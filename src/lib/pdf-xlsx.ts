// PDF → XLSX model — pure helpers (F24).
//
// The text-based PDF-to-Excel export: the workbook model is
// built from the PDF's extracted text and its detected
// tables (F23), then rendered to a real .xlsx by the server
// module (ExcelJS). Keeping the model pure makes the sheet
// layout unit-testable without touching the file format.
//
// Layout:
//   - One sheet per page with the page's text lines, one
//     line per row in column A ("Page 1", "Page 2", …).
//   - One sheet per detected table ("P1 Table 1", …) with
//     the table's cells in a real grid.
// A page with no text gets no sheet. Numbers stay text —
// this is a text export, and the route says so; the layout
// and formatting of the PDF are not reproduced (the
// docserver conversion, when available, is the
// layout-preserving path for Office formats).
import type { DetectedTable } from "@/lib/pdf-tables";

export interface XlsxSheet {
  name: string;
  rows: string[][];
}

/** Excel sheet-name rules: at most 31 characters, none of
 *  [ ] : * ? / \ — and unique within the workbook. */
export function sanitizeSheetName(raw: string, used: Set<string>): string {
  let name = raw.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = name.slice(0, 31 - suffix.length) + suffix;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

/** Build the workbook model from per-page text and the
 *  detected tables. */
export function buildXlsxSheets(
  pages: { page: number; text: string }[],
  tables: DetectedTable[]
): XlsxSheet[] {
  const used = new Set<string>();
  const sheets: XlsxSheet[] = [];
  for (const { page, text } of pages) {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "");
    if (lines.length === 0) continue;
    sheets.push({
      name: sanitizeSheetName(`Page ${page}`, used),
      rows: lines.map((l) => [l]),
    });
  }
  const perPageCount = new Map<number, number>();
  for (const table of tables) {
    const n = (perPageCount.get(table.page) ?? 0) + 1;
    perPageCount.set(table.page, n);
    sheets.push({
      name: sanitizeSheetName(`P${table.page} Table ${n}`, used),
      rows: table.rows,
    });
  }
  return sheets;
}

/** True when the model has at least one sheet with a row. */
export function xlsxSheetsHaveContent(sheets: XlsxSheet[]): boolean {
  return sheets.some((s) => s.rows.length > 0);
}

/** The file name for a document's XLSX export. */
export function getXlsxFileName(title: string): string {
  const base = title.replace(/\.[^.]+$/, "").trim() || "document";
  return `${base}.xlsx`;
}
