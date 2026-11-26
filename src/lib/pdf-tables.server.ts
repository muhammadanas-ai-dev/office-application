// Server side of PDF table extraction (F23).
//
// Reads every page's text runs with the Day 9 extractor and
// runs the pure detector over them. The CSV files are zipped
// with the Day 22 zip helper. Re-exports the tools helpers
// the route needs, following the established pattern.
import { listPdfTextRuns } from "@/lib/pdf-edit";
import {
  detectTablesInRuns,
  getTableFileName,
  tableToCsv,
  type DetectedTable,
} from "@/lib/pdf-tables";
import { countPdfPages } from "@/lib/pdf-tools.server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export {
  getTableFileName,
  getTablesFileName,
  tableToCsv,
  type DetectedTable,
} from "@/lib/pdf-tables";
export {
  fetchDocumentPdf,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  withTempDir,
  zipImageFiles,
} from "@/lib/pdf-images.server";

/** Detect every table in a PDF, page by page. */
export async function extractTablesFromPdf(
  bytes: Uint8Array
): Promise<DetectedTable[]> {
  const pageCount = await countPdfPages(bytes);
  const tables: DetectedTable[] = [];
  for (let page = 1; page <= pageCount; page++) {
    const runs = await listPdfTextRuns(bytes, page);
    tables.push(...detectTablesInRuns(runs, page));
  }
  return tables;
}

/** Write the tables as CSV files in `dir`; returns the file
 *  paths in table order. */
export async function writeTableCsvFiles(
  tables: DetectedTable[],
  dir: string
): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < tables.length; i++) {
    const path = join(dir, getTableFileName(i, tables[i].page));
    await writeFile(path, tableToCsv(tables[i]), "utf8");
    paths.push(path);
  }
  return paths;
}
