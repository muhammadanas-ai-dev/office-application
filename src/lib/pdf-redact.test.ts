import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  RedactError,
  estimateRunRect,
  rectsIntersect,
  validateRedactRegions,
} from "@/lib/pdf-redact";
import { redactInPdf } from "@/lib/pdf-edit";
import { extractPdfText } from "@/lib/pdf-searchable";
import type { PdfTextRun } from "@/lib/pdf-content";

describe("validateRedactRegions", () => {
  it("accepts a valid region list", () => {
    expect(
      validateRedactRegions([{ page: 1, x: 10, y: 20, width: 100, height: 30 }])
    ).toEqual([{ page: 1, x: 10, y: 20, width: 100, height: 30 }]);
  });
  it("refuses an empty list and non-positive sizes", () => {
    expect(() => validateRedactRegions([])).toThrow(RedactError);
    expect(() =>
      validateRedactRegions([{ page: 1, x: 0, y: 0, width: 0, height: 5 }])
    ).toThrow(RedactError);
    expect(() =>
      validateRedactRegions([{ page: 0, x: 0, y: 0, width: 5, height: 5 }])
    ).toThrow(RedactError);
  });
});

describe("rectsIntersect / estimateRunRect", () => {
  it("detects overlap and separation", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect(a, { x: 20, y: 0, width: 5, height: 5 })).toBe(false);
  });
  it("estimates a run box from its baseline and font size", () => {
    const run = {
      text: "Secret",
      x: 100,
      y: 200,
      fontSize: 10,
    } as PdfTextRun;
    const rect = estimateRunRect(run);
    expect(rect.x).toBe(100);
    expect(rect.y).toBeCloseTo(197.5);
    expect(rect.width).toBeCloseTo(33);
    expect(rect.height).toBeCloseTo(11);
  });
});

/** A two-line PDF: "Public line" at y 700, "Secret line" at y 650. */
async function buildTextPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("Public line", { x: 50, y: 700, size: 12, font });
  page.drawText("Secret line", { x: 50, y: 650, size: 12, font });
  return doc.save();
}

describe("redactInPdf", () => {
  it("removes the text under a region and keeps the rest", async () => {
    const bytes = await buildTextPdf();
    const result = await redactInPdf(bytes, [
      { page: 1, x: 40, y: 640, width: 200, height: 25 },
    ]);
    expect(result.removedTextRuns).toBeGreaterThanOrEqual(1);
    const { text } = await extractPdfText(result.bytes);
    expect(text).toContain("Public line");
    expect(text).not.toContain("Secret");
  });

  it("removes an image placement under a region", async () => {
    const doc = await PDFDocument.create();
    const pngB64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const image = await doc.embedPng(
      new Uint8Array(Buffer.from(pngB64, "base64"))
    );
    const page = doc.addPage([300, 200]);
    page.drawImage(image, { x: 50, y: 50, width: 100, height: 100 });
    const bytes = await doc.save();
    const result = await redactInPdf(bytes, [
      { page: 1, x: 40, y: 40, width: 120, height: 120 },
    ]);
    expect(result.removedImages).toBe(1);
  });

  it("refuses a region on a page the PDF does not have", async () => {
    const bytes = await buildTextPdf();
    await expect(
      redactInPdf(bytes, [{ page: 9, x: 0, y: 0, width: 10, height: 10 }])
    ).rejects.toThrow(/page 9 does not exist/);
  });
});
