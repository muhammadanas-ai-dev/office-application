// OCR engine tests (Phase C).
//
// The TSV parser is tested on a fixed sample (no binary needed).
// The real OCR runs use the committed fixture images (known text,
// rendered with DejaVu Sans / Noto Sans Arabic) and the project's
// own Tesseract binary — so they prove the engine end to end, not
// just the parser. A missing binary is tested separately: it must
// give a clear 503, not a crash.
import { describe, expect, it, afterEach } from "vitest";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  OCR_MAX_PAGES,
  OcrError,
  countOcrPdfPages,
  isOcrAcceptedMimeType,
  isOcrLanguage,
  ocrDocument,
  ocrImageFile,
  parseTesseractTsv,
} from "@/lib/ocr";

const FIXTURES = join(process.cwd(), "src", "lib", "__fixtures__");

const SAMPLE_TSV = [
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
  "1\t1\t0\t0\t0\t0\t0\t0\t1200\t300\t-1\t",
  "2\t1\t1\t0\t0\t0\t40\t49\t1075\t136\t-1\t",
  "3\t1\t1\t1\t0\t0\t40\t49\t1075\t136\t-1\t",
  "4\t1\t1\t1\t1\t0\t45\t49\t527\t37\t-1\t",
  "5\t1\t1\t1\t1\t1\t45\t49\t100\t37\t96.78\tForma",
  "5\t1\t1\t1\t1\t2\t150\t49\t120\t37\t96.67\tOffice",
  "5\t1\t1\t1\t1\t3\t275\t49\t80\t37\t94.73\tOCR",
  "5\t1\t1\t1\t1\t4\t360\t49\t90\t37\t96.81\ttest",
  "4\t1\t1\t1\t2\t0\t45\t130\t900\t37\t-1\t",
  "5\t1\t1\t1\t2\t1\t45\t130\t60\t37\t95.39\tThe",
  "5\t1\t1\t1\t2\t2\t110\t130\t110\t37\t96.79\tquick",
].join("\n");

describe("parseTesseractTsv", () => {
  it("returns the words, the line-broken text and the mean confidence", () => {
    const parsed = parseTesseractTsv(SAMPLE_TSV);
    expect(parsed.words.map((w) => w.text)).toEqual([
      "Forma",
      "Office",
      "OCR",
      "test",
      "The",
      "quick",
    ]);
    // The word boxes are kept (in image pixels) — "Make
    // searchable" needs them to place the invisible text.
    expect(parsed.words[0]).toEqual({
      text: "Forma",
      confidence: 96.78,
      left: 45,
      top: 49,
      width: 100,
      height: 37,
    });
    expect(parsed.text).toBe("Forma Office OCR test\nThe quick");
    expect(parsed.meanConfidence).toBeCloseTo(96.2, 1);
  });

  it("ignores non-word rows and empty words", () => {
    const parsed = parseTesseractTsv(
      SAMPLE_TSV + "\n5\t1\t1\t1\t2\t3\t230\t130\t10\t37\t50.00\t"
    );
    expect(parsed.words).toHaveLength(6);
  });

  it("throws a clear error on non-TSV output", () => {
    expect(() => parseTesseractTsv("not a tsv")).toThrow(OcrError);
    expect(() => parseTesseractTsv("not a tsv")).toThrow(/unexpected format/);
  });
});

describe("language and MIME guards", () => {
  it("accepts eng, urd and ara and nothing else", () => {
    expect(isOcrLanguage("eng")).toBe(true);
    expect(isOcrLanguage("urd")).toBe(true);
    expect(isOcrLanguage("ara")).toBe(true);
    expect(isOcrLanguage("fra")).toBe(false);
    expect(isOcrLanguage("")).toBe(false);
  });

  it("accepts PDF, PNG and JPEG and refuses TIFF", () => {
    expect(isOcrAcceptedMimeType("application/pdf")).toBe(true);
    expect(isOcrAcceptedMimeType("image/png")).toBe(true);
    expect(isOcrAcceptedMimeType("image/jpeg")).toBe(true);
    expect(isOcrAcceptedMimeType("image/tiff")).toBe(false);
    expect(isOcrAcceptedMimeType("image/gif")).toBe(false);
    expect(isOcrAcceptedMimeType(null)).toBe(false);
  });
});

describe("ocrImageFile (real binary)", () => {
  it("reads the English fixture exactly, with a high confidence", async () => {
    const result = await ocrImageFile(
      join(FIXTURES, "ocr-english.png"),
      "eng",
      1
    );
    expect(result.page).toBe(1);
    expect(result.text).toContain("Forma Office OCR test");
    expect(result.text).toContain(
      "The quick brown fox jumps over the lazy dog"
    );
    expect(result.meanConfidence).toBeGreaterThan(90);
  }, 60_000);

  it("reads the Urdu fixture (the second line exactly)", async () => {
    const result = await ocrImageFile(join(FIXTURES, "ocr-urdu.png"), "urd", 1);
    expect(result.text).toContain("یہ ایک اردو جانچ ہے");
    expect(result.meanConfidence).toBeGreaterThan(50);
  }, 60_000);

  it("gives a clear 503 when the binary is missing", async () => {
    const previous = process.env.OCR_TESSERACT_BIN;
    process.env.OCR_TESSERACT_BIN = "/nonexistent/tesseract";
    try {
      await expect(
        ocrImageFile(join(FIXTURES, "ocr-english.png"), "eng", 1)
      ).rejects.toThrow(/not installed on this server/);
    } finally {
      if (previous === undefined) delete process.env.OCR_TESSERACT_BIN;
      else process.env.OCR_TESSERACT_BIN = previous;
    }
  }, 60_000);
});

describe("ocrDocument", () => {
  it("OCRs a single image", async () => {
    const { readFile } = await import("node:fs/promises");
    const bytes = new Uint8Array(
      await readFile(join(FIXTURES, "ocr-english.png"))
    );
    const result = await ocrDocument(bytes, "image/png", "eng");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].text).toContain("Forma Office OCR test");
    expect(result.language).toBe("eng");
  }, 60_000);

  it("OCRs a PDF built from the fixture text", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);
    page.drawText("Forma Office OCR test", { x: 50, y: 300, size: 24 });
    page.drawText("The quick brown fox", { x: 50, y: 250, size: 24 });
    const bytes = await doc.save();
    const result = await ocrDocument(bytes, "application/pdf", "eng");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].text).toContain("Forma Office");
  }, 60_000);

  it("refuses a non-OCR file type", async () => {
    await expect(
      ocrDocument(new Uint8Array([1, 2, 3]), "application/msword", "eng")
    ).rejects.toThrow(/PDF, PNG and JPEG/);
  });

  it("refuses a PDF over the page cap", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < OCR_MAX_PAGES + 1; i++) {
      doc.addPage([600, 400]);
    }
    const bytes = await doc.save();
    await expect(ocrDocument(bytes, "application/pdf", "eng")).rejects.toThrow(
      /at most 20 pages/
    );
  });

  it("refuses invalid PDF bytes", async () => {
    await expect(
      ocrDocument(new Uint8Array([1, 2, 3]), "application/pdf", "eng")
    ).rejects.toThrow(/not a valid PDF/);
  });
});

describe("countOcrPdfPages", () => {
  it("counts the pages of a valid PDF", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 400]);
    doc.addPage([600, 400]);
    expect(await countOcrPdfPages(await doc.save())).toBe(2);
  });

  it("throws on invalid bytes", async () => {
    await expect(countOcrPdfPages(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      /not a valid PDF/
    );
  });
});

afterEach(() => {
  // The binary-missing test mutates env; make sure no other test
  // inherits a bad override.
  delete process.env.OCR_TESSERACT_BIN;
});
