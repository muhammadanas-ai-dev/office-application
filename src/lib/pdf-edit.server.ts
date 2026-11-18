// PDF editing server wiring (Phase B, feature 3) — server-only.
//
// Auth, rate limiting, RLS-checked document loading and the
// new-version bookkeeping. The edit operations themselves live in
// pdf-edit.ts so they are unit-testable; they are re-exported here
// so routes import from one place.
//
// Every edit creates a NEW immutable version of the document —
// the original file is never overwritten. The version is created
// exactly like the editor save callback does: upload the new bytes
// to private Storage as v(n+1), insert a document_versions row,
// then update the documents row guarded on the old version so two
// concurrent edits cannot both claim the same version number.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  DOCUMENTS_BUCKET,
  MAX_UPLOAD_BYTES,
  buildStoragePath,
} from "@/lib/storage";
import { FixedWindowRateLimiter } from "@/lib/export";
import {
  PDF_TOOLS_RATE_LIMIT_MAX,
  PDF_TOOLS_RATE_LIMIT_WINDOW_MS,
} from "@/lib/pdf-tools";
import {
  fetchDocumentPdf,
  getToolsClient,
  getToolsUser,
  pdfToolsRateLimiter,
  type ToolsDocument,
} from "@/lib/pdf-tools.server";
import {
  PdfEditError,
  deletePagesInPdf,
  detectImageMime,
  editTextInPdf,
  listPdfImages,
  listPdfTextRuns,
  reorderPagesInPdf,
  replaceImageInPdf,
  type DeletePagesInput,
  type EditTextInput,
  type ReorderPagesInput,
  type ReplaceImageInput,
} from "@/lib/pdf-edit";

export {
  PdfEditError,
  deletePagesInPdf,
  detectImageMime,
  editTextInPdf,
  fetchDocumentPdf,
  getToolsClient,
  getToolsUser,
  listPdfImages,
  listPdfTextRuns,
  pdfToolsRateLimiter,
  reorderPagesInPdf,
  replaceImageInPdf,
  type DeletePagesInput,
  type EditTextInput,
  type ReorderPagesInput,
  type ReplaceImageInput,
  type ToolsDocument,
};

/** Per-process, per-user rate limit for the edit routes. */
export const pdfEditRateLimiter = new FixedWindowRateLimiter(
  PDF_TOOLS_RATE_LIMIT_MAX,
  PDF_TOOLS_RATE_LIMIT_WINDOW_MS
);

/** The result of a successful edit: the new version number. */
export interface EditResult {
  version: number;
  documentId: string;
  title: string;
}

/**
 * Save edited bytes as a new immutable version of a document.
 * `document` is the row fetched through the user's client (RLS
 * already proved access). Returns the new version number.
 * Throws PdfEditError on every failure path.
 */
export async function saveNewVersion(
  document: ToolsDocument & { workspace_id: string; version: number },
  userId: string,
  bytes: Uint8Array
): Promise<number> {
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
    throw new PdfEditError(
      400,
      "The edited file is empty or larger than the 50 MB limit."
    );
  }
  const admin = createAdminClient();
  const newVersion = document.version + 1;
  const newPath = buildStoragePath(
    document.workspace_id,
    document.id,
    newVersion,
    document.title
  );
  const { error: uploadError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(newPath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    throw new PdfEditError(500, "Could not save the edited file.");
  }
  const { error: versionError } = await admin.from("document_versions").insert({
    document_id: document.id,
    workspace_id: document.workspace_id,
    version_number: newVersion,
    file_path: newPath,
    size_bytes: bytes.length,
    mime_type: "application/pdf",
    created_by: userId,
  });
  if (versionError) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([newPath]);
    throw new PdfEditError(500, "Could not record the new version.");
  }
  const { error: updateError } = await admin
    .from("documents")
    .update({
      version: newVersion,
      file_path: newPath,
      size_bytes: bytes.length,
      mime_type: "application/pdf",
    })
    .eq("id", document.id)
    .eq("version", document.version);
  if (updateError) {
    throw new PdfEditError(
      500,
      "The document changed while you were editing it — please reload and try again."
    );
  }
  return newVersion;
}

/** Load the full document row (workspace + version) through the user's client. */
export async function fetchEditableDocument(
  userClient: Awaited<ReturnType<typeof createClient>>,
  documentId: string
): Promise<ToolsDocument & { workspace_id: string; version: number }> {
  const { data: document, error } = await userClient
    .from("documents")
    .select("id, title, file_path, mime_type, workspace_id, version")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new PdfEditError(500, "Could not load the document.");
  }
  if (!document) {
    throw new PdfEditError(
      404,
      "Document not found, or you do not have access to it."
    );
  }
  if (!document.file_path) {
    throw new PdfEditError(400, "This document has no file yet.");
  }
  if (document.mime_type !== "application/pdf") {
    throw new PdfEditError(
      400,
      "PDF editing only works on PDF files — this document is not a PDF."
    );
  }
  return document;
}

/** The JSON body a successful edit returns. */
export function editJsonResponse(result: EditResult): Response {
  return Response.json(
    {
      ok: true,
      version: result.version,
      documentId: result.documentId,
      title: result.title,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
