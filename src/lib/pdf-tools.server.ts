// PDF utilities server wiring (Phase B, feature 2) — server-only.
//
// Auth, rate limiting, RLS-checked document loading and the
// download response. The document operations themselves
// (merge/split/rotate/compress) live in pdf-ops.ts so they are
// unit-testable; they are re-exported here so routes import from
// one place.
import "server-only";
import { PdfToolsError } from "@/lib/pdf-ops";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { FixedWindowRateLimiter, buildContentDisposition } from "@/lib/export";
import {
  PDF_TOOLS_RATE_LIMIT_MAX,
  PDF_TOOLS_RATE_LIMIT_WINDOW_MS,
  looksLikePdf,
} from "@/lib/pdf-tools";

export {
  PdfToolsError,
  compressPdf,
  countPdfPages,
  mergePdfs,
  rotatePdf,
  splitPdf,
} from "@/lib/pdf-ops";

/** A document row as fetched through the signed-in user's client. */
export interface ToolsDocument {
  id: string;
  title: string;
  file_path: string | null;
  mime_type: string | null;
}

/**
 * Per-process, per-user rate limit shared by all four PDF-tools
 * routes (see FixedWindowRateLimiter). One instance per server
 * process — a shared limiter is the multi-instance hardening item.
 */
export const pdfToolsRateLimiter = new FixedWindowRateLimiter(
  PDF_TOOLS_RATE_LIMIT_MAX,
  PDF_TOOLS_RATE_LIMIT_WINDOW_MS
);

/**
 * The signed-in user for a PDF-tools request. Throws 401 when
 * there is no session (the app proxy usually redirects to sign-in
 * first, so this is the second layer — same as the export route).
 */
export async function getToolsUser(): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new PdfToolsError(401, "Not signed in.");
  }
  return user;
}

/** The user's client (RLS-enforced) for a PDF-tools request. */
export async function getToolsClient(): Promise<
  Awaited<ReturnType<typeof createClient>>
> {
  return createClient();
}

/**
 * Fetch one document through the user's client (RLS decides access)
 * and download its bytes from private Storage. Returns the row and
 * the validated PDF bytes. Throws PdfToolsError on every failure
 * path — a caller never receives bytes for a document the user
 * cannot access, or bytes that are not a PDF.
 */
export async function fetchDocumentPdf(
  userClient: Awaited<ReturnType<typeof createClient>>,
  documentId: string
): Promise<{ document: ToolsDocument; bytes: Uint8Array }> {
  const { data: document, error } = await userClient
    .from("documents")
    .select("id, title, file_path, mime_type")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new PdfToolsError(500, "Could not load the document.");
  }
  if (!document) {
    throw new PdfToolsError(
      404,
      "Document not found, or you do not have access to it."
    );
  }
  if (!document.file_path) {
    throw new PdfToolsError(400, "This document has no file yet.");
  }
  if (document.mime_type !== "application/pdf") {
    throw new PdfToolsError(
      400,
      "PDF tools only work on PDF files — this document is not a PDF."
    );
  }
  const admin = createAdminClient();
  const { data: blob, error: downloadError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .download(document.file_path);
  if (downloadError || !blob) {
    throw new PdfToolsError(500, "Could not read this PDF file.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
    throw new PdfToolsError(
      400,
      "This PDF is empty or larger than the 50 MB limit."
    );
  }
  if (!looksLikePdf(bytes)) {
    throw new PdfToolsError(400, "This file is not a valid PDF.");
  }
  return { document, bytes };
}

/**
 * Build a download response for a tool result. `fileName` must
 * already end in .pdf (see getPdfToolsFileName). Extra headers
 * (e.g. the compression savings) are passed through.
 */
export function pdfDownloadResponse(
  bytes: Uint8Array,
  fileName: string,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": buildContentDisposition(fileName),
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}
