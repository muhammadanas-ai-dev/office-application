// Server side of PDF → XLSX (F24).
//
// Builds the pure workbook model (pdf-xlsx.ts) from the
// Day 21 text extraction and the F23 table detection, then
// renders it with ExcelJS (server-only — this module is
// never imported by client code).
import ExcelJS from "exceljs";
import { extractPdfText } from "@/lib/pdf-searchable";
import { extractTablesFromPdf } from "@/lib/pdf-tables.server";
import {
  buildXlsxSheets,
  xlsxSheetsHaveContent,
  type XlsxSheet,
} from "@/lib/pdf-xlsx";
import { PdfEditError } from "@/lib/pdf-edit";

export { getXlsxFileName } from "@/lib/pdf-xlsx";
export {
  fetchDocumentPdf,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
} from "@/lib/pdf-images.server";

/** Render the workbook model to .xlsx bytes. */
export async function renderXlsx(sheets: XlsxSheet[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Forma Office";
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) {
      ws.addRow(row);
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/**
 * Build a PDF's XLSX export bytes. Throws PdfEditError(400)
 * when the PDF carries no extractable text at all (a scanned
 * PDF — the OCR page is the fix).
 */
export async function buildPdfXlsx(bytes: Uint8Array): Promise<Uint8Array> {
  const { pages } = await extractPdfText(bytes);
  const tables = await extractTablesFromPdf(bytes);
  const sheets = buildXlsxSheets(pages, tables);
  if (!xlsxSheetsHaveContent(sheets)) {
    throw new PdfEditError(
      400,
      "This PDF has no extractable text to export. If it is a scanned PDF, run OCR first (the OCR page), then export."
    );
  }
  return renderXlsx(sheets);
}
