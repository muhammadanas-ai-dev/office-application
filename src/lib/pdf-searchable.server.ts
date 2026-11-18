// Searchable PDF (Day 21) — server-only helpers.
//
// Reads the latest OCR result's stored word boxes (the `words`
// column on document_ocr_results, added by the Day 21 migration)
// and wraps the pdf-edit server module for the make-searchable
// route. If the migration has not been applied, the words
// column does not exist and the route reports it clearly
// instead of failing silently.
import "server-only";

import {
  PdfEditError,
  editJsonResponse,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  pdfEditRateLimiter,
  saveNewVersion,
} from "@/lib/pdf-edit.server";
import { OcrError } from "@/lib/ocr";
import type { OcrWord } from "@/lib/ocr";
import type { SearchablePageWords } from "@/lib/pdf-searchable";

export {
  PdfEditError,
  editJsonResponse,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  pdfEditRateLimiter,
  saveNewVersion,
};

/** The stored OCR words for one page (the `words` column). */
function isOcrWord(value: unknown): value is OcrWord {
  if (typeof value !== "object" || value === null) return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.text === "string" &&
    typeof w.confidence === "number" &&
    typeof w.left === "number" &&
    typeof w.top === "number" &&
    typeof w.width === "number" &&
    typeof w.height === "number"
  );
}

/**
 * Load the latest OCR job's stored word boxes for a document.
 * Returns the pages (with words) for the latest job, or null
 * when there is no OCR result. Throws a 400 when the latest job
 * is not done, when its results have no words stored (an OCR
 * result from before the Day 21 migration — run OCR again), or
 * when the words column itself is missing (the migration has
 * not been applied).
 */
export async function getLatestOcrWords(
  userClient: Awaited<ReturnType<typeof getToolsClient>>,
  documentId: string
): Promise<SearchablePageWords[] | null> {
  const { data: job, error: jobError } = await userClient
    .from("ocr_jobs")
    .select("id, status")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobError) {
    throw new OcrError(500, "Could not load this document's OCR status.");
  }
  if (!job) return null;
  if (job.status !== "done") {
    throw new OcrError(
      400,
      "OCR has not finished for this document yet — wait for it, then make it searchable."
    );
  }
  const { data: results, error: resultsError } = await userClient
    .from("document_ocr_results")
    .select("page_number, words")
    .eq("job_id", job.id)
    .order("page_number", { ascending: true });
  if (resultsError) {
    // PGRST204: the column does not exist — the Day 21 migration
    // has not been applied yet.
    if (
      typeof resultsError.code === "string" &&
      resultsError.code === "PGRST204"
    ) {
      throw new PdfEditError(
        400,
        "The OCR word positions are not stored yet — run the Day 21 migration (forma-ocr-words-migration.sql) in the Supabase Dashboard, then run OCR again."
      );
    }
    throw new OcrError(500, "Could not load this document's OCR results.");
  }
  const pages: SearchablePageWords[] = [];
  for (const row of results ?? []) {
    const words = Array.isArray(row.words)
      ? (row.words as unknown[]).filter(isOcrWord)
      : [];
    pages.push({ pageNumber: row.page_number, words });
  }
  if (pages.every((p) => p.words.length === 0)) {
    throw new PdfEditError(
      400,
      "This OCR result has no word positions saved — run OCR again, then make it searchable."
    );
  }
  return pages;
}
