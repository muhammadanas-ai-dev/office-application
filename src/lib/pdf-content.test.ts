// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildReplacementOps,
  decodeWinAnsi,
  encodeWinAnsi,
  extractTextRuns,
  parseOperations,
  parseToUnicodeCMap,
  serializeOperations,
  tokenizeContent,
  type PdfFontInfo,
} from "@/lib/pdf-content";

describe("tokenizeContent", () => {
  it("tokenizes a simple text block", () => {
    const tokens = tokenizeContent(
      "BT /F1 10 Tf 1 0 0 1 50 700 Tm (Hello) Tj ET"
    );
    const ops = parseOperations(tokens);
    expect(ops.map((o) => o.operator)).toEqual(["BT", "Tf", "Tm", "Tj", "ET"]);
    expect(ops[1].operands[0]).toEqual({ kind: "name", value: "F1" });
    expect(ops[1].operands[1]).toEqual({ kind: "number", value: 10 });
    const str = ops[3].operands[0];
    expect(str.kind).toBe("string");
    if (str.kind === "string")
      expect(new TextDecoder().decode(str.value)).toBe("Hello");
  });

  it("decodes hex strings and TJ arrays", () => {
    const tokens = tokenizeContent("[(<48656C6C6F>) -120 <776F726C64>] TJ");
    const ops = parseOperations(tokens);
    expect(ops).toHaveLength(1);
    expect(ops[0].operator).toBe("TJ");
  });

  it("rejects an unterminated string", () => {
    expect(() => tokenizeContent("BT (oops Tj")).toThrow();
  });
});

describe("parseToUnicodeCMap", () => {
  it("parses bfchar and bfrange entries", () => {
    const cmap = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
2 beginbfchar
<0001> <0041>
<0002> <0042>
endbfchar
1 beginbfrange
<0003> <0005> <0043>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
    const map = parseToUnicodeCMap(cmap);
    expect(map.get(1)).toBe("A");
    expect(map.get(2)).toBe("B");
    expect(map.get(3)).toBe("C");
    expect(map.get(4)).toBe("D");
    expect(map.get(5)).toBe("E");
  });
});

describe("decodeWinAnsi / encodeWinAnsi", () => {
  it("round-trips ASCII and common punctuation", () => {
    const text = "Hello, World! 123 — €";
    const encoded = encodeWinAnsi(text);
    expect(encoded).not.toBeNull();
    expect(decodeWinAnsi(encoded!)).toBe(text);
  });

  it("refuses characters outside WinAnsi", () => {
    expect(encodeWinAnsi("Hello 😀")).toBeNull();
  });
});

describe("extractTextRuns", () => {
  it("extracts a run from an inline content stream", () => {
    const content =
      "q BT 0 0 0 rg /F1 20 Tf 24 TL 1 0 0 1 50 700 Tm <48656C6C6F> Tj T* ET Q";
    const ops = parseOperations(tokenizeContent(content));
    const runs = extractTextRuns(ops, new Map(), 0);
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe("Hello");
    expect(runs[0].fontSize).toBe(20);
    expect(runs[0].x).toBeCloseTo(50, 0);
    expect(runs[0].y).toBeCloseTo(700, 0);
  });

  it("records the fill colour and the base font of a run", () => {
    const fonts = new Map<string, PdfFontInfo>([
      [
        "F1",
        {
          name: "F1",
          isCid: false,
          toUnicode: null,
          baseFont: "ABCDEE+Arial-BoldMT",
        },
      ],
    ]);
    const content = "1 0 0 rg BT /F1 14 Tf 1 0 0 1 50 700 Tm (Red bold) Tj ET";
    const ops = parseOperations(tokenizeContent(content));
    const runs = extractTextRuns(ops, fonts, 0);
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe("Red bold");
    expect(runs[0].baseFont).toBe("ABCDEE+Arial-BoldMT");
    expect(runs[0].fillColor).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("splits a run when the fill colour changes, and reads grey/CMYK", () => {
    const content =
      "0.5 g BT /F1 12 Tf 1 0 0 1 50 700 Tm (Grey) Tj ET " +
      "0 1 0 0 k BT /F1 12 Tf 1 0 0 1 50 680 Tm (Cyan) Tj ET";
    const ops = parseOperations(tokenizeContent(content));
    const runs = extractTextRuns(ops, new Map(), 0);
    expect(runs).toHaveLength(2);
    expect(runs[0].text).toBe("Grey");
    expect(runs[0].fillColor).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
    expect(runs[1].text).toBe("Cyan");
    // CMYK (0,1,0,0) -> RGB (1,0,1).
    expect(runs[1].fillColor).toEqual({ r: 1, g: 0, b: 1 });
  });

  it("restores the colour across q/Q", () => {
    const content =
      "0 0 1 rg q 1 0 0 rg BT /F1 12 Tf 1 0 0 1 50 700 Tm (Red) Tj ET Q " +
      "BT /F1 12 Tf 1 0 0 1 50 680 Tm (Blue again) Tj ET";
    const ops = parseOperations(tokenizeContent(content));
    const runs = extractTextRuns(ops, new Map(), 0);
    expect(runs).toHaveLength(2);
    expect(runs[0].fillColor).toEqual({ r: 1, g: 0, b: 0 });
    expect(runs[1].fillColor).toEqual({ r: 0, g: 0, b: 1 });
  });
});

describe("buildReplacementOps", () => {
  it("wraps the replacement in q/Q and sets its colour", () => {
    const run = {
      text: "Old",
      page: 0,
      x: 50,
      y: 700,
      fontSize: 14,
      fontName: "F1",
      baseFont: "Arial-BoldMT",
      fillColor: { r: 1, g: 0, b: 0 },
      opIndices: [3],
      textMatrix: [1, 0, 0, 1, 50, 700] as [
        number,
        number,
        number,
        number,
        number,
        number,
      ],
    };
    const lines = buildReplacementOps(
      run,
      "New",
      "FormaEditFont",
      run.fillColor
    );
    expect(lines[0]).toBe("q");
    expect(lines[lines.length - 1]).toBe("Q");
    expect(lines).toContain("1 0 0 rg");
    expect(lines).toContain("/FormaEditFont 14 Tf");
    expect(lines).toContain("<4e6577> Tj");
    // The colour and font are scoped: the Q comes after the ET.
    expect(lines.indexOf("Q")).toBeGreaterThan(lines.indexOf("ET"));
  });

  it("sets no colour when the run never had one (it inherits)", () => {
    const run = {
      text: "Old",
      page: 0,
      x: 50,
      y: 700,
      fontSize: 12,
      fontName: "F1",
      baseFont: null,
      fillColor: null,
      opIndices: [3],
      textMatrix: [1, 0, 0, 1, 50, 700] as [
        number,
        number,
        number,
        number,
        number,
        number,
      ],
    };
    const lines = buildReplacementOps(run, "New", "FormaEditFont", null);
    expect(lines).not.toContain(expect.stringContaining(" rg"));
    expect(lines[0]).toBe("q");
    expect(lines[lines.length - 1]).toBe("Q");
  });

  it("keeps the original font setting in the stream (no leak)", () => {
    // Two text objects share one Tf: the second relies on the
    // font the first set. Editing the first must not change the
    // second's font — the q/Q wrapper is what guarantees it.
    const content =
      "BT /F1 12 Tf 1 0 0 1 50 700 Tm (First) Tj ET " +
      "BT 1 0 0 1 50 680 Tm (Second) Tj ET";
    const ops = parseOperations(tokenizeContent(content));
    const runs = extractTextRuns(ops, new Map(), 0);
    expect(runs).toHaveLength(2);
    const replacement = buildReplacementOps(
      runs[0],
      "Replaced",
      "FormaEditFont",
      null
    );
    const out = serializeOperations(
      ops,
      new Set(runs[0].opIndices),
      Math.min(...runs[0].opIndices),
      replacement
    );
    // The original font setting survives, and the Q that restores
    // it comes before the second text object. (The serializer
    // writes strings as lowercase hex, so "Second" is
    // <5365636f6e64>.)
    expect(out).toContain("/F1 12 Tf");
    expect(out.indexOf("Q")).toBeLessThan(out.indexOf("<5365636f6e64>"));
    expect(out).toContain("q");
  });
});

describe("extractTextRuns on fixture PDFs (via pdf-edit)", () => {
  it("finds the text in a pdf-lib PDF (standard font, hex strings)", async () => {
    const { listPdfTextRuns } = await import("@/lib/pdf-edit");
    const bytes = readFileSync("/tmp/e2e/pdf1.pdf");
    const runs = await listPdfTextRuns(bytes, 1);
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe("PDF One page 1");
    expect(runs[0].fontSize).toBe(20);
    expect(runs[0].x).toBeCloseTo(50, 0);
    expect(runs[0].y).toBeCloseTo(700, 0);
  });

  it("locates runs in an ONLYOFFICE PDF (CID font, no ToUnicode)", async () => {
    const { listPdfTextRuns } = await import("@/lib/pdf-edit");
    const bytes = readFileSync("/tmp/e2e/debug-export.pdf");
    const runs = await listPdfTextRuns(bytes, 1);
    // No ToUnicode CMap, so the decoded text is empty — but the
    // runs must still be located by position and operation index
    // (that is what the position-based edit match uses).
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0].y).toBeGreaterThan(700);
    expect(runs[0].fontSize).toBe(10);
    expect(runs[0].opIndices.length).toBeGreaterThan(0);
  });
});
