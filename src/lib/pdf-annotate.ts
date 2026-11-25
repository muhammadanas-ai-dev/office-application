// PDF annotations (Day 17) — pure functions, no server imports.
//
// Annotations live IN the PDF itself (as standard annotation
// dictionaries on each page's /Annots array), so they travel with
// the file and open in any PDF reader. pdf-lib has no high-level
// annotation-creation API, so the dicts are built by hand with
// `doc.context.obj({...})`, registered, and added with
// `page.node.addAnnot(ref)` — the mechanism proven by
// scripts/prove-annotations.mjs (14/14 checks).
//
// The five kinds and their fixed, named colours (v1 has no
// free-form colour picker):
//   highlight   yellow [1,1,0]   QuadPoints, one quad per line
//   underline   green  [0,0.6,0] QuadPoints, one quad per line
//   strikeout   red    [1,0,0]   QuadPoints, one quad per line
//   note        yellow [1,1,0]   a 20x20 icon at the click point
//   ink         red    [1,0,0]   InkList, one array per stroke
// QuadPoints are in the [top-left, top-right, bottom-left,
// bottom-right] order (PDF.js's own calculateLinkPosition builds
// them that way). All coordinates are PDF points, origin
// bottom-left.
// No appearance stream (/AP) in v1: PDF.js renders text-markup
// and ink annotations from the QuadPoints / InkList without one,
// and Adobe Reader / Preview generate appearances on open.
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  rgb,
} from "pdf-lib";

export type AnnotationKind =
  "highlight" | "underline" | "strikeout" | "note" | "ink";

const KIND_TO_SUBTYPE: Record<AnnotationKind, string> = {
  highlight: "Highlight",
  underline: "Underline",
  strikeout: "StrikeOut",
  note: "Text",
  ink: "Ink",
};

export const ANNOTATION_COLORS: Record<
  AnnotationKind,
  [number, number, number]
> = {
  highlight: [1, 1, 0],
  underline: [0, 0.6, 0],
  strikeout: [1, 0, 0],
  note: [1, 1, 0],
  ink: [1, 0, 0],
};

export const NOTE_ICON_SIZE = 20;
export const INK_LINE_WIDTH = 2;
export const MAX_CONTENTS_LENGTH = 2000;

export type AnnotationInput = {
  kind: AnnotationKind;
  /** 1-based page number. */
  page: number;
  /** For highlight / underline / strikeout: 8 numbers per quad,
   *  [top-left, top-right, bottom-left, bottom-right] per quad. */
  quadPoints?: number[];
  /** For note: the click point, in PDF points. */
  x?: number;
  y?: number;
  /** For ink: one flat array of alternating x,y per stroke. */
  strokes?: number[][];
  /** Optional note text (any kind). */
  contents?: string;
};

export type ListedAnnotation = {
  page: number;
  /** Index in the page's Annots array (used to remove it). */
  index: number;
  subtype: string;
  rect: [number, number, number, number];
  quadPoints?: number[];
  inkList?: number[][];
  contents?: string;
  color?: [number, number, number];
  author?: string;
  date?: string;
};

export class AnnotateError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toPdfDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function validateInput(input: AnnotationInput, pageCount: number): void {
  if (
    !Number.isInteger(input.page) ||
    input.page < 1 ||
    input.page > pageCount
  ) {
    throw new AnnotateError(
      400,
      `Page ${input.page} does not exist in this PDF.`
    );
  }
  if (input.contents !== undefined) {
    if (
      typeof input.contents !== "string" ||
      input.contents.length > MAX_CONTENTS_LENGTH
    ) {
      throw new AnnotateError(
        400,
        "The note text is too long (at most 2000 characters)."
      );
    }
  }
  if (
    input.kind === "highlight" ||
    input.kind === "underline" ||
    input.kind === "strikeout"
  ) {
    const quads = input.quadPoints;
    if (!Array.isArray(quads) || quads.length === 0 || quads.length % 8 !== 0) {
      throw new AnnotateError(
        400,
        "A text annotation needs at least one quad (8 numbers each)."
      );
    }
    if (!quads.every(isFiniteNumber)) {
      throw new AnnotateError(
        400,
        "The annotation coordinates must be finite numbers."
      );
    }
    return;
  }
  if (input.kind === "note") {
    if (!isFiniteNumber(input.x) || !isFiniteNumber(input.y)) {
      throw new AnnotateError(400, "A note needs a position (x and y).");
    }
    return;
  }
  if (input.kind === "ink") {
    const strokes = input.strokes;
    if (!Array.isArray(strokes) || strokes.length === 0) {
      throw new AnnotateError(
        400,
        "A freehand annotation needs at least one stroke."
      );
    }
    for (const stroke of strokes) {
      if (
        !Array.isArray(stroke) ||
        stroke.length < 4 ||
        stroke.length % 2 !== 0
      ) {
        throw new AnnotateError(
          400,
          "Each stroke needs at least two points (4 numbers)."
        );
      }
      if (!stroke.every(isFiniteNumber)) {
        throw new AnnotateError(
          400,
          "The stroke coordinates must be finite numbers."
        );
      }
    }
  }
}

function rectFromQuads(quads: number[]): [number, number, number, number] {
  const xs = quads.filter((_, i) => i % 2 === 0);
  const ys = quads.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function rectFromStrokes(
  strokes: number[][]
): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length; i += 2) {
      xs.push(stroke[i]);
      ys.push(stroke[i + 1]);
    }
  }
  const pad = INK_LINE_WIDTH;
  return [
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) + pad,
    Math.max(...ys) + pad,
  ];
}

function buildAnnotationDict(
  doc: PDFDocument,
  input: AnnotationInput,
  author: string
): PDFDict {
  // Built entry by entry with PDFDict.set (fully typed) rather
  // than context.obj, whose Literal type does not accept a dict
  // built up conditionally.
  const dict = PDFDict.withContext(doc.context);
  const color = ANNOTATION_COLORS[input.kind];
  dict.set(PDFName.of("Type"), PDFName.of("Annot"));
  dict.set(PDFName.of("Subtype"), PDFName.of(KIND_TO_SUBTYPE[input.kind]));
  dict.set(PDFName.of("C"), doc.context.obj([...color]));
  dict.set(PDFName.of("T"), PDFString.of(author));
  dict.set(PDFName.of("M"), PDFString.of(toPdfDate(new Date())));
  dict.set(PDFName.of("F"), PDFNumber.of(4));
  if (input.contents !== undefined && input.contents.length > 0) {
    dict.set(PDFName.of("Contents"), PDFString.of(input.contents));
  }
  if (
    input.kind === "highlight" ||
    input.kind === "underline" ||
    input.kind === "strikeout"
  ) {
    dict.set(
      PDFName.of("Rect"),
      doc.context.obj([...rectFromQuads(input.quadPoints!)])
    );
    dict.set(PDFName.of("QuadPoints"), doc.context.obj([...input.quadPoints!]));
  } else if (input.kind === "note") {
    dict.set(
      PDFName.of("Rect"),
      doc.context.obj([
        input.x!,
        input.y!,
        input.x! + NOTE_ICON_SIZE,
        input.y! + NOTE_ICON_SIZE,
      ])
    );
    dict.set(PDFName.of("Name"), PDFName.of("Comment"));
    dict.set(PDFName.of("Open"), PDFBool.False);
  } else {
    dict.set(
      PDFName.of("Rect"),
      doc.context.obj([...rectFromStrokes(input.strokes!)])
    );
    dict.set(
      PDFName.of("InkList"),
      doc.context.obj(input.strokes!.map((stroke) => [...stroke]))
    );
    dict.set(PDFName.of("Border"), doc.context.obj([0, 0, INK_LINE_WIDTH]));
  }
  return dict;
}

/** Add one or more annotations to a PDF. Returns the new bytes.
 *  The input PDF is never modified. */
export async function addAnnotationsToPdf(
  pdfBytes: Uint8Array,
  inputs: AnnotationInput[],
  author = "Forma Office"
): Promise<Uint8Array> {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new AnnotateError(400, "Add at least one annotation.");
  }
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pageCount = doc.getPageCount();
  for (const input of inputs) validateInput(input, pageCount);
  for (const input of inputs) {
    const page = doc.getPage(input.page - 1);
    const dict = buildAnnotationDict(doc, input, author);
    page.node.addAnnot(doc.context.register(dict));
  }
  return doc.save();
}

function readNumberArray(array: PDFArray | undefined): number[] | undefined {
  if (!array) return undefined;
  const values: number[] = [];
  for (let i = 0; i < array.size(); i++) {
    const value = array.lookup(i);
    if (!(value instanceof PDFNumber)) return undefined;
    values.push(value.asNumber());
  }
  return values;
}

function readAnnotationDict(
  dict: PDFDict,
  page: number,
  index: number
): ListedAnnotation | null {
  const subtype = dict.lookup(PDFName.of("Subtype"));
  if (!subtype) return null;
  const rect = readNumberArray(
    dict.lookup(PDFName.of("Rect")) as PDFArray | undefined
  );
  if (!rect || rect.length !== 4) return null;
  const contents = dict.lookup(PDFName.of("Contents"));
  const color = readNumberArray(
    dict.lookup(PDFName.of("C")) as PDFArray | undefined
  );
  const author = dict.lookup(PDFName.of("T"));
  const date = dict.lookup(PDFName.of("M"));
  const annotation: ListedAnnotation = {
    page,
    index,
    subtype: subtype.toString().replace("/", ""),
    rect: [rect[0], rect[1], rect[2], rect[3]],
  };
  const quadPoints = readNumberArray(
    dict.lookup(PDFName.of("QuadPoints")) as PDFArray | undefined
  );
  if (quadPoints) annotation.quadPoints = quadPoints;
  const inkListRaw = dict.lookup(PDFName.of("InkList"));
  if (inkListRaw instanceof PDFArray) {
    const inkList: number[][] = [];
    for (let i = 0; i < inkListRaw.size(); i++) {
      const stroke = readNumberArray(
        inkListRaw.lookup(i) as PDFArray | undefined
      );
      if (stroke) inkList.push(stroke);
    }
    if (inkList.length > 0) annotation.inkList = inkList;
  }
  if (contents instanceof PDFString) annotation.contents = contents.asString();
  if (color && color.length === 3) {
    annotation.color = [color[0], color[1], color[2]];
  }
  if (author instanceof PDFString) annotation.author = author.asString();
  if (date instanceof PDFString) annotation.date = date.asString();
  return annotation;
}

/** List every annotation in a PDF (all pages, in page order). */
export async function listAnnotationsInPdf(
  pdfBytes: Uint8Array
): Promise<ListedAnnotation[]> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const listed: ListedAnnotation[] = [];
  for (let p = 0; p < doc.getPageCount(); p++) {
    const page = doc.getPage(p);
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      // PDFArray.lookup resolves the ref, so this is the dict
      // itself (not the ref) — that is the object to read.
      const dict = annots.lookup(i);
      if (!(dict instanceof PDFDict)) continue;
      const annotation = readAnnotationDict(dict, p + 1, i);
      if (annotation) listed.push(annotation);
    }
  }
  return listed;
}

/** Remove one annotation (by its page + its index in that page's
 *  Annots array, as returned by listAnnotationsInPdf). Returns the
 *  new bytes. The input PDF is never modified. */
export async function removeAnnotationFromPdf(
  pdfBytes: Uint8Array,
  page: number,
  index: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  if (!Number.isInteger(page) || page < 1 || page > doc.getPageCount()) {
    throw new AnnotateError(400, `Page ${page} does not exist in this PDF.`);
  }
  const pageNode = doc.getPage(page - 1).node;
  const annots = pageNode.Annots();
  if (
    !annots ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= annots.size()
  ) {
    throw new AnnotateError(404, "That annotation does not exist.");
  }
  annots.remove(index);
  return doc.save();
}

export const HIGHLIGHT_FLATTEN_OPACITY = 0.5;
export const SUMMARY_CONTENTS_CHARS = 200;

/** The friendly name for an annotation subtype, for the summary. */
function subtypeLabel(subtype: string): string {
  switch (subtype) {
    case "Highlight":
      return "Highlight";
    case "Underline":
      return "Underline";
    case "StrikeOut":
      return "Strikeout";
    case "Text":
      return "Note";
    case "Ink":
      return "Drawing";
    default:
      return subtype;
  }
}

/** Flatten the annotations INTO the page content (Day 34): the
 *  highlight quads become translucent rectangles in the
 *  annotation's own colour, the underline/strikeout become lines,
 *  the ink strokes become polylines. The annotation dicts are
 *  then removed, so the result prints and renders identically in
 *  every reader. Note annotations are NOT drawn (a note has no
 *  printable geometry beyond its icon) — their text is carried
 *  by the comments summary page instead. Returns the new bytes.
 *  The input PDF is never modified. Throws AnnotateError(400, …)
 *  when the PDF has no annotations. */
export async function flattenAnnotationsInPdf(
  pdfBytes: Uint8Array
): Promise<Uint8Array> {
  const annotations = await listAnnotationsInPdf(pdfBytes);
  if (annotations.length === 0) {
    throw new AnnotateError(400, "This document has no comments to export.");
  }
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  for (const annotation of annotations) {
    const page = doc.getPage(annotation.page - 1);
    const color = rgb(...(annotation.color ?? ANNOTATION_COLORS.highlight));
    if (
      (annotation.subtype === "Highlight" ||
        annotation.subtype === "Underline" ||
        annotation.subtype === "StrikeOut") &&
      annotation.quadPoints
    ) {
      const quads = annotation.quadPoints;
      for (let q = 0; q + 8 <= quads.length; q += 8) {
        // [top-left, top-right, bottom-left, bottom-right]
        const [tlx, tly, trx, , blx, bly, brx] = quads.slice(q, q + 8);
        if (annotation.subtype === "Highlight") {
          page.drawRectangle({
            x: blx,
            y: bly,
            width: trx - tlx,
            height: tly - bly,
            color,
            opacity: HIGHLIGHT_FLATTEN_OPACITY,
          });
        } else if (annotation.subtype === "Underline") {
          page.drawLine({
            start: { x: blx, y: bly + 1 },
            end: { x: brx, y: bly + 1 },
            thickness: 1.5,
            color,
          });
        } else {
          const midY = (tly + bly) / 2;
          page.drawLine({
            start: { x: blx, y: midY },
            end: { x: brx, y: midY },
            thickness: 1.5,
            color,
          });
        }
      }
    } else if (annotation.subtype === "Ink" && annotation.inkList) {
      for (const stroke of annotation.inkList) {
        for (let s = 0; s + 4 <= stroke.length; s += 2) {
          page.drawLine({
            start: { x: stroke[s], y: stroke[s + 1] },
            end: { x: stroke[s + 2], y: stroke[s + 3] },
            thickness: INK_LINE_WIDTH,
            color,
          });
        }
      }
    }
    // Note annotations (subtype Text) are not drawn — see the
    // docstring.
  }
  // Remove every annotation dict, so the copy is truly flat.
  for (let p = 0; p < doc.getPageCount(); p++) {
    doc.getPage(p).node.delete(PDFName.of("Annots"));
  }
  return doc.save();
}

/** Append a comments summary page (Day 34) listing every
 *  annotation in page order: the page, the kind, the author and
 *  date when the dict carries them, and the Contents text
 *  (truncated at 200 chars). One or more pages are appended as
 *  needed. Returns the new bytes. The input PDF is never
 *  modified. */
export async function appendCommentsSummaryInPdf(
  pdfBytes: Uint8Array,
  annotations: ListedAnnotation[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN = 54;
  const LINE_HEIGHT = 15;
  const BODY_SIZE = 10;

  function wrap(text: string, size: number, useFont = font): string[] {
    const maxWidth = PAGE_WIDTH - MARGIN * 2;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (useFont.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  page.drawText("Comments", {
    x: MARGIN,
    y,
    size: 18,
    font: bold,
    color: rgb(0.13, 0.16, 0.24),
  });
  y -= 26;
  page.drawText(
    `${annotations.length} comment${annotations.length === 1 ? "" : "s"} in this document, in page order.`,
    { x: MARGIN, y, size: BODY_SIZE, font, color: rgb(0.4, 0.44, 0.54) }
  );
  y -= LINE_HEIGHT * 2;

  function ensureSpace(lines: number) {
    if (y - lines * LINE_HEIGHT < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  for (const [i, annotation] of annotations.entries()) {
    const header = `${i + 1}. Page ${annotation.page} — ${subtypeLabel(annotation.subtype)}`;
    const meta: string[] = [];
    if (annotation.author) meta.push(`by ${annotation.author}`);
    if (annotation.date) meta.push(annotation.date.replace(/^D:/, ""));
    const contents = annotation.contents
      ? annotation.contents.length > SUMMARY_CONTENTS_CHARS
        ? `${annotation.contents.slice(0, SUMMARY_CONTENTS_CHARS)}…`
        : annotation.contents
      : "(no text)";
    const headerLines = wrap(header, BODY_SIZE, bold);
    const metaLines = meta.length ? wrap(meta.join(" · "), BODY_SIZE) : [];
    const bodyLines = wrap(contents, BODY_SIZE);
    ensureSpace(headerLines.length + metaLines.length + bodyLines.length + 1);
    for (const line of headerLines) {
      page.drawText(line, {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font: bold,
        color: rgb(0.13, 0.16, 0.24),
      });
      y -= LINE_HEIGHT;
    }
    for (const line of [...metaLines, ...bodyLines]) {
      page.drawText(line, {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font,
        color: rgb(0.13, 0.16, 0.24),
      });
      y -= LINE_HEIGHT;
    }
    y -= LINE_HEIGHT / 2;
  }
  // pdf-lib writes an empty Annots array on a freshly added
  // page — remove it, so a flattened copy carries no Annots key
  // at all.
  for (let p = 0; p < doc.getPageCount(); p++) {
    const annots = doc.getPage(p).node.Annots();
    if (annots && annots.size() === 0) {
      doc.getPage(p).node.delete(PDFName.of("Annots"));
    }
  }
  return doc.save();
}
