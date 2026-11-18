// PDF utilities helpers (Phase B, feature 2) — pure functions, no secrets.
//
// Merge, split, rotate and compress are separate operations that
// share one pipeline (see pdf-tools.server.ts): fetch the source
// PDFs through RLS, validate the bytes, run the operation, stream
// the result back. Everything here is importable from server
// components, route handlers and tests. No value is hardcoded per
// document, user or environment.

import { MAX_UPLOAD_BYTES } from "@/lib/storage";
import { sanitizeDownloadName } from "@/lib/export";

/** Per-user PDF-tools rate limit: 10 operations per minute. */
export const PDF_TOOLS_RATE_LIMIT_MAX = 10;
export const PDF_TOOLS_RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** An operation may take a while on a large file; 2 minutes is the cap. */
export const PDF_TOOLS_TIMEOUT_MS = 2 * 60 * 1000;

/** No single input PDF may exceed the 50 MB upload cap. */
export const MAX_PDF_TOOLS_BYTES = MAX_UPLOAD_BYTES;

/** A merge may combine at most 20 documents. */
export const MAX_MERGE_DOCUMENTS = 20;

/** No operation may produce a PDF with more than 500 pages. */
export const MAX_PDF_PAGES = 500;

/** Ghostscript compression levels (see pdf-tools.server.ts). */
export const COMPRESS_LEVELS = ["screen", "ebook", "printer"] as const;
export type CompressLevel = (typeof COMPRESS_LEVELS)[number];

/** Whether a MIME type is a PDF (the only format these tools accept). */
export function isPdfMimeType(mimeType: string | null): boolean {
  return mimeType === "application/pdf";
}

/** Whether bytes look like a PDF (%PDF- header). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
  );
}

export type PageRangeResult =
  { ok: true; pages: number[] } | { ok: false; error: string };

/**
 * Parse a page selection like "1-3, 5, 7-9" against a document with
 * `pageCount` pages. Pages are 1-based and inclusive. Returns the
 * pages in the order given, duplicates kept (extracting the same
 * page twice is a valid split). Rejects empty input, non-numbers,
 * zero/negative pages, reversed ranges, pages past the end, and a
 * selection larger than MAX_PDF_PAGES.
 */
export function parsePageRanges(
  input: string,
  pageCount: number
): PageRangeResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter at least one page, for example 1-3, 5." };
  }
  const pages: number[] = [];
  for (const part of trimmed.split(",")) {
    const segment = part.trim();
    if (!segment) {
      return { ok: false, error: `Empty page in "${trimmed}" — use 1-3, 5.` };
    }
    const range = segment.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end < 1) {
        return { ok: false, error: "Page numbers start at 1." };
      }
      if (start > end) {
        return {
          ok: false,
          error: `Range ${start}-${end} is backwards — use ${end}-${start}.`,
        };
      }
      if (end > pageCount) {
        return {
          ok: false,
          error: `This PDF has ${pageCount} pages — ${end} is past the end.`,
        };
      }
      for (let page = start; page <= end; page++) pages.push(page);
      continue;
    }
    const single = segment.match(/^(\d+)$/);
    if (!single) {
      return {
        ok: false,
        error: `"${segment}" is not a page or a range — use 1-3, 5.`,
      };
    }
    const page = Number(single[1]);
    if (page < 1) {
      return { ok: false, error: "Page numbers start at 1." };
    }
    if (page > pageCount) {
      return {
        ok: false,
        error: `This PDF has ${pageCount} pages — ${page} is past the end.`,
      };
    }
    pages.push(page);
  }
  if (pages.length > MAX_PDF_PAGES) {
    return {
      ok: false,
      error: `Select at most ${MAX_PDF_PAGES} pages at a time.`,
    };
  }
  return { ok: true, pages };
}

/**
 * Parse a rotate selection: "all" means every page, otherwise the
 * same range syntax as parsePageRanges. Duplicates are collapsed
 * (rotating a page twice by the same amount is ambiguous).
 */
export function parseRotateSelection(
  input: string,
  pageCount: number
): PageRangeResult {
  if (input.trim().toLowerCase() === "all") {
    const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
    if (pages.length > MAX_PDF_PAGES) {
      return {
        ok: false,
        error: `This PDF has more than ${MAX_PDF_PAGES} pages — rotate a range instead.`,
      };
    }
    return { ok: true, pages };
  }
  const parsed = parsePageRanges(input, pageCount);
  if (!parsed.ok) return parsed;
  return { ok: true, pages: [...new Set(parsed.pages)] };
}

export type RotationResult =
  { ok: true; degrees: 90 | 180 | 270 } | { ok: false; error: string };

/** Only quarter-turns are valid rotations. */
export function parseRotationDegrees(value: unknown): RotationResult {
  const degrees = typeof value === "string" ? Number(value) : value;
  if (degrees === 90 || degrees === 180 || degrees === 270) {
    return { ok: true, degrees };
  }
  return {
    ok: false,
    error: "Rotation must be 90, 180 or 270 degrees.",
  };
}

/** Validate a Ghostscript compression level, defaulting to ebook. */
export function parseCompressLevel(value: unknown):
  | {
      ok: true;
      level: CompressLevel;
    }
  | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, level: "ebook" };
  }
  if (
    typeof value === "string" &&
    (COMPRESS_LEVELS as readonly string[]).includes(value)
  ) {
    return { ok: true, level: value as CompressLevel };
  }
  return {
    ok: false,
    error: "Compression level must be screen, ebook or printer.",
  };
}

/** Download file name for a tool result, e.g. "Report - merged.pdf". */
export function getPdfToolsFileName(title: string, suffix: string): string {
  const base = title.trim() || "document";
  const withoutPdf = base.replace(/\.pdf$/i, "");
  return `${sanitizeDownloadName(withoutPdf)} - ${suffix}.pdf`;
}

/** Download file name for a merge, from the first document's title. */
export function getMergedFileName(firstTitle: string): string {
  return getPdfToolsFileName(firstTitle, "merged");
}
