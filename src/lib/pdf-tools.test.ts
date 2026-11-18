// PDF utilities — pure helpers and pdf-lib operations.
// @vitest-environment node
import { execSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import {
  MAX_PDF_PAGES,
  getMergedFileName,
  getPdfToolsFileName,
  isPdfMimeType,
  looksLikePdf,
  parseCompressLevel,
  parsePageRanges,
  parseRotateSelection,
  parseRotationDegrees,
} from "@/lib/pdf-tools";
import {
  compressPdf,
  countPdfPages,
  mergePdfs,
  rotatePdf,
  splitPdf,
} from "@/lib/pdf-ops";

const gsAvailable = (() => {
  try {
    execSync("which gs", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Extract the text of a PDF by inflating its content streams.
 * pdf-lib compresses streams, so the drawn strings are not visible
 * in the raw bytes — the same technique as the Day 5 conversion
 * proof (pdftotext on the file).
 */
function extractText(bytes: Uint8Array): string {
  const data = Buffer.from(bytes);
  const parts: Buffer[] = [];
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(data.toString("latin1"))) !== null) {
    const raw = Buffer.from(match[1].replace(/\r?\n$/, ""), "latin1");
    try {
      parts.push(inflateSync(raw));
    } catch {
      parts.push(raw);
    }
  }
  const text = Buffer.concat(parts).toString("latin1");
  // pdf-lib writes drawn text as hex strings (<50616765...>), so
  // decode hex literals whose bytes are printable ASCII.
  return text.replace(/<([0-9A-Fa-f\s]+)>/g, (_match, hex: string) => {
    const clean = hex.replace(/\s+/g, "");
    if (clean.length % 2 !== 0) return _match;
    const decoded = Buffer.from(clean, "hex").toString("latin1");
    return /^[\x20-\x7e\r\n\t]*$/.test(decoded) ? decoded : _match;
  });
}

/** Build a PDF with `pages` pages, each labelled "Page N". */
async function buildPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([600, 800]);
    page.drawText(`Page ${i} of the test PDF`, {
      x: 50,
      y: 700,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
  }
  return doc.save();
}

describe("parsePageRanges", () => {
  it("parses ranges, singles and whitespace", () => {
    expect(parsePageRanges("1-3, 5", 10)).toEqual({
      ok: true,
      pages: [1, 2, 3, 5],
    });
    expect(parsePageRanges(" 1 - 3 , 5 ", 10)).toEqual({
      ok: true,
      pages: [1, 2, 3, 5],
    });
    expect(parsePageRanges("5", 10)).toEqual({ ok: true, pages: [5] });
    // Duplicates are kept — extracting the same page twice is valid.
    expect(parsePageRanges("1-3, 1", 10)).toEqual({
      ok: true,
      pages: [1, 2, 3, 1],
    });
  });

  it("rejects empty, invalid and out-of-range input", () => {
    for (const bad of ["", "   ", "0", "abc", "1,,3", "1-", "-3", "3-1"]) {
      expect(parsePageRanges(bad, 10).ok).toBe(false);
    }
    expect(parsePageRanges("11", 10)).toEqual({
      ok: false,
      error: "This PDF has 10 pages — 11 is past the end.",
    });
    expect(parsePageRanges("1-11", 10).ok).toBe(false);
  });

  it("caps the selection at MAX_PDF_PAGES", () => {
    expect(parsePageRanges(`1-${MAX_PDF_PAGES + 1}`, 1000).ok).toBe(false);
    expect(parsePageRanges(`1-${MAX_PDF_PAGES}`, 1000).ok).toBe(true);
  });
});

describe("parseRotateSelection", () => {
  it("expands 'all' and deduplicates ranges", () => {
    expect(parseRotateSelection("all", 3)).toEqual({
      ok: true,
      pages: [1, 2, 3],
    });
    expect(parseRotateSelection("ALL", 3)).toEqual({
      ok: true,
      pages: [1, 2, 3],
    });
    expect(parseRotateSelection("1, 1, 2", 5)).toEqual({
      ok: true,
      pages: [1, 2],
    });
  });

  it("rejects invalid selections", () => {
    expect(parseRotateSelection("0", 5).ok).toBe(false);
    expect(parseRotateSelection("9", 5).ok).toBe(false);
  });
});

describe("parseRotationDegrees", () => {
  it("accepts quarter-turns as numbers or strings", () => {
    expect(parseRotationDegrees(90)).toEqual({ ok: true, degrees: 90 });
    expect(parseRotationDegrees("180")).toEqual({ ok: true, degrees: 180 });
    expect(parseRotationDegrees(270)).toEqual({ ok: true, degrees: 270 });
  });

  it("rejects anything else", () => {
    for (const bad of [0, 45, 360, "abc", Number.NaN, null, undefined]) {
      expect(parseRotationDegrees(bad).ok).toBe(false);
    }
  });
});

describe("parseCompressLevel", () => {
  it("defaults to ebook and accepts the three levels", () => {
    expect(parseCompressLevel(undefined)).toEqual({ ok: true, level: "ebook" });
    expect(parseCompressLevel("")).toEqual({ ok: true, level: "ebook" });
    expect(parseCompressLevel("screen")).toEqual({ ok: true, level: "screen" });
    expect(parseCompressLevel("printer")).toEqual({
      ok: true,
      level: "printer",
    });
  });

  it("rejects unknown levels", () => {
    expect(parseCompressLevel("high").ok).toBe(false);
    expect(parseCompressLevel(42).ok).toBe(false);
  });
});

describe("isPdfMimeType / looksLikePdf", () => {
  it("identifies PDFs by MIME type and by header", () => {
    expect(isPdfMimeType("application/pdf")).toBe(true);
    expect(isPdfMimeType("application/msword")).toBe(false);
    expect(isPdfMimeType(null)).toBe(false);
    expect(looksLikePdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(
      true
    );
    expect(looksLikePdf(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
    expect(looksLikePdf(new Uint8Array([]))).toBe(false);
  });
});

describe("getPdfToolsFileName / getMergedFileName", () => {
  it("names results after the document and the operation", () => {
    expect(getPdfToolsFileName("Report", "rotated")).toBe(
      "Report - rotated.pdf"
    );
    expect(getPdfToolsFileName("Report.pdf", "pages 1-3")).toBe(
      "Report - pages 1-3.pdf"
    );
    expect(getMergedFileName("Report")).toBe("Report - merged.pdf");
    expect(getMergedFileName("")).toBe("document - merged.pdf");
  });
});

describe("pdf-lib operations", () => {
  it("counts pages", async () => {
    expect(await countPdfPages(await buildPdf(3))).toBe(3);
    await expect(countPdfPages(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });

  it("merges PDFs in order", async () => {
    const a = await buildPdf(2);
    const b = await buildPdf(3);
    const merged = await mergePdfs([a, b]);
    expect(await countPdfPages(merged)).toBe(5);
    // The first page comes from A and the third from B: check the
    // drawn text survives in the merged content streams.
    const mergedText = extractText(merged);
    expect(mergedText).toContain("Page 1 of the test PDF");
    expect(mergedText).toContain("Page 3 of the test PDF");
  });

  it("rejects a merge with no pages or a non-PDF input", async () => {
    await expect(mergePdfs([])).rejects.toThrow();
    await expect(
      mergePdfs([await buildPdf(1), new Uint8Array([1, 2, 3])])
    ).rejects.toThrow();
  });

  it("enforces the 500-page merge cap", async () => {
    const big = await buildPdf(MAX_PDF_PAGES);
    expect(await countPdfPages(await mergePdfs([big]))).toBe(MAX_PDF_PAGES);
    await expect(mergePdfs([big, await buildPdf(1)])).rejects.toThrow(/500/);
  });

  it("extracts pages in the given order, duplicates kept", async () => {
    const pdf = await buildPdf(4);
    const out = await splitPdf(pdf, [3, 1, 3]);
    expect(await countPdfPages(out)).toBe(3);
    const doc = await PDFDocument.load(out);
    // pdf-lib deduplicates the copied content stream, so the two
    // copies of source page 3 share one stream object: their
    // Contents references must be identical, and the copy of page
    // 1 must be a different one. That proves the order [3, 1, 3].
    const contents = (index: number) =>
      doc.getPage(index).node.get(PDFName.of("Contents"))?.toString();
    expect(contents(0)).toBe(contents(2));
    expect(contents(1)).not.toBe(contents(0));
    const text = extractText(out);
    expect(text).toContain("Page 3 of the test PDF");
    expect(text).toContain("Page 1 of the test PDF");
  });

  it("rejects a split past the end", async () => {
    const pdf = await buildPdf(2);
    await expect(splitPdf(pdf, [3])).rejects.toThrow(/2 pages/);
  });

  it("rotates additively", async () => {
    const pdf = await buildPdf(3);
    const once = await rotatePdf(pdf, [1], 90);
    const doc = await PDFDocument.load(once);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(1).getRotation().angle).toBe(0);
    // Rotating the already-rotated page by 90 more gives 180.
    const twice = await rotatePdf(once, [1], 90);
    const doc2 = await PDFDocument.load(twice);
    expect(doc2.getPage(0).getRotation().angle).toBe(180);
    // 180 + 180 wraps to 0.
    const wrapped = await rotatePdf(twice, [1], 180);
    const doc3 = await PDFDocument.load(wrapped);
    expect(doc3.getPage(0).getRotation().angle).toBe(0);
  });
});

describe.skipIf(!gsAvailable)("compressPdf (Ghostscript)", () => {
  it("never returns a larger file and keeps the pages", async () => {
    const pdf = await buildPdf(2);
    const { bytes, savedBytes } = await compressPdf(pdf, "ebook");
    expect(looksLikePdf(bytes)).toBe(true);
    expect(await countPdfPages(bytes)).toBe(2);
    expect(bytes.length).toBeLessThanOrEqual(pdf.length);
    expect(savedBytes).toBe(pdf.length - bytes.length);
  });

  it("rejects a non-PDF input", async () => {
    await expect(
      compressPdf(new Uint8Array([1, 2, 3]), "ebook")
    ).rejects.toThrow();
  });
});
