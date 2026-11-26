// Batch PDF export (F28) — server side.
//
// Converts each requested document with the text-based
// exporters and zips the results. A document that fails
// (no access, not a PDF, no extractable text) does not
// fail the batch: it is listed in batch-errors.txt inside
// the ZIP. Only when EVERY document fails does the caller
// get an error.
import "server-only";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PdfToolsError } from "@/lib/pdf-ops";
import { fetchDocumentPdf } from "@/lib/pdf-tools.server";
import { withTempDir, zipImageFiles } from "@/lib/pdf-images.server";
import { extractPdfText } from "@/lib/pdf-searchable";
import { buildPdfXlsx } from "@/lib/pdf-xlsx.server";
import { buildPdfPptx } from "@/lib/pdf-pptx.server";
import {
  batchFileName,
  type BatchExportFormat,
} from "@/lib/pdf-batch";

export interface BatchFailure {
  documentId: string;
  message: string;
}

export interface BatchResult {
  zipBytes: Uint8Array;
  succeeded: number;
  failures: BatchFailure[];
}

async function convertOne(
  bytes: Uint8Array,
  format: BatchExportFormat
): Promise<Uint8Array> {
  if (format === "xlsx") return buildPdfXlsx(bytes);
  if (format === "pptx") return buildPdfPptx(bytes);
  const { text } = await extractPdfText(bytes);
  if (text.trim().length === 0) {
    throw new PdfToolsError(
      400,
      "No extractable text — if this PDF is a scan, run “Make searchable” on it first."
    );
  }
  return new TextEncoder().encode(text);
}

export async function buildBatchExport(
  userClient: Awaited<
    ReturnType<typeof import("@/lib/supabase/server").createClient>
  >,
  documentIds: string[],
  format: BatchExportFormat
): Promise<BatchResult> {
  const failures: BatchFailure[] = [];
  const outputs: { name: string; bytes: Uint8Array }[] = [];
  const taken = new Set<string>();
  for (const documentId of documentIds) {
    try {
      const { document, bytes } = await fetchDocumentPdf(
        userClient,
        documentId
      );
      const converted = await convertOne(bytes, format);
      outputs.push({
        name: batchFileName(document.title, format, taken),
        bytes: converted,
      });
    } catch (error) {
      failures.push({
        documentId,
        message:
          error instanceof Error ? error.message : "Conversion failed.",
      });
    }
  }
  if (outputs.length === 0) {
    const first = failures[0];
    throw new PdfToolsError(
      400,
      first
        ? `None of the selected PDFs could be exported. First problem: ${first.message}`
        : "None of the selected PDFs could be exported."
    );
  }
  const zipBytes = await withTempDir(async (dir) => {
    const paths: string[] = [];
    for (const output of outputs) {
      const path = join(dir, output.name);
      await writeFile(path, output.bytes);
      paths.push(path);
    }
    if (failures.length > 0) {
      const notesPath = join(dir, "batch-errors.txt");
      await writeFile(
        notesPath,
        [
          "These PDFs could not be exported:",
          "",
          ...failures.map((f) => `- ${f.documentId}: ${f.message}`),
          "",
        ].join("\n")
      );
      paths.push(notesPath);
    }
    return zipImageFiles(dir, paths);
  });
  return { zipBytes, succeeded: outputs.length, failures };
}
