// Unit tests for PDF <-> image (Day 22) — the fit math, the
// file names, and the images-to-PDF builder. The builder tests
// use small real images (a PNG and a JPEG generated in the test
// with pdf-lib's own embed, plus the committed OCR fixtures for
// a real PNG/JPEG).
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  buildImagesPdf,
  fitImageInPage,
  getImageExportFileName,
  getImagesToPdfFileName,
  isImageExportDpi,
  isImageExportFormat,
} from "@/lib/pdf-images";

describe("fitImageInPage", () => {
  it("fits a wide image by width, centred vertically", () => {
    const rect = fitImageInPage(1200, 600);
    // Scale = 595.28/1200 = 0.496; width 595.28, height 297.64.
    expect(rect.width).toBeCloseTo(A4_WIDTH_PT, 2);
    expect(rect.height).toBeCloseTo(297.64, 2);
    expect(rect.x).toBeCloseTo(0, 2);
    expect(rect.y).toBeCloseTo((A4_HEIGHT_PT - 297.64) / 2, 2);
  });

  it("fits a tall image by height, centred horizontally", () => {
    const rect = fitImageInPage(600, 1200);
    // Scale = 841.89/1200 = 0.702; width 420.95, height 841.89.
    expect(rect.height).toBeCloseTo(A4_HEIGHT_PT, 2);
    expect(rect.width).toBeCloseTo(420.95, 2);
    expect(rect.x).toBeCloseTo((A4_WIDTH_PT - 420.95) / 2, 2);
    expect(rect.y).toBeCloseTo(0, 2);
  });

  it("never scales a small image up", () => {
    const rect = fitImageInPage(100, 80);
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(80);
    expect(rect.x).toBeCloseTo((A4_WIDTH_PT - 100) / 2, 2);
    expect(rect.y).toBeCloseTo((A4_HEIGHT_PT - 80) / 2, 2);
  });

  it("refuses a zero-size image", () => {
    expect(() => fitImageInPage(0, 100)).toThrowError();
    expect(() => fitImageInPage(100, 0)).toThrowError();
  });
});

describe("file names and format checks", () => {
  it("names the ZIP after the document", () => {
    expect(getImageExportFileName("Report.pdf")).toBe("Report-images.zip");
    expect(getImageExportFileName("Report")).toBe("Report-images.zip");
  });

  it("names the PDF after the title", () => {
    expect(getImagesToPdfFileName("My photos")).toBe("My photos.pdf");
    expect(getImagesToPdfFileName("  ")).toBe("Images to PDF.pdf");
  });

  it("accepts only png/jpg and 72/150/300 DPI", () => {
    expect(isImageExportFormat("png")).toBe(true);
    expect(isImageExportFormat("jpg")).toBe(true);
    expect(isImageExportFormat("tiff")).toBe(false);
    expect(isImageExportDpi(72)).toBe(true);
    expect(isImageExportDpi(150)).toBe(true);
    expect(isImageExportDpi(300)).toBe(true);
    expect(isImageExportDpi(200)).toBe(false);
  });
});

describe("buildImagesPdf", () => {
  it("builds a PDF with one page per image, A4, in order", async () => {
    const png = new Uint8Array(
      readFileSync("src/lib/__fixtures__/ocr-english.png")
    );
    // A real JPEG: the committed Urdu fixture is a PNG; make a
    // JPEG by embedding the PNG in a PDF is not a JPEG. Use a
    // minimal 1x1 JPEG (a valid JFIF, base64).
    const jpeg = new Uint8Array(
      Buffer.from(
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==",
        "base64"
      )
    );
    const bytes = await buildImagesPdf([
      { bytes: png, mimeType: "image/png" },
      { bytes: jpeg, mimeType: "image/jpeg" },
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const page = doc.getPage(0);
    expect(page.getWidth()).toBeCloseTo(A4_WIDTH_PT, 2);
    expect(page.getHeight()).toBeCloseTo(A4_HEIGHT_PT, 2);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await (
      await pdfjs.getDocument({ data: bytes.slice() })
    ).promise;
    expect(pdf.numPages).toBe(2);
  });

  it("refuses an empty list and more than 20 images", async () => {
    await expect(buildImagesPdf([])).rejects.toMatchObject({ status: 400 });
    const png = new Uint8Array(
      readFileSync("src/lib/__fixtures__/ocr-english.png")
    );
    const many = Array.from({ length: 21 }, () => ({
      bytes: png,
      mimeType: "image/png",
    }));
    await expect(buildImagesPdf(many)).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a non-image mime type and a mismatched file", async () => {
    const png = new Uint8Array(
      readFileSync("src/lib/__fixtures__/ocr-english.png")
    );
    await expect(
      buildImagesPdf([{ bytes: png, mimeType: "application/pdf" }])
    ).rejects.toMatchObject({ status: 400 });
    // A PNG's bytes claimed to be a JPEG.
    await expect(
      buildImagesPdf([{ bytes: png, mimeType: "image/jpeg" }])
    ).rejects.toMatchObject({ status: 400 });
  });
});
