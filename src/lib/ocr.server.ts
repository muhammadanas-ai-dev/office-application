// OCR server wiring (Phase C) — server-only.
//
// Auth, rate limiting, RLS-checked document loading and the job
// bookkeeping. The OCR engine itself lives in ocr.ts so it is
// unit-testable; the worker (ocr/worker.ts) does the actual OCR.
//
// A job is enqueued by the route and processed by the worker.
// The route never runs Tesseract — OCR takes seconds per page,
// so it does not belong inside a web request.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { FixedWindowRateLimiter } from "@/lib/export";
import {
  PDF_TOOLS_RATE_LIMIT_MAX,
  PDF_TOOLS_RATE_LIMIT_WINDOW_MS,
} from "@/lib/pdf-tools";
import { getToolsClient, getToolsUser } from "@/lib/pdf-tools.server";
import {
  OcrError,
  isOcrAcceptedMimeType,
  isOcrLanguage,
  type OcrLanguage,
  type OcrPageResult,
} from "@/lib/ocr";

export {
  OcrError,
  getToolsClient,
  getToolsUser,
  isOcrAcceptedMimeType,
  isOcrLanguage,
  type OcrLanguage,
  type OcrPageResult,
};

/** Per-process, per-user rate limit for the OCR routes. */
export const ocrRateLimiter = new FixedWindowRateLimiter(
  PDF_TOOLS_RATE_LIMIT_MAX,
  PDF_TOOLS_RATE_LIMIT_WINDOW_MS
);

/** A document row as fetched through the signed-in user's client. */
export interface OcrDocument {
  id: string;
  title: string;
  file_path: string | null;
  mime_type: string | null;
  workspace_id: string;
  version: number;
}

/**
 * Load a document row through the user's client (RLS decides access)
 * for an OCR operation. Refuses documents with no file and files
 * that are not a PDF, PNG or JPEG. Throws OcrError on every failure
 * path — a caller never enqueues a job for a document the user
 * cannot access.
 */
export async function fetchOcrDocument(
  userClient: Awaited<ReturnType<typeof createClient>>,
  documentId: string
): Promise<OcrDocument> {
  const { data: document, error } = await userClient
    .from("documents")
    .select("id, title, file_path, mime_type, workspace_id, version")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new OcrError(500, "Could not load the document.");
  }
  if (!document) {
    throw new OcrError(
      404,
      "Document not found, or you do not have access to it."
    );
  }
  if (!document.file_path) {
    throw new OcrError(400, "This document has no file yet.");
  }
  if (!isOcrAcceptedMimeType(document.mime_type)) {
    throw new OcrError(
      400,
      "OCR works on PDF, PNG and JPEG files — this file is a different type."
    );
  }
  return document;
}

/** An OCR job row (the fields the UI needs). */
export interface OcrJob {
  id: string;
  document_id: string;
  status: "pending" | "processing" | "done" | "failed";
  language: OcrLanguage;
  page_count: number | null;
  processed_pages: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** One stored OCR result row (one page). */
export interface OcrStoredResult {
  id: string;
  job_id: string;
  page_number: number;
  text: string;
  mean_confidence: number | null;
  language: OcrLanguage;
}

/**
 * Enqueue an OCR job for a document, through the user's client
 * (RLS-enforced). Refuses when a job is already pending or
 * processing for the same document — the database's unique index
 * enforces it, and the 23505 violation is turned into a clear 409.
 */
export async function enqueueOcrJob(
  userClient: Awaited<ReturnType<typeof createClient>>,
  document: OcrDocument,
  userId: string,
  language: OcrLanguage
): Promise<OcrJob> {
  const { data: job, error } = await userClient
    .from("ocr_jobs")
    .insert({
      document_id: document.id,
      workspace_id: document.workspace_id,
      user_id: userId,
      language,
    })
    .select(
      "id, document_id, status, language, page_count, processed_pages, error, created_at, updated_at"
    )
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new OcrError(
        409,
        "An OCR run is already in progress for this document — wait for it to finish."
      );
    }
    throw new OcrError(500, "Could not start OCR for this document.");
  }
  return job as OcrJob;
}

/**
 * Load the latest OCR job for a document and its stored results,
 * through the user's client (RLS decides access). Returns null
 * for the job when the document has never been OCR'd.
 */
export async function getLatestOcrJobAndResults(
  userClient: Awaited<ReturnType<typeof createClient>>,
  documentId: string
): Promise<{ job: OcrJob | null; results: OcrStoredResult[] }> {
  const { data: job, error } = await userClient
    .from("ocr_jobs")
    .select(
      "id, document_id, status, language, page_count, processed_pages, error, created_at, updated_at"
    )
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new OcrError(500, "Could not load this document's OCR status.");
  }
  if (!job) {
    return { job: null, results: [] };
  }
  const { data: results, error: resultsError } = await userClient
    .from("document_ocr_results")
    .select("id, job_id, page_number, text, mean_confidence, language")
    .eq("job_id", job.id)
    .order("page_number", { ascending: true });
  if (resultsError) {
    throw new OcrError(500, "Could not load this document's OCR results.");
  }
  return {
    job: job as OcrJob,
    results: (results ?? []) as OcrStoredResult[],
  };
}
