// PDF stamps / watermarks (Day 32) — pure functions, no server imports.
//
// A watermark or a stamp is DRAWN onto the page content (it becomes
// part of the page, not an annotation), so it is permanent — the
// standard approach, and WPS does the same. Removing one later
// means restoring an earlier version; the UI says so.
//
// Three operations:
//   - addTextWatermarkToPdf: custom text, drawn on the chosen pages
//     at a position, with a size, colour, opacity and rotation.
//     The classic watermark is the diagonal centre: large, light,
//     rotated 45 degrees.
//   - addImageWatermarkToPdf: an uploaded PNG or JPEG, drawn on the
//     chosen pages at a position, scaled to a fraction of the page
//     width, with an opacity and a rotation.
//   - addStampToPdf: a preset (CONFIDENTIAL, DRAFT, APPROVED,
//     REVIEWED) or custom text, drawn as a bordered box with the
//     text centred inside, in a colour, at a chosen position —
//     a rubber stamp.
//
// Pages are selected with "all" or a page-range string like
// "1-3, 5" (the same parsePageRanges as the other PDF tools).
// Every function throws PdfEditError(400, ...) for bad input and
// never modifies the input bytes.
import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type Color,
  type PDFImage,
} from "pdf-lib";
import { PdfEditError } from "@/lib/pdf-edit";
import { MAX_PDF_PAGES, parsePageRanges } from "@/lib/pdf-tools";
import {
  DRAW_COLORS,
  MAX_ADDED_TEXT_SIZE,
  MIN_ADDED_TEXT_SIZE,
  type DrawColorName,
} from "@/lib/pdf-page-tools";
import { validateFileSignature } from "@/lib/file-signatures";

export const MAX_WATERMARK_TEXT_CHARS = 100;
export const MIN_WATERMARK_OPACITY = 0.1;
export const MAX_WATERMARK_OPACITY = 1;
export const DEFAULT_WATERMARK_SIZE = 48;
export const DEFAULT_WATERMARK_OPACITY = 0.3;
export const WATERMARK_ROTATIONS = [0, 30, 45, 60, 90] as const;
export type WatermarkRotation = (typeof WATERMARK_ROTATIONS)[number];

export type TextWatermarkPosition =
  "centre-diagonal" | "centre" | "top-centre" | "bottom-centre";

export type ImageWatermarkPosition =
  "centre" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type StampPosition =
  "top-centre" | "top-right" | "bottom-centre" | "bottom-right";

export const STAMP_PRESETS = [
  "CONFIDENTIAL",
  "DRAFT",
  "APPROVED",
  "REVIEWED",
] as const;
export type StampPreset = (typeof STAMP_PRESETS)[number];

export const MAX_STAMP_TEXT_CHARS = 40;
export const STAMP_FONT_SIZE = 18;
export const STAMP_PADDING_X = 14;
export const STAMP_PADDING_Y = 8;
export const STAMP_BORDER_WIDTH = 2;
export const STAMP_MARGIN = 36;

export const MAX_WATERMARK_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MIN_WATERMARK_SCALE = 0.1;
export const MAX_WATERMARK_SCALE = 1;

function stampColor(name: DrawColorName): Color {
  const [r, g, b] = DRAW_COLORS[name];
  return rgb(r, g, b);
}

/** Resolve "all" or a page-range string to 1-based page numbers. */
function resolvePages(pages: string, pageCount: number): number[] {
  if (pages.trim().toLowerCase() === "all") {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const parsed = parsePageRanges(pages, pageCount);
  if (!parsed.ok) throw new PdfEditError(400, parsed.error);
  return parsed.pages;
}

function validateOpacity(opacity: number): void {
  if (
    !Number.isFinite(opacity) ||
    opacity < MIN_WATERMARK_OPACITY ||
    opacity > MAX_WATERMARK_OPACITY
  ) {
    throw new PdfEditError(
      400,
      `Opacity must be between ${MIN_WATERMARK_OPACITY} and ${MAX_WATERMARK_OPACITY}.`
    );
  }
}

function validateRotation(rotation: number): void {
  if (
    !Number.isInteger(rotation) ||
    !(WATERMARK_ROTATIONS as readonly number[]).includes(rotation)
  ) {
    throw new PdfEditError(
      400,
      `Rotation must be one of ${WATERMARK_ROTATIONS.join(", ")} degrees.`
    );
  }
}

async function loadStampPdf(bytes: Uint8Array): Promise<PDFDocument> {
  if (
    bytes.length < 5 ||
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  ) {
    throw new PdfEditError(400, "This file is not a valid PDF.");
  }
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch {
    throw new PdfEditError(400, "This file is not a valid PDF.");
  }
}

function checkPageCount(count: number): void {
  if (count > MAX_PDF_PAGES) {
    throw new PdfEditError(
      400,
      `This PDF has more than ${MAX_PDF_PAGES} pages.`
    );
  }
}

/** Add a text watermark to the chosen pages. Returns the new bytes.
 *  The input PDF is never modified. */
export async function addTextWatermarkToPdf(
  bytes: Uint8Array,
  input: {
    text: string;
    pages: string;
    position: TextWatermarkPosition;
    size: number;
    color: DrawColorName;
    opacity: number;
    rotation: number;
  }
): Promise<Uint8Array> {
  const text = input.text.trim();
  if (!text) {
    throw new PdfEditError(400, "Enter the watermark text.");
  }
  if (text.length > MAX_WATERMARK_TEXT_CHARS) {
    throw new PdfEditError(
      400,
      `Watermark text is at most ${MAX_WATERMARK_TEXT_CHARS} characters.`
    );
  }
  if (
    !Number.isInteger(input.size) ||
    input.size < MIN_ADDED_TEXT_SIZE ||
    input.size > MAX_ADDED_TEXT_SIZE
  ) {
    throw new PdfEditError(
      400,
      `Font size must be between ${MIN_ADDED_TEXT_SIZE} and ${MAX_ADDED_TEXT_SIZE}.`
    );
  }
  validateOpacity(input.opacity);
  validateRotation(input.rotation);
  const doc = await loadStampPdf(bytes);
  const count = doc.getPageCount();
  checkPageCount(count);
  const pageNumbers = resolvePages(input.pages, count);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const color = stampColor(input.color);
  const textWidth = font.widthOfTextAtSize(text, input.size);
  const rotation = input.position === "centre-diagonal" ? 45 : input.rotation;
  const theta = (rotation * Math.PI) / 180;
  for (const pageNumber of pageNumbers) {
    const page = doc.getPage(pageNumber - 1);
    const width = page.getWidth();
    const height = page.getHeight();
    // The target point is where the CENTRE of the text should land.
    // pdf-lib rotates the text around the (x, y) point, so the
    // start point is the centre moved back along the rotation by
    // half the text width and half the font size (the text's
    // height is approximated by its font size).
    let centreX = width / 2;
    let centreY = height / 2;
    if (input.position === "top-centre") {
      centreY = height - 72;
    } else if (input.position === "bottom-centre") {
      centreY = 72;
    }
    const x =
      centreX -
      (textWidth / 2) * Math.cos(theta) +
      (input.size / 2) * Math.sin(theta);
    const y =
      centreY -
      (textWidth / 2) * Math.sin(theta) -
      (input.size / 2) * Math.cos(theta);
    page.drawText(text, {
      x,
      y,
      size: input.size,
      font,
      color,
      opacity: input.opacity,
      rotate: degrees(rotation),
    });
  }
  return doc.save();
}

/** Add an image watermark to the chosen pages. The image must be a
 *  PNG or a JPEG (checked by its file signature, not its name).
 *  Returns the new bytes. The input PDF is never modified. */
export async function addImageWatermarkToPdf(
  bytes: Uint8Array,
  imageBytes: Uint8Array,
  imageMime: string,
  input: {
    pages: string;
    position: ImageWatermarkPosition;
    scale: number;
    opacity: number;
    rotation: number;
  }
): Promise<Uint8Array> {
  if (imageBytes.length === 0) {
    throw new PdfEditError(400, "The image file is empty.");
  }
  if (imageBytes.length > MAX_WATERMARK_IMAGE_BYTES) {
    throw new PdfEditError(
      400,
      `The image must be at most ${MAX_WATERMARK_IMAGE_BYTES / 1024 / 1024} MB.`
    );
  }
  const signature = validateFileSignature(
    imageBytes,
    imageMime === "image/png" ? "png" : "jpg"
  );
  if (!signature.ok) {
    throw new PdfEditError(400, signature.error);
  }
  if (
    !Number.isFinite(input.scale) ||
    input.scale < MIN_WATERMARK_SCALE ||
    input.scale > MAX_WATERMARK_SCALE
  ) {
    throw new PdfEditError(
      400,
      `Scale must be between ${MIN_WATERMARK_SCALE} and ${MAX_WATERMARK_SCALE} of the page width.`
    );
  }
  validateOpacity(input.opacity);
  validateRotation(input.rotation);
  const doc = await loadStampPdf(bytes);
  const count = doc.getPageCount();
  checkPageCount(count);
  const pageNumbers = resolvePages(input.pages, count);
  let image: PDFImage;
  if (imageMime === "image/png") {
    image = await doc.embedPng(imageBytes);
  } else if (imageMime === "image/jpeg") {
    image = await doc.embedJpg(imageBytes);
  } else {
    throw new PdfEditError(400, "The watermark image must be a PNG or a JPEG.");
  }
  const aspect = image.height / image.width;
  const theta = (input.rotation * Math.PI) / 180;
  for (const pageNumber of pageNumbers) {
    const page = doc.getPage(pageNumber - 1);
    const width = page.getWidth();
    const height = page.getHeight();
    const drawWidth = width * input.scale;
    const drawHeight = drawWidth * aspect;
    // The target point is where the CENTRE of the image should
    // land; the draw position is the centre moved back along the
    // rotation by half the image size.
    let centreX = width / 2;
    let centreY = height / 2;
    if (input.position === "top-left") {
      centreX = drawWidth / 2 + STAMP_MARGIN;
      centreY = height - drawHeight / 2 - STAMP_MARGIN;
    } else if (input.position === "top-right") {
      centreX = width - drawWidth / 2 - STAMP_MARGIN;
      centreY = height - drawHeight / 2 - STAMP_MARGIN;
    } else if (input.position === "bottom-left") {
      centreX = drawWidth / 2 + STAMP_MARGIN;
      centreY = drawHeight / 2 + STAMP_MARGIN;
    } else if (input.position === "bottom-right") {
      centreX = width - drawWidth / 2 - STAMP_MARGIN;
      centreY = drawHeight / 2 + STAMP_MARGIN;
    }
    const x =
      centreX -
      (drawWidth / 2) * Math.cos(theta) +
      (drawHeight / 2) * Math.sin(theta);
    const y =
      centreY -
      (drawWidth / 2) * Math.sin(theta) -
      (drawHeight / 2) * Math.cos(theta);
    page.drawImage(image, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
      opacity: input.opacity,
      rotate: degrees(input.rotation),
    });
  }
  return doc.save();
}

/** Add a rubber stamp to the chosen pages: a bordered box with the
 *  text centred inside it. Returns the new bytes. The input PDF is
 *  never modified. */
export async function addStampToPdf(
  bytes: Uint8Array,
  input: {
    text: string;
    pages: string;
    position: StampPosition;
    color: DrawColorName;
  }
): Promise<Uint8Array> {
  const text = input.text.trim().toUpperCase();
  if (!text) {
    throw new PdfEditError(400, "Enter the stamp text.");
  }
  if (text.length > MAX_STAMP_TEXT_CHARS) {
    throw new PdfEditError(
      400,
      `Stamp text is at most ${MAX_STAMP_TEXT_CHARS} characters.`
    );
  }
  const doc = await loadStampPdf(bytes);
  const count = doc.getPageCount();
  checkPageCount(count);
  const pageNumbers = resolvePages(input.pages, count);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const color = stampColor(input.color);
  const textWidth = font.widthOfTextAtSize(text, STAMP_FONT_SIZE);
  const boxWidth = textWidth + STAMP_PADDING_X * 2;
  const boxHeight = STAMP_FONT_SIZE + STAMP_PADDING_Y * 2;
  for (const pageNumber of pageNumbers) {
    const page = doc.getPage(pageNumber - 1);
    const width = page.getWidth();
    const height = page.getHeight();
    let x = (width - boxWidth) / 2;
    let y = height - STAMP_MARGIN - boxHeight;
    if (input.position === "top-right") {
      x = width - STAMP_MARGIN - boxWidth;
    } else if (input.position === "bottom-centre") {
      y = STAMP_MARGIN;
    } else if (input.position === "bottom-right") {
      x = width - STAMP_MARGIN - boxWidth;
      y = STAMP_MARGIN;
    }
    page.drawRectangle({
      x,
      y,
      width: boxWidth,
      height: boxHeight,
      borderColor: color,
      borderWidth: STAMP_BORDER_WIDTH,
      opacity: 0.9,
    });
    page.drawText(text, {
      x: x + STAMP_PADDING_X,
      y: y + STAMP_PADDING_Y,
      size: STAMP_FONT_SIZE,
      font,
      color,
      opacity: 0.9,
    });
  }
  return doc.save();
}
