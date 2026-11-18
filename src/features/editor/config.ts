// ONLYOFFICE editor config builder (Day 5) — server-only.
//
// Builds the DocEditor config for one document version, signs it as
// a JWT with the shared ONLYOFFICE secret, and records an editor
// session so the save callback can map the random document key back
// to the document, the user and the version.
//
// The document server fetches the file from /api/editor/file/[id]
// with a short-lived HMAC token, and posts saves to
// /api/editor/callback. Neither URL carries a user session — the
// tokens are the authorization, and both expire within an hour.
import "server-only";
import * as jose from "jose";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FILE_TOKEN_TTL_MS,
  getEditorDocumentType,
  getEditorFileType,
  isEditableDocumentType,
  newDocumentKey,
  signFileToken,
} from "@/lib/editor";
import {
  getDocumentServerUrl,
  getEditorPublicUrl,
  getFileTokenSecret,
  getOnlyOfficeJwtSecret,
} from "@/lib/editor.server";
import type { Database } from "@/types/database.types";

export type EditorDocument = Database["public"]["Tables"]["documents"]["Row"];

export interface EditorConfigResult {
  docServerUrl: string;
  /** The DocEditor config object (without the token). */
  config: Record<string, unknown>;
  /** JWT over the whole config, signed with ONLYOFFICE_JWT_SECRET. */
  token: string;
  /** Random document key recorded in editor_sessions. */
  key: string;
  mode: "edit" | "view";
}

export class EditorNotConfigured extends Error {
  constructor() {
    super("The editor server is not configured");
    this.name = "EditorNotConfigured";
  }
}

/**
 * Build a signed editor config for a document. The caller must
 * already have checked (via the user's client + RLS) that the user
 * may open this document; this function only mints the session.
 */
export async function buildEditorConfig(
  document: EditorDocument,
  user: { id: string; name: string }
): Promise<EditorConfigResult> {
  const docServerUrl = getDocumentServerUrl();
  if (!docServerUrl) throw new EditorNotConfigured();

  const documentType = getEditorDocumentType(document.mime_type);
  const fileType = getEditorFileType(document.mime_type);
  if (!documentType || !fileType) {
    throw new Error("This file format cannot be opened in the editor");
  }
  if (!document.file_path) {
    throw new Error("This document has no file yet");
  }

  const mode = isEditableDocumentType(documentType) ? "edit" : "view";
  const key = newDocumentKey();
  const expiresAt = new Date(Date.now() + FILE_TOKEN_TTL_MS);

  const admin = createAdminClient();
  const { error: sessionError } = await admin.from("editor_sessions").insert({
    key,
    document_id: document.id,
    workspace_id: document.workspace_id,
    user_id: user.id,
    version: document.version,
    expires_at: expiresAt.toISOString(),
  });
  if (sessionError) {
    throw new Error(
      `Could not start an editor session: ${sessionError.message}`
    );
  }

  const fileToken = signFileToken(getFileTokenSecret(), {
    documentId: document.id,
    version: document.version,
    expiresAt: expiresAt.getTime(),
  });
  const publicUrl = getEditorPublicUrl();
  const config: Record<string, unknown> = {
    document: {
      fileType,
      key,
      title: document.title,
      url: `${publicUrl}/api/editor/file/${document.id}?t=${encodeURIComponent(fileToken)}`,
      permissions: {
        download: true,
        edit: mode === "edit",
        print: true,
        review: mode === "edit",
      },
    },
    documentType,
    editorConfig: {
      callbackUrl: `${publicUrl}/api/editor/callback`,
      lang: "en",
      mode,
      user: { id: user.id, name: user.name },
    },
  };

  const token = await new jose.SignJWT(config as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(getOnlyOfficeJwtSecret()));

  return { docServerUrl, config, token, key, mode };
}

/** Look up an editor session (callback path). Returns null if missing. */
export async function getEditorSession(key: string): Promise<{
  key: string;
  document_id: string;
  workspace_id: string;
  user_id: string;
  version: number;
  expires_at: string;
} | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("editor_sessions")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/** Delete an editor session after its save is applied. */
export async function deleteEditorSession(key: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("editor_sessions").delete().eq("key", key);
}
