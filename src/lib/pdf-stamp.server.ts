// PDF stamps / watermarks server wiring (Day 32) — server-only.
//
// Auth, rate limiting, RLS-checked document loading and the
// new-version bookkeeping. The stamp operations themselves live
// in pdf-stamp.ts so they are unit-testable; they are re-exported
// here so routes import from one place.
//
// Every stamp/watermark change creates a NEW immutable version
// of the document — the original file is never overwritten. The
// version is created exactly like the editor save callback and
// the PDF annotation tools do: upload the new bytes to private
// Storage as v(n+1), insert a document_versions row, then update
// the documents row guarded on the old version (saveNewVersion
// in pdf-edit.server.ts).
import "server-only";
import { FixedWindowRateLimiter } from "@/lib/export";
import {
  PDF_TOOLS_RATE_LIMIT_MAX,
  PDF_TOOLS_RATE_LIMIT_WINDOW_MS,
} from "@/lib/pdf-tools";
import { getToolsClient, getToolsUser } from "@/lib/pdf-tools.server";
import {
  PdfEditError,
  editJsonResponse,
  fetchEditableDocument,
  saveNewVersion,
} from "@/lib/pdf-edit.server";
import { fetchDocumentPdf, PdfToolsError } from "@/lib/pdf-tools.server";
import {
  addImageWatermarkToPdf,
  addStampToPdf,
  addTextWatermarkToPdf,
  type ImageWatermarkPosition,
  type StampPosition,
  type TextWatermarkPosition,
} from "@/lib/pdf-stamp";

export {
  PdfEditError,
  PdfToolsError,
  addImageWatermarkToPdf,
  addStampToPdf,
  addTextWatermarkToPdf,
  editJsonResponse,
  fetchDocumentPdf,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  saveNewVersion,
  type ImageWatermarkPosition,
  type StampPosition,
  type TextWatermarkPosition,
};

export const pdfStampRateLimiter = new FixedWindowRateLimiter(
  PDF_TOOLS_RATE_LIMIT_MAX,
  PDF_TOOLS_RATE_LIMIT_WINDOW_MS
);
