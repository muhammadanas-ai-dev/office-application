// Export a PDF to PPTX, text-based (F25).
//
// GET /api/documents/[id]/pdf/to-pptx
// Returns a real .pptx deck: one slide per PDF page, the
// page's first text line as the slide title and the rest as
// the body. This is a TEXT export — the PDF's layout,
// images and formatting are not reproduced. A PDF with no
// extractable text (a scanned PDF) is a 400 pointing at the
// OCR page. This is an export: it creates no document and
// no version.
import { NextResponse } from "next/server";
import { PdfEditError } from "@/lib/pdf-edit";
import { OcrError } from "@/lib/pdf-images.server";
import {
  buildPdfPptx,
  fetchDocumentPdf,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  getPptxFileName,
} from "@/lib/pdf-pptx.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import { logError } from "@/lib/log";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await getToolsUser();
    const userClient = await getToolsClient();
    const document = await fetchEditableDocument(userClient, id);
    const { bytes } = await fetchDocumentPdf(userClient, id);
    const pptxBytes = await buildPdfPptx(bytes);
    const fileName = getPptxFileName(document.title);
    const encoded = encodeURIComponent(fileName).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );
    return new Response(new Uint8Array(pptxBytes), {
      status: 200,
      headers: {
        "Content-Type": PPTX_MIME,
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encoded}`,
      },
    });
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
    logError("pdf to-pptx", error);
    return NextResponse.json(
      { error: "Could not export this PDF to PPTX." },
      { status: 500 }
    );
  }
}
