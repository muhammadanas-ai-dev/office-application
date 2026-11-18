// PDF form filling server wiring (Phase B, feature 4) — server-only.
//
// Auth, rate limiting, RLS-checked document loading and the
// new-version bookkeeping. The form operations themselves live in
// pdf-form.ts so they are unit-testable; they are re-exported here
// so routes import from one place.
//
// Every fill creates a NEW immutable version of the document —
// the original file is never overwritten. The version is created
// exactly like the editor save callback and the PDF text edit do:
// upload the new bytes to private Storage as v(n+1), insert a
// document_versions row, then update the documents row guarded on
// the old version.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage";
import { FixedWindowRateLimiter } from "@/lib/export";
import {
  PDF_TOOLS_RATE_LIMIT_MAX,
  PDF_TOOLS_RATE_LIMIT_WINDOW_MS,
} from "@/lib/pdf-tools";
import {
  getToolsClient,
  getToolsUser,
} from "@/lib/pdf-tools.server";
import { createClient } from "@/lib/supabase/server";
import {
  PdfEditError,
  fetchEditableDocument,
  saveNewVersion,
} from "@/lib/pdf-edit.server";
import {
  PdfFormError,
  assertFormFillablePdf,
  fillPdfForm,
  listPdfFormFields,
  type PdfFormField,
  type PdfFormValue,
} from "@/lib/pdf-form";

export {
  PdfFormError,
  assertFormFillablePdf,
  fillPdfForm,
  getToolsClient,
  getToolsUser,
  listPdfFormFields,
  type PdfFormField,
  type PdfFormValue,
};

/**
 * Load a document row through the user's client (RLS), for a form
 * operation. Wraps fetchEditableDocument so callers only ever see
 * PdfFormError — without this, its PdfEditError (e.g. the 404 for
 * a document the user cannot access) would surface as a 500.
 */
export async function fetchFormDocument(
  userClient: Awaited<ReturnType<typeof createClient>>,
  documentId: string
): Promise<Awaited<ReturnType<typeof fetchEditableDocument>>> {
  try {
    return await fetchEditableDocument(userClient, documentId);
  } catch (error) {
    if (error instanceof PdfEditError) {
      throw new PdfFormError(error.status, error.message);
    }
    throw error;
  }
}

/** Per-process, per-user rate limit for the form routes. */
export const pdfFormRateLimiter = new FixedWindowRateLimiter(
  PDF_TOOLS_RATE_LIMIT_MAX,
  PDF_TOOLS_RATE_LIMIT_WINDOW_MS
);

/** The result of a successful fill: the new version number. */
export interface FillResult {
  version: number;
  documentId: string;
  title: string;
}

/**
 * Download a document's current bytes from private Storage.
 * `document` is the row fetched through the user's client (RLS
 * already proved access).
 */
export async function fetchFormDocumentBytes(
  document: Awaited<ReturnType<typeof fetchFormDocument>>
): Promise<Uint8Array> {
  if (!document.file_path) {
    throw new PdfFormError(400, "This document has no file yet.");
  }
  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .download(document.file_path);
  if (error || !blob) {
    throw new PdfFormError(500, "Could not download the document file.");
  }
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Save filled bytes as a new immutable version. Wraps
 * saveNewVersion so callers only ever see PdfFormError.
 */
export async function saveFilledVersion(
  document: Awaited<ReturnType<typeof fetchFormDocument>>,
  userId: string,
  bytes: Uint8Array
): Promise<number> {
  try {
    return await saveNewVersion(document, userId, bytes);
  } catch (error) {
    if (error instanceof PdfEditError) {
      throw new PdfFormError(error.status, error.message);
    }
    throw error;
  }
}

/** The JSON body a successful fill returns. */
export function fillJsonResponse(result: FillResult): Response {
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
