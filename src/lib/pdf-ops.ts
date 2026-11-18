// PDF operations (Phase B, feature 2) — pure document logic.
//
// Merge, split, rotate (pdf-lib) and compress (Ghostscript) take
// bytes in and return bytes out. This module has NO server-only
// import and no Supabase/Next dependency, so it is unit-testable in
// Vitest — the auth/storage wiring lives in pdf-tools.server.ts.
//
// Server-side by convention: compressPdf uses Node APIs
// (child_process, fs). Do NOT import this module from a client
// component — the browser build cannot provide those APIs.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { PDFDocument, degrees } from "pdf-lib";
import {
  MAX_PDF_PAGES,
  PDF_TOOLS_TIMEOUT_MS,
  looksLikePdf,
  type CompressLevel,
} from "@/lib/pdf-tools";

const execFileAsync = promisify(execFile);

/** A PDF operation failure with the HTTP status the route should return. */
export class PdfToolsError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PdfToolsError";
    this.status = status;
  }
}

/** Load a PDF and return its page count. Throws on invalid bytes. */
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    return doc.getPageCount();
  } catch {
    throw new PdfToolsError(400, "This file is not a valid PDF.");
  }
}

async function loadPdf(bytes: Uint8Array, label: string) {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch {
    throw new PdfToolsError(400, `${label} is not a valid PDF.`);
  }
}

/**
 * Merge several PDFs into one, in order. Every input is validated;
 * the total page count is capped at MAX_PDF_PAGES.
 */
export async function mergePdfs(inputs: Uint8Array[]): Promise<Uint8Array> {
  let totalPages = 0;
  const docs = [];
  for (let i = 0; i < inputs.length; i++) {
    if (!looksLikePdf(inputs[i])) {
      throw new PdfToolsError(400, `Document ${i + 1} is not a valid PDF.`);
    }
    const doc = await loadPdf(inputs[i], `Document ${i + 1}`);
    totalPages += doc.getPageCount();
    docs.push(doc);
  }
  if (totalPages === 0) {
    throw new PdfToolsError(400, "Nothing to merge — the PDFs have no pages.");
  }
  if (totalPages > MAX_PDF_PAGES) {
    throw new PdfToolsError(
      400,
      `Merging these PDFs would make ${totalPages} pages — the limit is ${MAX_PDF_PAGES}.`
    );
  }
  const merged = await PDFDocument.create();
  for (const doc of docs) {
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return merged.save();
}

/**
 * Extract pages (1-based, in the given order, duplicates allowed)
 * into a new PDF.
 */
export async function splitPdf(
  bytes: Uint8Array,
  pages: number[]
): Promise<Uint8Array> {
  const source = await loadPdf(bytes, "This file");
  const count = source.getPageCount();
  for (const page of pages) {
    if (page < 1 || page > count) {
      throw new PdfToolsError(
        400,
        `This PDF has ${count} pages — page ${page} is past the end.`
      );
    }
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    source,
    pages.map((page) => page - 1)
  );
  for (const page of copied) out.addPage(page);
  return out.save();
}

/**
 * Rotate pages by `degrees` clockwise, ADDITIVE to each page's
 * current rotation (a page already at 90° rotated by 90° ends at
 * 180°, which is what "rotate these pages" means).
 */
export async function rotatePdf(
  bytes: Uint8Array,
  pages: number[],
  degreesToAdd: 90 | 180 | 270
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes, "This file");
  const count = doc.getPageCount();
  for (const page of pages) {
    if (page < 1 || page > count) {
      throw new PdfToolsError(
        400,
        `This PDF has ${count} pages — page ${page} is past the end.`
      );
    }
  }
  for (const pageNumber of pages) {
    const page = doc.getPage(pageNumber - 1);
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + degreesToAdd) % 360));
  }
  return doc.save();
}

/** Ghostscript PDFSETTINGS for each compression level. */
const GS_SETTINGS: Record<CompressLevel, string> = {
  screen: "/screen",
  ebook: "/ebook",
  printer: "/printer",
};

/**
 * Compress a PDF with Ghostscript (real compression: downsamples
 * images, subsets fonts, drops duplicate objects). Returns the
 * smaller of the compressed output and the original — if
 * Ghostscript cannot shrink the file, the original is returned
 * with savedBytes 0, never a larger "compressed" file.
 */
export async function compressPdf(
  bytes: Uint8Array,
  level: CompressLevel
): Promise<{ bytes: Uint8Array; savedBytes: number }> {
  const dir = await mkdtemp(join(tmpdir(), "forma-pdf-"));
  const inputPath = join(dir, `input-${randomBytes(8).toString("hex")}.pdf`);
  const outputPath = join(dir, `output-${randomBytes(8).toString("hex")}.pdf`);
  try {
    await writeFile(inputPath, bytes);
    try {
      await execFileAsync(
        "gs",
        [
          "-sDEVICE=pdfwrite",
          "-dCompatibilityLevel=1.5",
          `-dPDFSETTINGS=${GS_SETTINGS[level]}`,
          "-dDetectDuplicateImages=true",
          "-dNOPAUSE",
          "-dQUIET",
          "-dBATCH",
          `-sOutputFile=${outputPath}`,
          inputPath,
        ],
        { timeout: PDF_TOOLS_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new PdfToolsError(
          503,
          "PDF compression needs Ghostscript on the server — it is not installed."
        );
      }
      throw new PdfToolsError(
        502,
        "This PDF could not be compressed — it may be encrypted or damaged."
      );
    }
    const compressed = new Uint8Array(await readFile(outputPath));
    if (!looksLikePdf(compressed)) {
      throw new PdfToolsError(
        502,
        "Compression produced a file that is not a valid PDF."
      );
    }
    // Integrity check: the page count must survive compression.
    const before = await countPdfPages(bytes);
    const after = await countPdfPages(compressed);
    if (before !== after) {
      throw new PdfToolsError(
        502,
        "Compression changed the page count — the result was discarded."
      );
    }
    if (compressed.length >= bytes.length) {
      return { bytes, savedBytes: 0 };
    }
    return { bytes: compressed, savedBytes: bytes.length - compressed.length };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
