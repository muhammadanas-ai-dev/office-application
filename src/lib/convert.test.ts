import { describe, expect, it } from "vitest";
import {
  CONVERSION_MATRIX,
  getConvertibleTargets,
  getConvertedFileName,
  getConvertedTitle,
  getFormatLabel,
  getTargetMimeType,
  isConversionSupported,
  validateConvertedBytes,
} from "@/lib/convert";

describe("CONVERSION_MATRIX", () => {
  it("offers only conversions within a family, plus PDF, plus PDF back to DOCX/TXT", () => {
    // Word family.
    expect(CONVERSION_MATRIX.docx).toEqual(["odt", "pdf", "txt"]);
    expect(CONVERSION_MATRIX.doc).toEqual(["docx", "odt", "pdf", "txt"]);
    expect(CONVERSION_MATRIX.odt).toEqual(["docx", "pdf", "txt"]);
    expect(CONVERSION_MATRIX.txt).toEqual(["docx", "odt", "pdf"]);
    // Spreadsheet family.
    expect(CONVERSION_MATRIX.xlsx).toEqual(["csv", "ods", "pdf"]);
    expect(CONVERSION_MATRIX.xls).toEqual(["csv", "ods", "xlsx", "pdf"]);
    expect(CONVERSION_MATRIX.ods).toEqual(["csv", "xlsx", "pdf"]);
    expect(CONVERSION_MATRIX.csv).toEqual(["ods", "xlsx", "pdf"]);
    // Presentation family.
    expect(CONVERSION_MATRIX.pptx).toEqual(["odp", "pdf"]);
    expect(CONVERSION_MATRIX.ppt).toEqual(["odp", "pptx", "pdf"]);
    expect(CONVERSION_MATRIX.odp).toEqual(["pptx", "pdf"]);
    // PDF.
    expect(CONVERSION_MATRIX.pdf).toEqual(["docx", "txt"]);
  });

  it("never offers a cross-family conversion", () => {
    expect(getConvertibleTargets("docx")).not.toContain("xlsx");
    expect(getConvertibleTargets("docx")).not.toContain("pptx");
    expect(getConvertibleTargets("xlsx")).not.toContain("docx");
    expect(getConvertibleTargets("xlsx")).not.toContain("pptx");
    expect(getConvertibleTargets("pptx")).not.toContain("docx");
    expect(getConvertibleTargets("pptx")).not.toContain("xlsx");
  });

  it("never offers the same format, and never offers PDF-to-Excel in v1", () => {
    for (const [from, targets] of Object.entries(CONVERSION_MATRIX)) {
      expect(targets).not.toContain(from);
    }
    expect(getConvertibleTargets("pdf")).not.toContain("xlsx");
    expect(getConvertibleTargets("docx")).not.toContain("doc");
    expect(getConvertibleTargets("xlsx")).not.toContain("xls");
  });

  it("returns [] for an unknown source or a null source", () => {
    expect(getConvertibleTargets("png")).toEqual([]);
    expect(getConvertibleTargets("epub")).toEqual([]);
    expect(getConvertibleTargets(null)).toEqual([]);
  });
});

describe("isConversionSupported", () => {
  it("accepts a matrix conversion", () => {
    expect(isConversionSupported("docx", "pdf")).toBe(true);
    expect(isConversionSupported("csv", "xlsx")).toBe(true);
    expect(isConversionSupported("pdf", "docx")).toBe(true);
  });

  it("refuses a same-format conversion", () => {
    expect(isConversionSupported("docx", "docx")).toBe(false);
    expect(isConversionSupported("pdf", "pdf")).toBe(false);
  });

  it("refuses a conversion outside the matrix", () => {
    expect(isConversionSupported("docx", "xlsx")).toBe(false);
    expect(isConversionSupported("pdf", "xlsx")).toBe(false);
    expect(isConversionSupported("png", "pdf")).toBe(false);
    expect(isConversionSupported("docx", "epub")).toBe(false);
  });

  it("refuses a null source or target", () => {
    expect(isConversionSupported(null, "pdf")).toBe(false);
    expect(isConversionSupported("docx", null)).toBe(false);
  });
});

describe("getTargetMimeType", () => {
  it("returns the right MIME type for each target", () => {
    expect(getTargetMimeType("docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(getTargetMimeType("pdf")).toBe("application/pdf");
    expect(getTargetMimeType("csv")).toBe("text/csv");
    expect(getTargetMimeType("txt")).toBe("text/plain");
    expect(getTargetMimeType("pptx")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
  });

  it("returns null for an unknown extension", () => {
    expect(getTargetMimeType("epub")).toBe(null);
    expect(getTargetMimeType(null)).toBe(null);
  });
});

describe("getFormatLabel", () => {
  it("labels the common formats", () => {
    expect(getFormatLabel("docx")).toBe("Word document (.docx)");
    expect(getFormatLabel("xlsx")).toBe("Excel workbook (.xlsx)");
    expect(getFormatLabel("pptx")).toBe("PowerPoint presentation (.pptx)");
    expect(getFormatLabel("pdf")).toBe("PDF (.pdf)");
    expect(getFormatLabel("csv")).toBe("CSV (.csv)");
  });
});

describe("validateConvertedBytes", () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.4\n%...");
  const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
  const textBytes = new TextEncoder().encode("name,amount\nAnas,100\n");

  it("accepts a PDF for a pdf target", () => {
    expect(validateConvertedBytes(pdfBytes, "pdf")).toBe(null);
  });

  it("refuses a non-PDF for a pdf target", () => {
    expect(validateConvertedBytes(zipBytes, "pdf")).not.toBe(null);
    expect(validateConvertedBytes(textBytes, "pdf")).not.toBe(null);
  });

  it("accepts ZIP bytes for an Office target", () => {
    for (const ext of [
      "docx",
      "doc",
      "xlsx",
      "xls",
      "pptx",
      "ppt",
      "odt",
      "ods",
      "odp",
    ]) {
      expect(validateConvertedBytes(zipBytes, ext)).toBe(null);
    }
  });

  it("refuses non-ZIP bytes for an Office target", () => {
    expect(validateConvertedBytes(pdfBytes, "docx")).not.toBe(null);
    expect(validateConvertedBytes(textBytes, "xlsx")).not.toBe(null);
  });

  it("accepts plain text for txt and csv", () => {
    expect(validateConvertedBytes(textBytes, "txt")).toBe(null);
    expect(validateConvertedBytes(textBytes, "csv")).toBe(null);
  });

  it("refuses a ZIP or a PDF for a text target", () => {
    expect(validateConvertedBytes(zipBytes, "txt")).not.toBe(null);
    expect(validateConvertedBytes(pdfBytes, "csv")).not.toBe(null);
  });

  it("refuses empty bytes and an unknown target", () => {
    expect(validateConvertedBytes(new Uint8Array(0), "pdf")).not.toBe(null);
    expect(validateConvertedBytes(pdfBytes, "epub")).not.toBe(null);
  });
});

describe("file names", () => {
  it("builds a converted file name from the title", () => {
    expect(getConvertedFileName("Quarterly report.docx", "pdf")).toBe(
      "Quarterly report.pdf"
    );
    expect(getConvertedFileName("data", "xlsx")).toBe("data.xlsx");
    expect(getConvertedFileName("", "pdf")).toBe("document.pdf");
  });

  it("builds a converted document title", () => {
    expect(getConvertedTitle("Quarterly report.docx", "pdf")).toBe(
      "Quarterly report.pdf"
    );
    expect(getConvertedTitle("notes.txt", "docx")).toBe("notes.docx");
  });
});
