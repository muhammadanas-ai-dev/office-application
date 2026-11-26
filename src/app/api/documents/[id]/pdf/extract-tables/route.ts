// Extract a PDF's tables as CSV files (F23).
//
// GET /api/documents/[id]/pdf/extract-tables
// Returns a ZIP with one CSV per detected table
// (table-<n>-page-<p>.csv). Detection is a text-alignment
// heuristic over the PDF's text layer: it finds tables whose
// cells are drawn as aligned columns of text. It cannot see
// ruled lines, merged cells, or tables drawn as images — a
// PDF where no aligned table is found is a 400 saying so.
// This is an export: it creates no document and no version.
import { NextResponse } from "next/server";
import { PdfEditError } from "@/lib/pdf-edit";
import { OcrError } from "@/lib/pdf-images.server";
import {
  extractTablesFromPdf,
  fetchDocumentPdf,
  fetchEditableDocument,
  getTablesFileName,
  getToolsClient,
  getToolsUser,
  withTempDir,
  writeTableCsvFiles,
  zipImageFiles,
} from "@/lib/pdf-tables.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import { logError } from "@/lib/log";

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
    const tables = await extractTablesFromPdf(bytes);
    if (tables.length === 0) {
      return NextResponse.json(
        {
          error:
            "No tables were detected in this PDF. Tables are found by aligned columns of text — ruled-only, merged-cell, or scanned-image tables cannot be detected.",
        },
        { status: 400 }
      );
    }
    const zipBytes = await withTempDir(async (dir) => {
      const paths = await writeTableCsvFiles(tables, dir);
      return zipImageFiles(dir, paths);
    });
    const fileName = getTablesFileName(document.title);
    const encoded = encodeURIComponent(fileName).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );
    return new Response(new Uint8Array(zipBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encoded}`,
        "X-Forma-Tables": String(tables.length),
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
    logError("pdf extract-tables", error);
    return NextResponse.json(
      { error: "Could not extract this PDF's tables." },
      { status: 500 }
    );
  }
}
