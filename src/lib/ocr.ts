// OCR engine (Phase C) — pure document logic.
//
// Runs the project's own Tesseract binary (ocr/vendor/bin/tesseract,
// built from the cloned source — see ocr/README.md) on an image or a
// scanned PDF, and returns the text per page with a confidence score.
// This module has NO server-only import and no Supabase/Next
// dependency, so it is unit-testable in Vitest — the auth/storage
// wiring lives in ocr.server.ts and the worker lives in ocr/worker.ts.
//
// Server-side by convention: it uses Node APIs (child_process, fs).
// Do NOT import this module from a client component — the browser
// build cannot provide those APIs.
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { PDFDocument } from "pdf-lib";

const execFileAsync = promisify(execFile);

/** An OCR failure with the HTTP status the route should return. */
export class OcrError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "OcrError";
    this.status = status;
  }
}

/** The languages the project ships language data for (ocr/tessdata/). */
export const OCR_LANGUAGES = ["eng", "urd", "ara"] as const;
export type OcrLanguage = (typeof OCR_LANGUAGES)[number];

export function isOcrLanguage(value: string): value is OcrLanguage {
  return (OCR_LANGUAGES as readonly string[]).includes(value);
}

/** Page cap per OCR job (v1) — a job that would exceed it is refused. */
export const OCR_MAX_PAGES = 20;
/** Per-page Tesseract timeout — a page that takes longer fails the job. */
export const OCR_PAGE_TIMEOUT_MS = 30_000;
/** Resolution pdftoppm renders PDF pages at (300 DPI is Tesseract's sweet spot). */
export const OCR_RENDER_DPI = 300;
/** Page segmentation mode: assume a uniform block of text. */
export const OCR_PSM = 6;

/** The MIME types OCR accepts. TIFF is refused: the project's
 *  Leptonica was built without TIFF support (see ocr/README.md). */
export const OCR_ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export type OcrAcceptedMimeType = (typeof OCR_ACCEPTED_MIME_TYPES)[number];

export function isOcrAcceptedMimeType(
  value: string | null
): value is OcrAcceptedMimeType {
  return (OCR_ACCEPTED_MIME_TYPES as readonly string[]).includes(value ?? "");
}

/** One recognised word, with Tesseract's confidence (0–100) and
 *  its bounding box in image pixels (left/top from the image's
 *  top-left, at the render DPI). The box is what "Make searchable"
 *  needs to place the invisible text over the word in the PDF. */
export interface OcrWord {
  text: string;
  confidence: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The OCR result for one page. */
export interface OcrPageResult {
  page: number;
  text: string;
  meanConfidence: number;
  words: OcrWord[];
}

/** The OCR result for a whole file. */
export interface OcrResult {
  pages: OcrPageResult[];
  language: OcrLanguage;
}

/**
 * The Tesseract binary. Overridable with OCR_TESSERACT_BIN; the
 * default is the project's own build, resolved from the working
 * directory (the project root for the app and for the worker).
 */
export function getTesseractBin(): string {
  const override = process.env.OCR_TESSERACT_BIN;
  if (override && override.trim() !== "") return override;
  return resolve(process.cwd(), "ocr", "vendor", "bin", "tesseract");
}

/**
 * The language-data directory. Overridable with OCR_TESSDATA_PREFIX;
 * the default is the project's own tessdata. It is passed to the
 * child process as TESSDATA_PREFIX.
 */
export function getTessdataPrefix(): string {
  const override = process.env.OCR_TESSDATA_PREFIX;
  if (override && override.trim() !== "") return override;
  return resolve(process.cwd(), "ocr", "tessdata");
}

/**
 * Parse Tesseract TSV output (the `tsv` config) into the text and
 * the recognised words. TSV columns: level, page_num, block_num,
 * par_num, line_num, word_num, left, top, width, height, conf, text.
 * Only level-5 rows (words) carry text. Words are grouped by line,
 * so the text keeps its line breaks. A word with no confidence
 * (conf -1) is kept with confidence 0 and excluded from the mean.
 */
export function parseTesseractTsv(tsv: string): {
  text: string;
  words: OcrWord[];
  meanConfidence: number;
} {
  const lines = tsv.split(/\r?\n/);
  if (lines.length === 0 || !lines[0].startsWith("level\t")) {
    throw new OcrError(
      502,
      "The OCR engine returned output in an unexpected format."
    );
  }
  const words: OcrWord[] = [];
  const textLines: string[] = [];
  let currentLineKey: string | null = null;
  let currentLineWords: string[] = [];
  const flushLine = () => {
    if (currentLineWords.length > 0) {
      textLines.push(currentLineWords.join(" "));
      currentLineWords = [];
    }
  };
  for (const line of lines.slice(1)) {
    if (line === "") continue;
    const cols = line.split("\t");
    if (cols.length < 12) continue;
    if (cols[0] !== "5") continue;
    const text = cols[11];
    if (!text) continue;
    const conf = Number(cols[10]);
    const left = Number(cols[6]);
    const top = Number(cols[7]);
    const width = Number(cols[8]);
    const height = Number(cols[9]);
    words.push({
      text,
      confidence: Number.isFinite(conf) && conf >= 0 ? conf : 0,
      left: Number.isFinite(left) ? left : 0,
      top: Number.isFinite(top) ? top : 0,
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
    });
    // Group words into lines by block / paragraph / line.
    const lineKey = `${cols[2]}:${cols[3]}:${cols[4]}`;
    if (currentLineKey !== null && lineKey !== currentLineKey) {
      flushLine();
    }
    currentLineKey = lineKey;
    currentLineWords.push(text);
  }
  flushLine();
  const confidences = words.map((w) => w.confidence).filter((c) => c > 0);
  const meanConfidence =
    confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;
  return { text: textLines.join("\n"), words, meanConfidence };
}

/**
 * Run Tesseract on one image file and return the page result.
 * The TSV is written to a temporary file (Tesseract's `tsv`
 * config needs a file output) and removed afterwards. Throws
 * OcrError on every failure path.
 */
export async function ocrImageFile(
  imagePath: string,
  language: OcrLanguage,
  page: number
): Promise<OcrPageResult> {
  const bin = getTesseractBin();
  const dir = await mkdtemp(join(tmpdir(), "forma-ocr-"));
  const outputBase = join(dir, `page-${page}`);
  try {
    try {
      await execFileAsync(
        bin,
        [
          imagePath,
          outputBase,
          "-l",
          language,
          "--psm",
          String(OCR_PSM),
          "tsv",
        ],
        {
          timeout: OCR_PAGE_TIMEOUT_MS,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, TESSDATA_PREFIX: getTessdataPrefix() },
        }
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new OcrError(
          503,
          "The OCR engine is not installed on this server — it is not set up."
        );
      }
      if ((error as { killed?: boolean }).killed) {
        throw new OcrError(
          502,
          `OCR timed out on page ${page} — the page may be too large or too complex.`
        );
      }
      throw new OcrError(
        502,
        `The OCR engine could not read page ${page} — the file may be damaged.`
      );
    }
    let tsv: string;
    try {
      tsv = await readFile(`${outputBase}.tsv`, "utf8");
    } catch {
      throw new OcrError(
        503,
        "The OCR engine is misconfigured — its output settings are missing from the language data directory."
      );
    }
    const parsed = parseTesseractTsv(tsv);
    return { page, ...parsed };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Count the pages of a PDF. Throws OcrError on invalid bytes. */
export async function countOcrPdfPages(bytes: Uint8Array): Promise<number> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    return doc.getPageCount();
  } catch {
    throw new OcrError(400, "This file is not a valid PDF.");
  }
}

/**
 * Render every page of a PDF to a PNG with pdftoppm (poppler-utils),
 * at OCR_RENDER_DPI. Returns the image paths in page order. The
 * caller owns the returned directory and must remove it.
 */
export async function renderPdfPagesToImages(
  bytes: Uint8Array,
  dir: string
): Promise<string[]> {
  const inputPath = join(dir, `input-${randomBytes(8).toString("hex")}.pdf`);
  const prefix = join(dir, "page");
  await writeFile(inputPath, bytes);
  try {
    await execFileAsync(
      "pdftoppm",
      ["-png", "-r", String(OCR_RENDER_DPI), inputPath, prefix],
      { timeout: OCR_PAGE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }
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
  const names = (await readdir(dir))
    .filter((name) => /^page-\d+\.png$/.test(name))
    .sort((a, b) => {
      const na = Number(a.slice(5, -4));
      const nb = Number(b.slice(5, -4));
      return na - nb;
    });
  if (names.length === 0) {
    throw new OcrError(502, "This PDF rendered no pages.");
  }
  return names.map((name) => join(dir, name));
}

/**
 * OCR a whole file — a scanned PDF (every page, in order) or a
 * single image. Returns the text per page with its confidence.
 * The file is never modified. Throws OcrError on every failure path.
 */
export async function ocrDocument(
  bytes: Uint8Array,
  mimeType: string,
  language: OcrLanguage
): Promise<OcrResult> {
  if (!isOcrAcceptedMimeType(mimeType)) {
    throw new OcrError(
      400,
      "OCR works on PDF, PNG and JPEG files — this file is a different type."
    );
  }
  if (mimeType === "application/pdf") {
    const pageCount = await countOcrPdfPages(bytes);
    if (pageCount === 0) {
      throw new OcrError(400, "This PDF has no pages.");
    }
    if (pageCount > OCR_MAX_PAGES) {
      throw new OcrError(
        400,
        `This PDF has ${pageCount} pages — OCR handles at most ${OCR_MAX_PAGES} pages at a time.`
      );
    }
    const dir = await mkdtemp(join(tmpdir(), "forma-ocr-"));
    try {
      const imagePaths = await renderPdfPagesToImages(bytes, dir);
      if (imagePaths.length !== pageCount) {
        throw new OcrError(
          502,
          `This PDF has ${pageCount} pages but only ${imagePaths.length} rendered.`
        );
      }
      const pages: OcrPageResult[] = [];
      for (let i = 0; i < imagePaths.length; i++) {
        pages.push(await ocrImageFile(imagePaths[i], language, i + 1));
      }
      return { pages, language };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  const dir = await mkdtemp(join(tmpdir(), "forma-ocr-"));
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const imagePath = join(dir, `image-${randomBytes(8).toString("hex")}.${ext}`);
  try {
    await writeFile(imagePath, bytes);
    const page = await ocrImageFile(imagePath, language, 1);
    return { pages: [page], language };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
