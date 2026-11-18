// Make a scanned PDF searchable (Day 21).
//
// POST /api/documents/[id]/pdf/make-searchable
// No body.
//
// Embeds the latest OCR result's word boxes as an invisible
// text layer (rendering mode 3) in the PDF, so the scanned PDF
// becomes searchable, selectable and copyable while the image
// is untouched. The words come from the stored OCR result (the
// `words` column on document_ocr_results, added by the Day 21
// migration) — the route does not re-run OCR. A PDF with no OCR
// result, or an OCR result with no words stored, is refused
// with a clear 400. Every make-searchable creates a new
// immutable version — the original file is never overwritten.
// Returns { ok, version, documentId, title }.
import { NextResponse } from "next/server";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  editJsonResponse,
  fetchEditableDocument,
  getLatestOcrWords,
  getToolsClient,
  getToolsUser,
  pdfEditRateLimiter,
  saveNewVersion,
} from "@/lib/pdf-searchable.server";
import { fetchDocumentPdf } from "@/lib/pdf-tools.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import { OcrError } from "@/lib/ocr";
import { embedOcrWordsInPdf } from "@/lib/pdf-searchable";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const user = await getToolsUser();
    const limit = pdfEditRateLimiter.check(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many PDF operations — try again in a moment." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          },
        }
      );
    }
    const userClient = await getToolsClient();
    const document = await fetchEditableDocument(userClient, id);
    const { bytes } = await fetchDocumentPdf(userClient, id);
    const pages = await getLatestOcrWords(userClient, id);
    if (!pages) {
      return NextResponse.json(
        {
          error:
            "This PDF has no OCR result yet — run OCR first, then make it searchable.",
        },
        { status: 400 }
      );
    }
    const { bytes: searchableBytes, skippedWords } = await embedOcrWordsInPdf(
      bytes,
      pages
    );
    const version = await saveNewVersion(document, user.id, searchableBytes);
    const response = editJsonResponse({
      version,
      documentId: document.id,
      title: document.title,
    });
    if (skippedWords > 0) {
      response.headers.set(
        "X-Forma-Searchable-Skipped-Words",
        String(skippedWords)
      );
    }
    return response;
  } catch (error) {
    if (
      error instanceof PdfEditError ||
      error instanceof PdfToolsError ||
      error instanceof OcrError
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf make-searchable]", error);
    return NextResponse.json(
      { error: "Could not make this PDF searchable." },
      { status: 500 }
    );
  }
}
