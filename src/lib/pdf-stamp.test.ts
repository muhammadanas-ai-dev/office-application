// Unit tests for PDF stamps / watermarks (Day 32).
//
// The fixture PDFs are built in the test with pdf-lib, so the
// tests prove the operations are correct — not just that bytes
// were produced. The drawn text is real text, so it is
// extractable with pdfjs-dist getTextContent. The image
// watermark is verified by the embedded image's presence in
// the result (the page's XObject resources).
import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  addImageWatermarkToPdf,
  addStampToPdf,
  addTextWatermarkToPdf,
} from "@/lib/pdf-stamp";
import { PdfEditError as EditError } from "@/lib/pdf-edit";

async function fixturePdf(pageTexts: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pageTexts) {
    const page = doc.addPage([612, 792]);
    page.drawText(text, { x: 50, y: 700, size: 20, font, color: rgb(0, 0, 0) });
  }
  return doc.save();
}

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await (await pdfjs.getDocument({ data: bytes })).promise;
  const texts: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    texts.push(
      content.items.map((item) => ("str" in item ? item.str : "")).join(" ")
    );
  }
  return texts;
}

/** A 1x1 red PNG (the smallest valid PNG). */
function fixturePng(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

describe("addTextWatermarkToPdf", () => {
  it("draws the watermark text on every page", async () => {
    const bytes = await addTextWatermarkToPdf(
      await fixturePdf(["Page 1", "Page 2"]),
      {
        text: "CONFIDENTIAL",
        pages: "all",
        position: "centre-diagonal",
        size: 48,
        color: "red",
        opacity: 0.3,
        rotation: 45,
      }
    );
    const texts = await pageTexts(bytes);
    expect(texts[0]).toContain("CONFIDENTIAL");
    expect(texts[1]).toContain("CONFIDENTIAL");
  });

  it("draws the watermark only on the chosen pages", async () => {
    const bytes = await addTextWatermarkToPdf(
      await fixturePdf(["Page 1", "Page 2", "Page 3"]),
      {
        text: "DRAFT",
        pages: "2",
        position: "centre",
        size: 36,
        color: "grey",
        opacity: 0.5,
        rotation: 0,
      }
    );
    const texts = await pageTexts(bytes);
    expect(texts[0]).not.toContain("DRAFT");
    expect(texts[1]).toContain("DRAFT");
    expect(texts[2]).not.toContain("DRAFT");
  });

  it("does not modify the input PDF", async () => {
    const original = await fixturePdf(["Page 1"]);
    await addTextWatermarkToPdf(original, {
      text: "DRAFT",
      pages: "all",
      position: "centre",
      size: 36,
      color: "grey",
      opacity: 0.5,
      rotation: 0,
    });
    const texts = await pageTexts(original);
    expect(texts[0].trim()).toBe("Page 1");
  });

  it("rejects empty text, bad opacity, bad rotation and a bad page range", async () => {
    const base = {
      text: "DRAFT",
      pages: "all",
      position: "centre" as const,
      size: 36,
      color: "grey" as const,
      opacity: 0.5,
      rotation: 0,
    };
    await expect(
      addTextWatermarkToPdf(await fixturePdf(["Page 1"]), {
        ...base,
        text: "   ",
      })
    ).rejects.toThrow(EditError);
    await expect(
      addTextWatermarkToPdf(await fixturePdf(["Page 1"]), {
        ...base,
        opacity: 0,
      })
    ).rejects.toThrow(EditError);
    await expect(
      addTextWatermarkToPdf(await fixturePdf(["Page 1"]), {
        ...base,
        opacity: 1.5,
      })
    ).rejects.toThrow(EditError);
    await expect(
      addTextWatermarkToPdf(await fixturePdf(["Page 1"]), {
        ...base,
        rotation: 15,
      })
    ).rejects.toThrow(EditError);
    await expect(
      addTextWatermarkToPdf(await fixturePdf(["Page 1"]), {
        ...base,
        pages: "5",
      })
    ).rejects.toThrow(EditError);
  });

  it("rejects a non-PDF", async () => {
    await expect(
      addTextWatermarkToPdf(new Uint8Array([1, 2, 3, 4, 5]), {
        text: "DRAFT",
        pages: "all",
        position: "centre",
        size: 36,
        color: "grey",
        opacity: 0.5,
        rotation: 0,
      })
    ).rejects.toThrow(EditError);
  });
});

describe("addStampToPdf", () => {
  it("draws the stamp text on every page", async () => {
    const bytes = await addStampToPdf(await fixturePdf(["Page 1", "Page 2"]), {
      text: "CONFIDENTIAL",
      pages: "all",
      position: "top-centre",
      color: "red",
    });
    const texts = await pageTexts(bytes);
    expect(texts[0]).toContain("CONFIDENTIAL");
    expect(texts[1]).toContain("CONFIDENTIAL");
  });

  it("uppercases custom stamp text", async () => {
    const bytes = await addStampToPdf(await fixturePdf(["Page 1"]), {
      text: "for review",
      pages: "all",
      position: "bottom-right",
      color: "blue",
    });
    const texts = await pageTexts(bytes);
    expect(texts[0]).toContain("FOR REVIEW");
  });

  it("rejects empty text and text over the limit", async () => {
    await expect(
      addStampToPdf(await fixturePdf(["Page 1"]), {
        text: "   ",
        pages: "all",
        position: "top-centre",
        color: "red",
      })
    ).rejects.toThrow(EditError);
    await expect(
      addStampToPdf(await fixturePdf(["Page 1"]), {
        text: "A".repeat(41),
        pages: "all",
        position: "top-centre",
        color: "red",
      })
    ).rejects.toThrow(EditError);
  });
});

describe("addImageWatermarkToPdf", () => {
  it("embeds the image on every page", async () => {
    const bytes = await addImageWatermarkToPdf(
      await fixturePdf(["Page 1", "Page 2"]),
      fixturePng(),
      "image/png",
      {
        pages: "all",
        position: "centre",
        scale: 0.5,
        opacity: 0.3,
        rotation: 0,
      }
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    // Each page's resources must carry an XObject (the image).
    for (let i = 0; i < 2; i++) {
      const resources = doc.getPage(i).node.get(PDFName.of("Resources"));
      expect(resources).toBeDefined();
      const dict = resources as unknown as { lookup: (n: unknown) => unknown };
      const xObject = dict.lookup(PDFName.of("XObject"));
      expect(xObject).toBeDefined();
    }
  });

  it("rejects a non-image and a bad scale", async () => {
    const png = fixturePng();
    await expect(
      addImageWatermarkToPdf(
        await fixturePdf(["Page 1"]),
        new Uint8Array([1, 2, 3]),
        "image/png",
        {
          pages: "all",
          position: "centre",
          scale: 0.5,
          opacity: 0.3,
          rotation: 0,
        }
      )
    ).rejects.toThrow(EditError);
    await expect(
      addImageWatermarkToPdf(await fixturePdf(["Page 1"]), png, "image/png", {
        pages: "all",
        position: "centre",
        scale: 0,
        opacity: 0.3,
        rotation: 0,
      })
    ).rejects.toThrow(EditError);
  });
});
