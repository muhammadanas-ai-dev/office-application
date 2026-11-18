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

export const applyTemplateSchema = z.object({
  // The template id (Day 16). An unknown id is rejected, not
  // silently defaulted — the registry is the source of truth.
  templateId: z.enum(["resume", "letter", "report"]),
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
