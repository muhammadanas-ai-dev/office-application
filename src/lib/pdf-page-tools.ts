// PDF page tools, part 1 (Day 18) — pure functions, no server imports.
//
// Insert pages (a blank page, or pages from another PDF) and add
// page numbers. They follow the deletePagesInPdf /
// reorderPagesInPdf pattern in pdf-edit.ts (load with loadPdf,
// validate, operate, save; throw PdfEditError).
//
// Insert positions are 1-based, in the user's language:
//   before page N  -> index N-1
//   after page N   -> index N
//   at the end     -> index = page count
// A blank page is sized from a neighbouring page (pdf-lib's
// default blank page is A4, which would be the wrong size in a
// Letter document). Pages copied from another PDF keep their own
// size, fonts and content.
// Page numbers are DRAWN onto the page content (they become part
// of the page, not annotations), so they are permanent — the
// standard approach, and WPS does the same. Applying page numbers
// twice draws a second number over the first; the UI says so.
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
  type Color,
} from "pdf-lib";
import { PdfEditError } from "@/lib/pdf-edit";
import { MAX_PDF_PAGES, looksLikePdf } from "@/lib/pdf-tools";

export type InsertPosition =
  | { kind: "before"; page: number }
  | { kind: "after"; page: number }
  | { kind: "end" };

export type PageNumberPosition =
  "bottom-centre" | "bottom-right" | "top-centre" | "top-right";

export type PageNumberFormat = "number" | "page" | "page-of-total";

/** A rectangle dragged on a page, as its two endpoints in PDF
 *  points (origin bottom-left). The endpoints are normalised into
 *  a rect by normaliseDragRect. */
export interface DragRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The named colours for added text and shapes (the same
 *  fixed-colour approach as the annotations — no free-form
 *  picker in v1). */
export const DRAW_COLORS = {
  black: [0, 0, 0],
  grey: [0.4, 0.4, 0.4],
  red: [1, 0, 0],
  green: [0, 0.6, 0],
  blue: [0, 0, 1],
} as const;
export type DrawColorName = keyof typeof DRAW_COLORS;

/** The three standard fonts for added text. */
export const DRAW_FONTS = {
  helvetica: StandardFonts.Helvetica,
  times: StandardFonts.TimesRoman,
  courier: StandardFonts.Courier,
} as const;
export type DrawFontName = keyof typeof DRAW_FONTS;

export type DrawShape = "rectangle" | "ellipse" | "line";

export const MAX_ADDED_TEXT_CHARS = 500;
export const MIN_ADDED_TEXT_SIZE = 8;
export const MAX_ADDED_TEXT_SIZE = 72;
export const DEFAULT_SHAPE_BORDER_WIDTH = 2;

function drawColor(name: DrawColorName): Color {
  const [r, g, b] = DRAW_COLORS[name];
  return rgb(r, g, b);
}

/** Normalise a dragged rectangle into a rect with a positive
 *  width and height. */
export function normaliseDragRect(rect: DragRect): PageRect {
  return {
    x: Math.min(rect.x1, rect.x2),
    y: Math.min(rect.y1, rect.y2),
    width: Math.abs(rect.x2 - rect.x1),
    height: Math.abs(rect.y2 - rect.y1),
  };
}

function validateRectInPage(
  rect: PageRect,
  pageWidth: number,
  pageHeight: number,
  label: string
): void {
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  ) {
    throw new PdfEditError(400, `${label} must be numbers.`);
  }
  if (rect.width <= 0 || rect.height <= 0) {
    throw new PdfEditError(
      400,
      `${label} must have a size — drag a rectangle, not a point.`
    );
  }
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > pageWidth ||
    rect.y + rect.height > pageHeight
  ) {
    throw new PdfEditError(400, `${label} must lie inside the page.`);
  }
}

function validatePageNumber(page: number, pageCount: number): void {
  if (!Number.isInteger(page) || page < 1) {
    throw new PdfEditError(400, "Page numbers must be positive.");
  }
  if (page > pageCount) {
    throw new PdfEditError(
      400,
      `This PDF has ${pageCount} page${pageCount === 1 ? "" : "s"} — there is no page ${page}.`
    );
  }
}

/** Normalise a link URL: a bare domain gets https://, and
 *  anything that is not a valid http(s) URL is refused. */
export function normaliseLinkUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new PdfEditError(400, "Enter a link URL.");
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("not http(s)");
    }
    return parsed.href;
  } catch {
    throw new PdfEditError(
      400,
      "Enter a valid web address (for example https://example.com)."
    );
  }
}

export const PAGE_NUMBER_SIZE = 12;
export const PAGE_NUMBER_MARGIN = 36;
export const MAX_INSERT_PAGES = 50;

async function loadPdf(bytes: Uint8Array, label: string): Promise<PDFDocument> {
  if (!looksLikePdf(bytes)) {
    throw new PdfEditError(400, "This file is not a valid PDF.");
  }
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch {
    throw new PdfEditError(400, `${label} is not a valid PDF.`);
  }
}

function validatePosition(position: InsertPosition, pageCount: number): number {
  if (position.kind === "end") return pageCount;
  if (!Number.isInteger(position.page) || position.page < 1) {
    throw new PdfEditError(400, "Page numbers must be positive.");
  }
  if (position.kind === "before" && position.page > pageCount) {
    throw new PdfEditError(
      400,
      `This PDF has ${pageCount} page${pageCount === 1 ? "" : "s"} — there is no page ${position.page} to insert before.`
    );
  }
  if (position.kind === "after" && position.page > pageCount) {
    throw new PdfEditError(
      400,
      `This PDF has ${pageCount} page${pageCount === 1 ? "" : "s"} — there is no page ${position.page} to insert after.`
    );
  }
  return position.kind === "before" ? position.page - 1 : position.page;
}

function neighbourSize(doc: PDFDocument, index: number): [number, number] {
  // The page at the insertion index (or the last page, for an
  // insert at the end) — the blank page matches its size.
  const pageIndex = Math.min(index, doc.getPageCount() - 1);
  const page = doc.getPage(pageIndex);
  return [page.getWidth(), page.getHeight()];
}

/** Insert one blank page. Returns the new bytes. The input PDF is
 *  never modified. */
export async function insertBlankPageInPdf(
  bytes: Uint8Array,
  position: InsertPosition
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes, "This PDF");
  const index = validatePosition(position, doc.getPageCount());
  const size = neighbourSize(doc, index);
  doc.insertPage(index, size);
  return doc.save();
}

/** Insert pages from another PDF. `pages` are 1-based page numbers
 *  in the source PDF, in the order they are inserted. Returns the
 *  new bytes. Neither input PDF is modified. */
export async function insertPagesFromPdf(
  bytes: Uint8Array,
  sourceBytes: Uint8Array,
  input: { pages: number[]; position: InsertPosition }
): Promise<Uint8Array> {
  const pages = [...new Set(input.pages)].sort((a, b) => a - b);
  if (pages.length === 0) {
    throw new PdfEditError(400, "Choose at least one page to insert.");
  }
  if (pages.length > MAX_INSERT_PAGES) {
    throw new PdfEditError(
      400,
      `Insert at most ${MAX_INSERT_PAGES} pages at once.`
    );
  }
  for (const p of pages) {
    if (!Number.isInteger(p) || p < 1) {
      throw new PdfEditError(400, "Page numbers must be positive.");
    }
  }
  const doc = await loadPdf(bytes, "This PDF");
  const source = await loadPdf(sourceBytes, "The source PDF");
  const sourceCount = source.getPageCount();
  for (const p of pages) {
    if (p > sourceCount) {
      throw new PdfEditError(
        400,
        `The source PDF has ${sourceCount} page${sourceCount === 1 ? "" : "s"} — there is no page ${p} to insert.`
      );
    }
  }
  const index = validatePosition(input.position, doc.getPageCount());
  const copied = await doc.copyPages(
    source,
    pages.map((p) => p - 1)
  );
  copied.forEach((page, i) => doc.insertPage(index + i, page));
  return doc.save();
}

function formatPageNumber(
  format: PageNumberFormat,
  number: number,
  total: number
): string {
  if (format === "number") return String(number);
  if (format === "page") return `Page ${number}`;
  return `Page ${number} of ${total}`;
}

/** Add page numbers to a PDF. Returns the new bytes. The input PDF
 *  is never modified. `fromPage` (1-based, default 1) is the first
 *  page that gets a number; `startNumber` (default 1) is the number
 *  it gets. Pages before `fromPage` are left unnumbered. */
export async function addPageNumbersToPdf(
  bytes: Uint8Array,
  input: {
    position: PageNumberPosition;
    format: PageNumberFormat;
    fromPage?: number;
    startNumber?: number;
  }
): Promise<Uint8Array> {
  const fromPage = input.fromPage ?? 1;
  const startNumber = input.startNumber ?? 1;
  if (!Number.isInteger(fromPage) || fromPage < 1) {
    throw new PdfEditError(400, "The first numbered page must be positive.");
  }
  if (!Number.isInteger(startNumber) || startNumber < 1) {
    throw new PdfEditError(400, "The starting number must be positive.");
  }
  const doc = await loadPdf(bytes, "This PDF");
  const count = doc.getPageCount();
  if (fromPage > count) {
    throw new PdfEditError(
      400,
      `This PDF has ${count} page${count === 1 ? "" : "s"} — there is no page ${fromPage} to start numbering from.`
    );
  }
  if (count > MAX_PDF_PAGES) {
    throw new PdfEditError(
      400,
      `This PDF has more than ${MAX_PDF_PAGES} pages.`
    );
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = fromPage; p <= count; p++) {
    const page = doc.getPage(p - 1);
    const number = startNumber + (p - fromPage);
    const text = formatPageNumber(input.format, number, count);
    const textWidth = font.widthOfTextAtSize(text, PAGE_NUMBER_SIZE);
    const width = page.getWidth();
    const height = page.getHeight();
    const x =
      input.position === "bottom-centre" || input.position === "top-centre"
        ? (width - textWidth) / 2
        : width - textWidth - PAGE_NUMBER_MARGIN;
    const y =
      input.position === "bottom-centre" || input.position === "bottom-right"
        ? PAGE_NUMBER_MARGIN
        : height - PAGE_NUMBER_MARGIN - PAGE_NUMBER_SIZE;
    page.drawText(text, {
      x,
      y,
      size: PAGE_NUMBER_SIZE,
      font,
      color: rgb(0, 0, 0),
    });
  }
  return doc.save();
}

/** Crop pages to a rectangle (the visible region). `pages` are
 *  1-based. The rectangle must lie inside the page. Returns the
 *  new bytes. The input PDF is never modified. */
export async function cropPagesInPdf(
  bytes: Uint8Array,
  input: { pages: number[]; rect: DragRect }
): Promise<Uint8Array> {
  const pages = [...new Set(input.pages)].sort((a, b) => a - b);
  if (pages.length === 0) {
    throw new PdfEditError(400, "Choose at least one page to crop.");
  }
  const rect = normaliseDragRect(input.rect);
  const doc = await loadPdf(bytes, "This PDF");
  const count = doc.getPageCount();
  for (const p of pages) {
    validatePageNumber(p, count);
    const page = doc.getPage(p - 1);
    validateRectInPage(
      rect,
      page.getWidth(),
      page.getHeight(),
      "The crop rectangle"
    );
    page.setCropBox(rect.x, rect.y, rect.width, rect.height);
  }
  return doc.save();
}

/** Add a hyperlink to a page. The link is a standard link
 *  annotation (the Day 17 pattern) — it opens in any PDF reader.
 *  Returns the new bytes. The input PDF is never modified. */
export async function addLinkToPdf(
  bytes: Uint8Array,
  input: { page: number; rect: DragRect; url: string }
): Promise<Uint8Array> {
  const url = normaliseLinkUrl(input.url);
  const rect = normaliseDragRect(input.rect);
  const doc = await loadPdf(bytes, "This PDF");
  const count = doc.getPageCount();
  validatePageNumber(input.page, count);
  const page = doc.getPage(input.page - 1);
  validateRectInPage(
    rect,
    page.getWidth(),
    page.getHeight(),
    "The link rectangle"
  );
  const linkDict = PDFDict.withContext(doc.context);
  linkDict.set(PDFName.of("Type"), PDFName.of("Annot"));
  linkDict.set(PDFName.of("Subtype"), PDFName.of("Link"));
  linkDict.set(
    PDFName.of("Rect"),
    doc.context.obj([rect.x, rect.y, rect.x + rect.width, rect.y + rect.height])
  );
  const action = PDFDict.withContext(doc.context);
  action.set(PDFName.of("S"), PDFName.of("URI"));
  action.set(PDFName.of("URI"), PDFString.of(url));
  linkDict.set(PDFName.of("A"), action);
  linkDict.set(PDFName.of("Border"), doc.context.obj([0, 0, 0]));
  linkDict.set(PDFName.of("C"), doc.context.obj([0, 0, 1]));
  page.node.addAnnot(doc.context.register(linkDict));
  return doc.save();
}

/** Add text to a page. The text is drawn with its baseline at
 *  (x, y) — the click is where the text starts. Returns the new
 *  bytes. The input PDF is never modified. */
export async function addTextToPdf(
  bytes: Uint8Array,
  input: {
    page: number;
    x: number;
    y: number;
    text: string;
    size: number;
    font: DrawFontName;
    color: DrawColorName;
  }
): Promise<Uint8Array> {
  const text = input.text.trim();
  if (!text) {
    throw new PdfEditError(400, "Enter the text to add.");
  }
  if (text.length > MAX_ADDED_TEXT_CHARS) {
    throw new PdfEditError(
      400,
      `The text must be at most ${MAX_ADDED_TEXT_CHARS} characters.`
    );
  }
  if (
    !Number.isInteger(input.size) ||
    input.size < MIN_ADDED_TEXT_SIZE ||
    input.size > MAX_ADDED_TEXT_SIZE
  ) {
    throw new PdfEditError(
      400,
      `The text size must be between ${MIN_ADDED_TEXT_SIZE} and ${MAX_ADDED_TEXT_SIZE} pt.`
    );
  }
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    throw new PdfEditError(400, "The position must be numbers.");
  }
  const doc = await loadPdf(bytes, "This PDF");
  const count = doc.getPageCount();
  validatePageNumber(input.page, count);
  const page = doc.getPage(input.page - 1);
  if (
    input.x < 0 ||
    input.y < 0 ||
    input.x > page.getWidth() ||
    input.y > page.getHeight()
  ) {
    throw new PdfEditError(400, "The position must lie inside the page.");
  }
  const font = await doc.embedFont(DRAW_FONTS[input.font]);
  page.drawText(text, {
    x: input.x,
    y: input.y,
    size: input.size,
    font,
    color: drawColor(input.color),
  });
  return doc.save();
}

/** Add a shape to a page. A rectangle or ellipse is inscribed in
 *  the dragged rectangle; a line runs from the drag's start point
 *  to its end point. Returns the new bytes. The input PDF is never
 *  modified. */
export async function addShapeToPdf(
  bytes: Uint8Array,
  input: {
    page: number;
    shape: DrawShape;
    rect: DragRect;
    color: DrawColorName;
    filled: boolean;
  }
): Promise<Uint8Array> {
  const rect = normaliseDragRect(input.rect);
  const doc = await loadPdf(bytes, "This PDF");
  const count = doc.getPageCount();
  validatePageNumber(input.page, count);
  const page = doc.getPage(input.page - 1);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const color = drawColor(input.color);
  if (input.shape === "line") {
    const { x1, y1, x2, y2 } = input.rect;
    for (const [x, y] of [
      [x1, y1],
      [x2, y2],
    ]) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new PdfEditError(400, "The line endpoints must be numbers.");
      }
      if (x < 0 || y < 0 || x > pageWidth || y > pageHeight) {
        throw new PdfEditError(400, "The line must lie inside the page.");
      }
    }
    if (x1 === x2 && y1 === y2) {
      throw new PdfEditError(
        400,
        "The line must have a length — drag, don't click."
      );
    }
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: DEFAULT_SHAPE_BORDER_WIDTH,
      color,
    });
  } else {
    validateRectInPage(rect, pageWidth, pageHeight, "The shape rectangle");
    if (input.shape === "rectangle") {
      page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: input.filled ? color : undefined,
        borderColor: color,
        borderWidth: DEFAULT_SHAPE_BORDER_WIDTH,
      });
    } else {
      page.drawEllipse({
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        xScale: rect.width / 2,
        yScale: rect.height / 2,
        color: input.filled ? color : undefined,
        borderColor: color,
        borderWidth: DEFAULT_SHAPE_BORDER_WIDTH,
      });
    }
  }
  return doc.save();
}
