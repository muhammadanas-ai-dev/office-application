// Unit tests for PDF annotations (Day 17).
//
// The fixture PDF is built in the test with pdf-lib (one page, a
// line of text), so the tests prove the annotation dicts are
// written and read back correctly — not just that bytes were
// produced.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  addAnnotationsToPdf,
  listAnnotationsInPdf,
  removeAnnotationFromPdf,
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
