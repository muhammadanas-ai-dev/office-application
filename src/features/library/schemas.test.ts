import { describe, expect, it } from "vitest";
import {
  applyTemplateSchema,
  documentTitleSchema,
  folderNameSchema,
  moveFolderSchema,
  renameFolderSchema,
} from "@/features/library/schemas";
import { TEMPLATES } from "@/lib/templates";

describe("folderNameSchema", () => {
  it("accepts a name and an optional parent id", () => {
    const result = folderNameSchema.safeParse({
      name: "  Reports  ",
      parentId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Reports");
    }
  });

  it("treats an empty parent id as the workspace root", () => {
    const result = folderNameSchema.safeParse({
      name: "Root folder",
      parentId: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentId).toBeNull();
    }
  });

  it("rejects an empty name and a too-long name", () => {
    expect(folderNameSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(folderNameSchema.safeParse({ name: "x".repeat(101) }).success).toBe(
      false
    );
  });

  it("rejects a malformed parent id", () => {
    expect(
      folderNameSchema.safeParse({ name: "Ok", parentId: "not-a-uuid" }).success
    ).toBe(false);
  });
});

describe("documentTitleSchema", () => {
  it("trims the title and caps it at 200 characters", () => {
    const result = documentTitleSchema.safeParse({ title: "  Q3 Report " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Q3 Report");
    }
    expect(
      documentTitleSchema.safeParse({ title: "x".repeat(201) }).success
    ).toBe(false);
  });

  it("defaults a missing blank-document type to docx", () => {
    const result = documentTitleSchema.safeParse({ title: "New doc" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("docx");
    }
  });

  it("accepts xlsx and pptx, and rejects an unknown type", () => {
    expect(
      documentTitleSchema.safeParse({ title: "Sheet", type: "xlsx" }).success
    ).toBe(true);
    expect(
      documentTitleSchema.safeParse({ title: "Deck", type: "pptx" }).success
    ).toBe(true);
    expect(
      documentTitleSchema.safeParse({ title: "Doc", type: "pdf" }).success
    ).toBe(false);
  });
});

describe("applyTemplateSchema", () => {
  it("accepts a known template id and a title", () => {
    const result = applyTemplateSchema.safeParse({
      templateId: "resume",
      title: "My resume",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.templateId).toBe("resume");
      expect(result.data.title).toBe("My resume");
    }
  });

  it("rejects an unknown template id", () => {
    expect(
      applyTemplateSchema.safeParse({ templateId: "invoice", title: "X" })
        .success
    ).toBe(false);
  });

  it("stays in step with the template registry", () => {
    // The schema's enum is a static list; the registry is the
    // source of truth. If a template is added or removed, this
    // test fails until the schema is updated to match.
    const enumValues = applyTemplateSchema.shape.templateId.options;
    expect([...enumValues].sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
  });
});

describe("renameFolderSchema", () => {
  it("requires a valid folder id", () => {
    expect(
      renameFolderSchema.safeParse({ folderId: "nope", name: "New" }).success
    ).toBe(false);
    expect(
      renameFolderSchema.safeParse({
        folderId: "11111111-1111-4111-8111-111111111111",
        name: "New",
      }).success
    ).toBe(true);
  });
});

describe("moveFolderSchema", () => {
  it("accepts a null target (workspace root)", () => {
    const result = moveFolderSchema.safeParse({
      folderId: "11111111-1111-4111-8111-111111111111",
      targetParentId: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetParentId).toBeNull();
    }
  });
});
