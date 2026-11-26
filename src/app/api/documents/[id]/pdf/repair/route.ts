// Repair a PDF (F36).
//
// POST /api/documents/[id]/pdf/repair
//
// qpdf rebuilds the file's cross-reference tables and
// object streams, repairing common corruption. When qpdf
// finds nothing wrong AND the rebuild is byte-identical,
// no new version is saved — the response says the file is
// already healthy. Otherwise the rebuilt file is saved as
// a new version, with qpdf's own notes about what it
// fixed.
import { NextResponse } from "next/server";
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
import { repairPdfBytes } from "@/lib/pdf-repair.server";
import { logError } from "@/lib/log";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    const result = await repairPdfBytes(bytes);
    if (!result.hadProblems && !result.changed) {
      return NextResponse.json({
        ok: true,
        repaired: false,
        message:
          "This PDF is healthy — qpdf found nothing to repair and the rebuild changed nothing, so no new version was saved.",
        documentId: document.id,
        title: document.title,
      });
    }
    const version = await saveNewVersion(document, user.id, result.bytes);
    return NextResponse.json(
      {
        ok: true,
        version,
        documentId: document.id,
        title: document.title,
        repaired: true,
        hadProblems: result.hadProblems,
        warnings: result.warnings,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof PdfEditError || error instanceof PdfToolsError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logError("pdf repair", error);
    return NextResponse.json(
      { error: "Could not repair this PDF." },
      { status: 500 }
    );
  }
}
