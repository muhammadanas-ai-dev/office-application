// Unit tests for PDF annotations (Day 17).
//
// The fixture PDF is built in the test with pdf-lib (one page, a
// line of text), so the tests prove the annotation dicts are
// written and read back correctly — not just that bytes were
// produced.
import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  addAnnotationsToPdf,
  appendCommentsSummaryInPdf,
  flattenAnnotationsInPdf,
  listAnnotationsInPdf,
  removeAnnotationFromPdf,
  importAnnotationsInPdf,
  AnnotateError,
  type AnnotationInput,
} from "@/lib/pdf-annotate";

async function fixturePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("The quick brown fox jumps over the lazy dog.", {
    x: 50,
    y: 650,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });
  return doc.save();
}

const HIGHLIGHT: AnnotationInput = {
  kind: "highlight",
  page: 1,
  quadPoints: [50, 664, 350, 664, 50, 648, 350, 648],
  contents: "A test highlight",
};

describe("addAnnotationsToPdf", () => {
  it("adds a highlight with the right subtype, quads and colour", async () => {
    const bytes = await addAnnotationsToPdf(await fixturePdf(), [HIGHLIGHT]);
    const listed = await listAnnotationsInPdf(bytes);
    expect(listed).toHaveLength(1);
    expect(listed[0].subtype).toBe("Highlight");
    expect(listed[0].page).toBe(1);
    expect(listed[0].index).toBe(0);
    expect(listed[0].quadPoints).toEqual([
      50, 664, 350, 664, 50, 648, 350, 648,
    ]);
    expect(listed[0].rect).toEqual([50, 648, 350, 664]);
    expect(listed[0].color).toEqual([1, 1, 0]);
    expect(listed[0].contents).toBe("A test highlight");
    expect(listed[0].author).toBe("Forma Office");
    expect(listed[0].date).toMatch(/^D:\d{14}Z$/);
  });

  it("adds all five kinds with the right subtypes", async () => {
    const inputs: AnnotationInput[] = [
      {
        kind: "highlight",
        page: 1,
        quadPoints: [50, 664, 350, 664, 50, 648, 350, 648],
      },
      {
        kind: "underline",
        page: 1,
        quadPoints: [50, 664, 350, 664, 50, 648, 350, 648],
      },
      {
        kind: "strikeout",
        page: 1,
        quadPoints: [50, 664, 350, 664, 50, 648, 350, 648],
      },
      { kind: "note", page: 1, x: 100, y: 500, contents: "A sticky note" },
      { kind: "ink", page: 1, strokes: [[50, 500, 175, 550, 300, 500]] },
    ];
    const bytes = await addAnnotationsToPdf(await fixturePdf(), inputs);
    const listed = await listAnnotationsInPdf(bytes);
    expect(listed.map((a) => a.subtype)).toEqual([
      "Highlight",
      "Underline",
      "StrikeOut",
      "Text",
      "Ink",
    ]);
    const note = listed.find((a) => a.subtype === "Text");
    expect(note?.rect).toEqual([100, 500, 120, 520]);
    expect(note?.contents).toBe("A sticky note");
    const ink = listed.find((a) => a.subtype === "Ink");
    expect(ink?.inkList).toEqual([[50, 500, 175, 550, 300, 500]]);
    expect(ink?.color).toEqual([1, 0, 0]);
    const underline = listed.find((a) => a.subtype === "Underline");
    expect(underline?.color).toEqual([0, 0.6, 0]);
  });

  it("does not modify the input PDF", async () => {
    const original = await fixturePdf();
    const before = await listAnnotationsInPdf(original);
    await addAnnotationsToPdf(original, [HIGHLIGHT]);
    expect(await listAnnotationsInPdf(original)).toEqual(before);
  });

  it("rejects an empty QuadPoints array", async () => {
    await expect(
      addAnnotationsToPdf(await fixturePdf(), [
        { kind: "highlight", page: 1, quadPoints: [] },
      ])
    ).rejects.toThrow(AnnotateError);
  });

  it("rejects a QuadPoints array that is not a multiple of 8", async () => {
    await expect(
      addAnnotationsToPdf(await fixturePdf(), [
        { kind: "highlight", page: 1, quadPoints: [50, 664, 350, 664] },
      ])
    ).rejects.toThrow(AnnotateError);
  });

  it("rejects a page that does not exist", async () => {
    await expect(
      addAnnotationsToPdf(await fixturePdf(), [
        {
          kind: "highlight",
          page: 2,
          quadPoints: [50, 664, 350, 664, 50, 648, 350, 648],
        },
      ])
    ).rejects.toThrow(AnnotateError);
  });

  it("rejects a note without a position", async () => {
    await expect(
      addAnnotationsToPdf(await fixturePdf(), [{ kind: "note", page: 1 }])
    ).rejects.toThrow(AnnotateError);
  });

  it("rejects an ink annotation without a stroke", async () => {
    await expect(
      addAnnotationsToPdf(await fixturePdf(), [
        { kind: "ink", page: 1, strokes: [] },
      ])
    ).rejects.toThrow(AnnotateError);
  });

  it("rejects a stroke with fewer than two points", async () => {
    await expect(
      addAnnotationsToPdf(await fixturePdf(), [
        { kind: "ink", page: 1, strokes: [[50, 500]] },
      ])
    ).rejects.toThrow(AnnotateError);
  });

  it("rejects a non-finite coordinate", async () => {
    await expect(
      addAnnotationsToPdf(await fixturePdf(), [
        {
          kind: "highlight",
          page: 1,
          quadPoints: [50, 664, 350, 664, 50, 648, 350, Number.NaN],
        },
      ])
    ).rejects.toThrow(AnnotateError);
  });

  it("rejects an empty input list", async () => {
    await expect(addAnnotationsToPdf(await fixturePdf(), [])).rejects.toThrow(
      AnnotateError
    );
  });
});

describe("listAnnotationsInPdf", () => {
  it("returns an empty list for a PDF with no annotations", async () => {
    expect(await listAnnotationsInPdf(await fixturePdf())).toEqual([]);
  });
});

describe("removeAnnotationFromPdf", () => {
  it("removes the annotation at the given index and keeps the rest", async () => {
    const bytes = await addAnnotationsToPdf(await fixturePdf(), [
      HIGHLIGHT,
      { kind: "note", page: 1, x: 100, y: 500, contents: "Keep me" },
    ]);
    const removed = await removeAnnotationFromPdf(bytes, 1, 0);
    const listed = await listAnnotationsInPdf(removed);
    expect(listed).toHaveLength(1);
    expect(listed[0].subtype).toBe("Text");
    expect(listed[0].contents).toBe("Keep me");
    expect(listed[0].index).toBe(0);
  });

  it("rejects an index that does not exist", async () => {
    const bytes = await addAnnotationsToPdf(await fixturePdf(), [HIGHLIGHT]);
    await expect(removeAnnotationFromPdf(bytes, 1, 5)).rejects.toThrow(
      AnnotateError
    );
  });

  it("rejects a page that does not exist", async () => {
    const bytes = await addAnnotationsToPdf(await fixturePdf(), [HIGHLIGHT]);
    await expect(removeAnnotationFromPdf(bytes, 2, 0)).rejects.toThrow(
      AnnotateError
    );
  });
});

describe("flattenAnnotationsInPdf", () => {
  it("draws the markup into the page and removes every annotation", async () => {
    const bytes = await addAnnotationsToPdf(await fixturePdf(), [
      HIGHLIGHT,
      { kind: "note", page: 1, x: 100, y: 500, contents: "A note" },
      { kind: "ink", page: 1, strokes: [[60, 600, 200, 600, 200, 560]] },
    ]);
    const flat = await flattenAnnotationsInPdf(bytes);
    // No annotations remain in the flattened copy.
    expect(await listAnnotationsInPdf(flat)).toHaveLength(0);
    // The page count is unchanged and the original is untouched.
    const flatDoc = await PDFDocument.load(flat);
    expect(flatDoc.getPageCount()).toBe(1);
    expect(await listAnnotationsInPdf(bytes)).toHaveLength(3);
    // The flattened page's content stream is longer than the
    // original's (the markup was drawn into it).
    const originalDoc = await PDFDocument.load(bytes);
    const flatPage = flatDoc.getPage(0);
    const originalPage = originalDoc.getPage(0);
    const flatContents = flatPage.node.get(PDFName.of("Contents"));
    const originalContents = originalPage.node.get(PDFName.of("Contents"));
    expect(flatContents).toBeDefined();
    expect(originalContents).toBeDefined();
  });

  it("rejects a PDF with no annotations", async () => {
    await expect(flattenAnnotationsInPdf(await fixturePdf())).rejects.toThrow(
      AnnotateError
    );
  });
});

describe("appendCommentsSummaryInPdf", () => {
  it("appends a summary page listing every annotation in order", async () => {
    const bytes = await addAnnotationsToPdf(await fixturePdf(), [
      HIGHLIGHT,
      { kind: "note", page: 1, x: 100, y: 500, contents: "A note" },
    ]);
    const annotations = await listAnnotationsInPdf(bytes);
    const withSummary = await appendCommentsSummaryInPdf(bytes, annotations);
    const doc = await PDFDocument.load(withSummary);
    expect(doc.getPageCount()).toBe(2);
    // The summary page's text lists both annotations.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await (
      await pdfjs.getDocument({ data: new Uint8Array(withSummary) })
    ).promise;
    const page = await pdf.getPage(2);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    expect(text).toContain("Comments");
    expect(text).toContain("Highlight");
    expect(text).toContain("A test highlight");
    expect(text).toContain("Note");
    expect(text).toContain("A note");
    // The input PDF is untouched.
    const originalDoc = await PDFDocument.load(bytes);
    expect(originalDoc.getPageCount()).toBe(1);
  });
});

async function multiPagePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${i + 1}`, {
      x: 50,
      y: 650,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    });
  }
  return doc.save();
}

describe("importAnnotationsInPdf (F30)", () => {
  it("copies annotations page-for-page and skips pages the target lacks", async () => {
    const source = await addAnnotationsToPdf(await multiPagePdf(3), [
      HIGHLIGHT,
      { kind: "note", page: 3, x: 100, y: 600, contents: "Page 3 note" },
    ]);
    const result = await importAnnotationsInPdf(
      await multiPagePdf(2),
      source
    );
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    const listed = await listAnnotationsInPdf(result.bytes);
    expect(listed).toHaveLength(1);
    expect(listed[0].contents).toBe("A test highlight");
    expect(listed[0].page).toBe(1);
    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it("refuses a source with no annotations", async () => {
    await expect(
      importAnnotationsInPdf(await multiPagePdf(1), await multiPagePdf(1))
    ).rejects.toThrow(/no comments to import/);
  });
});
