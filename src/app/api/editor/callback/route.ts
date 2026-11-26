// ONLYOFFICE save callback (Day 5).
//
// The document server POSTs here when a document is saved. The
// request carries NO user session, so its only authorization is the
// JWT the document server signs with the shared secret: the token
// (Authorization: Bearer, or the `token` field in the body) is
// verified first, and the VERIFIED payload — never the raw body —
// is used as the callback data. A missing or bad token is rejected
// before anything is read or written.
//
// On status 2 (ready to save): the document key is mapped back to
// a document/user/version through editor_sessions, the user's
// workspace membership is re-checked, the saved file is downloaded
// from the document server, validated (size + Office ZIP magic
// bytes + the saved filetype matching the document's format), and
// stored as a new immutable version in the document's own MIME
// type. A repeated delivery of the same save is detected (document
// version already past the session version) and acknowledged
// without writing twice. ONLYOFFICE expects {"error": 0} on success.
import { NextResponse } from "next/server";
import * as jose from "jose";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStoragePath, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { getEditorFileType, looksLikeOfficeZip } from "@/lib/editor";
import { getOnlyOfficeJwtSecret } from "@/lib/editor.server";
import {
  deleteEditorSession,
  getEditorSession,
} from "@/features/editor/config";
import { logError } from "@/lib/log";

const CALLBACK_OK = { error: 0 };
const CALLBACK_FAILED = { error: 1 };

interface CallbackPayload {
  key?: unknown;
  status?: unknown;
  url?: unknown;
  filetype?: unknown;
}

async function verifyCallbackToken(
  request: Request,
  body: unknown
): Promise<CallbackPayload | null> {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const bodyToken =
    body !== null && typeof body === "object" && "token" in body
      ? String((body as { token?: unknown }).token ?? "")
      : "";
  const token = bearer || bodyToken;
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(
      token,
      new TextEncoder().encode(getOnlyOfficeJwtSecret())
    );
    return payload as CallbackPayload;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(CALLBACK_FAILED, { status: 400 });
  }

  const payload = await verifyCallbackToken(request, body);
  if (!payload) {
    return NextResponse.json(CALLBACK_FAILED, { status: 401 });
  }

  const key = typeof payload.key === "string" ? payload.key : "";
  const status = typeof payload.status === "number" ? payload.status : -1;
  if (!key) {
    return NextResponse.json(CALLBACK_FAILED, { status: 400 });
  }

  // 1 = being edited, 4 = closed without changes, 6 = save error on
  // the document server side: acknowledge, nothing to store.
  if (status === 1 || status === 4 || status === 6) {
    if (status === 6) {
      logError("editor callback", "document server save error", {
        key,
      });
    }
    return NextResponse.json(CALLBACK_OK);
  }
  if (status !== 2) {
    logError("editor callback", "unknown status", { key, status });
    return NextResponse.json(CALLBACK_OK);
  }

  const session = await getEditorSession(key);
  if (!session) {
    return NextResponse.json(CALLBACK_FAILED, { status: 403 });
  }
  if (Date.now() > new Date(session.expires_at).getTime()) {
    await deleteEditorSession(key);
    return NextResponse.json(CALLBACK_FAILED, { status: 403 });
  }

  const admin = createAdminClient();

  // Re-check access: the user who opened the document must still
  // be a member of its workspace.
  const { data: membership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", session.workspace_id)
    .eq("user_id", session.user_id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(CALLBACK_FAILED, { status: 403 });
  }

  const { data: document, error: docError } = await admin
    .from("documents")
    .select("id, workspace_id, title, version, file_path, mime_type")
    .eq("id", session.document_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (docError || !document) {
    logError("editor callback", docError);
    return NextResponse.json(CALLBACK_FAILED, { status: 500 });
  }
  if (document.workspace_id !== session.workspace_id) {
    return NextResponse.json(CALLBACK_FAILED, { status: 403 });
  }
  // Duplicate delivery: this save was already applied.
  if (document.version > session.version) {
    return NextResponse.json(CALLBACK_OK);
  }
  // The document server must save in the document's own format —
  // a save that arrives as a different filetype is rejected.
  const expectedFileType = getEditorFileType(document.mime_type);
  const savedFileType =
    typeof payload.filetype === "string" ? payload.filetype : "";
  if (
    expectedFileType &&
    savedFileType &&
    savedFileType.toLowerCase() !== expectedFileType
  ) {
    logError("editor callback", "filetype mismatch", {
      key,
      expected: expectedFileType,
      got: savedFileType,
    });
    return NextResponse.json(CALLBACK_FAILED, { status: 400 });
  }

  const fileUrl = typeof payload.url === "string" ? payload.url : "";
  if (!fileUrl.startsWith("http://") && !fileUrl.startsWith("https://")) {
    return NextResponse.json(CALLBACK_FAILED, { status: 400 });
  }

  let saved: Response;
  try {
    saved = await fetch(fileUrl);
  } catch (error) {
    logError("editor callback download failed", error);
    return NextResponse.json(CALLBACK_FAILED, { status: 502 });
  }
  if (!saved.ok) {
    logError("editor callback download failed", saved.status);
    return NextResponse.json(CALLBACK_FAILED, { status: 502 });
  }
  const bytes = new Uint8Array(await saved.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json(CALLBACK_FAILED, { status: 400 });
  }
  // Office saves (DOCX/XLSX/PPTX/ODT/ODS/ODP) are ZIP archives.
  // Plain-text saves (TXT) and PDFs are not: TXT is checked by
  // size only, PDF by its %PDF header.
  const mimeType = document.mime_type ?? "";
  if (mimeType === "text/plain") {
    // No magic bytes to check; the filetype check above already
    // confirmed the document server saved a TXT.
  } else if (mimeType === "application/pdf") {
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    if (header !== "%PDF-") {
      logError("editor callback", "saved file is not a PDF");
      return NextResponse.json(CALLBACK_FAILED, { status: 400 });
    }
  } else if (!looksLikeOfficeZip(bytes)) {
    logError("editor callback", "saved file is not an Office file", {
      key,
      mimeType,
    });
    return NextResponse.json(CALLBACK_FAILED, { status: 400 });
  }

  const newVersion = document.version + 1;
  const newPath = buildStoragePath(
    document.workspace_id,
    document.id,
    newVersion,
    document.title
  );
  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(newPath, bytes, {
      contentType: document.mime_type ?? "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    // A duplicate upload means this save was already applied.
    if (uploadError.message.includes("already exists")) {
      return NextResponse.json(CALLBACK_OK);
    }
    logError("editor callback", uploadError);
    return NextResponse.json(CALLBACK_FAILED, { status: 500 });
  }

  const { error: versionError } = await admin.from("document_versions").insert({
    document_id: document.id,
    workspace_id: document.workspace_id,
    version_number: newVersion,
    file_path: newPath,
    size_bytes: bytes.length,
    mime_type: document.mime_type,
    created_by: session.user_id,
  });
  if (versionError) {
    logError("editor callback", versionError);
    await admin.storage.from("documents").remove([newPath]);
    return NextResponse.json(CALLBACK_FAILED, { status: 500 });
  }

  const { error: updateError } = await admin
    .from("documents")
    .update({
      version: newVersion,
      file_path: newPath,
      size_bytes: bytes.length,
      mime_type: document.mime_type,
    })
    .eq("id", document.id)
    .eq("version", document.version);
  if (updateError) {
    logError("editor callback", updateError);
    return NextResponse.json(CALLBACK_FAILED, { status: 500 });
  }

  // Keep the session for further edits in the same editing session,
  // at the new version.
  await admin
    .from("editor_sessions")
    .update({ version: newVersion })
    .eq("key", key);

  return NextResponse.json(CALLBACK_OK);
}
