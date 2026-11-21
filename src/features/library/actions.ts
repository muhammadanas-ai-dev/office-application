// Library server actions (Day 4).
//
// Every action re-authenticates with getUser() and re-checks
// workspace membership through the user's own client, so RLS is the
// enforcement — the UI never decides access. Real errors are logged
// server-side only; the browser gets a short generic message.
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateFileSignature } from "@/lib/file-signatures";
import { logError } from "@/lib/log";
import {
  ALLOWED_UPLOAD_TYPES,
  buildStoragePath,
  buildTemplateStoragePath,
  DOCUMENTS_BUCKET,
  validateUpload,
} from "@/lib/storage";
import {
  getCurrentWorkspace,
  getDocumentInWorkspace,
  getUserRole,
  isMissingTableError,
  LibraryNotReady,
  type LibraryClient,
} from "@/features/library/queries";
import {
  getTemplateFileName,
  getBlankTemplateType,
} from "@/lib/blank-templates";
import { getBlankTemplateBytes } from "@/lib/blank-templates.server";
import { getTemplateBytes } from "@/lib/templates.server";
import { getTemplate } from "@/lib/templates";
import { getUserTemplateInWorkspace } from "@/lib/user-templates.server";
import {
  applyTemplateSchema,
  applyUserTemplateSchema,
  documentIdSchema,
  documentTitleSchema,
  folderIdSchema,
  folderNameSchema,
  moveDocumentSchema,
  moveFolderSchema,
  renameDocumentSchema,
  renameFolderSchema,
  renameUserTemplateSchema,
  saveAsTemplateSchema,
  toggleStarSchema,
  uploadDocumentSchema,
  userTemplateIdSchema,
} from "@/features/library/schemas";

export type ActionResult = { ok: true } | { ok: false; error: string };

const SETUP_PENDING_ERROR =
  "The library is not set up yet — apply the Day 3 and Day 4 migrations in the Supabase dashboard first.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

function toActionError(error: unknown): ActionResult {
  if (error instanceof LibraryNotReady) {
    return { ok: false, error: SETUP_PENDING_ERROR };
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    isMissingTableError(error as { code?: string })
  ) {
    return { ok: false, error: SETUP_PENDING_ERROR };
  }
  logError("library.action", error);
  return { ok: false, error: GENERIC_ERROR };
}

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

async function authedWorkspace() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const workspace = await getCurrentWorkspace(supabase, user.id);
  if (!workspace) throw new Error("No workspace yet");
  return { supabase, user, workspace };
}

function revalidateLibrary() {
  for (const path of [
    "/files",
    "/home",
    "/recent",
    "/starred",
    "/trash",
    "/templates",
  ]) {
    revalidatePath(path);
  }
}

/** All folder ids in a subtree (the folder itself + descendants). */
async function subtreeFolderIds(
  supabase: LibraryClient,
  workspaceId: string,
  rootId: string,
  includeDeleted = false
): Promise<string[]> {
  let query = supabase
    .from("folders")
    .select("id, parent_id")
    .eq("workspace_id", workspaceId);
  if (!includeDeleted) query = query.is("deleted_at", null);
  const { data: folders, error } = await query;
  if (error) throw error;
  const children = new Map<string | null, string[]>();
  for (const folder of folders ?? []) {
    const list = children.get(folder.parent_id) ?? [];
    list.push(folder.id);
    children.set(folder.parent_id, list);
  }
  const ids: string[] = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const child of children.get(current) ?? []) {
      ids.push(child);
      queue.push(child);
    }
  }
  return ids;
}

async function requireEditorRole(
  supabase: LibraryClient,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const role = await getUserRole(supabase, workspaceId, userId);
  return role === "owner" || role === "admin" || role === "editor";
}

async function requireOwnerOrAdmin(
  supabase: LibraryClient,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const role = await getUserRole(supabase, workspaceId, userId);
  return role === "owner" || role === "admin";
}

// ------------------------------------------------------------------
// Folders
// ------------------------------------------------------------------

export async function createFolder(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = folderNameSchema.safeParse(formValues(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      };
    }
    const { supabase, user, workspace } = await authedWorkspace();
    if (!(await requireEditorRole(supabase, workspace.id, user.id))) {
      return { ok: false, error: "Your role does not allow creating folders." };
    }
    if (parsed.data.parentId) {
      const { data: parent, error } = await supabase
        .from("folders")
        .select("id")
        .eq("id", parsed.data.parentId)
        .eq("workspace_id", workspace.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!parent) return { ok: false, error: "That folder does not exist." };
    }
    const { error } = await supabase.from("folders").insert({
      workspace_id: workspace.id,
      parent_id: parsed.data.parentId,
      name: parsed.data.name,
      created_by: user.id,
    });
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: "A folder with that name already exists here.",
        };
      }
      throw error;
    }
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function renameFolder(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = renameFolderSchema.safeParse(formValues(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      };
    }
    const { supabase, workspace } = await authedWorkspace();
    const { error } = await supabase
      .from("folders")
      .update({ name: parsed.data.name })
      .eq("id", parsed.data.folderId)
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null);
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: "A folder with that name already exists here.",
        };
      }
      throw error;
    }
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function moveFolder(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = moveFolderSchema.safeParse(formValues(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      };
    }
    const { folderId, targetParentId } = parsed.data;
    if (targetParentId === folderId) {
      return { ok: false, error: "A folder cannot be moved into itself." };
    }
    const { supabase, workspace } = await authedWorkspace();
    if (targetParentId) {
      const subtree = await subtreeFolderIds(supabase, workspace.id, folderId);
      if (subtree.includes(targetParentId)) {
        return {
          ok: false,
          error: "A folder cannot be moved into one of its own subfolders.",
        };
      }
      const { data: target, error } = await supabase
        .from("folders")
        .select("id")
        .eq("id", targetParentId)
        .eq("workspace_id", workspace.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!target) return { ok: false, error: "That folder does not exist." };
    }
    const { error } = await supabase
      .from("folders")
      .update({ parent_id: targetParentId })
      .eq("id", folderId)
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null);
    if (error) throw error;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteFolder(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = folderIdSchema.safeParse(formValues(formData));
    if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
    const { supabase, workspace } = await authedWorkspace();
    const ids = await subtreeFolderIds(
      supabase,
      workspace.id,
      parsed.data.folderId
    );
    const now = new Date().toISOString();
    const { error: folderError } = await supabase
      .from("folders")
      .update({ deleted_at: now })
      .in("id", ids)
      .eq("workspace_id", workspace.id);
    if (folderError) throw folderError;
    const { error: docError } = await supabase
      .from("documents")
      .update({ deleted_at: now })
      .in("folder_id", ids)
      .eq("workspace_id", workspace.id);
    if (docError) throw docError;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function restoreFolder(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = folderIdSchema.safeParse(formValues(formData));
    if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
    const { supabase, workspace } = await authedWorkspace();
    const ids = await subtreeFolderIds(
      supabase,
      workspace.id,
      parsed.data.folderId,
      true
    );
    // Restore ancestors too, or the folder would stay hidden under a
    // deleted parent. Ancestors may themselves be deleted, so this
    // walk queries without the deleted filter.
    const { data: trashedFolder } = await supabase
      .from("folders")
      .select("parent_id")
      .eq("id", parsed.data.folderId)
      .eq("workspace_id", workspace.id)
      .maybeSingle();
    let parentId = trashedFolder?.parent_id ?? null;
    const ancestorIds: string[] = [];
    while (parentId) {
      ancestorIds.push(parentId);
      const { data: parent } = await supabase
        .from("folders")
        .select("parent_id")
        .eq("id", parentId)
        .eq("workspace_id", workspace.id)
        .maybeSingle();
      parentId = parent?.parent_id ?? null;
    }
    const restoreIds = [...new Set([...ids, ...ancestorIds])];
    const { error: folderError } = await supabase
      .from("folders")
      .update({ deleted_at: null })
      .in("id", restoreIds)
      .eq("workspace_id", workspace.id);
    if (folderError) throw folderError;
    const { error: docError } = await supabase
      .from("documents")
      .update({ deleted_at: null })
      .in("folder_id", ids)
      .eq("workspace_id", workspace.id);
    if (docError) throw docError;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function permanentDeleteFolder(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = folderIdSchema.safeParse(formValues(formData));
    if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
    const { supabase, user, workspace } = await authedWorkspace();
    if (!(await requireOwnerOrAdmin(supabase, workspace.id, user.id))) {
      return {
        ok: false,
        error: "Only the workspace owner or an admin can permanently delete.",
      };
    }
    const ids = await subtreeFolderIds(
      supabase,
      workspace.id,
      parsed.data.folderId,
      true
    );
    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select("id")
      .in("folder_id", ids)
      .eq("workspace_id", workspace.id);
    if (docsError) throw docsError;
    for (const doc of docs ?? []) {
      await removeDocumentFiles(supabase, workspace.id, doc.id);
    }
    const { error: docDeleteError } = await supabase
      .from("documents")
      .delete()
      .in("folder_id", ids)
      .eq("workspace_id", workspace.id);
    if (docDeleteError) throw docDeleteError;
    const { error: folderError } = await supabase
      .from("folders")
      .delete()
      .eq("id", parsed.data.folderId)
      .eq("workspace_id", workspace.id);
    if (folderError) throw folderError;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

// ------------------------------------------------------------------
// Documents
// ------------------------------------------------------------------

export async function createDocument(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = documentTitleSchema.safeParse(formValues(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      };
    }
    const { supabase, user, workspace } = await authedWorkspace();
    if (!(await requireEditorRole(supabase, workspace.id, user.id))) {
      return {
        ok: false,
        error: "Your role does not allow creating documents.",
      };
    }
    if (parsed.data.folderId) {
      const { data: folder, error } = await supabase
        .from("folders")
        .select("id")
        .eq("id", parsed.data.folderId)
        .eq("workspace_id", workspace.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!folder) return { ok: false, error: "That folder does not exist." };
    }
    // A blank document is a real file, not a title-only row: the
    // template bytes for the chosen type are uploaded as version 1,
    // so the new document opens in the editor like any upload.
    const template = getBlankTemplateType(parsed.data.type);
    if (!template) return { ok: false, error: GENERIC_ERROR };
    const bytes = getBlankTemplateBytes(parsed.data.type);
    const documentId = crypto.randomUUID();
    const fileName = getTemplateFileName(parsed.data.title, parsed.data.type);
    const filePath = buildStoragePath(workspace.id, documentId, 1, fileName);
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(filePath, bytes, { contentType: template.mimeType });
    if (uploadError) throw uploadError;
    const { error: docError } = await supabase.from("documents").insert({
      id: documentId,
      workspace_id: workspace.id,
      folder_id: parsed.data.folderId,
      title: parsed.data.title,
      file_path: filePath,
      mime_type: template.mimeType,
      size_bytes: bytes.length,
      version: 1,
      created_by: user.id,
    });
    if (docError) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
      throw docError;
    }
    const { error: versionError } = await supabase
      .from("document_versions")
      .insert({
        document_id: documentId,
        workspace_id: workspace.id,
        version_number: 1,
        file_path: filePath,
        mime_type: template.mimeType,
        size_bytes: bytes.length,
        created_by: user.id,
      });
    if (versionError) throw versionError;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

// Apply a template (Day 16): create a new document from one of
// Forma's own template files, the same way createDocument creates
// one from a blank file. The template id is validated against the
// registry; an unknown id is rejected, not silently defaulted.
export async function applyTemplate(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = applyTemplateSchema.safeParse(formValues(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      };
    }
    const { supabase, user, workspace } = await authedWorkspace();
    if (!(await requireEditorRole(supabase, workspace.id, user.id))) {
      return {
        ok: false,
        error: "Your role does not allow creating documents.",
      };
    }
    if (parsed.data.folderId) {
      const { data: folder, error } = await supabase
        .from("folders")
        .select("id")
        .eq("id", parsed.data.folderId)
        .eq("workspace_id", workspace.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!folder) return { ok: false, error: "That folder does not exist." };
    }
    const template = getTemplate(parsed.data.templateId);
    const bytes = getTemplateBytes(parsed.data.templateId);
    const documentId = crypto.randomUUID();
    const fileName = getTemplateFileName(parsed.data.title, template.fileType);
    const filePath = buildStoragePath(workspace.id, documentId, 1, fileName);
    // The new document has the template's own file type (docx, xlsx
    // or pptx) — the MIME type comes from the upload list by extension,
    // so a budget tracker is stored as a spreadsheet and a pitch deck
    // as a presentation, not as a Word document.
    const mimeType = ALLOWED_UPLOAD_TYPES[template.fileType];
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(filePath, bytes, { contentType: mimeType });
    if (uploadError) throw uploadError;
    const { error: docError } = await supabase.from("documents").insert({
      id: documentId,
      workspace_id: workspace.id,
      folder_id: parsed.data.folderId,
      title: parsed.data.title,
      file_path: filePath,
      mime_type: mimeType,
      size_bytes: bytes.length,
      version: 1,
      created_by: user.id,
    });
    if (docError) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
      throw docError;
    }
    const { error: versionError } = await supabase
      .from("document_versions")
      .insert({
        document_id: documentId,
        workspace_id: workspace.id,
        version_number: 1,
        file_path: filePath,
        mime_type: mimeType,
        size_bytes: bytes.length,
        created_by: user.id,
      });
    if (versionError) throw versionError;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

// ------------------------------------------------------------------
// User-created templates (Day 31)
// ------------------------------------------------------------------

// Save one of the user's own documents as a reusable template.
// The document's current file is COPIED to the template path in
// Storage (a snapshot — editing the document later never changes
// the template), and a row in `user_templates` records the name,
// description, file path, MIME type and size. If the row insert
// fails, the copied file is removed again, so a failed save leaves
// nothing behind.
export async function saveAsTemplate(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = saveAsTemplateSchema.safeParse(formValues(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      };
    }
    const { supabase, user, workspace } = await authedWorkspace();
    const doc = await getDocumentInWorkspace(
      supabase,
      workspace.id,
      parsed.data.documentId
    );
    if (!doc) return { ok: false, error: "That document does not exist." };
    if (!doc.file_path) {
      return {
        ok: false,
        error:
          "That document has no file yet, so it cannot be saved as a template.",
      };
    }
    if (!doc.mime_type || !doc.size_bytes) {
      return {
        ok: false,
        error:
          "That document has no file yet, so it cannot be saved as a template.",
      };
    }
    if (!(await requireEditorRole(supabase, workspace.id, user.id))) {
      return {
        ok: false,
        error: "Your role does not allow saving templates.",
      };
    }
    const templateId = crypto.randomUUID();
    const fileName = doc.file_path.split("/").pop() ?? "file";
    const templatePath = buildTemplateStoragePath(
      workspace.id,
      templateId,
      fileName
    );
    const { error: copyError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .copy(doc.file_path, templatePath);
    if (copyError) throw copyError;
    const { error: insertError } = await supabase
      .from("user_templates")
      .insert({
        id: templateId,
        workspace_id: workspace.id,
        source_document_id: doc.id,
        name: parsed.data.name,
        description: parsed.data.description,
        file_path: templatePath,
        mime_type: doc.mime_type,
        size_bytes: doc.size_bytes,
        created_by: user.id,
      });
    if (insertError) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([templatePath]);
      throw insertError;
    }
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

// Create a new document in the library from a user-created
// template. The template file is copied inside Storage to the new
// document's version-1 path (no download/upload round-trip), and
// the document + version-1 row are inserted; a failed insert
// removes the copied file again. The template itself is never
// changed.
export async function applyUserTemplate(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = applyUserTemplateSchema.safeParse(formValues(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      };
    }
    const { supabase, user, workspace } = await authedWorkspace();
    const template = await getUserTemplateInWorkspace(
      supabase,
      workspace.id,
      parsed.data.templateId
    );
    if (!template) return { ok: false, error: "That template does not exist." };
    if (!(await requireEditorRole(supabase, workspace.id, user.id))) {
      return {
        ok: false,
        error: "Your role does not allow creating documents.",
      };
    }
    if (parsed.data.folderId) {
      const { data: folder, error } = await supabase
        .from("folders")
        .select("id")
        .eq("id", parsed.data.folderId)
        .eq("workspace_id", workspace.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!folder) return { ok: false, error: "That folder does not exist." };
    }
    const documentId = crypto.randomUUID();
    const fileName = template.file_path.split("/").pop() ?? "file";
    const filePath = buildStoragePath(workspace.id, documentId, 1, fileName);
    const { error: copyError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .copy(template.file_path, filePath);
    if (copyError) throw copyError;
    const { error: docError } = await supabase.from("documents").insert({
      id: documentId,
      workspace_id: workspace.id,
      folder_id: parsed.data.folderId,
      title: parsed.data.title,
      file_path: filePath,
      mime_type: template.mime_type,
      size_bytes: template.size_bytes,
      version: 1,
      created_by: user.id,
    });
    if (docError) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
      throw docError;
    }
    const { error: versionError } = await supabase
      .from("document_versions")
      .insert({
        document_id: documentId,
        workspace_id: workspace.id,
        version_number: 1,
        file_path: filePath,
        mime_type: template.mime_type,
        size_bytes: template.size_bytes,
        created_by: user.id,
      });
    if (versionError) throw versionError;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

// Delete a user-created template: the row and its Storage file are
// both removed. Deleting the template never touches the document
// it was saved from.
export async function deleteUserTemplate(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = userTemplateIdSchema.safeParse(formValues(formData));
    if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
    const { supabase, user, workspace } = await authedWorkspace();
    const template = await getUserTemplateInWorkspace(
      supabase,
      workspace.id,
      parsed.data.templateId
    );
    if (!template) return { ok: false, error: "That template does not exist." };
    if (!(await requireEditorRole(supabase, workspace.id, user.id))) {
      return {
        ok: false,
        error: "Your role does not allow deleting templates.",
      };
    }
    const { error: deleteError } = await supabase
      .from("user_templates")
      .delete()
      .eq("id", template.id)
      .eq("workspace_id", workspace.id);
    if (deleteError) throw deleteError;
    const { error: removeError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .remove([template.file_path]);
    if (removeError) throw removeError;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

// Rename a user-created template (name + description). The file
// itself is never touched.
export async function renameUserTemplate(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = renameUserTemplateSchema.safeParse(formValues(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      };
    }
    const { supabase, user, workspace } = await authedWorkspace();
    const template = await getUserTemplateInWorkspace(
      supabase,
      workspace.id,
      parsed.data.templateId
    );
    if (!template) return { ok: false, error: "That template does not exist." };
    if (!(await requireEditorRole(supabase, workspace.id, user.id))) {
      return {
        ok: false,
        error: "Your role does not allow renaming templates.",
      };
    }
    const { error } = await supabase
      .from("user_templates")
      .update({
        name: parsed.data.name,
        description: parsed.data.description,
      })
      .eq("id", template.id)
      .eq("workspace_id", workspace.id);
    if (error) throw error;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function renameDocument(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = renameDocumentSchema.safeParse(formValues(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      };
    }
    const { supabase, workspace } = await authedWorkspace();
    const { error } = await supabase
      .from("documents")
      .update({ title: parsed.data.title })
      .eq("id", parsed.data.documentId)
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null);
    if (error) throw error;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function moveDocument(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = moveDocumentSchema.safeParse(formValues(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      };
    }
    const { supabase, workspace } = await authedWorkspace();
    if (parsed.data.targetFolderId) {
      const { data: folder, error } = await supabase
        .from("folders")
        .select("id")
        .eq("id", parsed.data.targetFolderId)
        .eq("workspace_id", workspace.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!folder) return { ok: false, error: "That folder does not exist." };
    }
    const { error } = await supabase
      .from("documents")
      .update({ folder_id: parsed.data.targetFolderId })
      .eq("id", parsed.data.documentId)
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null);
    if (error) throw error;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateDocument(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = documentIdSchema.safeParse(formValues(formData));
    if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
    const { supabase, user, workspace } = await authedWorkspace();
    const doc = await getDocumentInWorkspace(
      supabase,
      workspace.id,
      parsed.data.documentId
    );
    if (!doc) return { ok: false, error: "That document does not exist." };
    if (!(await requireEditorRole(supabase, workspace.id, user.id))) {
      return {
        ok: false,
        error: "Your role does not allow duplicating documents.",
      };
    }
    const newId = crypto.randomUUID();
    let filePath: string | null = null;
    if (doc.file_path) {
      const fileName = doc.file_path.split("/").pop() ?? "file";
      filePath = buildStoragePath(workspace.id, newId, 1, fileName);
      const { error: copyError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .copy(doc.file_path, filePath);
      if (copyError) throw copyError;
    }
    const { error: insertError } = await supabase.from("documents").insert({
      id: newId,
      workspace_id: workspace.id,
      folder_id: doc.folder_id,
      title: `${doc.title} copy`,
      file_path: filePath,
      mime_type: doc.mime_type,
      size_bytes: doc.size_bytes,
      version: 1,
      created_by: user.id,
    });
    if (insertError) {
      if (filePath) {
        await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
      }
      throw insertError;
    }
    if (filePath) {
      const { error: versionError } = await supabase
        .from("document_versions")
        .insert({
          document_id: newId,
          workspace_id: workspace.id,
          version_number: 1,
          file_path: filePath,
          mime_type: doc.mime_type,
          size_bytes: doc.size_bytes,
          created_by: user.id,
        });
      if (versionError) throw versionError;
    }
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteDocument(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = documentIdSchema.safeParse(formValues(formData));
    if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
    const { supabase, workspace } = await authedWorkspace();
    const { error } = await supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", parsed.data.documentId)
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null);
    if (error) throw error;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function restoreDocument(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = documentIdSchema.safeParse(formValues(formData));
    if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
    const { supabase, workspace } = await authedWorkspace();
    const { error } = await supabase
      .from("documents")
      .update({ deleted_at: null })
      .eq("id", parsed.data.documentId)
      .eq("workspace_id", workspace.id)
      .not("deleted_at", "is", null);
    if (error) throw error;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function permanentDeleteDocument(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = documentIdSchema.safeParse(formValues(formData));
    if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
    const { supabase, user, workspace } = await authedWorkspace();
    if (!(await requireOwnerOrAdmin(supabase, workspace.id, user.id))) {
      return {
        ok: false,
        error: "Only the workspace owner or an admin can permanently delete.",
      };
    }
    await removeDocumentFiles(supabase, workspace.id, parsed.data.documentId);
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", parsed.data.documentId)
      .eq("workspace_id", workspace.id);
    if (error) throw error;
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

/** Remove every stored file version of a document (best effort). */
async function removeDocumentFiles(
  supabase: LibraryClient,
  workspaceId: string,
  documentId: string
): Promise<void> {
  const { data: versions, error } = await supabase
    .from("document_versions")
    .select("file_path")
    .eq("document_id", documentId)
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  const paths = (versions ?? []).map((v) => v.file_path);
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .remove(paths);
    if (removeError) {
      logError("library.storageCleanup", removeError);
    }
  }
}

export async function toggleStar(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = toggleStarSchema.safeParse(formValues(formData));
    if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
    const { supabase, user, workspace } = await authedWorkspace();
    const doc = await getDocumentInWorkspace(
      supabase,
      workspace.id,
      parsed.data.documentId
    );
    if (!doc) return { ok: false, error: "That document does not exist." };
    if (parsed.data.starred) {
      const { error } = await supabase.from("document_stars").insert({
        document_id: parsed.data.documentId,
        user_id: user.id,
      });
      if (error && error.code !== "23505") throw error;
    } else {
      const { error } = await supabase
        .from("document_stars")
        .delete()
        .eq("document_id", parsed.data.documentId)
        .eq("user_id", user.id);
      if (error) throw error;
    }
    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

// ------------------------------------------------------------------
// Upload
// ------------------------------------------------------------------

export async function uploadDocument(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const parsed = uploadDocumentSchema.safeParse(formValues(formData));
    if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, error: "Choose a file to upload." };
    }
    const validation = validateUpload(file);
    if (!validation.ok) return { ok: false, error: validation.error };
    // The byte-signature check (Day 27 hardening): the extension
    // and the declared MIME type are attacker-controlled, so the
    // file's actual bytes must match the extension it claims.
    // A PNG renamed to .pdf is refused here, before anything is
    // written to Storage or the database.
    const signature = validateFileSignature(
      new Uint8Array(await file.arrayBuffer()),
      validation.extension
    );
    if (!signature.ok) return { ok: false, error: signature.error };

    const { supabase, user, workspace } = await authedWorkspace();
    if (!(await requireEditorRole(supabase, workspace.id, user.id))) {
      return { ok: false, error: "Your role does not allow uploading files." };
    }
    if (parsed.data.folderId) {
      const { data: folder, error } = await supabase
        .from("folders")
        .select("id")
        .eq("id", parsed.data.folderId)
        .eq("workspace_id", workspace.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!folder) return { ok: false, error: "That folder does not exist." };
    }

    const documentId = crypto.randomUUID();
    const filePath = buildStoragePath(workspace.id, documentId, 1, file.name);
    const title = file.name.replace(/\.[^.]+$/, "") || file.name;

    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(filePath, file, { contentType: validation.mimeType });
    if (uploadError) throw uploadError;

    const { error: docError } = await supabase.from("documents").insert({
      id: documentId,
      workspace_id: workspace.id,
      folder_id: parsed.data.folderId,
      title,
      file_path: filePath,
      mime_type: validation.mimeType,
      size_bytes: file.size,
      version: 1,
      created_by: user.id,
    });
    if (docError) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
      throw docError;
    }
    const { error: versionError } = await supabase
      .from("document_versions")
      .insert({
        document_id: documentId,
        workspace_id: workspace.id,
        version_number: 1,
        file_path: filePath,
        mime_type: validation.mimeType,
        size_bytes: file.size,
        created_by: user.id,
      });
    if (versionError) throw versionError;

    revalidateLibrary();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
