// PDF <-> image (Day 22) — server-only helpers.
//
// Renders a PDF's pages with pdftoppm and zips the images with
// the `zip` command. Both are system binaries (poppler-utils
// and info-zip) — they do NOT survive a VM reset, so a missing
// binary is a clear 503, never a silent failure.
import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import {
  PdfEditError,
  fetchEditableDocument,
  getToolsClient,
  getToolsUser,
  pdfEditRateLimiter,
} from "@/lib/pdf-edit.server";
import { fetchDocumentPdf } from "@/lib/pdf-tools.server";
import { PdfToolsError } from "@/lib/pdf-ops";
import { OcrError, countOcrPdfPages } from "@/lib/ocr";
import {
  MAX_IMAGE_EXPORT_PAGES,
  type ImageExportDpi,
  type ImageExportFormat,
} from "@/lib/pdf-images";

const execFileAsync = promisify(execFile);

export {
  PdfEditError,
  PdfToolsError,
  OcrError,
  fetchEditableDocument,
  fetchDocumentPdf,
  getToolsClient,
  getToolsUser,
  pdfEditRateLimiter,
  countOcrPdfPages,
};

/**
 * Render every page of a PDF to an image file with pdftoppm,
 * in a fresh temp dir. Returns the image file paths in page
 * order (page-1.png, page-2.png, …). The caller owns the temp
 * dir (it is removed by `withTempDir`). A missing pdftoppm is
 * a 503; a PDF that cannot be rendered is a 502.
 */
export async function renderPdfPagesToImages(
  bytes: Uint8Array,
  dir: string,
  format: ImageExportFormat,
  dpi: ImageExportDpi
): Promise<string[]> {
  const inputPath = join(dir, `input-${randomBytes(8).toString("hex")}.pdf`);
  const prefix = join(dir, "page");
  await writeFile(inputPath, bytes);
  // pdftoppm's JPEG flag is -jpeg (not -jpg), but the files it
  // writes use the .jpg extension.
  const pdftoppmFlag = format === "jpg" ? "-jpeg" : "-png";
  try {
    await execFileAsync(
      "pdftoppm",
      [pdftoppmFlag, "-r", String(dpi), inputPath, prefix],
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new OcrError(
        503,
        "PDF page rendering needs poppler-utils (pdftoppm) on the server — it is not installed."
      );
    }
    throw new OcrError(
      502,
      "This PDF could not be rendered — it may be encrypted or damaged."
    );
  }
  const files = (await readdir(dir))
    .filter((f) => f.startsWith("page-") && f.endsWith(`.${format}`))
    .sort((a, b) => {
      const na = Number(a.slice(5, -`.${format}`.length));
      const nb = Number(b.slice(5, -`.${format}`.length));
      return na - nb;
    })
    .map((f) => join(dir, f));
  return files;
}

/**
 * Zip image files into one archive (the `zip` command, `-j`
 * to store just the file names, no directory). Returns the ZIP
 * bytes. A missing `zip` binary is a 503.
 */
export async function zipImageFiles(
  dir: string,
  imagePaths: string[]
): Promise<Uint8Array> {
  const zipPath = join(dir, `pages-${randomBytes(8).toString("hex")}.zip`);
  try {
    await execFileAsync("zip", ["-j", "-q", zipPath, ...imagePaths], {
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new PdfEditError(
        503,
        "Image export needs the zip tool on the server — it is not installed."
      );
    }
    throw new PdfEditError(500, "Could not zip the exported images.");
  }
  return readFile(zipPath);
}

/** Run a function with a fresh temp dir, removed afterwards. */
export async function withTempDir<T>(
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "forma-pdf-images-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The most pages one export renders (the OCR cap). */
export { MAX_IMAGE_EXPORT_PAGES };
