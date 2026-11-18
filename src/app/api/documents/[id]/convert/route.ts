// Convert one document to another format (Phase D).
//
// POST /api/documents/[id]/convert
//
// The document row is fetched through the signed-in user's
// client, so RLS decides access — exactly like the export
// route. The conversion runs server-side through the ONLYOFFICE
// ConvertService (JWT-signed, HMAC file token), and the result
// is saved as a NEW document in the same workspace and folder
// (version 1) — the original document is never modified or
// overwritten. The document server's URL never reaches the
// client.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  EXPORT_RATE_LIMIT_MAX,
  EXPORT_RATE_LIMIT_WINDOW_MS,
  FixedWindowRateLimiter,
  getSourceFileName,
} from "@/lib/export";
import {
  FILE_TOKEN_TTL_MS,
  getEditorFileType,
  signFileToken,
} from "@/lib/editor";
import { getEditorPublicUrl, getFileTokenSecret } from "@/lib/editor.server";
import { ConvertError, convertDocument } from "@/lib/convert.server";
import {
  getConvertedFileName,
  getConvertedTitle,
  getTargetMimeType,
  isConversionSupported,
} from "@/lib/convert";
import { DOCUMENTS_BUCKET, buildStoragePath } from "@/lib/storage";

const convertBodySchema = z.object({
  outputType: z.string().min(1).max(10),
});

/**
 * Per-process, per-user rate limit (see FixedWindowRateLimiter). One
 * instance per server process — enough for a single-instance
 * deployment; a shared limiter is the multi-instance hardening
 * item.
 */
const convertRateLimiter = new FixedWindowRateLimiter(
  EXPORT_RATE_LIMIT_MAX,
  EXPORT_RATE_LIMIT_WINDOW_MS
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = convertBodySchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A target format is required" },
      { status: 400 }
    );
  }
  const outputType = parsed.data.outputType.toLowerCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title, version, file_path, mime_type, workspace_id, folder_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[convert]", error);
    return NextResponse.json(
      { error: "Could not load the document" },
      { status: 500 }
    );
  }
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (!document.file_path) {
    return NextResponse.json(
      { error: "This document has no file yet" },
      { status: 400 }
    );
  }
  const fileType = getEditorFileType(document.mime_type);
  if (!fileType) {
    return NextResponse.json(
      { error: "This file format cannot be converted" },
      { status: 400 }
    );
  }
  const targetMimeType = getTargetMimeType(outputType);
  if (!targetMimeType || !isConversionSupported(fileType, outputType)) {
    return NextResponse.json(
      {
        error: `This file cannot be converted to .${outputType} — the engine does not perform that conversion.`,
      },
      { status: 400 }
    );
  }

  const limit = convertRateLimiter.check(user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many conversions — try again in a moment" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      }
    );
  }

  // The document server fetches the source file through the same
  // HMAC-gated file route the editor uses.
  let fileToken: string;
  try {
    fileToken = signFileToken(getFileTokenSecret(), {
      documentId: document.id,
      version: document.version,
      expiresAt: Date.now() + FILE_TOKEN_TTL_MS,
    });
  } catch (error) {
    console.error("[convert] file token", error);
    return NextResponse.json(
      { error: "Could not prepare this conversion" },
      { status: 500 }
    );
  }
  const fileUrl = `${getEditorPublicUrl()}/api/editor/file/${document.id}?t=${encodeURIComponent(fileToken)}`;

  let bytes: Uint8Array;
  try {
    bytes = await convertDocument({
      fileUrl,
      fileType,
      outputType,
      title: getSourceFileName(document.title, fileType),
    });
  } catch (error) {
    if (error instanceof ConvertError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[convert]", error);
    return NextResponse.json(
      { error: "Could not convert this file" },
      { status: 500 }
    );
  }

  // Save the result as a NEW document in the same workspace and
  // folder. The original document is never touched.
  const newId = crypto.randomUUID();
  const newTitle = getConvertedTitle(document.title, outputType);
  const fileName = getConvertedFileName(document.title, outputType);
  const filePath = buildStoragePath(document.workspace_id, newId, 1, fileName);
  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(filePath, bytes.buffer as ArrayBuffer, {
      contentType: targetMimeType,
      upsert: false,
    });
  if (uploadError) {
    console.error("[convert] upload", uploadError);
    return NextResponse.json(
      { error: "Could not save the converted file" },
      { status: 500 }
    );
  }
  const { error: insertError } = await supabase.from("documents").insert({
    id: newId,
    workspace_id: document.workspace_id,
    folder_id: document.folder_id,
    title: newTitle,
    file_path: filePath,
    mime_type: targetMimeType,
    size_bytes: bytes.length,
    version: 1,
    created_by: user.id,
  });
  if (insertError) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
    console.error("[convert] insert", insertError);
    return NextResponse.json(
      { error: "Could not save the converted file" },
      { status: 500 }
    );
  }
  const { error: versionError } = await supabase
    .from("document_versions")
    .insert({
      document_id: newId,
      workspace_id: document.workspace_id,
      version_number: 1,
      file_path: filePath,
      mime_type: targetMimeType,
      size_bytes: bytes.length,
      created_by: user.id,
    });
  if (versionError) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
    console.error("[convert] version", versionError);
    return NextResponse.json(
      { error: "Could not save the converted file" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    document: { id: newId, title: newTitle, mimeType: targetMimeType },
    sourceId: document.id,
  });
}
