// Unit tests for PDF page tools, part 1 (Day 18).
//
// The fixture PDFs are built in the test with pdf-lib, so the
// tests prove the page operations are correct — not just that
// bytes were produced. The page-number text is read back with
// pdfjs-dist getTextContent (the drawn text is real text, so it
// is extractable).
import { inflateSync } from "node:zlib";
import { PDFArray, PDFDocument, PDFStream, StandardFonts, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  addLinkToPdf,
  addPageNumbersToPdf,
  addShapeToPdf,
  addTextToPdf,
  cropPagesInPdf,
  insertBlankPageInPdf,
  insertPagesFromPdf,
} from "@/lib/pdf-page-tools";
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

describe("insertBlankPageInPdf", () => {
  it("inserts a blank page before page 2, keeping the order", async () => {
    const bytes = await insertBlankPageInPdf(
      await fixturePdf(["Page 1", "Page 2", "Page 3"]),
      {
        kind: "before",
        page: 2,
      }
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(4);
    const texts = await pageTexts(bytes);
    expect(texts[0]).toContain("Page 1");
    expect(texts[1].trim()).toBe("");
    expect(texts[2]).toContain("Page 2");
    expect(texts[3]).toContain("Page 3");
  });

  it("sizes the blank page from its neighbour", async () => {
    const bytes = await insertBlankPageInPdf(
      await fixturePdf(["Page 1", "Page 2"]),
      {
        kind: "after",
        page: 1,
      }
    );
    const doc = await PDFDocument.load(bytes);
    const blank = doc.getPage(1);
    expect(blank.getWidth()).toBe(612);
    expect(blank.getHeight()).toBe(792);
  });

  it("inserts at the end", async () => {
    const bytes = await insertBlankPageInPdf(await fixturePdf(["Page 1"]), {
      kind: "end",
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const texts = await pageTexts(bytes);
    expect(texts[0]).toContain("Page 1");
    expect(texts[1].trim()).toBe("");
  });

  it("does not modify the input PDF", async () => {
    const original = await fixturePdf(["Page 1", "Page 2"]);
    await insertBlankPageInPdf(original, { kind: "end" });
    const doc = await PDFDocument.load(original);
    expect(doc.getPageCount()).toBe(2);
  });

  it("rejects a position beyond the last page", async () => {
    await expect(
      insertBlankPageInPdf(await fixturePdf(["Page 1"]), {
        kind: "before",
        page: 5,
      })
    ).rejects.toThrow(EditError);
  });
});

describe("insertPagesFromPdf", () => {
  it("inserts the chosen pages at the end, in order, with their text", async () => {
    const bytes = await insertPagesFromPdf(
      await fixturePdf(["Page 1", "Page 2", "Page 3"]),
      await fixturePdf(["Source 1", "Source 2"]),
      { pages: [1, 2], position: { kind: "end" } }
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(5);
    const texts = await pageTexts(bytes);
    expect(texts[0]).toContain("Page 1");
    expect(texts[3]).toContain("Source 1");
    expect(texts[4]).toContain("Source 2");
  });

  it("inserts before a page, keeping the rest in order", async () => {
    const bytes = await insertPagesFromPdf(
      await fixturePdf(["Page 1", "Page 2"]),
      await fixturePdf(["Source 1"]),
      { pages: [1], position: { kind: "before", page: 2 } }
    );
    const texts = await pageTexts(bytes);
    expect(texts).toHaveLength(3);
    expect(texts[0]).toContain("Page 1");
    expect(texts[1]).toContain("Source 1");
    expect(texts[2]).toContain("Page 2");
  });

  it("rejects a source page that does not exist", async () => {
    await expect(
      insertPagesFromPdf(
        await fixturePdf(["Page 1"]),
        await fixturePdf(["Source 1"]),
        { pages: [2], position: { kind: "end" } }
      )
    ).rejects.toThrow(EditError);
  });

  it("rejects an empty page list", async () => {
    await expect(
      insertPagesFromPdf(
        await fixturePdf(["Page 1"]),
        await fixturePdf(["Source 1"]),
        {
          pages: [],
          position: { kind: "end" },
        }
      )
    ).rejects.toThrow(EditError);
  });

  it("rejects a position beyond the last page", async () => {
    await expect(
      insertPagesFromPdf(
        await fixturePdf(["Page 1"]),
        await fixturePdf(["Source 1"]),
        {
          pages: [1],
          position: { kind: "after", page: 9 },
        }
      )
    ).rejects.toThrow(EditError);
  });
});

describe("addPageNumbersToPdf", () => {
  it("numbers every page bottom centre as 'Page N of M'", async () => {
    const bytes = await addPageNumbersToPdf(
      await fixturePdf(["Page 1", "Page 2", "Page 3"]),
      {
        position: "bottom-centre",
        format: "page-of-total",
      }
    );
    const texts = await pageTexts(bytes);
    expect(texts[0]).toContain("Page 1 of 3");
    expect(texts[1]).toContain("Page 2 of 3");
    expect(texts[2]).toContain("Page 3 of 3");
  });

  it("numbers as a bare number", async () => {
    const bytes = await addPageNumbersToPdf(
      await fixturePdf(["Page 1", "Page 2"]),
      {
        position: "bottom-right",
        format: "number",
      }
    );
    const texts = await pageTexts(bytes);
    expect(texts[0].trim().endsWith("1")).toBe(true);
    expect(texts[1].trim().endsWith("2")).toBe(true);
  });

  it("numbers as 'Page N'", async () => {
    const bytes = await addPageNumbersToPdf(
      await fixturePdf(["Page 1", "Page 2"]),
      {
        position: "top-centre",
        format: "page",
      }
    );
    const texts = await pageTexts(bytes);
    expect(texts[0]).toContain("Page 1");
    expect(texts[1]).toContain("Page 2");
  });

  it("starts numbering from a page, with a starting number", async () => {
    const bytes = await addPageNumbersToPdf(
      await fixturePdf(["Cover", "Page 2", "Page 3"]),
      {
        position: "bottom-centre",
        format: "number",
        fromPage: 2,
        startNumber: 6,
      }
    );
    const texts = await pageTexts(bytes);
    expect(texts[0].trim()).toBe("Cover");
    expect(texts[1].trim().endsWith("6")).toBe(true);
    expect(texts[2].trim().endsWith("7")).toBe(true);
  });

  it("does not modify the input PDF", async () => {
    const original = await fixturePdf(["Page 1"]);
    await addPageNumbersToPdf(original, {
      position: "bottom-centre",
      format: "number",
    });
    const texts = await pageTexts(original);
    expect(texts[0].trim()).toBe("Page 1");
  });

  it("rejects a first page beyond the last page", async () => {
    await expect(
      addPageNumbersToPdf(await fixturePdf(["Page 1"]), {
        position: "bottom-centre",
        format: "number",
        fromPage: 5,
      })
    ).rejects.toThrow(EditError);
  });

  it("rejects a starting number below 1", async () => {
    await expect(
      addPageNumbersToPdf(await fixturePdf(["Page 1"]), {
        position: "bottom-centre",
        format: "number",
        startNumber: 0,
      })
    ).rejects.toThrow(EditError);
  });
});

/** The PDF operators on a page, read from the page's content
 *  stream (pdf-lib + zlib inflate, parsed by pdf-content.ts).
 *  PDF.js's getOperatorList() consolidates path construction into
 *  a single "constructPath", so it cannot tell a rectangle from
 *  an ellipse — the raw operators can. */
async function pageOperators(
  bytes: Uint8Array,
  pageNumber: number
): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(pageNumber - 1);
  const contents = page.node.Contents();
  const streams: PDFStream[] = [];
  if (contents instanceof PDFStream) streams.push(contents);
  else if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) {
      const entry = contents.lookup(i);
      if (entry instanceof PDFStream) streams.push(entry);
    }
  }
  const parts: string[] = [];
  for (const stream of streams) {
    const raw = stream.getContents();
    let decoded: Buffer;
    try {
      decoded = inflateSync(raw);
    } catch {
      decoded = Buffer.from(raw);
    }
    parts.push(decoded.toString("latin1"));
  }
  const { parseOperations, tokenizeContent } =
    await import("@/lib/pdf-content");
  return parseOperations(tokenizeContent(parts.join("\n"))).map(
    (op) => op.operator
  );
}

describe("cropPagesInPdf", () => {
  it("crops a page to its top half", async () => {
    const bytes = await cropPagesInPdf(await fixturePdf(["Page 1", "Page 2"]), {
      pages: [1],
      rect: { x1: 0, y1: 396, x2: 612, y2: 792 },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const crop = doc.getPage(0).getCropBox();
    expect(crop).toEqual({ x: 0, y: 396, width: 612, height: 396 });
    const other = doc.getPage(1).getCropBox();
    expect(other).toEqual({ x: 0, y: 0, width: 612, height: 792 });
  });

  it("crops several pages at once", async () => {
    const bytes = await cropPagesInPdf(await fixturePdf(["Page 1", "Page 2"]), {
      pages: [1, 2],
      rect: { x1: 50, y1: 50, x2: 562, y2: 742 },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPage(0).getCropBox()).toEqual({
      x: 50,
      y: 50,
      width: 512,
      height: 692,
    });
    expect(doc.getPage(1).getCropBox()).toEqual({
      x: 50,
      y: 50,
      width: 512,
      height: 692,
    });
  });

  it("does not modify the input PDF", async () => {
    const original = await fixturePdf(["Page 1"]);
    await cropPagesInPdf(original, {
      pages: [1],
      rect: { x1: 0, y1: 396, x2: 612, y2: 792 },
    });
    const doc = await PDFDocument.load(original);
    expect(doc.getPage(0).getCropBox()).toEqual({
      x: 0,
      y: 0,
      width: 612,
      height: 792,
    });
  });

  it("rejects a rectangle outside the page", async () => {
    await expect(
      cropPagesInPdf(await fixturePdf(["Page 1"]), {
        pages: [1],
        rect: { x1: 500, y1: 700, x2: 700, y2: 900 },
      })
    ).rejects.toThrow(EditError);
  });

  it("rejects a zero-size rectangle", async () => {
    await expect(
      cropPagesInPdf(await fixturePdf(["Page 1"]), {
        pages: [1],
        rect: { x1: 100, y1: 100, x2: 100, y2: 100 },
      })
    ).rejects.toThrow(EditError);
  });

  it("rejects a page that does not exist", async () => {
    await expect(
      cropPagesInPdf(await fixturePdf(["Page 1"]), {
        pages: [3],
        rect: { x1: 0, y1: 396, x2: 612, y2: 792 },
      })
    ).rejects.toThrow(EditError);
  });
});

describe("addLinkToPdf", () => {
  it("adds a link annotation that PDF.js reads back", async () => {
    const bytes = await addLinkToPdf(await fixturePdf(["Page 1"]), {
      page: 1,
      rect: { x1: 50, y1: 700, x2: 200, y2: 720 },
      url: "https://example.com",
    });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await (await pdfjs.getDocument({ data: bytes })).promise;
    const page = await pdf.getPage(1);
    const annots = await page.getAnnotations();
    const link = annots.find((a) => a.subtype === "Link");
    expect(link).toBeDefined();
    expect(link?.url).toBe("https://example.com/");
    expect(link?.rect).toEqual([50, 700, 200, 720]);
  });

  it("prepends https:// to a bare domain", async () => {
    const bytes = await addLinkToPdf(await fixturePdf(["Page 1"]), {
      page: 1,
      rect: { x1: 50, y1: 700, x2: 200, y2: 720 },
      url: "example.com/docs",
    });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await (await pdfjs.getDocument({ data: bytes })).promise;
    const page = await pdf.getPage(1);
    const annots = await page.getAnnotations();
    expect(annots.find((a) => a.subtype === "Link")?.url).toBe(
      "https://example.com/docs"
    );
  });

  it("rejects a non-web URL", async () => {
    await expect(
      addLinkToPdf(await fixturePdf(["Page 1"]), {
        page: 1,
        rect: { x1: 50, y1: 700, x2: 200, y2: 720 },
        url: "javascript:alert(1)",
      })
    ).rejects.toThrow(EditError);
  });

  it("rejects a rectangle outside the page", async () => {
    await expect(
      addLinkToPdf(await fixturePdf(["Page 1"]), {
        page: 1,
        rect: { x1: 600, y1: 700, x2: 700, y2: 720 },
        url: "https://example.com",
      })
    ).rejects.toThrow(EditError);
  });
});

describe("addTextToPdf", () => {
  it("draws text that is extractable", async () => {
    const bytes = await addTextToPdf(await fixturePdf(["Page 1"]), {
      page: 1,
      x: 50,
      y: 400,
      text: "Added text",
      size: 14,
      font: "helvetica",
      color: "red",
    });
    const texts = await pageTexts(bytes);
    expect(texts[0]).toContain("Added text");
  });

  it("does not modify the input PDF", async () => {
    const original = await fixturePdf(["Page 1"]);
    await addTextToPdf(original, {
      page: 1,
      x: 50,
      y: 400,
      text: "Added text",
      size: 14,
      font: "times",
      color: "blue",
    });
    const texts = await pageTexts(original);
    expect(texts[0].trim()).toBe("Page 1");
  });

  it("rejects empty text", async () => {
    await expect(
      addTextToPdf(await fixturePdf(["Page 1"]), {
        page: 1,
        x: 50,
        y: 400,
        text: "   ",
        size: 14,
        font: "helvetica",
        color: "black",
      })
    ).rejects.toThrow(EditError);
  });

  it("rejects a size outside 8–72 pt", async () => {
    await expect(
      addTextToPdf(await fixturePdf(["Page 1"]), {
        page: 1,
        x: 50,
        y: 400,
        text: "Added text",
        size: 100,
        font: "helvetica",
        color: "black",
      })
    ).rejects.toThrow(EditError);
  });

  it("rejects a position outside the page", async () => {
    await expect(
      addTextToPdf(await fixturePdf(["Page 1"]), {
        page: 1,
        x: 700,
        y: 400,
        text: "Added text",
        size: 14,
        font: "helvetica",
        color: "black",
      })
    ).rejects.toThrow(EditError);
  });
});

describe("addShapeToPdf", () => {
  it("draws a rectangle (a closed path: moveto, lineto, closepath)", async () => {
    const bytes = await addShapeToPdf(await fixturePdf(["Page 1"]), {
      page: 1,
      shape: "rectangle",
      rect: { x1: 50, y1: 300, x2: 150, y2: 350 },
      color: "blue",
      filled: true,
    });
    const ops = await pageOperators(bytes, 1);
    // pdf-lib draws a rectangle as a path (m, l, l, l, h), not
    // with the "re" operator — so a rectangle is a closed path
    // with straight segments and no curves.
    expect(ops).toContain("m");
    expect(ops).toContain("l");
    expect(ops).toContain("h");
    expect(ops).not.toContain("c");
  });

  it("draws an ellipse (curve operators)", async () => {
    const bytes = await addShapeToPdf(await fixturePdf(["Page 1"]), {
      page: 1,
      shape: "ellipse",
      rect: { x1: 50, y1: 300, x2: 150, y2: 350 },
      color: "green",
      filled: false,
    });
    const ops = await pageOperators(bytes, 1);
    expect(ops).toContain("c");
  });

  it("draws a line from the drag's start to its end", async () => {
    const bytes = await addShapeToPdf(await fixturePdf(["Page 1"]), {
      page: 1,
      shape: "line",
      rect: { x1: 50, y1: 200, x2: 200, y2: 250 },
      color: "red",
      filled: false,
    });
    const ops = await pageOperators(bytes, 1);
    expect(ops).toContain("m");
    expect(ops).toContain("l");
  });

  it("rejects a zero-length line", async () => {
    await expect(
      addShapeToPdf(await fixturePdf(["Page 1"]), {
        page: 1,
        shape: "line",
        rect: { x1: 100, y1: 100, x2: 100, y2: 100 },
        color: "red",
        filled: false,
      })
    ).rejects.toThrow(EditError);
  });

  it("rejects a rectangle outside the page", async () => {
    await expect(
      addShapeToPdf(await fixturePdf(["Page 1"]), {
        page: 1,
        shape: "rectangle",
        rect: { x1: 600, y1: 700, x2: 700, y2: 750 },
        color: "blue",
        filled: true,
      })
    ).rejects.toThrow(EditError);
  });
});
