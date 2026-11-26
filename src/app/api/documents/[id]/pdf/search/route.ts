// Search a PDF's text layer (F20).
//
// GET /api/documents/[id]/pdf/search?q=fox&case=1&word=1
// Returns { ok, query, total, truncated, pages: [{ page,
// matches: [{ before, match, after, startsCut, endsCut }] }] }.
//
// The search reads the text the PDF already carries (the
// Day 21 extractor). A scanned PDF with no text layer returns
// zero matches — the client says so and points at "Make
// searchable". Search never changes the document, so no new
// version is created.
import { NextResponse } from "next/server";
import {
  AnnotateError,
  extractPdfText,
  fetchAnnotateDocument,
  fetchAnnotateDocumentBytes,
  getToolsClient,
  getToolsUser,
  pdfAnnotateRateLimiter,
  searchPdfText,
  validateSearchQuery,
} from "@/lib/pdf-search.server";
import { PdfEditError } from "@/lib/pdf-edit";
import { logError } from "@/lib/log";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const user = await getToolsUser();
    const limit = pdfAnnotateRateLimiter.check(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests — wait a moment and try again." },
        { status: 429 }
      );
    }
    const url = new URL(request.url);
    const query = validateSearchQuery(url.searchParams.get("q") ?? "");
    const caseSensitive = url.searchParams.get("case") === "1";
    const wholeWord = url.searchParams.get("word") === "1";

    const userClient = await getToolsClient();
    const document = await fetchAnnotateDocument(userClient, id);
    const bytes = await fetchAnnotateDocumentBytes(document);
    const { pages } = await extractPdfText(bytes);
    const results = searchPdfText(pages, query, {
      caseSensitive,
      wholeWord,
    });
    return NextResponse.json(
      { ok: true, query, ...results },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AnnotateError || error instanceof PdfEditError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("pdf search", error);
    return NextResponse.json(
      { error: "Could not search this PDF." },
      { status: 500 }
    );
  }
}
