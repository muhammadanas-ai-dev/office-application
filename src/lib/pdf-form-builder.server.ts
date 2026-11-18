// PDF form building server wiring (Phase B, feature 5) — server-only.
//
// Auth, rate limiting, RLS-checked document loading and the
// new-version bookkeeping. The builder operations themselves live
// in pdf-form-builder.ts so they are unit-testable; they are
// re-exported here so routes import from one place.
//
// The document loading, byte download and version saving are
// SHARED with the form-fill feature (pdf-form.server.ts) — a
// builder add/remove is the same operation on the same document,
// with the same RLS, the same 10/min per-user rate limit and the
// same new-version bookkeeping. Every add/remove creates a NEW
// immutable version of the document — the original file is never
// overwritten.
import "server-only";
import { FixedWindowRateLimiter } from "@/lib/export";
import {
  PDF_TOOLS_RATE_LIMIT_MAX,
  PDF_TOOLS_RATE_LIMIT_WINDOW_MS,
} from "@/lib/pdf-tools";
import {
  PdfFormBuilderError,
  addFormField,
  removeFormField,
  type PdfFormBuilderFieldSpec,
  type PdfFormBuilderFieldType,
} from "@/lib/pdf-form-builder";
import {
  fetchFormDocument,
  fetchFormDocumentBytes,
  getToolsClient,
  getToolsUser,
  saveFilledVersion,
} from "@/lib/pdf-form.server";

export {
  PdfFormBuilderError,
  addFormField,
  fetchFormDocument,
  fetchFormDocumentBytes,
  getToolsClient,
  getToolsUser,
  removeFormField,
  saveFilledVersion,
  type PdfFormBuilderFieldSpec,
  type PdfFormBuilderFieldType,
};
export { listPdfFormFields, type PdfFormField } from "@/lib/pdf-form";

/** Per-process, per-user rate limit for the builder routes. */
export const pdfFormBuilderRateLimiter = new FixedWindowRateLimiter(
  PDF_TOOLS_RATE_LIMIT_MAX,
  PDF_TOOLS_RATE_LIMIT_WINDOW_MS
);

/** The result of a successful add/remove: the new version number. */
export interface BuilderResult {
  version: number;
  documentId: string;
  title: string;
  field: string;
}

/** The JSON body a successful add/remove returns. */
export function builderJsonResponse(result: BuilderResult): Response {
  return Response.json(
    {
      ok: true,
      version: result.version,
      documentId: result.documentId,
      title: result.title,
      field: result.field,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
