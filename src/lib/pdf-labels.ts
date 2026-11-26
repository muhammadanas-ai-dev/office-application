// PDF page labels (F37).
//
// Page labels are the numbers readers show for pages —
// i, ii, iii for front matter, then 1, 2, 3 for the body.
// They live in the catalog's /PageLabels number tree as
// ranges: each range starts at a page and sets a numbering
// style (decimal, roman, letters, or none), an optional
// prefix and a starting value. This module validates the
// ranges, writes/reads the tree with pdf-lib, and renders
// any page's label (for the tools-page preview).
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
} from "pdf-lib";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  pageLabel,
  toLetters,
  toRoman,
  type PageLabelRange,
  type PageLabelStyle,
} from "@/lib/page-label-render";

export {
  pageLabel,
  toLetters,
  toRoman,
  type PageLabelRange,
  type PageLabelStyle,
};

export const MAX_LABEL_RANGES = 20;
export const MAX_LABEL_PREFIX_CHARS = 32;

const STYLE_TO_PDF: Record<Exclude<PageLabelStyle, "none">, string> = {
  decimal: "D",
  "roman-upper": "R",
  "roman-lower": "r",
  "letters-upper": "A",
  "letters-lower": "a",
};
const PDF_TO_STYLE: Record<string, PageLabelStyle> = {
  D: "decimal",
  R: "roman-upper",
  r: "roman-lower",
  A: "letters-upper",
  a: "letters-lower",
};

const STYLES: PageLabelStyle[] = [
  "decimal",
  "roman-upper",
  "roman-lower",
  "letters-upper",
  "letters-lower",
  "none",
];

/** Validate + normalize label ranges against the page
 *  count. Ranges come back sorted; the first must start
 *  at page 1 (the PDF spec's tree starts at index 0). */
export function validateLabelRanges(
  raw: unknown,
  pageCount: number
): PageLabelRange[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new PdfEditError(400, "Define at least one label range.");
  }
  if (raw.length > MAX_LABEL_RANGES) {
    throw new PdfEditError(
      400,
      `At most ${MAX_LABEL_RANGES} label ranges.`
    );
  }
  const ranges: PageLabelRange[] = raw.map((item, index) => {
    const range = (item ?? {}) as Partial<PageLabelRange>;
    if (
      typeof range.fromPage !== "number" ||
      !Number.isInteger(range.fromPage) ||
      range.fromPage < 1 ||
      range.fromPage > pageCount
    ) {
      throw new PdfEditError(
        400,
        `Range ${index + 1}: the start page must be between 1 and ${pageCount}.`
      );
    }
    if (
      typeof range.style !== "string" ||
      !STYLES.includes(range.style as PageLabelStyle)
    ) {
      throw new PdfEditError(400, `Range ${index + 1}: unknown style.`);
    }
    const prefix = typeof range.prefix === "string" ? range.prefix : "";
    if (prefix.length > MAX_LABEL_PREFIX_CHARS) {
      throw new PdfEditError(
        400,
        `Range ${index + 1}: the prefix is too long (at most ${MAX_LABEL_PREFIX_CHARS} characters).`
      );
    }
    const start = range.start === undefined ? 1 : range.start;
    if (
      typeof start !== "number" ||
      !Number.isInteger(start) ||
      start < 1 ||
      start > 9999
    ) {
      throw new PdfEditError(
        400,
        `Range ${index + 1}: the starting number must be between 1 and 9999.`
      );
    }
    return {
      fromPage: range.fromPage,
      style: range.style as PageLabelStyle,
      prefix,
      start,
    };
  });
  ranges.sort((a, b) => a.fromPage - b.fromPage);
  if (ranges[0].fromPage !== 1) {
    throw new PdfEditError(
      400,
      "The first label range must start at page 1."
    );
  }
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].fromPage === ranges[i - 1].fromPage) {
      throw new PdfEditError(
        400,
        `Two ranges start at page ${ranges[i].fromPage} — give each range its own start page.`
      );
    }
  }
  return ranges;
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch {
    throw new PdfEditError(400, "This file could not be read as a PDF.");
  }
}

/** Write the /PageLabels number tree. Returns the new
 *  bytes. */
export async function setPdfPageLabels(
  bytes: Uint8Array,
  ranges: PageLabelRange[]
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const valid = validateLabelRanges(ranges, doc.getPageCount());
  const context = doc.context;
  const array = PDFArray.withContext(context);
  for (const range of valid) {
    array.push(PDFNumber.of(range.fromPage - 1));
    const dict = context.obj({});
    if (range.style !== "none") {
      dict.set(
        PDFName.of("S"),
        PDFName.of(STYLE_TO_PDF[range.style as Exclude<PageLabelStyle, "none">])
      );
    }
    if (range.prefix) {
      dict.set(PDFName.of("P"), PDFString.of(range.prefix));
    }
    if (range.start !== 1) {
      dict.set(PDFName.of("St"), PDFNumber.of(range.start));
    }
    array.push(dict);
  }
  const labels = context.obj({ Nums: array });
  doc.catalog.set(PDFName.of("PageLabels"), labels);
  return doc.save();
}

/** Read the /PageLabels ranges back (empty when the PDF
 *  has none). */
export async function readPdfPageLabels(
  bytes: Uint8Array
): Promise<PageLabelRange[]> {
  const doc = await loadPdf(bytes);
  const labelsObj = doc.catalog.get(PDFName.of("PageLabels"));
  if (!labelsObj) return [];
  const labelsDict = doc.context.lookup(labelsObj, PDFDict);
  const nums = labelsDict.get(PDFName.of("Nums"));
  if (!nums) return [];
  const numsArray = doc.context.lookup(nums, PDFArray);
  const ranges: PageLabelRange[] = [];
  for (let i = 0; i + 1 < numsArray.size(); i += 2) {
    const indexObj = numsArray.get(i);
    const dictObj = numsArray.get(i + 1);
    const index =
      indexObj instanceof PDFNumber ? indexObj.asNumber() : NaN;
    const dict = doc.context.lookup(dictObj, PDFDict);
    const styleObj = dict.get(PDFName.of("S"));
    const styleName =
      styleObj instanceof PDFName ? styleObj.decodeText() : null;
    const prefixObj = dict.get(PDFName.of("P"));
    const prefix =
      prefixObj instanceof PDFString ? prefixObj.decodeText() : "";
    const startObj = dict.get(PDFName.of("St"));
    const start =
      startObj instanceof PDFNumber ? startObj.asNumber() : 1;
    if (Number.isNaN(index)) continue;
    ranges.push({
      fromPage: index + 1,
      style: styleName ? (PDF_TO_STYLE[styleName] ?? "decimal") : "none",
      prefix,
      start,
    });
  }
  return ranges.sort((a, b) => a.fromPage - b.fromPage);
}
