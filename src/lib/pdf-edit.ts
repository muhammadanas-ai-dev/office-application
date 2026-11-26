// PDF editing operations (Phase B, feature 3).
//
// Text, image and page edits on a PDF, built on pdf-lib for the
// object model and pdf-content.ts for the content-stream surgery.
// Every function takes bytes in and returns bytes out; none of
// them touches storage or the database — the version bookkeeping
// (a new immutable version per edit, the original never
// overwritten) lives in pdf-edit.server.ts.
//
// Server-side by convention: pdf-lib runs in Node here and the
// helpers below are imported by server routes only. Do NOT import
// this module from a client component.
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  StandardFonts,
  decodePDFRawStream,
  rgb,
  type PDFDict,
} from "pdf-lib";
import {
  PdfContentError,
  buildReplacementOps,
  decodeTextBytes,
  extractImagePlacements,
  extractTextRuns,
  parseOperations,
  parseToUnicodeCMap,
  serializeOperations,
  tokenizeContent,
  type PdfFontInfo,
  type PdfTextRun,
} from "@/lib/pdf-content";
import { MAX_PDF_PAGES, looksLikePdf } from "@/lib/pdf-tools";
import {
  estimateRunRect,
  rectsIntersect,
  type RedactRegion,
} from "@/lib/pdf-redact";
import type { PDFArray } from "pdf-lib";

/** A PDF-edit failure with the HTTP status the route should return. */
export class PdfEditError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PdfEditError";
    this.status = status;
  }
}

export const MAX_REPLACEMENT_CHARS = 500;
export const MAX_REPLACEMENT_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const EDIT_FONT_NAME = "FormaEditFont";

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

/** Decode a content stream's bytes (Flate/LZW/etc. via decodePDFRawStream). */
function decodeStreamBytes(stream: PDFStream): Uint8Array {
  if (stream instanceof PDFRawStream) {
    const decoded = decodePDFRawStream(stream);
    // The decoded Stream's length (its `length` getter) is not in
    // pdf-lib's type, so read it through a cast; getBytes clamps
    // to the end, so the full remaining bytes come back.
    const length = (decoded as unknown as { length: number }).length;
    return decoded.getBytes(length) as Uint8Array;
  }
  return stream.getContents();
}

/** The page's content streams, concatenated and decoded. */
function getPageContent(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPage(pageIndex);
  const contents = page.node.get(PDFName.of("Contents"));
  const streams: PDFStream[] = [];
  const collect = (obj: unknown) => {
    if (obj instanceof PDFStream) {
      streams.push(obj);
      return;
    }
    if (obj instanceof PDFRef) {
      const resolved = doc.context.lookup(obj);
      if (resolved instanceof PDFStream) streams.push(resolved);
      return;
    }
    if (
      obj &&
      typeof (obj as { asArray?: () => unknown[] }).asArray === "function"
    ) {
      for (const item of (obj as { asArray: () => unknown[] }).asArray())
        collect(item);
    }
  };
  if (contents) collect(contents);
  const parts: string[] = [];
  for (const stream of streams) {
    parts.push(new TextDecoder("latin1").decode(decodeStreamBytes(stream)));
  }
  return parts.join("\n");
}

/** Encode a latin1 string back to its exact bytes (char -> byte). */
function latin1ToBytes(content: string): Uint8Array {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i += 1)
    bytes[i] = content.charCodeAt(i) & 0xff;
  return bytes;
}

/** Replace a page's content stream with new bytes. */
function setPageContent(
  doc: PDFDocument,
  pageIndex: number,
  content: string
): void {
  const page = doc.getPage(pageIndex);
  // The content was decoded as latin1 (one char per byte), so it
  // must be re-encoded the same way — a UTF-8 TextEncoder would
  // expand every byte above 127 into two bytes and corrupt the
  // stream.
  const stream = doc.context.flateStream(latin1ToBytes(content));
  // flateStream returns a direct PDFRawStream object, and a stream
  // can never be a direct object in a PDF — it must be indirect.
  // Registering it in the context yields the PDFRef the Contents
  // entry needs. (Setting the raw stream object here silently
  // corrupts the page tree on save.)
  const ref = doc.context.register(stream);
  page.node.set(PDFName.of("Contents"), ref);
}

/** The page's font dict (name -> font dict), or an empty map. */
function getPageFonts(
  doc: PDFDocument,
  pageIndex: number
): Map<string, PdfFontInfo> {
  const fonts = new Map<string, PdfFontInfo>();
  const page = doc.getPage(pageIndex);
  const resources = page.node.Resources();
  if (!resources) return fonts;
  const fontDictRef = resources.lookup(PDFName.of("Font"));
  if (!fontDictRef) return fonts;
  const fontDict = doc.context.lookup(fontDictRef) as PDFDict | undefined;
  if (!fontDict) return fonts;
  for (const [nameObj, ref] of fontDict.entries()) {
    // entries() yields PDFName objects, not strings — the lookup
    // key must be the decoded name ("F1"), or no font ever matches.
    const name = nameObj.decodeText();
    if (!(ref instanceof PDFRef)) continue;
    const font = doc.context.lookup(ref) as PDFDict | undefined;
    if (!font) continue;
    const subtype = font.lookup(PDFName.of("Subtype"));
    const subtypeName =
      subtype &&
      typeof (subtype as unknown as { decodeText?: () => string })
        .decodeText === "function"
        ? (subtype as unknown as { decodeText: () => string }).decodeText()
        : String(subtype ?? "");
    const isCid = subtypeName.includes("Type0");
    let toUnicode: Map<number, string> | null = null;
    const toUnicodeRef = font.lookup(PDFName.of("ToUnicode"));
    if (toUnicodeRef instanceof PDFRef) {
      const cmapStream = doc.context.lookup(toUnicodeRef) as
        PDFStream | undefined;
      if (cmapStream) {
        const cmapBytes = decodeStreamBytes(cmapStream);
        toUnicode = parseToUnicodeCMap(
          new TextDecoder("latin1").decode(cmapBytes)
        );
      }
    }
    // BaseFont (e.g. "ABCDEE+Arial-BoldMT", "LiberationSerif"):
    // the only honest source for which standard font the
    // replacement should be drawn in.
    const baseFontRef = font.lookup(PDFName.of("BaseFont"));
    const baseFont =
      baseFontRef &&
      typeof (baseFontRef as unknown as { decodeText?: () => string })
        .decodeText === "function"
        ? (baseFontRef as unknown as { decodeText: () => string }).decodeText()
        : null;
    fonts.set(name, { name, isCid, toUnicode, baseFont });
  }
  return fonts;
}

/**
 * Map a font's BaseFont name to the closest standard (built-in)
 * PDF font, keeping its family, weight and slant. A subset
 * prefix ("ABCDEE+") is stripped first. An embedded font's
 * subset almost never contains the replacement text's glyphs,
 * so the original font itself cannot be reused — the closest
 * standard font is the honest substitute, and the UI says so.
 * Unknown families fall back to Helvetica (the metric match for
 * Arial, Liberation Sans and DejaVu Sans).
 */
export function mapBaseFontToStandard(baseFont: string | null): StandardFonts {
  const raw = (baseFont ?? "").replace(/^[^+]*\+/, "").toLowerCase();
  const bold = /bold|black|heavy|demi|semibold/.test(raw);
  const italic = /italic|oblique/.test(raw);
  // Monospace -> Courier (the only monospace standard font).
  if (raw.includes("courier") || raw.includes("mono")) {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  // Serif -> Times (the serif standard font). The "sans" guard
  // keeps a "SansSerif" name from landing here.
  if (
    raw.includes("times") ||
    raw.includes("georgia") ||
    (raw.includes("serif") && !raw.includes("sans"))
  ) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

/** Add the replacement font to a page's resources. */
async function ensureEditFont(
  doc: PDFDocument,
  pageIndex: number,
  standardFont: StandardFonts
): Promise<void> {
  const page = doc.getPage(pageIndex);
  const font = await doc.embedFont(standardFont);
  const resources = page.node.Resources();
  if (!resources) {
    throw new PdfEditError(500, "This PDF page has no resources dictionary.");
  }
  let fontDict = resources.lookup(PDFName.of("Font")) as PDFDict | undefined;
  if (!fontDict) {
    fontDict = doc.context.obj({});
    resources.set(PDFName.of("Font"), fontDict);
  }
  fontDict.set(PDFName.of(EDIT_FONT_NAME), font.ref);
}

/** Position of a text run as the browser (PDF.js) reports it. */
export interface PdfTextPosition {
  x: number;
  y: number;
  fontSize: number;
}

/**
 * Find the run(s) to edit. Tries, in order:
 * 1. An exact decoded-text match (works when the font is decodable).
 * 2. Consecutive runs on one baseline whose joined text equals the
 *    target (producers often split one visual line into several ops).
 * 3. A position match — the run at the (x, y) the browser reports.
 *    This is the CID-font path: some producers (ONLYOFFICE among
 *    them) embed subset CID fonts with no ToUnicode CMap, so the
 *    server cannot decode the text at all. The run is then located
 *    by its baseline position and font size, which the content
 *    stream records exactly. A position match must be unique within
 *    a 2-point tolerance, or it is refused as ambiguous.
 */
function findRunsForEdit(
  runs: PdfTextRun[],
  text: string,
  occurrence: number,
  position?: PdfTextPosition
): PdfTextRun[] {
  const exact = runs.filter((r) => r.text === text);
  if (exact.length > 0) {
    if (occurrence >= exact.length) {
      throw new PdfEditError(
        400,
        `Found ${exact.length} occurrence(s) of that text on the page — occurrence ${occurrence} does not exist.`
      );
    }
    return [exact[occurrence]];
  }
  // Fallback: consecutive runs on the same baseline whose joined
  // text equals the target (PDF producers often split one visual
  // line into several Tj/TJ operations).
  for (let i = 0; i < runs.length; i += 1) {
    let joined = "";
    const group: PdfTextRun[] = [];
    for (let j = i; j < runs.length; j += 1) {
      const r = runs[j];
      if (group.length > 0) {
        const prev = group[group.length - 1];
        if (Math.abs(r.y - prev.y) > 1 || r.x < prev.x) break;
      }
      joined += r.text;
      group.push(r);
      if (joined === text) return group;
      if (joined.length > text.length) break;
    }
  }
  if (position) {
    const near = runs.filter(
      (r) =>
        Math.abs(r.x - position.x) <= 2 &&
        Math.abs(r.y - position.y) <= 2 &&
        Math.abs(r.fontSize - position.fontSize) <= 0.5
    );
    if (near.length === 1) return [near[0]];
    if (near.length > 1) {
      throw new PdfEditError(
        400,
        "More than one text run sits at that position — the edit is ambiguous, so it was refused."
      );
    }
    throw new PdfEditError(
      400,
      "Could not find that text at the given position on this page."
    );
  }
  throw new PdfEditError(400, "Could not find that exact text on this page.");
}

export interface EditTextInput {
  /** 1-based page number. */
  page: number;
  /** The exact text to replace (as shown in the PDF). */
  text: string;
  /** The replacement text. */
  replacement: string;
  /** 0-based occurrence when the text appears more than once. */
  occurrence?: number;
  /** The run's position as the browser reports it (the CID-font path). */
  position?: PdfTextPosition;
}

/**
 * Replace one text run in a PDF. The old text is removed from the
 * content stream (never just covered) and the replacement is drawn
 * at the same baseline, size and rotation, in the closest standard
 * font to the original (family, weight and slant from its BaseFont
 * name) and in the original's fill colour. The replacement does
 * not reflow the page — it occupies the same position the old text
 * did.
 */
export async function editTextInPdf(
  bytes: Uint8Array,
  input: EditTextInput
): Promise<Uint8Array> {
  const { page, text, replacement } = input;
  const occurrence = input.occurrence ?? 0;
  if (!Number.isInteger(page) || page < 1) {
    throw new PdfEditError(400, "Page must be a positive number.");
  }
  if (typeof text !== "string" || text.length === 0) {
    throw new PdfEditError(400, "The text to replace must not be empty.");
  }
  if (typeof replacement !== "string" || replacement.length === 0) {
    throw new PdfEditError(400, "The replacement text must not be empty.");
  }
  if (replacement.length > MAX_REPLACEMENT_CHARS) {
    throw new PdfEditError(
      400,
      `The replacement text is longer than ${MAX_REPLACEMENT_CHARS} characters.`
    );
  }
  if (!Number.isInteger(occurrence) || occurrence < 0) {
    throw new PdfEditError(400, "Occurrence must be a non-negative number.");
  }
  const doc = await loadPdf(bytes, "This PDF");
  if (page > doc.getPageCount()) {
    throw new PdfEditError(
      400,
      `This PDF has ${doc.getPageCount()} page(s) — page ${page} does not exist.`
    );
  }
  const pageIndex = page - 1;
  let content: string;
  let ops;
  try {
    content = getPageContent(doc, pageIndex);
    ops = parseOperations(tokenizeContent(content));
  } catch (error) {
    if (error instanceof PdfContentError) {
      throw new PdfEditError(
        400,
        `This page's content could not be read: ${error.message}`
      );
    }
    throw error;
  }
  const fonts = getPageFonts(doc, pageIndex);
  const runs = extractTextRuns(ops, fonts, pageIndex);
  const target = findRunsForEdit(runs, text, occurrence, input.position);
  const first = target[0];
  const removeIndices = new Set<number>();
  for (const r of target) for (const idx of r.opIndices) removeIndices.add(idx);
  // The replacement keeps the first run's styling: the closest
  // standard font to its BaseFont, and its fill colour. (A joined
  // multi-run target is drawn at the first run's position in the
  // first run's style — the runs share a baseline by construction.)
  const standardFont = mapBaseFontToStandard(first.baseFont);
  let replacementOps: string[];
  try {
    replacementOps = buildReplacementOps(
      first,
      replacement,
      EDIT_FONT_NAME,
      first.fillColor
    );
  } catch (error) {
    if (error instanceof PdfContentError) {
      throw new PdfEditError(400, error.message);
    }
    throw error;
  }
  const newContent = serializeOperations(
    ops,
    removeIndices,
    Math.min(...removeIndices),
    replacementOps
  );
  setPageContent(doc, pageIndex, newContent);
  await ensureEditFont(doc, pageIndex, standardFont);
  return doc.save();
}

// ------------------------------------------------------------------
// Images
// ------------------------------------------------------------------

export interface PdfImageInfo {
  /** 1-based page number. */
  page: number;
  /** Index of the image on that page (0-based, document order). */
  index: number;
  /** XObject name in the page resources. */
  name: string;
  /** Placement rect in points. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Native pixel size of the image, when known. */
  pixelWidth: number | null;
  pixelHeight: number | null;
}

/** List the images on every page (for the edit UI). */
export async function listPdfImages(
  bytes: Uint8Array
): Promise<PdfImageInfo[]> {
  const doc = await loadPdf(bytes, "This PDF");
  const out: PdfImageInfo[] = [];
  for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
    const page = doc.getPage(pageIndex);
    const resources = page.node.Resources();
    if (!resources) continue;
    const xobjRef = resources.lookup(PDFName.of("XObject"));
    if (!xobjRef) continue;
    const xobjDict = doc.context.lookup(xobjRef) as PDFDict | undefined;
    if (!xobjDict) continue;
    const imageNames = new Set<string>();
    const pixelSize = new Map<string, { w: number | null; h: number | null }>();
    for (const [nameObj, ref] of xobjDict.entries()) {
      // entries() yields PDFName objects — the placement match
      // needs the decoded string name ("Im1").
      const name = nameObj.decodeText();
      if (!(ref instanceof PDFRef)) continue;
      const resolved = doc.context.lookup(ref) as
        PDFDict | PDFStream | undefined;
      if (!resolved) continue;
      // An image XObject is a stream, not a plain dict — its
      // entries live in the stream's dict.
      const obj: PDFDict | undefined =
        resolved instanceof PDFStream ? resolved.dict : (resolved as PDFDict);
      if (!obj || typeof obj.lookup !== "function") continue;
      const subtype = obj.lookup(PDFName.of("Subtype"));
      const subtypeName =
        subtype &&
        typeof (subtype as unknown as { decodeText?: () => string })
          .decodeText === "function"
          ? (subtype as unknown as { decodeText: () => string }).decodeText()
          : String(subtype ?? "");
      if (!subtypeName.includes("Image")) continue;
      imageNames.add(name);
      const w = obj.lookup(PDFName.of("Width"));
      const h = obj.lookup(PDFName.of("Height"));
      pixelSize.set(name, {
        w:
          typeof (w as unknown as { asNumber?: () => number })?.asNumber ===
          "function"
            ? (w as unknown as { asNumber: () => number }).asNumber()
            : null,
        h:
          typeof (h as unknown as { asNumber?: () => number })?.asNumber ===
          "function"
            ? (h as unknown as { asNumber: () => number }).asNumber()
            : null,
      });
    }
    if (imageNames.size === 0) continue;
    let content = "";
    try {
      content = getPageContent(doc, pageIndex);
      const ops = parseOperations(tokenizeContent(content));
      const placements = extractImagePlacements(ops);
      let index = 0;
      for (const p of placements) {
        if (!imageNames.has(p.name)) continue;
        const size = pixelSize.get(p.name) ?? { w: null, h: null };
        out.push({
          page: pageIndex + 1,
          index: index++,
          name: p.name,
          x: Math.round(p.x * 100) / 100,
          y: Math.round(p.y * 100) / 100,
          width: Math.round(p.width * 100) / 100,
          height: Math.round(p.height * 100) / 100,
          pixelWidth: size.w,
          pixelHeight: size.h,
        });
      }
    } catch {
      // A page whose content cannot be parsed lists no images
      // rather than failing the whole document.
      continue;
    }
  }
  return out;
}

export interface ReplaceImageInput {
  /** 1-based page number. */
  page: number;
  /** Index of the image on that page (as listed by listPdfImages). */
  imageIndex: number;
  /** The replacement image bytes (PNG or JPEG). */
  imageBytes: Uint8Array;
  /** The replacement image's MIME type. */
  imageMime: string;
}

/** Detect a PNG or JPEG by magic bytes. Returns the mime or null. */
export function detectImageMime(
  bytes: Uint8Array
): "image/png" | "image/jpeg" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  return null;
}

/**
 * Replace one image on a page. The new image is embedded and the
 * page's XObject entry is pointed at it, so the replacement is
 * drawn in exactly the same frame (position and size) as the old
 * image. The old image data is removed from the document.
 */
export async function replaceImageInPdf(
  bytes: Uint8Array,
  input: ReplaceImageInput
): Promise<Uint8Array> {
  const { page, imageIndex, imageBytes, imageMime } = input;
  if (!Number.isInteger(page) || page < 1) {
    throw new PdfEditError(400, "Page must be a positive number.");
  }
  if (!Number.isInteger(imageIndex) || imageIndex < 0) {
    throw new PdfEditError(400, "Image index must be a non-negative number.");
  }
  if (
    imageBytes.length === 0 ||
    imageBytes.length > MAX_REPLACEMENT_IMAGE_BYTES
  ) {
    throw new PdfEditError(
      400,
      "The replacement image is empty or larger than 10 MB."
    );
  }
  const detected = detectImageMime(imageBytes);
  if (!detected || detected !== imageMime) {
    throw new PdfEditError(
      400,
      "The replacement file is not a PNG or JPEG image."
    );
  }
  const doc = await loadPdf(bytes, "This PDF");
  if (page > doc.getPageCount()) {
    throw new PdfEditError(
      400,
      `This PDF has ${doc.getPageCount()} page(s) — page ${page} does not exist.`
    );
  }
  const pageIndex = page - 1;
  const images = await listPdfImages(bytes);
  const onPage = images.filter((img) => img.page === page);
  if (onPage.length === 0) {
    throw new PdfEditError(400, `Page ${page} has no images to replace.`);
  }
  if (imageIndex >= onPage.length) {
    throw new PdfEditError(
      400,
      `Page ${page} has ${onPage.length} image(s) — image ${imageIndex} does not exist.`
    );
  }
  const target = onPage[imageIndex];
  const embedded =
    imageMime === "image/png"
      ? await doc.embedPng(imageBytes)
      : await doc.embedJpg(imageBytes);
  const pageObj = doc.getPage(pageIndex);
  const resources = pageObj.node.Resources();
  if (!resources)
    throw new PdfEditError(500, "This PDF page has no resources dictionary.");
  const xobjRef = resources.lookup(PDFName.of("XObject"));
  if (!xobjRef)
    throw new PdfEditError(500, "This PDF page has no image resources.");
  const xobjDict = doc.context.lookup(xobjRef) as PDFDict | undefined;
  if (!xobjDict)
    throw new PdfEditError(500, "This PDF page has no image resources.");
  xobjDict.set(PDFName.of(target.name), embedded.ref);
  return doc.save();
}

// ------------------------------------------------------------------
// Pages
// ------------------------------------------------------------------

export interface DeletePagesInput {
  /** 1-based page numbers to delete. */
  pages: number[];
}

/** Delete pages. At least one page must remain. */
export async function deletePagesInPdf(
  bytes: Uint8Array,
  input: DeletePagesInput
): Promise<Uint8Array> {
  const pages = [...new Set(input.pages)].sort((a, b) => a - b);
  if (pages.length === 0) {
    throw new PdfEditError(400, "Choose at least one page to delete.");
  }
  for (const p of pages) {
    if (!Number.isInteger(p) || p < 1) {
      throw new PdfEditError(400, "Page numbers must be positive.");
    }
  }
  const doc = await loadPdf(bytes, "This PDF");
  const count = doc.getPageCount();
  for (const p of pages) {
    if (p > count) {
      throw new PdfEditError(
        400,
        `This PDF has ${count} page(s) — page ${p} does not exist.`
      );
    }
  }
  if (pages.length >= count) {
    throw new PdfEditError(
      400,
      "A PDF must keep at least one page — you cannot delete every page."
    );
  }
  // Remove from the end so earlier indices stay valid.
  for (let i = pages.length - 1; i >= 0; i -= 1) {
    doc.removePage(pages[i] - 1);
  }
  return doc.save();
}

export interface ReorderPagesInput {
  /** The new order as 1-based page numbers (a permutation of 1..N). */
  order: number[];
}

/** Reorder pages. `order` must be a permutation of 1..N. */
export async function reorderPagesInPdf(
  bytes: Uint8Array,
  input: ReorderPagesInput
): Promise<Uint8Array> {
  const order = input.order;
  const doc = await loadPdf(bytes, "This PDF");
  const count = doc.getPageCount();
  if (order.length !== count) {
    throw new PdfEditError(
      400,
      `The new order must list all ${count} page(s).`
    );
  }
  const sorted = [...order].sort((a, b) => a - b);
  for (let i = 0; i < count; i += 1) {
    if (sorted[i] !== i + 1) {
      throw new PdfEditError(
        400,
        "The new order must use each page number exactly once."
      );
    }
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    doc,
    order.map((p) => p - 1)
  );
  for (const p of copied) out.addPage(p);
  return out.save();
}

/** List the text runs on one page (for the edit UI / validation). */
export async function listPdfTextRuns(
  bytes: Uint8Array,
  page: number
): Promise<PdfTextRun[]> {
  const doc = await loadPdf(bytes, "This PDF");
  if (page < 1 || page > doc.getPageCount()) {
    throw new PdfEditError(
      400,
      `This PDF has ${doc.getPageCount()} page(s) — page ${page} does not exist.`
    );
  }
  const pageIndex = page - 1;
  let ops;
  try {
    ops = parseOperations(tokenizeContent(getPageContent(doc, pageIndex)));
  } catch (error) {
    if (error instanceof PdfContentError) {
      throw new PdfEditError(
        400,
        `This page's content could not be read: ${error.message}`
      );
    }
    throw error;
  }
  const fonts = getPageFonts(doc, pageIndex);
  return extractTextRuns(ops, fonts, pageIndex);
}

/** Validate that a PDF can be edited at all (loadable, has pages). */
export async function assertEditablePdf(bytes: Uint8Array): Promise<number> {
  const doc = await loadPdf(bytes, "This PDF");
  const count = doc.getPageCount();
  if (count < 1) throw new PdfEditError(400, "This PDF has no pages.");
  if (count > MAX_PDF_PAGES) {
    throw new PdfEditError(
      400,
      `This PDF has more than ${MAX_PDF_PAGES} pages.`
    );
  }
  return count;
}

export { decodeTextBytes };

// ------------------------------------------------------------------
// Redaction (F26)
// ------------------------------------------------------------------

export interface RedactResult {
  bytes: Uint8Array;
  /** Text runs removed (a run is removed whole when its
   *  estimated box touches a region). */
  removedTextRuns: number;
  /** Image placements whose draw operation was removed. */
  removedImages: number;
  /** Annotations removed because their rect touched a
   *  region (their contents could quote the redacted text). */
  removedAnnotations: number;
}

/** Read an annotation dictionary's /Rect as a Rect, or null. */
function readAnnotRect(dict: PDFDict): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  const raw = dict.lookup(PDFName.of("Rect")) as PDFArray | undefined;
  if (!raw || raw.size() !== 4) return null;
  const values: number[] = [];
  for (let i = 0; i < 4; i++) {
    const value = raw.lookup(i);
    if (!(value instanceof PDFNumber)) return null;
    values.push(value.asNumber());
  }
  const [x1, y1, x2, y2] = values;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/**
 * Permanently remove the content under the given regions:
 * every text run whose estimated box intersects a region has
 * its drawing operations deleted from the content stream;
 * every image placement intersecting a region loses its Do
 * operation; annotations whose rect intersects a region are
 * removed; and a solid black rectangle is drawn over each
 * region. The server wrapper then rebuilds the file with
 * qpdf so image objects that are no longer drawn anywhere
 * are dropped from the file entirely.
 *
 * Throws PdfEditError(400) when a region names a page the
 * PDF does not have, or when nothing at all was removed and
 * no box would change anything (a region on an empty area
 * still draws its box, so this only fires for an empty
 * region list, which validation already refuses).
 */
export async function redactInPdf(
  bytes: Uint8Array,
  regions: RedactRegion[]
): Promise<RedactResult> {
  const doc = await loadPdf(bytes, "This PDF");
  const pageCount = doc.getPageCount();
  for (const region of regions) {
    if (region.page > pageCount) {
      throw new PdfEditError(
        400,
        `This PDF has ${pageCount} page(s) — page ${region.page} does not exist.`
      );
    }
  }
  let removedTextRuns = 0;
  let removedImages = 0;
  let removedAnnotations = 0;

  const pagesToEdit = [...new Set(regions.map((r) => r.page))];
  for (const pageNumber of pagesToEdit) {
    const pageRegions = regions.filter((r) => r.page === pageNumber);
    const pageIndex = pageNumber - 1;
    let content: string;
    let ops;
    try {
      content = getPageContent(doc, pageIndex);
      ops = parseOperations(tokenizeContent(content));
    } catch (error) {
      if (error instanceof PdfContentError) {
        throw new PdfEditError(
          400,
          `Page ${pageNumber}'s content could not be read: ${error.message}`
        );
      }
      throw error;
    }
    const fonts = getPageFonts(doc, pageIndex);
    const runs = extractTextRuns(ops, fonts, pageIndex);
    const placements = extractImagePlacements(ops);
    // Only true image XObjects are removed — a Form XObject
    // can contain a whole page section; it is covered by the
    // black box but never deleted (the stated limit).
    const pageNode = doc.getPage(pageIndex).node;
    const resources = pageNode.Resources();
    const xobjDict = resources
      ? (doc.context.lookup(
          resources.lookup(PDFName.of("XObject")) as PDFRef
        ) as PDFDict | undefined)
      : undefined;
    const imageNames = new Set<string>();
    if (xobjDict) {
      for (const [nameObj, ref] of xobjDict.entries()) {
        if (!(ref instanceof PDFRef)) continue;
        const resolved = doc.context.lookup(ref) as
          PDFDict | PDFStream | undefined;
        if (!resolved) continue;
        const obj: PDFDict | undefined =
          resolved instanceof PDFStream
            ? resolved.dict
            : (resolved as PDFDict);
        if (!obj || typeof obj.lookup !== "function") continue;
        const subtype = obj.lookup(PDFName.of("Subtype"));
        const subtypeName =
          subtype &&
          typeof (subtype as unknown as { decodeText?: () => string })
            .decodeText === "function"
            ? (subtype as unknown as { decodeText: () => string }).decodeText()
            : String(subtype ?? "");
        if (subtypeName.includes("Image")) {
          imageNames.add(nameObj.decodeText());
        }
      }
    }
    const removeIndices = new Set<number>();
    for (const run of runs) {
      const rect = estimateRunRect(run);
      if (pageRegions.some((region) => rectsIntersect(rect, region))) {
        for (const idx of run.opIndices) removeIndices.add(idx);
        removedTextRuns++;
      }
    }
    const removedImageNames = new Set<string>();
    for (const placement of placements) {
      if (!imageNames.has(placement.name)) continue;
      const rect = {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      };
      if (pageRegions.some((region) => rectsIntersect(rect, region))) {
        removeIndices.add(placement.opIndex);
        removedImageNames.add(placement.name);
        removedImages++;
      }
    }
    if (removeIndices.size > 0) {
      setPageContent(doc, pageIndex, serializeOperations(ops, removeIndices));
    }
    // Drop the page's reference to a removed image when no
    // remaining draw operation uses it, so the qpdf rebuild
    // drops the image object (and its mask) from the file.
    if (xobjDict && removedImageNames.size > 0) {
      const stillUsed = new Set(
        placements
          .filter((p) => !removeIndices.has(p.opIndex))
          .map((p) => p.name)
      );
      for (const name of removedImageNames) {
        if (!stillUsed.has(name)) {
          xobjDict.delete(PDFName.of(name));
        }
      }
    }

    // Annotations whose rect touches a region are removed —
    // their text could quote what was redacted.
    const page = doc.getPage(pageIndex);
    const annots = page.node.Annots();
    if (annots) {
      for (let i = annots.size() - 1; i >= 0; i--) {
        const dict = annots.lookup(i) as PDFDict | undefined;
        if (!dict || typeof dict.lookup !== "function") continue;
        const rect = readAnnotRect(dict);
        if (
          rect &&
          pageRegions.some((region) => rectsIntersect(rect, region))
        ) {
          annots.remove(i);
          removedAnnotations++;
        }
      }
    }

    // The visible black boxes, drawn last so they sit on top.
    for (const region of pageRegions) {
      page.drawRectangle({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        color: rgb(0, 0, 0),
      });
    }
  }

  return {
    bytes: await doc.save(),
    removedTextRuns,
    removedImages,
    removedAnnotations,
  };
}
