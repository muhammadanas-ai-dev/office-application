// Export with comments (Day 34).
//
// POST /api/documents/[id]/pdf/export-comments
// Body: { "mode": "flattened" }
//
// Creates a new version of the PDF with the annotations drawn
// INTO the page content (highlight quads as translucent
// rectangles, underline/strikeout as lines, ink strokes as
// polylines) and the annotation dicts removed, plus a comments
// summary page appended at the end listing every annotation in
// page order. Note annotations are not drawn (a note has no
// printable geometry) — their text lives on the summary page.
// A document with no annotations is refused (400). The original
// file is never overwritten.
// Returns { ok, version, documentId, title }.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AnnotateError,
  annotateJsonResponse,
  appendCommentsSummaryInPdf,
  fetchAnnotateDocument,
  fetchAnnotateDocumentBytes,
  flattenAnnotationsInPdf,
  getToolsClient,
  getToolsUser,
  listAnnotationsInPdf,
  pdfAnnotateRateLimiter,
  saveAnnotatedVersion,
} from "@/lib/pdf-annotate.server";

const ExportCommentsBody = z.object({
  mode: z.literal("flattened"),
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

  const parsed = ExportCommentsBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 }
    );
  }

  try {
    const user = await getToolsUser();
    const limit = pdfAnnotateRateLimiter.check(user.id);
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
    const document = await fetchAnnotateDocument(userClient, id);
    const bytes = await fetchAnnotateDocumentBytes(document);
    const annotations = await listAnnotationsInPdf(bytes);
    if (annotations.length === 0) {
      throw new AnnotateError(400, "This document has no comments to export.");
    }
    const flattened = await flattenAnnotationsInPdf(bytes);
    const withSummary = await appendCommentsSummaryInPdf(
      flattened,
      annotations
    );
    const version = await saveAnnotatedVersion(document, user.id, withSummary);
    return annotateJsonResponse({
      version,
      documentId: document.id,
      title: document.title,
    });
  } catch (error) {
    if (error instanceof AnnotateError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[pdf export-comments]", error);
    return NextResponse.json(
      { error: "Could not export the comments." },
      { status: 500 }
    );
  }
}
