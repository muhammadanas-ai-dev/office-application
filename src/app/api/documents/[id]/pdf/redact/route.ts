// Redact areas of a PDF (F26).
//
// POST /api/documents/[id]/pdf/redact
// Body: { "regions": [{ page, x, y, width, height }, ...] }
// (PDF points, bottom-left origin.)
//
// PERMANENT removal, saved as a new version (the pre-redaction
// version stays in the version history — redaction is for the
// copies you share, and the UI says exactly that). Every text
// run and image under a region is deleted from the content,
// annotations touching a region are removed, a black box is
// drawn over each region, and qpdf rebuilds the file so
// removed image objects leave the file entirely.
// Returns { ok, version, documentId, title, removed }.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AnnotateError,
  RedactError,
  fetchAnnotateDocument,
  fetchAnnotateDocumentBytes,
  getToolsClient,
  getToolsUser,
  pdfAnnotateRateLimiter,
  redactPdfBytes,
  saveAnnotatedVersion,
  validateRedactRegions,
} from "@/lib/pdf-redact.server";
import { PdfEditError } from "@/lib/pdf-edit";
import { logError } from "@/lib/log";

const RedactBody = z.object({
  regions: z.array(z.unknown()).min(1).max(200),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
  const parsed = RedactBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Mark at least one area to redact first." },
      { status: 400 }
    );
  }

  try {
    const user = await getToolsUser();
    const limit = pdfAnnotateRateLimiter.check(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests — wait a moment and try again." },
        { status: 429 }
      );
    }
    const regions = validateRedactRegions(parsed.data.regions);
    const userClient = await getToolsClient();
    const document = await fetchAnnotateDocument(userClient, id);
    const bytes = await fetchAnnotateDocumentBytes(document);
    const result = await redactPdfBytes(bytes, regions);
    const version = await saveAnnotatedVersion(document, user.id, result.bytes);
    return NextResponse.json(
      {
        ok: true,
        version,
        documentId: document.id,
        title: document.title,
        removed: {
          textRuns: result.removedTextRuns,
          images: result.removedImages,
          annotations: result.removedAnnotations,
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (
      error instanceof AnnotateError ||
      error instanceof PdfEditError ||
      error instanceof RedactError
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("pdf redact", error);
    return NextResponse.json(
      { error: "Could not redact this PDF." },
      { status: 500 }
    );
  }
}
