// PDF export for one document (Phase B, feature 1).
//
// GET /api/documents/[id]/export?format=pdf
//
// The document row is fetched through the signed-in user's client,
// so RLS decides access — exactly like the download route. The
// conversion runs server-side through the ONLYOFFICE ConvertService
// (JWT-signed, HMAC file token) and the PDF bytes are streamed back
// to the browser; the document server's URL never reaches the
// client. The export is a download only: the original file is never
// modified and no new version is created.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  EXPORT_RATE_LIMIT_MAX,
  EXPORT_RATE_LIMIT_WINDOW_MS,
  FixedWindowRateLimiter,
  buildContentDisposition,
  getSourceFileName,
  isExportableToPdf,
} from "@/lib/export";
import {
  FILE_TOKEN_TTL_MS,
  getEditorFileType,
  signFileToken,
} from "@/lib/editor";
import { getEditorPublicUrl, getFileTokenSecret } from "@/lib/editor.server";
import { ExportError, convertToPdf } from "@/lib/export.server";

/**
 * Per-process, per-user rate limit (see FixedWindowRateLimiter). One
 * instance per server process — enough for a single-instance
 * deployment; a shared limiter is the multi-instance hardening
 * item.
 */
const exportRateLimiter = new FixedWindowRateLimiter(
  EXPORT_RATE_LIMIT_MAX,
  EXPORT_RATE_LIMIT_WINDOW_MS
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "pdf";
  if (format !== "pdf") {
    return NextResponse.json(
      { error: "Only PDF export is supported" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: document, error } = await supabase
    .from("documents")
    .select("id, title, version, file_path, mime_type")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[export]", error);
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
      { error: "This file format cannot be exported to PDF" },
      { status: 400 }
    );
  }
  if (!isExportableToPdf(document.mime_type)) {
    return NextResponse.json(
      { error: "This file is already a PDF — use Download instead" },
      { status: 400 }
    );
  }

  const limit = exportRateLimiter.check(user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many exports — try again in a moment" },
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
    console.error("[export] file token", error);
    return NextResponse.json(
      { error: "Could not prepare this export" },
      { status: 500 }
    );
  }
  const fileUrl = `${getEditorPublicUrl()}/api/editor/file/${document.id}?t=${encodeURIComponent(fileToken)}`;

  let bytes: Uint8Array;
  try {
    bytes = await convertToPdf({
      fileUrl,
      fileType,
      title: getSourceFileName(document.title, fileType),
    });
  } catch (error) {
    if (error instanceof ExportError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[export]", error);
    return NextResponse.json(
      { error: "Could not export this file to PDF" },
      { status: 500 }
    );
  }

  // bytes is a Uint8Array view over a fresh ArrayBuffer from
  // arrayBuffer(), so its .buffer is exactly the PDF bytes.
  return new Response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": buildContentDisposition(document.title),
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
    },
  });
}
