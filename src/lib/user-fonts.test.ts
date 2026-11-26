import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  detectFontFormat,
  fontNameFromFileName,
  sortFontsForPicker,
  validateFontName,
  type UserFontRow,
} from "@/lib/user-fonts";
import { addTextToPdf } from "@/lib/pdf-page-tools";
import { readFileSync } from "node:fs";

describe("user fonts (F33)", () => {
  it("detects TTF and OTF from magic bytes and refuses the rest", () => {
    expect(
      detectFontFormat(new Uint8Array([0x00, 0x01, 0x00, 0x00, 9, 9]))
    ).toBe("ttf");
    expect(detectFontFormat(new TextEncoder().encode("OTTOxxxx"))).toBe("otf");
    expect(detectFontFormat(new TextEncoder().encode("truexxxx"))).toBe("ttf");
    expect(detectFontFormat(new TextEncoder().encode("ttcfxxxx"))).toBeNull();
    expect(detectFontFormat(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(detectFontFormat(new Uint8Array([1, 2]))).toBeNull();
  });

  it("validates names and derives one from a file name", () => {
    expect(validateFontName("  My   Font ")).toBe("My Font");
    expect(() => validateFontName("")).toThrow(/Give the font a name/);
    expect(() => validateFontName("x".repeat(81))).toThrow(/at most 80/);
    expect(fontNameFromFileName("PlayfairDisplay-Bold.ttf")).toBe(
      "PlayfairDisplay-Bold"
    );
    expect(fontNameFromFileName("")).toBe("My font");
  });

  it("orders the picker: favourites, then recent, then A–Z", () => {
    const font = (partial: Partial<UserFontRow>): UserFontRow => ({
      id: Math.random().toString(36),
      name: "Font",
      format: "ttf",
      sizeBytes: 100,
      isFavourite: false,
      lastUsedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      ...partial,
    });
    const sorted = sortFontsForPicker([
      font({ name: "Zebra" }),
      font({ name: "Recent", lastUsedAt: "2026-11-20T00:00:00Z" }),
      font({ name: "Fav", isFavourite: true }),
      font({ name: "Alpha" }),
      font({ name: "Older", lastUsedAt: "2026-11-01T00:00:00Z" }),
    ]);
    expect(sorted.map((f) => f.name)).toEqual([
      "Fav",
      "Recent",
      "Older",
      "Alpha",
      "Zebra",
    ]);
  });

  it("draws text with an uploaded TTF (embedded + subset)", async () => {
    const fontBytes = new Uint8Array(
      readFileSync("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    );
    const doc = await PDFDocument.create();
    const std = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText("Base page", { x: 50, y: 700, size: 14, font: std });
    const pdfBytes = await doc.save();
    const out = await addTextToPdf(
      pdfBytes,
      {
        page: 1,
        x: 50,
        y: 600,
        text: "Custom font text",
        size: 16,
        font: "custom",
        color: "black",
      },
      fontBytes
    );
    // Asserted through PDF.js — what a reader shows. (Forma's
    // own text extractor cannot decode subset-font encodings;
    // that limit is recorded in known-limitations.)
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await (await pdfjs.getDocument({ data: out })).promise;
    const pdfPage = await pdf.getPage(1);
    const content = await pdfPage.getTextContent();
    const shown = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    expect(shown).toContain("Custom font text");
    expect(shown).toContain("Base page");
  });
});
