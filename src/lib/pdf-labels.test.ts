import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  pageLabel,
  readPdfPageLabels,
  setPdfPageLabels,
  toLetters,
  toRoman,
  validateLabelRanges,
  type PageLabelRange,
} from "@/lib/pdf-labels";

async function fixturePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${i + 1}`, { x: 50, y: 700, size: 14, font });
  }
  return doc.save();
}

const FRONT_AND_BODY: PageLabelRange[] = [
  { fromPage: 1, style: "roman-lower", prefix: "", start: 1 },
  { fromPage: 3, style: "decimal", prefix: "", start: 1 },
];

describe("page labels (F37)", () => {
  it("renders roman and letter values", () => {
    expect(toRoman(1)).toBe("I");
    expect(toRoman(4)).toBe("IV");
    expect(toRoman(14)).toBe("XIV");
    expect(toRoman(49)).toBe("XLIX");
    expect(toLetters(1)).toBe("A");
    expect(toLetters(26)).toBe("Z");
    expect(toLetters(27)).toBe("AA");
    expect(toLetters(53)).toBe("AAA");
  });

  it("computes the label of every page", () => {
    expect(pageLabel(FRONT_AND_BODY, 1)).toBe("i");
    expect(pageLabel(FRONT_AND_BODY, 2)).toBe("ii");
    expect(pageLabel(FRONT_AND_BODY, 3)).toBe("1");
    expect(pageLabel(FRONT_AND_BODY, 5)).toBe("3");
    const appendix: PageLabelRange[] = [
      { fromPage: 1, style: "decimal", prefix: "", start: 1 },
      { fromPage: 4, style: "letters-upper", prefix: "A-", start: 1 },
    ];
    expect(pageLabel(appendix, 4)).toBe("A-A");
    expect(pageLabel(appendix, 5)).toBe("A-B");
  });

  it("writes and reads back the /PageLabels tree", async () => {
    const bytes = await fixturePdf(5);
    const out = await setPdfPageLabels(bytes, FRONT_AND_BODY);
    const back = await readPdfPageLabels(out);
    expect(back).toEqual(FRONT_AND_BODY);
    // PDF.js must agree — it is what readers show.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await (await pdfjs.getDocument({ data: out })).promise;
    const labels = await pdf.getPageLabels();
    expect(labels).toEqual(["i", "ii", "1", "2", "3"]);
  });

  it("validates the ranges", () => {
    expect(() =>
      validateLabelRanges(
        [{ fromPage: 2, style: "decimal", prefix: "", start: 1 }],
        5
      )
    ).toThrow(/must start at page 1/);
    expect(() =>
      validateLabelRanges(
        [
          { fromPage: 1, style: "decimal", prefix: "", start: 1 },
          { fromPage: 1, style: "decimal", prefix: "", start: 1 },
        ],
        5
      )
    ).toThrow(/its own start page/);
    expect(() =>
      validateLabelRanges(
        [{ fromPage: 9, style: "decimal", prefix: "", start: 1 }],
        5
      )
    ).toThrow(/between 1 and 5/);
    expect(validateLabelRanges(FRONT_AND_BODY, 5)).toEqual(FRONT_AND_BODY);
    expect(
      validateLabelRanges(
        [{ fromPage: 1, style: "none", prefix: "Cover", start: 1 }],
        5
      )[0].style
    ).toBe("none");
  });
});
