import { describe, expect, it } from "vitest";
import {
  buildPptxSlides,
  getPptxFileName,
  pptxSlidesHaveText,
} from "@/lib/pdf-pptx";

describe("buildPptxSlides", () => {
  it("uses the first line as the title and the rest as the body", () => {
    const slides = buildPptxSlides([
      { page: 1, text: "Quarterly figures\nApples sold well\nPears too\n" },
      { page: 2, text: "Second page title\nOnly body line" },
    ]);
    expect(slides[0]).toEqual({
      title: "Quarterly figures",
      bodyLines: ["Apples sold well", "Pears too"],
    });
    expect(slides[1].title).toBe("Second page title");
  });

  it("a text-less page still gets a slide so counts match pages", () => {
    const slides = buildPptxSlides([
      { page: 1, text: "Text" },
      { page: 2, text: "   \n" },
    ]);
    expect(slides).toHaveLength(2);
    expect(slides[1]).toEqual({ title: "Page 2", bodyLines: [] });
  });

  it("truncates an over-long title with an ellipsis", () => {
    const slides = buildPptxSlides([
      { page: 1, text: "x".repeat(200) },
    ]);
    expect(slides[0].title.length).toBe(90);
    expect(slides[0].title.endsWith("…")).toBe(true);
  });
});

describe("pptxSlidesHaveText", () => {
  it("is false when every page is blank", () => {
    expect(pptxSlidesHaveText([{ page: 1, text: " \n" }])).toBe(false);
    expect(pptxSlidesHaveText([{ page: 1, text: "Hi" }])).toBe(true);
  });
});

describe("getPptxFileName", () => {
  it("swaps the extension for .pptx", () => {
    expect(getPptxFileName("Deck.pdf")).toBe("Deck.pptx");
    expect(getPptxFileName("")).toBe("document.pptx");
  });
});
