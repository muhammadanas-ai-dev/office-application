// Unit tests for the template registry (Day 16).
//
// These tests prove the committed template files are real, valid
// Office files and that their previews match them — not just bytes
// that happen to exist. If a template is ever deleted, corrupted,
// or replaced, the tests fail loudly instead of the gallery showing
// a broken template.
//
// The test reads the files directly (it is Node code). The server
// wrapper getTemplateBytes (templates.server.ts) reads the same
// files at the same path and is exercised by the live e2e.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATES, getTemplate, isTemplateId } from "@/lib/templates";

function readTemplateBytes(fileName: string): Buffer {
  return readFileSync(join(process.cwd(), "src", "lib", "templates", fileName));
}

function readThumbnailBytes(thumbnailPath: string): Buffer {
  return readFileSync(join(process.cwd(), "public", thumbnailPath));
}

// A minimal ZIP reader: enough to list the entries of a ZIP file
// without a dependency. (Same helper as the blank-template tests.)
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

describe("template registry", () => {
  it("lists exactly the three first templates", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["resume", "letter", "report"]);
    expect(TEMPLATES.map((t) => t.name)).toEqual([
      "Professional Resume",
      "Formal Business Letter",
      "Business Report",
    ]);
  });

  it("rejects unknown template ids", () => {
    expect(isTemplateId("resume")).toBe(true);
    expect(isTemplateId("invoice")).toBe(false);
    expect(isTemplateId("")).toBe(false);
    expect(getTemplate("report").name).toBe("Business Report");
  });

  it.each(TEMPLATES)(
    "$id: the file is a valid DOCX with its main part",
    (template) => {
      const bytes = readTemplateBytes(template.fileName);
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("PK\x03\x04");
      const entries = listZipEntries(bytes);
      expect(entries).toContain("[Content_Types].xml");
      expect(entries).toContain("word/document.xml");
    }
  );

  it.each(TEMPLATES)("$id: the thumbnail is a valid PNG", (template) => {
    const bytes = readThumbnailBytes(template.thumbnailPath);
    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(bytes.length).toBeGreaterThan(10_000);
  });

  it.each(TEMPLATES)(
    "$id: the preview is non-empty and structured",
    (template) => {
      expect(template.preview.length).toBeGreaterThan(5);
      for (const entry of template.preview) {
        expect(entry.text.length).toBeGreaterThan(0);
        expect(entry.style.length).toBeGreaterThan(0);
      }
    }
  );

  it.each([
    ["resume", "Title", "[Your Full Name]"],
    ["letter", "Normal", "[Your Full Name]"],
    ["report", "Title", "[Report Title]"],
  ] as const)(
    "$id: the preview starts with the template's first line",
    (id, style, text) => {
      const template = getTemplate(id);
      expect(template.preview[0]).toEqual({ style, text });
    }
  );

  it("the resume preview contains its section headings", () => {
    const headings = getTemplate("resume")
      .preview.filter((e) => e.style === "Heading1")
      .map((e) => e.text);
    expect(headings).toEqual([
      "Professional Summary",
      "Experience",
      "Education",
      "Skills",
    ]);
  });

  it("the report preview contains its results table", () => {
    const table = getTemplate("report").preview.find(
      (e) => e.style === "Table" && e.text.startsWith("Quarter")
    );
    expect(table?.text).toBe("Quarter | Revenue | Growth");
  });
});
