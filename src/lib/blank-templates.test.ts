// Unit tests for the blank Office templates (Day 15).
//
// These tests prove the committed template files are real, valid
// Office files — not just bytes that happen to exist. If a template
// is ever deleted, corrupted, or replaced by a non-Office file, the
// tests fail loudly instead of the app silently creating a broken
// document.
//
// The test reads the files directly (it is Node code). The server
// wrapper getBlankTemplateBytes (blank-templates.server.ts) reads
// the same files at the same path and is exercised by the live e2e.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BLANK_TEMPLATE_TYPES,
  getTemplateFileName,
  getBlankTemplateType,
  isBlankTemplateExt,
} from "@/lib/blank-templates";
import { ALLOWED_UPLOAD_TYPES } from "@/lib/storage";

function readTemplateBytes(ext: string): Buffer {
  return readFileSync(
    join(process.cwd(), "src", "lib", "blank-templates", `blank.${ext}`)
  );
}

// A minimal ZIP reader: enough to list the entries of a ZIP file
// without a dependency. The local file header is 30 bytes + name +
// extra; the central directory is found by scanning for PK\x01\x02.
function listZipEntries(bytes: Buffer): string[] {
  const names: string[] = [];
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes.readUInt32LE(offset) !== 0x04034b50) break;
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    names.push(bytes.toString("utf8", offset + 30, offset + 30 + nameLength));
    offset += 30 + nameLength + extraLength + compressedSize;
  }
  return names;
}

describe("blank templates", () => {
  it("offers exactly Document, Spreadsheet and Presentation", () => {
    expect(BLANK_TEMPLATE_TYPES.map((t) => t.ext)).toEqual([
      "docx",
      "xlsx",
      "pptx",
    ]);
    expect(BLANK_TEMPLATE_TYPES.map((t) => t.label)).toEqual([
      "Document",
      "Spreadsheet",
      "Presentation",
    ]);
  });

  it("uses the upload MIME types (no second MIME table)", () => {
    for (const type of BLANK_TEMPLATE_TYPES) {
      expect(type.mimeType).toBe(ALLOWED_UPLOAD_TYPES[type.ext]);
    }
  });

  it.each([
    ["docx", "word/document.xml"],
    ["xlsx", "xl/workbook.xml"],
    ["pptx", "ppt/presentation.xml"],
  ] as const)(
    "blank.%s is a valid Office file with its main part",
    (ext, mainPart) => {
      const bytes = readTemplateBytes(ext);
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("PK\x03\x04");
      const entries = listZipEntries(bytes);
      expect(entries).toContain("[Content_Types].xml");
      expect(entries).toContain(mainPart);
      expect(entries).toContain("_rels/.rels");
    }
  );

  it("rejects unknown extensions", () => {
    expect(isBlankTemplateExt("docx")).toBe(true);
    expect(isBlankTemplateExt("pdf")).toBe(false);
    expect(isBlankTemplateExt("")).toBe(false);
    expect(getBlankTemplateType("xlsx")?.label).toBe("Spreadsheet");
  });

  it("builds a safe file name from the title", () => {
    expect(getTemplateFileName("My report", "docx")).toBe(
      "My_report.docx"
    );
    expect(getTemplateFileName("  Quarterly results!  ", "xlsx")).toBe(
      "Quarterly_results_.xlsx"
    );
    expect(getTemplateFileName("", "pptx")).toBe("Untitled.pptx");
    expect(getTemplateFileName("...", "docx")).toBe("Untitled.docx");
  });
});
