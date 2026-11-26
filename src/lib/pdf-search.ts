// PDF text search — pure helpers (checklist completion run,
// F20).
//
// Search the text a PDF already carries (its text layer),
// page by page, and return every match with a short context
// snippet. The page texts come from the Day 21 extractor
// (`extractPdfText`), so search reads exactly the text a
// reader would show. A scanned PDF with no text layer simply
// has no matches — "Make searchable" (Day 21) is the fix for
// that case, and the UI says so.
//
// Nothing here touches the filesystem or a network, so it is
// safe to import from anywhere, including tests.
import { PdfEditError } from "@/lib/pdf-edit";

/** The longest query a search accepts. */
export const MAX_SEARCH_QUERY_CHARS = 200;
/** The most matches one search returns (the rest are counted
 *  as truncated, so a common word in a long document cannot
 *  produce an unbounded response). */
export const MAX_SEARCH_MATCHES = 500;
/** Characters of context kept on each side of a match. */
const SNIPPET_CONTEXT_CHARS = 40;

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

export interface SearchMatch {
  /** The text before the match, inside the snippet window. */
  before: string;
  /** The matched text, exactly as it appears in the PDF. */
  match: string;
  /** The text after the match, inside the snippet window. */
  after: string;
  /** True when the snippet was cut at the start. */
  startsCut: boolean;
  /** True when the snippet was cut at the end. */
  endsCut: boolean;
}

export interface SearchPageResults {
  page: number;
  matches: SearchMatch[];
}

export interface SearchResults {
  total: number;
  truncated: boolean;
  pages: SearchPageResults[];
}

/** Validate and normalise a search query. Throws
 *  PdfEditError(400) with a user-readable message. */
export function validateSearchQuery(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new PdfEditError(400, "Type something to search for.");
  }
  const query = raw.trim();
  if (query.length === 0) {
    throw new PdfEditError(400, "Type something to search for.");
  }
  if (query.length > MAX_SEARCH_QUERY_CHARS) {
    throw new PdfEditError(
      400,
      `Search for at most ${MAX_SEARCH_QUERY_CHARS} characters.`
    );
  }
  return query;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Search per-page texts for a query. Matches never span
 * pages (a phrase split across a page break is two partial
 * texts, not one match — the honest limit of page-by-page
 * extraction).
 */
export function searchPdfText(
  pages: { page: number; text: string }[],
  query: string,
  options: SearchOptions = {}
): SearchResults {
  const escaped = escapeRegExp(query);
  const pattern =
    options.wholeWord === true ? `\\b${escaped}\\b` : escaped;
  const regex = new RegExp(
    pattern,
    options.caseSensitive === true ? "g" : "gi"
  );
  const results: SearchPageResults[] = [];
  let total = 0;
  let truncated = false;
  for (const { page, text } of pages) {
    const matches: SearchMatch[] = [];
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (total >= MAX_SEARCH_MATCHES) {
        truncated = true;
        break;
      }
      const start = m.index;
      const end = start + m[0].length;
      const from = Math.max(0, start - SNIPPET_CONTEXT_CHARS);
      const to = Math.min(text.length, end + SNIPPET_CONTEXT_CHARS);
      matches.push({
        before: text.slice(from, start),
        match: m[0],
        after: text.slice(end, to),
        startsCut: from > 0,
        endsCut: to < text.length,
      });
      total++;
      if (m[0].length === 0) regex.lastIndex++;
    }
    if (matches.length > 0) results.push({ page, matches });
    if (truncated) break;
  }
  return { total, truncated, pages: results };
}
