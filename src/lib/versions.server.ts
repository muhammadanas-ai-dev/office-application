// Versions UI (Day 23) — server-only helpers.
//
// The versions are immutable rows in the document_versions
// table (one per saved file). This module reads them through
// the user's client (RLS) and restores one — restoring downloads
// the old version's file and saves it as a NEW version (the
// saveNewVersion pattern, but with the version's actual mime
// type, not PDF). It never overwrites and never deletes.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  DOCUMENTS_BUCKET,
  buildStoragePath,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";
import { PdfEditError } from "@/lib/pdf-edit";
import { isRestorable } from "@/lib/versions";

/** One version row, as the versions page lists it. */
export interface DocumentVersionRow {
  version_number: number;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  created_by: string | null;
}

/**
 * Load a document's versions through the user's client (RLS),
 * newest first.
 */
export async function fetchDocumentVersions(
  userClient: Awaited<
    ReturnType<typeof import("@/lib/supabase/server").createClient>
  >,
  documentId: string
): Promise<DocumentVersionRow[]> {
  const { data, error } = await userClient
    .from("document_versions")
    .select(
      "version_number, file_path, mime_type, size_bytes, created_at, created_by"
    )
    .eq("document_id", documentId)
    .order("version_number", { ascending: false });
  if (error) {
    throw new PdfEditError(500, "Could not load this document's versions.");
  }
  return (data ?? []) as DocumentVersionRow[];
}

/**
 * Restore a version: download the old version's file and save
 * it as a NEW version (current + 1). The old versions stay,
 * and the restore itself is a new version in the list. Returns
 * the new version number.
 */
export async function restoreVersion(
  userClient: Awaited<
    ReturnType<typeof import("@/lib/supabase/server").createClient>
  >,
  documentId: string,
  versionNumber: number,
  userId: string
): Promise<number> {
  const { data: document, error: docError } = await userClient
    .from("documents")
    .select("id, workspace_id, version, title, mime_type")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (docError) {
    throw new PdfEditError(500, "Could not load this document.");
  }
  if (!document) {
    throw new PdfEditError(404, "Document not found");
  }
  if (!isRestorable(versionNumber, document.version)) {
    throw new PdfEditError(400, "This version is already the current one.");
  }
  const { data: version, error: versionError } = await userClient
    .from("document_versions")
    .select("version_number, file_path, mime_type, size_bytes")
    .eq("document_id", documentId)
    .eq("version_number", versionNumber)
    .maybeSingle();
  if (versionError) {
    throw new PdfEditError(500, "Could not load this version.");
  }
  if (!version) {
    throw new PdfEditError(404, "Version not found");
  }
  const mimeType = version.mime_type ?? document.mime_type ?? "application/pdf";

  // Download the old version's file (the admin client — the
  // file is in the private bucket).
  const admin = createAdminClient();
  const { data: blob, error: downloadError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .download(version.file_path);
  if (downloadError || !blob) {
    throw new PdfEditError(500, "Could not read this version's file.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
    throw new PdfEditError(
      400,
      "This version's file is empty or larger than the 50 MB limit."
    );
  }

  // Save it as a NEW version (the saveNewVersion pattern, with
  // the version's mime type).
  const newVersion = document.version + 1;
  const newPath = buildStoragePath(
    document.workspace_id,
    document.id,
    newVersion,
    document.title
  );
  const { error: uploadError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(newPath, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) {
    throw new PdfEditError(500, "Could not save the restored version.");
  }
  const { error: insertError } = await admin.from("document_versions").insert({
    document_id: document.id,
    workspace_id: document.workspace_id,
    version_number: newVersion,
    file_path: newPath,
    size_bytes: bytes.length,
    mime_type: mimeType,
    created_by: userId,
  });
  if (insertError) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([newPath]);
    throw new PdfEditError(500, "Could not record the restored version.");
  }
  const { error: updateError } = await admin
    .from("documents")
    .update({
      version: newVersion,
      file_path: newPath,
      size_bytes: bytes.length,
      mime_type: mimeType,
    })
    .eq("id", document.id)
    .eq("version", document.version);
  if (updateError) {
    throw new PdfEditError(
      500,
      "The document changed while restoring — please reload and try again."
    );
  }
  return newVersion;
}
