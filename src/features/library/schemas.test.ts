import { describe, expect, it } from "vitest";
import {
  applyTemplateSchema,
  applyUserTemplateSchema,
  documentTitleSchema,
  folderNameSchema,
  moveFolderSchema,
  renameFolderSchema,
  renameUserTemplateSchema,
  saveAsTemplateSchema,
  userTemplateIdSchema,
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
      applyTemplateSchema.safeParse({ templateId: "contract", title: "X" })
        .success
    ).toBe(false);
    // "invoice" is a real template since Day 30, so it must parse.
    expect(
      applyTemplateSchema.safeParse({ templateId: "invoice", title: "X" })
        .success
    ).toBe(true);
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

describe("saveAsTemplateSchema", () => {
  it("accepts a document id, a name and an optional description", () => {
    const result = saveAsTemplateSchema.safeParse({
      documentId: "11111111-1111-4111-8111-111111111111",
      name: "  My contract  ",
      description: "  The standard client contract.  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My contract");
      expect(result.data.description).toBe("The standard client contract.");
    }
  });

  it("treats an empty description as no description", () => {
    const result = saveAsTemplateSchema.safeParse({
      documentId: "11111111-1111-4111-8111-111111111111",
      name: "My contract",
      description: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeNull();
    }
  });

  it("rejects an empty name and a non-uuid document id", () => {
    expect(
      saveAsTemplateSchema.safeParse({
        documentId: "11111111-1111-4111-8111-111111111111",
        name: "   ",
      }).success
    ).toBe(false);
    expect(
      saveAsTemplateSchema.safeParse({
        documentId: "not-a-uuid",
        name: "My contract",
      }).success
    ).toBe(false);
  });
});

describe("applyUserTemplateSchema", () => {
  it("accepts a template id, a title and an optional folder", () => {
    const result = applyUserTemplateSchema.safeParse({
      templateId: "11111111-1111-4111-8111-111111111111",
      title: "  New contract  ",
      folderId: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("New contract");
      expect(result.data.folderId).toBeNull();
    }
  });
});

describe("userTemplateIdSchema", () => {
  it("accepts a uuid template id and rejects anything else", () => {
    expect(
      userTemplateIdSchema.safeParse({
        templateId: "11111111-1111-4111-8111-111111111111",
      }).success
    ).toBe(true);
    expect(
      userTemplateIdSchema.safeParse({ templateId: "not-a-uuid" }).success
    ).toBe(false);
  });
});

describe("renameUserTemplateSchema", () => {
  it("accepts a template id, a name and an optional description", () => {
    const result = renameUserTemplateSchema.safeParse({
      templateId: "11111111-1111-4111-8111-111111111111",
      name: "  Renamed  ",
      description: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Renamed");
      expect(result.data.description).toBeNull();
    }
  });
});
