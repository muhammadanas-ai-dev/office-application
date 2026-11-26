// Server side of PDF text search (F20).
//
// The pure search lives in pdf-search.ts; the page texts come
// from the Day 21 extractor in pdf-searchable.ts (pure pdf-lib
// code). They are re-exported here so the route imports from
// one place, following the pdf-annotate.server.ts pattern.
export {
  MAX_SEARCH_MATCHES,
  MAX_SEARCH_QUERY_CHARS,
  searchPdfText,
  validateSearchQuery,
  type SearchMatch,
  type SearchOptions,
  type SearchPageResults,
  type SearchResults,
} from "@/lib/pdf-search";
export { extractPdfText } from "@/lib/pdf-searchable";
export {
  AnnotateError,
  fetchAnnotateDocument,
  fetchAnnotateDocumentBytes,
  getToolsClient,
  getToolsUser,
  pdfAnnotateRateLimiter,
} from "@/lib/pdf-annotate.server";
