// Server side of PDF redaction (F26).
//
// redactInPdf (pdf-edit.ts) removes the content; this
// wrapper then rebuilds the file with qpdf — the rebuild
// drops objects that are no longer referenced (a redacted
// image's object and its mask), so the removed content is
// not merely undrawn but absent from the file. qpdf is
// required: without it the guarantee cannot be made, so a
// missing qpdf is a 503, never a silent downgrade.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PdfEditError, redactInPdf } from "@/lib/pdf-edit";
import type { RedactRegion } from "@/lib/pdf-redact";

export { RedactError, validateRedactRegions } from "@/lib/pdf-redact";
export type { RedactRegion } from "@/lib/pdf-redact";
export {
  AnnotateError,
  fetchAnnotateDocument,
  fetchAnnotateDocumentBytes,
  getToolsClient,
  getToolsUser,
  pdfAnnotateRateLimiter,
  saveAnnotatedVersion,
} from "@/lib/pdf-annotate.server";

const execFileAsync = promisify(execFile);

/** Rebuild a PDF with qpdf (dropping unreferenced objects). */
async function rebuildWithQpdf(bytes: Uint8Array): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "forma-pdf-redact-"));
  const inputPath = join(dir, "input.pdf");
  const outputPath = join(dir, "output.pdf");
  try {
    await writeFile(inputPath, bytes);
    try {
      await execFileAsync(
        process.env.QPDF_BIN?.trim() || "qpdf",
        [inputPath, outputPath],
        { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new PdfEditError(
          503,
          "Redaction needs the qpdf tool on the server to rebuild the file without the removed content — it is not installed."
        );
      }
      // qpdf exit code 3 means "warnings, output produced" —
      // accept the output when it exists.
      const exitCode = (error as { code?: unknown }).code;
      if (exitCode !== 3) {
        throw new PdfEditError(500, "Could not rebuild the redacted PDF.");
      }
    }
    return new Uint8Array(await readFile(outputPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Redact and rebuild. Returns the new bytes and the removal
 *  counts from the content pass. */
export async function redactPdfBytes(
  bytes: Uint8Array,
  regions: RedactRegion[]
): Promise<{
  bytes: Uint8Array;
  removedTextRuns: number;
  removedImages: number;
  removedAnnotations: number;
}> {
  const result = await redactInPdf(bytes, regions);
  const rebuilt = await rebuildWithQpdf(result.bytes);
  return { ...result, bytes: rebuilt };
}
