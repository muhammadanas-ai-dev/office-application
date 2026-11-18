// PDF <-> image (Day 22) — pure helpers.
//
// PDF -> image: render a PDF's pages to PNG/JPG (pdftoppm does
// the rendering; this module holds the constants and the file
// names). Images -> PDF: build a PDF from images with pdf-lib
// (one page per image, fit within an A4 page, centred, aspect
// kept). Nothing here touches the filesystem or a network, so it
// is safe to import from anywhere, including tests.
import { PDFDocument, PageSizes } from "pdf-lib";
import { PdfEditError } from "@/lib/pdf-edit";

/** The image formats a PDF's pages can be exported as. */
export const IMAGE_EXPORT_FORMATS = ["png", "jpg"] as const;
export type ImageExportFormat = (typeof IMAGE_EXPORT_FORMATS)[number];

export function isImageExportFormat(value: string): value is ImageExportFormat {
  return (IMAGE_EXPORT_FORMATS as readonly string[]).includes(value);
}

/** The DPIs a PDF's pages can be rendered at. */
export const IMAGE_EXPORT_DPIS = [72, 150, 300] as const;
export type ImageExportDpi = (typeof IMAGE_EXPORT_DPIS)[number];

export function isImageExportDpi(value: number): value is ImageExportDpi {
  return (IMAGE_EXPORT_DPIS as readonly number[]).includes(value);
}

/** The most pages one export renders (a 100-page PDF at 300 DPI
 *  would be hundreds of MB). */
export const MAX_IMAGE_EXPORT_PAGES = 20;

/** The most images one images-to-PDF takes. */
export const MAX_IMAGES_TO_PDF = 20;

/** An A4 page, in points (pdf-lib's PageSizes.A4). */
export const A4_WIDTH_PT = PageSizes.A4[0];
export const A4_HEIGHT_PT = PageSizes.A4[1];

/** The image formats the app stores (and images-to-PDF accepts). */
export const IMAGE_TO_PDF_MIME_TYPES = ["image/png", "image/jpeg"] as const;

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

/**
 * Fit an image (in pixels) within an A4 page, keeping the
 * aspect ratio, centred. The image is never scaled up (a small
 * image stays small). Returns the drawn rectangle in points.
 */
export function fitImageInPage(
  imageWidthPx: number,
  imageHeightPx: number
): { x: number; y: number; width: number; height: number } {
  if (
    !Number.isFinite(imageWidthPx) ||
    !Number.isFinite(imageHeightPx) ||
    imageWidthPx <= 0 ||
    imageHeightPx <= 0
  ) {
    throw new PdfEditError(400, "This image has no size.");
  }
  const scale = Math.min(
    A4_WIDTH_PT / imageWidthPx,
    A4_HEIGHT_PT / imageHeightPx,
    1
  );
  const width = imageWidthPx * scale;
  const height = imageHeightPx * scale;
  return {
    x: (A4_WIDTH_PT - width) / 2,
    y: (A4_HEIGHT_PT - height) / 2,
    width,
    height,
  };
}

/** The ZIP file name for a PDF's exported images. */
export function getImageExportFileName(title: string): string {
  const base = title.replace(/\.[^.]+$/, "").trim() || "document";
  return `${base}-images.zip`;
}

/** The PDF file name for an images-to-PDF. */
export function getImagesToPdfFileName(title: string): string {
  const base = title.trim() || "Images to PDF";
  return `${base}.pdf`;
}

/** One image for images-to-PDF. */
export interface ImagesToPdfImage {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * Build a PDF from images — one page per image, each fit within
 * an A4 page, centred, aspect kept. The mime type must match the
 * bytes (a PNG that claims to be a JPEG is refused). Returns the
 * PDF bytes. The images are never modified.
 */
export async function buildImagesPdf(
  images: ImagesToPdfImage[]
): Promise<Uint8Array> {
  if (images.length === 0) {
    throw new PdfEditError(400, "Choose at least one image.");
  }
  if (images.length > MAX_IMAGES_TO_PDF) {
    throw new PdfEditError(400, `Choose at most ${MAX_IMAGES_TO_PDF} images.`);
  }
  const doc = await PDFDocument.create();
  for (const image of images) {
    const png = image.mimeType === "image/png";
    const jpeg = image.mimeType === "image/jpeg";
    if (!png && !jpeg) {
      throw new PdfEditError(
        400,
        "Only PNG and JPEG images can go into a PDF."
      );
    }
    if ((png && !isPng(image.bytes)) || (jpeg && !isJpeg(image.bytes))) {
      throw new PdfEditError(
        400,
        "This image's contents do not match its file type."
      );
    }
    const embedded = png
      ? await doc.embedPng(image.bytes)
      : await doc.embedJpg(image.bytes);
    const rect = fitImageInPage(embedded.width, embedded.height);
    const page = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    page.drawImage(embedded, rect);
  }
  return doc.save();
}
