import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  applyPdfMetadata,
  readPdfMetadata,
  validateMetadataEdit,
} from "@/lib/pdf-metadata";

async function fixturePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("Metadata fixture", { x: 50, y: 700, size: 16, font });
  doc.setTitle("Original Title");
  doc.setAuthor("Original Author");
  doc.setCreator("Fixture Maker");
  return doc.save();
}

describe("PDF metadata (F29)", () => {
  it("reads the information dictionary", async () => {
    const meta = await readPdfMetadata(await fixturePdf());
    expect(meta.title).toBe("Original Title");
    expect(meta.author).toBe("Original Author");
    expect(meta.creator).toBe("Fixture Maker");
    expect(meta.pageCount).toBe(1);
    expect(meta.createdAt).not.toBeNull();
  });

  it("applies an edit and stamps the modification date", async () => {
    const before = await readPdfMetadata(await fixturePdf());
    const out = await applyPdfMetadata(await fixturePdf(), {
      title: "New Title",
      author: "Anas",
      subject: "A subject",
      keywords: "alpha, beta , gamma",
    });
    const after = await readPdfMetadata(out);
    expect(after.title).toBe("New Title");
    expect(after.author).toBe("Anas");
    expect(after.subject).toBe("A subject");
    expect(after.keywords).toContain("alpha");
    expect(after.keywords).toContain("gamma");
    expect(after.creator).toBe("Fixture Maker");
    expect(after.modifiedAt).not.toBeNull();
    expect(after.modifiedAt! >= (before.modifiedAt ?? "")).toBe(true);
  });

  it("clears a field with an empty string", async () => {
    const out = await applyPdfMetadata(await fixturePdf(), {
      title: "",
      author: "",
      subject: "",
      keywords: "",
    });
    const after = await readPdfMetadata(out);
    expect(after.title).toBe("");
    expect(after.author).toBe("");
  });

  it("validates lengths and types", () => {
    expect(() =>
      validateMetadataEdit({ title: "x".repeat(301) })
    ).toThrow(/too long/);
    expect(() => validateMetadataEdit({ author: 42 })).toThrow(/must be text/);
    expect(validateMetadataEdit({ title: "  Tidy  " }).title).toBe("Tidy");
    expect(validateMetadataEdit({}).author).toBe("");
  });
});
