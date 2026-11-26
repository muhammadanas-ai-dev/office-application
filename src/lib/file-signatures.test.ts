import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectFileType, validateFileSignature } from "@/lib/file-signatures";

function corpus(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(process.cwd(), "corpus", name)));
}

describe("detectFileType", () => {
  it("detects a PDF from its %PDF magic", () => {
    expect(detectFileType(corpus("pdf-rich.pdf"))).toBe("pdf");
  });

  it("detects a PNG from its 8-byte magic", () => {
    expect(detectFileType(corpus("image.png"))).toBe("png");
  });

  it("detects a JPEG from its FF D8 FF magic", () => {
    expect(detectFileType(corpus("image.jpg"))).toBe("jpg");
  });

  it("detects a legacy Office file as OLE (they share the magic)", () => {
    expect(detectFileType(corpus("doc-rich.doc"))).toBe("ole");
    expect(detectFileType(corpus("xls-rich.xls"))).toBe("ole");
    expect(detectFileType(corpus("ppt-rich.ppt"))).toBe("ole");
  });

  it("detects a ZIP-based Office file as zip", () => {
    expect(detectFileType(corpus("docx-rich.docx"))).toBe("zip");
    expect(detectFileType(corpus("xlsx-rich.xlsx"))).toBe("zip");
    expect(detectFileType(corpus("odt-rich.odt"))).toBe("zip");
  });

  it("detects plain text", () => {
    expect(detectFileType(corpus("plain.txt"))).toBe("txt");
    expect(detectFileType(corpus("data.csv"))).toBe("txt");
  });

  it("returns null for bytes that match no known format", () => {
    // 0xFF 0xFE is not valid UTF-8, so it is neither text nor
    // any known magic.
    expect(detectFileType(new Uint8Array([0xff, 0xfe, 0x00]))).toBeNull();
  });
});

describe("validateFileSignature", () => {
  it("accepts every real corpus file under its own extension", () => {
    const cases: [string, string][] = [
      ["docx-rich.docx", "docx"],
      ["xlsx-rich.xlsx", "xlsx"],
      ["pptx-rich.pptx", "pptx"],
      ["doc-rich.doc", "doc"],
      ["xls-rich.xls", "xls"],
      ["ppt-rich.ppt", "ppt"],
      ["odt-rich.odt", "odt"],
      ["ods-rich.ods", "ods"],
      ["odp-rich.odp", "odp"],
      ["pdf-rich.pdf", "pdf"],
      ["plain.txt", "txt"],
      ["data.csv", "csv"],
      ["image.png", "png"],
      ["image.jpg", "jpg"],
    ];
    for (const [file, ext] of cases) {
      expect(validateFileSignature(corpus(file), ext)).toEqual({
        ok: true,
      });
    }
  });

  it("refuses a PNG renamed to .pdf (and names what it actually is)", () => {
    const result = validateFileSignature(corpus("image.png"), "pdf");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not a PDF");
      expect(result.error).toContain("PNG");
    }
  });

  it("refuses a DOCX renamed to .xlsx (the ZIP inner marker differs)", () => {
    const result = validateFileSignature(corpus("docx-rich.docx"), "xlsx");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not a XLSX");
    }
  });

  it("refuses an ODT renamed to .ods (the mimetype differs)", () => {
    const result = validateFileSignature(corpus("odt-rich.odt"), "ods");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not a ODS");
    }
  });

  it("refuses a PDF renamed to .docx", () => {
    const result = validateFileSignature(corpus("pdf-rich.pdf"), "docx");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not a DOCX");
      expect(result.error).toContain("PDF");
    }
  });

  it("refuses a binary file renamed to .txt", () => {
    const binary = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
    const result = validateFileSignature(binary, "txt");
    expect(result.ok).toBe(false);
  });

  it("refuses bytes that do not match the claimed format", () => {
    // A truncated PDF still starts with %PDF, so the magic
    // check passes it — truncation is caught later, when the
    // PDF is parsed. What the magic check refuses is bytes
    // that never were a PDF.
    const result = validateFileSignature(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "pdf"
    );
    expect(result.ok).toBe(false);
  });

  it("refuses an unknown extension", () => {
    const result = validateFileSignature(corpus("pdf-rich.pdf"), "exe");
    expect(result.ok).toBe(false);
  });

  it("accepts a .jpeg extension for JPEG bytes", () => {
    expect(validateFileSignature(corpus("image.jpg"), "jpeg")).toEqual({
      ok: true,
    });
  });
});

describe("WEBP / TIFF signatures (F34)", () => {
  const webp = new Uint8Array([
    ...new TextEncoder().encode("RIFF"),
    0x24, 0x00, 0x00, 0x00,
    ...new TextEncoder().encode("WEBPVP8 "),
  ]);
  const tiffLe = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00]);
  const tiffBe = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x08]);

  it("detects webp and tiff", () => {
    expect(detectFileType(webp)).toBe("webp");
    expect(detectFileType(tiffLe)).toBe("tiff");
    expect(detectFileType(tiffBe)).toBe("tiff");
  });

  it("validates the extensions against the bytes", () => {
    expect(validateFileSignature(webp, "webp").ok).toBe(true);
    expect(validateFileSignature(tiffLe, "tiff").ok).toBe(true);
    expect(validateFileSignature(tiffBe, "tif").ok).toBe(true);
    expect(validateFileSignature(webp, "png").ok).toBe(false);
    expect(validateFileSignature(tiffLe, "webp").ok).toBe(false);
  });
});
