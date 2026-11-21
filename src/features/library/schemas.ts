// Zod schemas for library server actions (Day 4).
//
// Server actions are untrusted entry points: every id and name is
// validated here, and membership is re-checked against the database
// inside each action (RLS is the real enforcement; these schemas only
// reject malformed input early).
import { z } from "zod";

const uuid = z.uuid();
const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

export const folderNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the folder a name.")
    .max(100, "Folder names are at most 100 characters."),
  parentId: optionalUuid,
});

export const renameFolderSchema = z.object({
  folderId: uuid,
  name: z
    .string()
    .trim()
    .min(1, "Give the folder a name.")
    .max(100, "Folder names are at most 100 characters."),
});

export const moveFolderSchema = z.object({
  folderId: uuid,
  targetParentId: optionalUuid,
});

export const folderIdSchema = z.object({
  folderId: uuid,
});

export const documentTitleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the document a title.")
    .max(200, "Titles are at most 200 characters."),
  // The blank-document type (Day 15). A missing type means a
  // Document; an unknown type is rejected, not silently defaulted.
  type: z.enum(["docx", "xlsx", "pptx"]).default("docx"),
  folderId: optionalUuid,
});

export const renameDocumentSchema = z.object({
  documentId: uuid,
  title: z
    .string()
    .trim()
    .min(1, "Give the document a title.")
    .max(200, "Titles are at most 200 characters."),
});

export const moveDocumentSchema = z.object({
  documentId: uuid,
  targetFolderId: optionalUuid,
});

// User-created templates (Day 31). The name is required (at most
// 200 characters, the same limit as a document title); the
// description is optional (at most 500 characters, the same limit
// as the table check).
export const saveAsTemplateSchema = z.object({
  documentId: uuid,
  name: z
    .string()
    .trim()
    .min(1, "Give the template a name.")
    .max(200, "Template names are at most 200 characters."),
  description: z
    .string()
    .trim()
    .max(500, "Descriptions are at most 500 characters.")
    .optional()
    .transform((v) => (v ? v : null)),
});

export const applyUserTemplateSchema = z.object({
  templateId: uuid,
  title: z
    .string()
    .trim()
    .min(1, "Give the document a title.")
    .max(200, "Titles are at most 200 characters."),
  folderId: optionalUuid,
});

export const userTemplateIdSchema = z.object({
  templateId: uuid,
});

export const renameUserTemplateSchema = z.object({
  templateId: uuid,
  name: z
    .string()
    .trim()
    .min(1, "Give the template a name.")
    .max(200, "Template names are at most 200 characters."),
  description: z
    .string()
    .trim()
    .max(500, "Descriptions are at most 500 characters.")
    .optional()
    .transform((v) => (v ? v : null)),
});

export const applyTemplateSchema = z.object({
  // The template id (Day 16, extended Day 30). An unknown id is
  // rejected, not silently defaulted — the registry is the source
  // of truth, and the schema test fails until this enum matches it.
  templateId: z.enum([
    "resume",
    "letter",
    "report",
    "proposal",
    "invoice",
    "minutes",
    "certificate",
    "budget",
    "pitch",
  ]),
  title: z
    .string()
    .trim()
    .min(1, "Give the document a title.")
    .max(200, "Titles are at most 200 characters."),
  folderId: optionalUuid,
});

export const documentIdSchema = z.object({
  documentId: uuid,
});

export const toggleStarSchema = z.object({
  documentId: uuid,
  starred: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const uploadDocumentSchema = z.object({
  folderId: optionalUuid,
});
