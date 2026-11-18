// Unit tests for the searchable PDF (Day 21) — the invisible
// text layer. The tests build the fixture PDF in the test
// (pdf-lib) and read the result back with pdfjs-dist (the text
// must be extractable) and with the raw content stream (the
// rendering mode must be 3). The content-stream helper follows
// the Day 19 pattern (pdf-lib + zlib inflate, parsed by
// pdf-content.ts's tokenizeContent + parseOperations).
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFStream, StandardFonts, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { embedOcrWordsInPdf, extractPdfText } from "@/lib/pdf-searchable";
import { parseOperations, tokenizeContent } from "@/lib/pdf-content";
import type { OcrWord } from "@/lib/ocr";

/** Read the content-stream operators of one page. */
async function pageOperators(bytes: Uint8Array, pageNumber: number) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(pageNumber - 1);
  const contents = page.node.Contents();
  if (!contents) return [];
  const streams =
    contents instanceof PDFStream
      ? [contents]
      : [...Array(contents.size())]
          .map((_, i) => contents.lookup(i))
          .filter((s): s is PDFStream => s instanceof PDFStream);
  const text = streams
    .map((s) => {
      try {
        return inflateSync(s.getContents()).toString("latin1");
      } catch {
        return Buffer.from(s.getContents()).toString("latin1");
      }
    })
    .join("\n");
  return parseOperations(tokenizeContent(text));
}

/** The text of one page, via PDF.js (the searchable check).
 *  The bytes are copied before handing them to PDF.js — it
 *  detaches the ArrayBuffer it is given, which would leave the
 *  caller's array empty for the next check. */
async function pageText(bytes: Uint8Array, pageNumber: number) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await (await pdfjs.getDocument({ data: bytes.slice() })).promise;
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
}

/** A 1-page PDF with a visible heading (the "scan"). */
async function basePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("Scanned heading", {
    x: 50,
    y: 700,
    size: 20,
    font,
    color: rgb(0, 0, 0),
  });
  return doc.save();
}

function word(
  text: string,
  left: number,
  top: number,
  width: number,
  height: number
): OcrWord {
  return { text, confidence: 95, left, top, width, height };
}

describe("embedOcrWordsInPdf", () => {
  it("embeds the words as invisible, extractable text", async () => {
    const input = await basePdf();
    const { bytes } = await embedOcrWordsInPdf(input, [
      {
        pageNumber: 1,
        words: [
          word("invisible", 50, 100, 80, 24),
          word("words", 140, 100, 50, 24),
        ],
      },
    ]);
    const text = await pageText(bytes, 1);
    expect(text).toContain("Scanned heading");
    expect(text).toContain("invisible");
    expect(text).toContain("words");
    const ops = await pageOperators(bytes, 1);
    const trOps = ops.filter((op) => op.operator === "Tr");
    expect(trOps.length).toBeGreaterThan(0);
    expect(
      trOps.every(
        (op) =>
          op.operands.length === 1 &&
          op.operands[0].kind === "number" &&
          op.operands[0].value === 3
      )
    ).toBe(true);
  });

  it("places the text at the word's position", async () => {
    const input = await basePdf();
    const { bytes } = await embedOcrWordsInPdf(input, [
      { pageNumber: 1, words: [word("placed", 100, 200, 60, 24)] },
    ]);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await (
      await pdfjs.getDocument({ data: bytes.slice() })
    ).promise;
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const placed = content.items.find(
      (item) => "str" in item && item.str === "placed"
    );
    expect(placed).toBeDefined();
    if (placed && "transform" in placed) {
      // left 100px at 300 DPI = 24pt; top 200px = 48pt from the
      // top, so y = 792 - 48 - 24/300*72 (the word height) ≈ 738.
      expect(placed.transform[4]).toBeCloseTo(24, 0);
      expect(placed.transform[5]).toBeCloseTo(738, 0);
    }
  });

  it("does not modify the input PDF", async () => {
    const input = await basePdf();
    const before = Buffer.from(input);
    await embedOcrWordsInPdf(input, [
      { pageNumber: 1, words: [word("kept", 50, 100, 40, 24)] },
    ]);
    expect(Buffer.compare(Buffer.from(input), before)).toBe(0);
  });

  it("skips words that cannot be encoded (non-Latin) instead of failing", async () => {
    const input = await basePdf();
    const { bytes, skippedWords } = await embedOcrWordsInPdf(input, [
      {
        pageNumber: 1,
        words: [
          word("kept", 50, 100, 40, 24),
          // Urdu — Helvetica (WinAnsi) cannot encode it.
          word("فارما", 50, 150, 40, 24),
        ],
      },
    ]);
    expect(skippedWords).toBe(1);
    const text = await pageText(bytes, 1);
    expect(text).toContain("kept");
  });

  it("skips a word outside the page instead of failing", async () => {
    const input = await basePdf();
    const { skippedWords } = await embedOcrWordsInPdf(input, [
      { pageNumber: 1, words: [word("outside", 5000, 5000, 40, 24)] },
    ]);
    expect(skippedWords).toBe(1);
  });

  it("refuses a page that does not exist", async () => {
    const input = await basePdf();
    await expect(
      embedOcrWordsInPdf(input, [
        { pageNumber: 9, words: [word("nope", 50, 100, 40, 24)] },
      ])
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses an empty word list", async () => {
    const input = await basePdf();
    await expect(embedOcrWordsInPdf(input, [])).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("extractPdfText", () => {
  it("extracts the text of a PDF, page by page", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page1 = doc.addPage([612, 792]);
    page1.drawText("First page heading", {
      x: 50,
      y: 700,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    page1.drawText("First page body", {
      x: 50,
      y: 650,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
    const page2 = doc.addPage([612, 792]);
    page2.drawText("Second page", {
      x: 50,
      y: 700,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    const bytes = await doc.save();
    const { pages, text } = await extractPdfText(bytes);
    expect(pages).toHaveLength(2);
    expect(pages[0].text).toContain("First page heading");
    expect(pages[0].text).toContain("First page body");
    expect(pages[1].text).toContain("Second page");
    expect(text).toContain("First page heading");
    expect(text).toContain("Second page");
  });

  it("reads the invisible text layer too (a searchable PDF)", async () => {
    const input = await basePdf();
    const { bytes } = await embedOcrWordsInPdf(input, [
      { pageNumber: 1, words: [word("invisible", 50, 100, 80, 24)] },
    ]);
    const { text } = await extractPdfText(bytes);
    expect(text).toContain("Scanned heading");
    expect(text).toContain("invisible");
  });

  it("returns empty text for a PDF with no text layer", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const bytes = await doc.save();
    const { text } = await extractPdfText(bytes);
    expect(text).toBe("");
  });
});
