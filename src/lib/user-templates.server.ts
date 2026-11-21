// User-created templates (Day 31) — server-only.
//
// A custom template is a snapshot of one of the user's own
// documents: the document's file is copied to the template path
// in Storage, and a row in `user_templates` records the name,
// description, file path, MIME type and size.
//
// This module only lists the templates for a workspace (the
// gallery page imports it). The save/apply/delete/rename actions
// live in src/features/library/actions.ts, next to the other
// library actions.
//
// This module uses the Supabase server client and must never be
// imported by a client component.
import "server-only";

import type { LibraryClient } from "@/features/library/queries";
import {
  isMissingTableError,
  LibraryNotReady,
} from "@/features/library/queries";

export type UserTemplateRow = {
  id: string;
  workspace_id: string;
  source_document_id: string | null;
  name: string;
  description: string | null;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  created_by: string;
  created_at: string;
};

/** The workspace's custom templates, newest first. */
export async function listUserTemplates(
  supabase: LibraryClient,
  workspaceId: string
): Promise<UserTemplateRow[]> {
  const { data, error } = await supabase
    .from("user_templates")
    .select(
      "id, workspace_id, source_document_id, name, description, file_path, mime_type, size_bytes, created_by, created_at"
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTableError(error)) throw new LibraryNotReady();
    throw new Error(`Could not load the templates: ${error.message}`);
  }
  return (data ?? []) as UserTemplateRow[];
}

/** One custom template in a workspace, or null. */
export async function getUserTemplateInWorkspace(
  supabase: LibraryClient,
  workspaceId: string,
  templateId: string
): Promise<UserTemplateRow | null> {
  const { data, error } = await supabase
    .from("user_templates")
    .select(
      "id, workspace_id, source_document_id, name, description, file_path, mime_type, size_bytes, created_by, created_at"
    )
    .eq("id", templateId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) throw new LibraryNotReady();
    throw new Error(`Could not load the template: ${error.message}`);
  }
  return data as UserTemplateRow | null;
}
