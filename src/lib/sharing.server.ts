// Single-user sharing server wiring (Day 25) — server-only.
//
// A shareable link is /s/<token>. The database stores only the
// SHA-256 hash of the token (never the token itself). The owner
// manages links through their own client (RLS); the public share
// page reads via the admin client, but ONLY after the token hash
// matches a row — the token itself is the credential, so no user
// session is needed there.
//
// The token is returned ONCE, at creation. After that it is
// unrecoverable — the owner must copy the link when it is shown.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PdfEditError } from "@/lib/pdf-edit";
import {
  expiresAtForChoice,
  getShareUrl,
  hashShareToken,
  isShareExpired,
  isShareExpiryChoice,
  newShareToken,
  type ShareExpiryChoice,
} from "@/lib/sharing";

export type SharingClient = Awaited<ReturnType<typeof createClient>>;

export interface ShareRow {
  id: string;
  document_id: string;
  workspace_id: string;
  token_hash: string;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
}

export interface CreatedShare {
  id: string;
  token: string;
  url: string;
  expiresAt: string | null;
}

/** The user's client (RLS-enforced) for a sharing request. */
export async function getSharingClient(): Promise<SharingClient> {
  return createClient();
}

/** The signed-in user for a sharing request. */
export async function getSharingUser(): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new PdfEditError(401, "Not signed in.");
  }
  return user;
}

/**
 * Load one document through the user's client (RLS decides
 * access). Throws PdfEditError 404 when the document is missing
 * or the user cannot access it.
 */
async function fetchShareableDocument(
  userClient: SharingClient,
  documentId: string
): Promise<{ id: string; workspace_id: string; file_path: string | null }> {
  const { data: document, error } = await userClient
    .from("documents")
    .select("id, workspace_id, file_path")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new PdfEditError(500, "Could not load the document.");
  }
  if (!document || !document.file_path) {
    throw new PdfEditError(404, "Document not found.");
  }
  return document;
}

/**
 * Create a share link for a document. Returns the token ONCE —
 * the database only ever holds its hash, so the link must be
 * copied when it is shown.
 */
export async function createShare(
  userClient: SharingClient,
  documentId: string,
  expiry: ShareExpiryChoice,
  userId: string
): Promise<CreatedShare> {
  const document = await fetchShareableDocument(userClient, documentId);
  const token = newShareToken();
  const expiresAt = expiresAtForChoice(expiry);
  const { data: share, error } = await userClient
    .from("document_shares")
    .insert({
      document_id: document.id,
      workspace_id: document.workspace_id,
      token_hash: hashShareToken(token),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    // A missing table (PGRST205) or a missing column (PGRST204,
    // or 42703 when the schema cache is stale — the Day 24
    // lesson) means the Day 25 migration has not been applied
    // yet.
    if (
      error.code === "PGRST204" ||
      error.code === "PGRST205" ||
      error.code === "42703"
    ) {
      throw new PdfEditError(
        400,
        "Sharing is not set up yet — run forma-shares-migration.sql in the Supabase Dashboard SQL Editor, then try again."
      );
    }
    throw new PdfEditError(500, "Could not create the share link.");
  }
  return {
    id: share.id,
    token,
    url: getShareUrl(token),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
}

/** List a document's share links, newest first (RLS-enforced). */
export async function listShares(
  userClient: SharingClient,
  documentId: string
): Promise<ShareRow[]> {
  const document = await fetchShareableDocument(userClient, documentId);
  const { data: shares, error } = await userClient
    .from("document_shares")
    .select(
      "id, document_id, workspace_id, token_hash, expires_at, created_by, created_at, revoked_at"
    )
    .eq("document_id", document.id)
    .order("created_at", { ascending: false });
  if (error) {
    if (
      error.code === "PGRST204" ||
      error.code === "PGRST205" ||
      error.code === "42703"
    ) {
      throw new PdfEditError(
        400,
        "Sharing is not set up yet — run forma-shares-migration.sql in the Supabase Dashboard SQL Editor, then try again."
      );
    }
    throw new PdfEditError(500, "Could not load the share links.");
  }
  return (shares ?? []) as ShareRow[];
}

/** Revoke a share link (it stops working immediately). */
export async function revokeShare(
  userClient: SharingClient,
  documentId: string,
  shareId: string,
  userId: string
): Promise<void> {
  const document = await fetchShareableDocument(userClient, documentId);
  const { data: share, error } = await userClient
    .from("document_shares")
    .select("id, document_id, created_by")
    .eq("id", shareId)
    .eq("document_id", document.id)
    .maybeSingle();
  if (error) {
    throw new PdfEditError(500, "Could not load the share link.");
  }
  if (!share) {
    throw new PdfEditError(404, "Share link not found.");
  }
  // Only the creator (or a workspace owner/admin, via RLS) may
  // revoke. The RLS update policy enforces workspace membership;
  // the creator check here keeps a plain member from revoking
  // someone else's link.
  if (share.created_by !== userId) {
    throw new PdfEditError(
      403,
      "Only the person who created this link can revoke it."
    );
  }
  const { error: updateError } = await userClient
    .from("document_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId);
  if (updateError) {
    throw new PdfEditError(500, "Could not revoke the share link.");
  }
}

export type ResolvedShare =
  | {
      ok: true;
      document: {
        id: string;
        title: string;
        mime_type: string | null;
        file_path: string;
        size_bytes: number | null;
      };
      expiresAt: string | null;
    }
  | { ok: false; reason: "not-found" | "revoked" | "expired" };

/**
 * Resolve a public share token (no user session — the token
 * itself is the credential). Hashes the token, looks up the
 * hash via the admin client, and checks revocation + expiry.
 * The document is loaded via the admin client too, because an
 * anonymous visitor has no RLS access — but ONLY after the
 * token matched a live share row.
 */
export async function resolveShare(token: string): Promise<ResolvedShare> {
  const tokenHash = hashShareToken(token);
  const admin = createAdminClient();
  const { data: share, error } = await admin
    .from("document_shares")
    .select("id, document_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !share) {
    return { ok: false, reason: "not-found" };
  }
  if (share.revoked_at) {
    return { ok: false, reason: "revoked" };
  }
  if (isShareExpired(share.expires_at)) {
    return { ok: false, reason: "expired" };
  }
  const { data: document, error: docError } = await admin
    .from("documents")
    .select("id, title, mime_type, file_path, size_bytes")
    .eq("id", share.document_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (docError || !document || !document.file_path) {
    return { ok: false, reason: "not-found" };
  }
  return {
    ok: true,
    document: {
      id: document.id,
      title: document.title,
      mime_type: document.mime_type,
      file_path: document.file_path,
      size_bytes: document.size_bytes,
    },
    expiresAt: share.expires_at,
  };
}

/** Validate an expiry choice from an untrusted request body. */
export function parseShareExpiry(value: unknown): ShareExpiryChoice {
  if (!isShareExpiryChoice(value)) {
    throw new PdfEditError(
      400,
      "Choose 1 day, 7 days, 30 days, or never for the link expiry."
    );
  }
  return value;
}
