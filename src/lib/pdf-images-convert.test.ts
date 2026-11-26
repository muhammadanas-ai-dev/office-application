import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { imageToPdfPages } from "@/lib/pdf-images.server";
import { buildImagesPdf } from "@/lib/pdf-images";

async function solidPng(
  r: number,
  g: number,
  b: number
): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width: 6,
      height: 4,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

describe("WEBP / TIFF to PDF pages (F34)", () => {
  it("passes PNG through untouched", async () => {
    const png = await solidPng(10, 20, 30);
    const pages = await imageToPdfPages(png, "image/png");
    expect(pages).toHaveLength(1);
    expect(pages[0].bytes).toBe(png);
  });

  it("decodes WEBP to a PNG page that embeds in a PDF", async () => {
    const png = await solidPng(200, 0, 0);
    const webp = new Uint8Array(await sharp(png).webp().toBuffer());
    const pages = await imageToPdfPages(webp, "image/webp");
    expect(pages).toHaveLength(1);
    expect(pages[0].mimeType).toBe("image/png");
    const pdf = await buildImagesPdf(pages);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
  });

  it("decodes a TIFF to a PNG page (the multi-page loop reads one PNG per TIFF page)", async () => {
    const first = await solidPng(0, 200, 0);
    const second = await solidPng(0, 0, 200);
    const tiff = new Uint8Array(await sharp(first).tiff().toBuffer());
    const pages = await imageToPdfPages(tiff, "image/tiff");
    expect(pages).toHaveLength(1);
    expect(pages[0].mimeType).toBe("image/png");
    const pdf = await buildImagesPdf([
      ...pages,
      ...(await imageToPdfPages(
        new Uint8Array(await sharp(second).webp().toBuffer()),
        "image/webp"
      )),
    ]);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2);
  });

  it("refuses an undecodable image and an unsupported type", async () => {
    await expect(
      imageToPdfPages(new Uint8Array([1, 2, 3, 4]), "image/webp")
    ).rejects.toThrow(/could not be decoded/);
    await expect(
      imageToPdfPages(new Uint8Array([1, 2, 3]), "image/gif")
    ).rejects.toThrow(/Only PNG, JPEG, WEBP and TIFF/);
  });
});
