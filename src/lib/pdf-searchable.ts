// Searchable PDF (Day 21) — pure helpers.
//
// Embed the OCR words as an invisible text layer in a scanned
// PDF, so the PDF becomes searchable, selectable and copyable
// while the scanned image is untouched. The text is drawn with
// text rendering mode 3 ("neither fill nor stroke") — the
// standard "searchable PDF" approach — via pdf-lib's low-level
// operators, because `page.drawText` has no rendering-mode
// option. Nothing here touches the filesystem or a network, so
// it is safe to import from anywhere, including tests.
import {
  PDFDocument,
  PDFName,
  StandardFonts,
  TextRenderingMode,
  beginText,
  endText,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { PdfEditError, listPdfTextRuns } from "@/lib/pdf-edit";
import { OCR_RENDER_DPI, type OcrWord } from "@/lib/ocr";
import { looksLikePdf } from "@/lib/pdf-tools";

/** The OCR words for one page, with the page they belong to. */
export interface SearchablePageWords {
  pageNumber: number;
  words: OcrWord[];
}

/** Convert an image-pixel coordinate to PDF points (the OCR
 *  renders pages at OCR_RENDER_DPI). */
function toPoints(pixels: number): number {
  return (pixels * 72) / OCR_RENDER_DPI;
}

/** Load a PDF, refusing anything that is not one (the
 *  pdf-edit.ts pattern). */
async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  if (!looksLikePdf(bytes)) {
    throw new PdfEditError(400, "This file is not a valid PDF.");
  }
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch {
    throw new PdfEditError(400, "This PDF is not a valid PDF.");
  }
}

/** The font resource key for a page. `page.setFont` registers
 *  the font in the page's Resources; the key is a private
 *  property in pdf-lib's types, so it is read through a narrow
 *  cast (documented here, not hidden). */
function getFontKey(page: PDFPage, font: PDFFont): string | PDFName {
  page.setFont(font);
  const key = (page as unknown as { fontKey?: string | PDFName }).fontKey;
  if (!key) {
    throw new PdfEditError(500, "Could not register the font.");
  }
  return key;
}

/**
 * Extract a PDF's text, page by page, as plain text. Each page's
 * runs are grouped into lines (by their baseline y) and joined
 * with a space; pages are separated by a blank line. A scanned
 * PDF with no text layer returns empty text — that is the case
 * "Make searchable" fixes. Uses the Day 9 extractor
 * (`listPdfTextRuns`), so it reads exactly the text a reader
 * would show.
 */
export async function extractPdfText(
  bytes: Uint8Array
): Promise<{ pages: { page: number; text: string }[]; text: string }> {
  const doc = await loadPdf(bytes);
  const pageCount = doc.getPageCount();
  const pages: { page: number; text: string }[] = [];
  for (let page = 1; page <= pageCount; page++) {
    const runs = await listPdfTextRuns(bytes, page);
    // Group into lines by baseline y (top to bottom), runs
    // within a line sorted left to right.
    const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: string[] = [];
    let currentY: number | null = null;
    let currentLine: string[] = [];
    const flush = () => {
      if (currentLine.length > 0) {
        lines.push(currentLine.join(" "));
        currentLine = [];
      }
    };
    for (const run of sorted) {
      if (!run.text || run.text.trim() === "") continue;
      if (currentY === null || Math.abs(run.y - currentY) <= run.fontSize / 2) {
        currentY = currentY ?? run.y;
        currentLine.push(run.text.trim());
      } else {
        flush();
        currentY = run.y;
        currentLine.push(run.text.trim());
      }
    }
    flush();
    pages.push({ page, text: lines.join("\n") });
  }
  return { pages, text: pages.map((p) => p.text).join("\n\n") };
}
/**
 * Embed the OCR words as an invisible text layer in a PDF.
 * Each word is drawn at its box (image pixels at the render
 * DPI, origin top-left) converted to PDF points (origin
 * bottom-left), in the word's height as the font size, with
 * rendering mode 3 (invisible). Words that cannot be encoded
 * in the standard font (e.g. Urdu/Arabic — Helvetica is Latin
 * only) are skipped, not failed. Returns the new PDF bytes and
 * the number of words skipped. The input PDF is never modified.
 */
export async function embedOcrWordsInPdf(
  bytes: Uint8Array,
  pages: SearchablePageWords[]
): Promise<{ bytes: Uint8Array; skippedWords: number }> {
  if (pages.length === 0) {
    throw new PdfEditError(400, "There are no OCR words to embed.");
  }
  const doc = await loadPdf(bytes);
  const pageCount = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let skippedWords = 0;
  for (const { pageNumber, words } of pages) {
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > pageCount
    ) {
      throw new PdfEditError(
        400,
        `Page ${pageNumber} does not exist in this PDF.`
      );
    }
    if (words.length === 0) continue;
    const page = doc.getPage(pageNumber - 1);
    const fontKey = getFontKey(page, font);
    const pageHeight = page.getHeight();
    const pageWidth = page.getWidth();
    for (const word of words) {
      if (!word.text || word.text.trim() === "") continue;
      // The word box in PDF points (origin bottom-left).
      const x = toPoints(word.left);
      const y = pageHeight - toPoints(word.top + word.height);
      const size = Math.max(toPoints(word.height), 1);
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(size)
      ) {
        skippedWords += 1;
        continue;
      }
      // The word must lie on the page (a small tolerance for
      // rounding at the edges).
      if (x < -1 || y < -1 || x > pageWidth + 1 || y > pageHeight + 1) {
        skippedWords += 1;
        continue;
      }
      let encoded;
      try {
        encoded = font.encodeText(word.text);
      } catch {
        // Not encodable in the standard font (e.g. Urdu/Arabic).
        skippedWords += 1;
        continue;
      }
      page.pushOperators(
        beginText(),
        setFontAndSize(fontKey, size),
        setTextRenderingMode(TextRenderingMode.Invisible),
        setTextMatrix(1, 0, 0, 1, x, y),
        showText(encoded),
        endText()
      );
    }
  }
  return { bytes: await doc.save(), skippedWords };
}
