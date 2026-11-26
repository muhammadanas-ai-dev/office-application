// Export a PDF to XLSX, text-based (F24).
//
// GET /api/documents/[id]/pdf/to-xlsx
// Returns a real .xlsx workbook: one sheet per page with the
// page's text lines, plus one sheet per detected table with
// the table's cells in a grid. This is a TEXT export — the
// PDF's layout and formatting are not reproduced, and
// numbers are written as text. A PDF with no extractable
// text (a scanned PDF) is a 400 pointing at the OCR page.
// This is an export: it creates no document and no version.
import { NextResponse } from "next/server";
import { PdfEditError } from "@/lib/pdf-edit";
import { OcrError } from "@/lib/pdf-images.server";
import {
  buildPdfXlsx,
  fetchDocumentPdf,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  getXlsxFileName,
} from "@/lib/pdf-xlsx.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import { logError } from "@/lib/log";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
    const xlsxBytes = await buildPdfXlsx(bytes);
    const fileName = getXlsxFileName(document.title);
    const encoded = encodeURIComponent(fileName).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );
    return new Response(new Uint8Array(xlsxBytes), {
      status: 200,
      headers: {
        "Content-Type": XLSX_MIME,
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
    logError("pdf to-xlsx", error);
    return NextResponse.json(
      { error: "Could not export this PDF to XLSX." },
      { status: 500 }
    );
  }
}
