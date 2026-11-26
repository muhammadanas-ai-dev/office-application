import { describe, expect, it } from "vitest";
import {
  detectTablesInRuns,
  getTableFileName,
  tableToCsv,
} from "@/lib/pdf-tables";
import type { PdfTextRun } from "@/lib/pdf-content";

function run(text: string, x: number, y: number): PdfTextRun {
  return {
    text,
    page: 0,
    x,
    y,
    fontSize: 10,
    fontName: "F1",
    baseFont: "Helvetica",
    fillColor: null,
    opIndices: [],
    textMatrix: [1, 0, 0, 1, x, y],
  };
}

/** A clean 3-column, 3-row table at x = 50/150/250. */
function tableRuns(): PdfTextRun[] {
  const rows: [string, string, string][] = [
    ["Item", "Qty", "Price"],
    ["Apples", "2", "3.50"],
    ["Pears", "5", "7.25"],
  ];
  const runs: PdfTextRun[] = [];
  rows.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      runs.push(run(cell, 50 + ci * 100, 700 - ri * 20));
    });
  });
  return runs;
}

describe("detectTablesInRuns", () => {
  it("detects a clean aligned table", () => {
    const tables = detectTablesInRuns(tableRuns(), 1);
    expect(tables).toHaveLength(1);
    expect(tables[0].page).toBe(1);
    expect(tables[0].rows).toEqual([
      ["Item", "Qty", "Price"],
      ["Apples", "2", "3.50"],
      ["Pears", "5", "7.25"],
    ]);
  });

  it("keeps an empty cell empty when a row skips a column", () => {
    const runs = tableRuns();
    // Remove the Qty value of the last row.
    const filtered = runs.filter(
      (r) => !(r.text === "5" && r.x === 150)
    );
    const tables = detectTablesInRuns(filtered, 2);
    expect(tables).toHaveLength(1);
    expect(tables[0].rows[2]).toEqual(["Pears", "", "7.25"]);
  });

  it("finds no table in plain paragraph text", () => {
    const runs = [
      run("The quick brown fox", 50, 700),
      run("jumps over the lazy dog", 50, 680),
      run("and runs away quickly", 50, 660),
    ];
    expect(detectTablesInRuns(runs, 1)).toEqual([]);
  });

  it("a single aligned row is not a table", () => {
    const runs = [run("A", 50, 700), run("B", 150, 700), run("C", 250, 700)];
    expect(detectTablesInRuns(runs, 1)).toEqual([]);
  });

  it("a paragraph line between rows splits the table honestly", () => {
    const runs = [
      ...tableRuns().slice(0, 6),
      run("A note in the middle", 50, 670),
      ...tableRuns().slice(6),
    ];
    const tables = detectTablesInRuns(runs, 1);
    // The header + first row form one table of 2 rows; the
    // last row alone cannot form another.
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toHaveLength(2);
  });
});

describe("tableToCsv", () => {
  it("escapes commas and quotes", () => {
    const csv = tableToCsv({
      page: 1,
      rows: [
        ["Name", "Note"],
        ["Smith, J.", 'Said "hi"'],
      ],
    });
    expect(csv).toBe('Name,Note\r\n"Smith, J.","Said ""hi"""\r\n');
  });
});

describe("getTableFileName", () => {
  it("names tables by index and page", () => {
    expect(getTableFileName(0, 3)).toBe("table-1-page-3.csv");
  });
});
