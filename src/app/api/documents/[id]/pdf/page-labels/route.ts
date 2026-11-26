// Set a PDF's page labels (F37).
//
// POST /api/documents/[id]/pdf/page-labels
// Body: { "ranges": [{ "fromPage": 1, "style": "roman-lower",
//                      "prefix": "", "start": 1 }, ...] }
//
// Writes the /PageLabels number tree (the numbers readers
// show for pages) and saves a new version.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PdfEditError,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  pdfEditRateLimiter,
  saveNewVersion,
} from "@/lib/pdf-edit.server";
import { fetchDocumentPdf } from "@/lib/pdf-tools.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import { countPdfPages } from "@/lib/pdf-ops";
import {
  setPdfPageLabels,
  validateLabelRanges,
} from "@/lib/pdf-labels";
import { logError } from "@/lib/log";

const LabelsBody = z.object({
  ranges: z.array(z.unknown()).min(1).max(50),
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
  const parsed = LabelsBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  try {
    const user = await getToolsUser();
    const limit = pdfEditRateLimiter.check(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests — wait a moment and try again." },
        { status: 429 }
      );
    }
    const userClient = await getToolsClient();
    const document = await fetchEditableDocument(userClient, id);
    const { bytes } = await fetchDocumentPdf(userClient, id);
    const pageCount = await countPdfPages(bytes);
    const ranges = validateLabelRanges(parsed.data.ranges, pageCount);
    const newBytes = await setPdfPageLabels(bytes, ranges);
    const version = await saveNewVersion(document, user.id, newBytes);
    return NextResponse.json({
      ok: true,
      version,
      documentId: document.id,
      title: document.title,
      ranges,
    });
  } catch (error) {
    if (error instanceof PdfEditError || error instanceof PdfToolsError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("pdf page-labels", error);
    return NextResponse.json(
      { error: "Could not set the page labels." },
      { status: 500 }
    );
  }
}
