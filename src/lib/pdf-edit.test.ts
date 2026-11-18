// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  deletePagesInPdf,
  detectImageMime,
  editTextInPdf,
  listPdfImages,
  listPdfTextRuns,
  mapBaseFontToStandard,
  reorderPagesInPdf,
  replaceImageInPdf,
} from "@/lib/pdf-edit";

/** Extract the visible text of a PDF with pdftotext (the viewer's view). */
function visibleText(bytes: Uint8Array): string {
  const path = `/tmp/e2e/edit-test-${Date.now()}.pdf`;
  writeFileSync(path, bytes);
  try {
    return execSync(`pdftotext ${path} -`, { encoding: "utf8" });
  } finally {
    execSync(`rm -f ${path}`);
  }
}

/** Expand a PDF with qpdf so its content streams are readable text. */
function qdfText(bytes: Uint8Array): string {
  const inPath = `/tmp/e2e/edit-test-${Date.now()}-in.pdf`;
  const outPath = `/tmp/e2e/edit-test-${Date.now()}-out.pdf`;
  writeFileSync(inPath, bytes);
  try {
    execSync(`qpdf --qdf --object-streams=disable ${inPath} ${outPath}`, {
      stdio: "pipe",
    });
    return readFileSync(outPath, "latin1");
  } finally {
    execSync(`rm -f ${inPath} ${outPath}`);
  }
}

/** True when qpdf finds no structural problem in the PDF. */
function qpdfOk(bytes: Uint8Array): boolean {
  const path = `/tmp/e2e/edit-test-${Date.now()}-check.pdf`;
  writeFileSync(path, bytes);
  try {
    execSync(`qpdf --check ${path}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  } finally {
    execSync(`rm -f ${path}`);
  }
}

/** A one-page PDF with a bold red line, an italic blue line and a plain black line. */
async function styledPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.drawText("Bold red heading", {
    x: 50,
    y: 700,
    size: 20,
    font: await doc.embedFont(StandardFonts.HelveticaBold),
    color: rgb(1, 0, 0),
  });
  page.drawText("Italic blue note", {
    x: 50,
    y: 660,
    size: 12,
    font: await doc.embedFont(StandardFonts.TimesRomanItalic),
    color: rgb(0, 0, 1),
  });
  page.drawText("Plain black body", {
    x: 50,
    y: 620,
    size: 12,
    font: await doc.embedFont(StandardFonts.Helvetica),
  });
  return doc.save();
}

describe("mapBaseFontToStandard", () => {
  it("keeps family, weight and slant, and strips subset prefixes", () => {
    expect(mapBaseFontToStandard("ABCDEE+Arial-BoldMT")).toBe(
      StandardFonts.HelveticaBold
    );
    expect(mapBaseFontToStandard("TimesNewRoman-Italic")).toBe(
      StandardFonts.TimesRomanItalic
    );
    expect(mapBaseFontToStandard("CourierNew-Bold")).toBe(
      StandardFonts.CourierBold
    );
    expect(mapBaseFontToStandard("LiberationSerif-BoldItalic")).toBe(
      StandardFonts.TimesRomanBoldItalic
    );
    expect(mapBaseFontToStandard("LiberationSans")).toBe(
      StandardFonts.Helvetica
    );
    expect(mapBaseFontToStandard("DejaVuSerif")).toBe(StandardFonts.TimesRoman);
  });

  it("falls back to Helvetica for unknown fonts and null", () => {
    expect(mapBaseFontToStandard("SomeCustomFont")).toBe(
      StandardFonts.Helvetica
    );
    expect(mapBaseFontToStandard(null)).toBe(StandardFonts.Helvetica);
  });
});

describe("editTextInPdf", () => {
  it("keeps the original font and colour when it replaces text", async () => {
    const bytes = await styledPdf();
    const before = await listPdfTextRuns(bytes, 1);
    const bold = before.find((r) => r.text === "Bold red heading")!;
    expect(bold.baseFont).toBe("Helvetica-Bold");
    expect(bold.fillColor).toEqual({ r: 1, g: 0, b: 0 });
    const italic = before.find((r) => r.text === "Italic blue note")!;
    expect(italic.baseFont).toBe("Times-Italic");
    expect(italic.fillColor).toEqual({ r: 0, g: 0, b: 1 });
    const plain = before.find((r) => r.text === "Plain black body")!;
    // pdf-lib writes an explicit black fill for its default colour.
    expect(plain.fillColor).toEqual({ r: 0, g: 0, b: 0 });

    const out = await editTextInPdf(bytes, {
      page: 1,
      text: "Bold red heading",
      replacement: "New bold heading",
    });
    const text = visibleText(out);
    expect(text).toContain("New bold heading");
    expect(text).not.toContain("Bold red heading");
    // The replacement is drawn in the bold font, in red.
    const expanded = qdfText(out);
    expect(expanded).toContain("/Helvetica-Bold");
    expect(expanded).toContain("1 0 0 rg");
    // The edited file is structurally valid.
    expect(qpdfOk(out)).toBe(true);

    // The italic blue line, edited separately, keeps its own style.
    const out2 = await editTextInPdf(bytes, {
      page: 1,
      text: "Italic blue note",
      replacement: "New italic note",
    });
    const expanded2 = qdfText(out2);
    expect(expanded2).toContain("/Times-Italic");
    expect(expanded2).toContain("0 0 1 rg");
    expect(qpdfOk(out2)).toBe(true);
    // The other lines are untouched by the edit.
    expect(visibleText(out2)).toContain("Bold red heading");
    expect(visibleText(out2)).toContain("Plain black body");
  });

  it("replaces the text and removes the old text (pdf-lib PDF)", async () => {
    const bytes = readFileSync("/tmp/e2e/pdf1.pdf");
    const out = await editTextInPdf(bytes, {
      page: 1,
      text: "PDF One page 1",
      replacement: "Edited line one",
    });
    const runs = await listPdfTextRuns(out, 1);
    expect(runs.map((r) => r.text)).toContain("Edited line one");
    expect(runs.map((r) => r.text)).not.toContain("PDF One page 1");
    // The replacement sits at the same baseline and size.
    const edited = runs.find((r) => r.text === "Edited line one")!;
    expect(edited.x).toBeCloseTo(50, 0);
    expect(edited.y).toBeCloseTo(700, 0);
    expect(edited.fontSize).toBe(20);
  });

  it("replaces text by position on an ONLYOFFICE PDF (CID, no ToUnicode)", async () => {
    const bytes = readFileSync("/tmp/e2e/debug-export.pdf");
    // The first run sits near the top of the page; find its position.
    const before = await listPdfTextRuns(bytes, 1);
    expect(before.length).toBeGreaterThan(0);
    const first = before[0];
    const out = await editTextInPdf(bytes, {
      page: 1,
      text: "Forma E2E export test - the quick brown fox.",
      replacement: "Replaced by the editor.",
      position: { x: first.x, y: first.y, fontSize: first.fontSize },
    });
    const after = await listPdfTextRuns(out, 1);
    expect(after.map((r) => r.text)).toContain("Replaced by the editor.");
    const edited = after.find((r) => r.text === "Replaced by the editor.")!;
    expect(edited.x).toBeCloseTo(first.x, 0);
    expect(edited.y).toBeCloseTo(first.y, 0);
    // The viewer's view: the old line is gone, the new line is there.
    const text = visibleText(out);
    expect(text).toContain("Replaced by the editor.");
    expect(text).not.toContain("Forma E2E export test");
  });

  it("refuses text that is not on the page", async () => {
    const bytes = readFileSync("/tmp/e2e/pdf1.pdf");
    await expect(
      editTextInPdf(bytes, { page: 1, text: "No such line", replacement: "x" })
    ).rejects.toThrow("Could not find that exact text");
  });

  it("refuses an empty replacement and a page past the end", async () => {
    const bytes = readFileSync("/tmp/e2e/pdf1.pdf");
    await expect(
      editTextInPdf(bytes, { page: 1, text: "PDF One page 1", replacement: "" })
    ).rejects.toThrow("must not be empty");
    await expect(
      editTextInPdf(bytes, {
        page: 9,
        text: "PDF One page 1",
        replacement: "x",
      })
    ).rejects.toThrow("does not exist");
  });
});

describe("deletePagesInPdf / reorderPagesInPdf", () => {
  it("deletes a page and keeps the rest in order", async () => {
    const bytes = readFileSync("/tmp/e2e/pdf1.pdf");
    const out = await deletePagesInPdf(bytes, { pages: [2] });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    const runs1 = await listPdfTextRuns(out, 1);
    const runs2 = await listPdfTextRuns(out, 2);
    expect(runs1[0].text).toBe("PDF One page 1");
    expect(runs2[0].text).toBe("PDF One page 3");
  });

  it("refuses to delete every page", async () => {
    const bytes = readFileSync("/tmp/e2e/pdf1.pdf");
    await expect(deletePagesInPdf(bytes, { pages: [1, 2, 3] })).rejects.toThrow(
      "at least one page"
    );
  });

  it("reorders pages", async () => {
    const bytes = readFileSync("/tmp/e2e/pdf1.pdf");
    const out = await reorderPagesInPdf(bytes, { order: [3, 1, 2] });
    const runs1 = await listPdfTextRuns(out, 1);
    const runs2 = await listPdfTextRuns(out, 2);
    const runs3 = await listPdfTextRuns(out, 3);
    expect(runs1[0].text).toBe("PDF One page 3");
    expect(runs2[0].text).toBe("PDF One page 1");
    expect(runs3[0].text).toBe("PDF One page 2");
  });

  it("refuses a reorder that is not a permutation", async () => {
    const bytes = readFileSync("/tmp/e2e/pdf1.pdf");
    await expect(
      reorderPagesInPdf(bytes, { order: [1, 1, 2] })
    ).rejects.toThrow("exactly once");
  });
});

describe("replaceImageInPdf / listPdfImages", () => {
  it("lists the image on a page and replaces it", async () => {
    const bytes = readFileSync("/tmp/chrome-proof/img.pdf");
    const images = await listPdfImages(bytes);
    expect(images.length).toBe(1);
    expect(images[0].page).toBe(1);
    // A small red PNG as the replacement.
    const replacement = buildRedPng();
    const out = await replaceImageInPdf(bytes, {
      page: 1,
      imageIndex: 0,
      imageBytes: replacement,
      imageMime: "image/png",
    });
    const after = await listPdfImages(out);
    expect(after.length).toBe(1);
    // Same frame, new image data.
    expect(after[0].x).toBeCloseTo(images[0].x, 0);
    expect(after[0].y).toBeCloseTo(images[0].y, 0);
    expect(after[0].width).toBeCloseTo(images[0].width, 0);
    expect(after[0].height).toBeCloseTo(images[0].height, 0);
  });

  it("refuses a non-image replacement", async () => {
    const bytes = readFileSync("/tmp/chrome-proof/img.pdf");
    await expect(
      replaceImageInPdf(bytes, {
        page: 1,
        imageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        imageMime: "image/png",
      })
    ).rejects.toThrow("not a PNG or JPEG");
  });

  it("refuses a page with no images", async () => {
    const bytes = readFileSync("/tmp/e2e/pdf1.pdf");
    await expect(
      replaceImageInPdf(bytes, {
        page: 1,
        imageIndex: 0,
        imageBytes: buildRedPng(),
        imageMime: "image/png",
      })
    ).rejects.toThrow("no images");
  });
});

describe("detectImageMime", () => {
  it("recognises PNG and JPEG by magic bytes", () => {
    expect(
      detectImageMime(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
    ).toBe("image/png");
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg"
    );
    expect(detectImageMime(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

/** A 1x1 red PNG, built from raw bytes (zlib-compressed IDAT). */
function buildRedPng(): Uint8Array {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32Sync(td), 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const raw = Buffer.from([0, 255, 0, 0]); // filter 0 + red pixel
  const idat = deflateSync(raw);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return new Uint8Array(png);
}

// CRC-32 (IEEE) for PNG chunks.
function crc32Sync(buf: Buffer): number {
  let table = (crc32Sync as unknown as { table?: Int32Array }).table;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1)
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32Sync as unknown as { table?: Int32Array }).table = table;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
