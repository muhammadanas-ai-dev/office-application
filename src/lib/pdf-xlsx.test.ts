import { describe, expect, it } from "vitest";
import {
  buildXlsxSheets,
  getXlsxFileName,
  sanitizeSheetName,
  xlsxSheetsHaveContent,
} from "@/lib/pdf-xlsx";

describe("sanitizeSheetName", () => {
  it("strips forbidden characters and caps at 31 chars", () => {
    const used = new Set<string>();
    const name = sanitizeSheetName("A/B:C*D?E[F]G\\H".repeat(4), used);
    expect(name).not.toMatch(/[[\]:*?/\\]/);
    expect(name.length).toBeLessThanOrEqual(31);
  });
  it("deduplicates names", () => {
    const used = new Set<string>();
    expect(sanitizeSheetName("Page 1", used)).toBe("Page 1");
    expect(sanitizeSheetName("Page 1", used)).toBe("Page 1 (2)");
  });
});

describe("buildXlsxSheets", () => {
  it("builds a text sheet per non-empty page and a sheet per table", () => {
    const sheets = buildXlsxSheets(
      [
        { page: 1, text: "Hello\nWorld\n" },
        { page: 2, text: "   \n" },
        { page: 3, text: "Last page" },
      ],
      [
        {
          page: 1,
          rows: [
            ["Item", "Qty"],
            ["Apples", "2"],
          ],
        },
        { page: 1, rows: [["A", "B"]] },
      ]
    );
    expect(sheets.map((s) => s.name)).toEqual([
      "Page 1",
      "Page 3",
      "P1 Table 1",
      "P1 Table 2",
    ]);
    expect(sheets[0].rows).toEqual([["Hello"], ["World"]]);
    expect(sheets[2].rows[1]).toEqual(["Apples", "2"]);
    expect(xlsxSheetsHaveContent(sheets)).toBe(true);
  });

  it("an empty document produces no sheets", () => {
    const sheets = buildXlsxSheets([{ page: 1, text: "" }], []);
    expect(sheets).toEqual([]);
    expect(xlsxSheetsHaveContent(sheets)).toBe(false);
  });
});

describe("getXlsxFileName", () => {
  it("swaps the extension for .xlsx", () => {
    expect(getXlsxFileName("Report.pdf")).toBe("Report.xlsx");
    expect(getXlsxFileName("")).toBe("document.xlsx");
  });
});
