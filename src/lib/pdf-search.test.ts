import { describe, expect, it } from "vitest";
import {
  MAX_SEARCH_MATCHES,
  searchPdfText,
  validateSearchQuery,
} from "@/lib/pdf-search";
import { PdfEditError } from "@/lib/pdf-edit";

const PAGES = [
  { page: 1, text: "The quick brown fox jumps over the lazy dog." },
  { page: 2, text: "A QUICK study in scarlet. The fox returns." },
  { page: 3, text: "Nothing relevant on this page." },
];

describe("validateSearchQuery", () => {
  it("trims and returns the query", () => {
    expect(validateSearchQuery("  fox  ")).toBe("fox");
  });
  it("rejects an empty query", () => {
    expect(() => validateSearchQuery("   ")).toThrow(PdfEditError);
  });
  it("rejects an over-long query", () => {
    expect(() => validateSearchQuery("x".repeat(201))).toThrow(
      PdfEditError
    );
  });
});

describe("searchPdfText", () => {
  it("finds matches across pages, case-insensitively by default", () => {
    const result = searchPdfText(PAGES, "quick");
    expect(result.total).toBe(2);
    expect(result.pages.map((p) => p.page)).toEqual([1, 2]);
    expect(result.pages[1].matches[0].match).toBe("QUICK");
  });

  it("honours case sensitivity", () => {
    const result = searchPdfText(PAGES, "quick", {
      caseSensitive: true,
    });
    expect(result.total).toBe(1);
    expect(result.pages[0].page).toBe(1);
  });

  it("honours whole-word matching", () => {
    const pages = [{ page: 1, text: "foxes fox firefox" }];
    expect(searchPdfText(pages, "fox").total).toBe(3);
    expect(
      searchPdfText(pages, "fox", { wholeWord: true }).total
    ).toBe(1);
  });

  it("treats the query as literal text, not a regex", () => {
    const pages = [{ page: 1, text: "Price is 5.00 (net) today." }];
    const result = searchPdfText(pages, "5.00 (net)");
    expect(result.total).toBe(1);
    expect(result.pages[0].matches[0].match).toBe("5.00 (net)");
  });

  it("builds a snippet with context and cut markers", () => {
    const long =
      "a".repeat(60) + " needle " + "b".repeat(60);
    const result = searchPdfText([{ page: 1, text: long }], "needle");
    const match = result.pages[0].matches[0];
    expect(match.match).toBe("needle");
    expect(match.startsCut).toBe(true);
    expect(match.endsCut).toBe(true);
    expect(match.before.length).toBeLessThanOrEqual(41);
  });

  it("caps the matches and reports truncation", () => {
    const pages = [
      { page: 1, text: "x ".repeat(MAX_SEARCH_MATCHES + 50) },
    ];
    const result = searchPdfText(pages, "x");
    expect(result.total).toBe(MAX_SEARCH_MATCHES);
    expect(result.truncated).toBe(true);
  });

  it("returns no pages when nothing matches", () => {
    const result = searchPdfText(PAGES, "zebra");
    expect(result.total).toBe(0);
    expect(result.pages).toEqual([]);
  });
});
