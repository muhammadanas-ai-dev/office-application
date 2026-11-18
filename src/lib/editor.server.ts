// ONLYOFFICE editor environment (Day 5) — server-only.
//
// Secret getters only. The pure helpers (tokens, format mapping,
// DOCX magic bytes) live in src/lib/editor.ts so server components
// and tests can import them without tripping the server-only guard.
import "server-only";
import { getPublicEnv } from "@/lib/env";

/** The document server's public URL (the browser loads its JS here). */
export function getDocumentServerUrl(): string {
  return (process.env.ONLYOFFICE_DOCSERVER_URL ?? "").trim();
}

/** Shared secret for the ONLYOFFICE JWT (config token + callback). */
export function getOnlyOfficeJwtSecret(): string {
  const secret = (process.env.ONLYOFFICE_JWT_SECRET ?? "").trim();
  if (!secret) {
    throw new Error("ONLYOFFICE_JWT_SECRET is not configured");
  }
  return secret;
}

/** Secret for our own file-download HMAC tokens. */
export function getFileTokenSecret(): string {
  const secret = (process.env.EDITOR_FILE_TOKEN_SECRET ?? "").trim();
  if (!secret) {
    throw new Error("EDITOR_FILE_TOKEN_SECRET is not configured");
  }
  return secret;
}

/**
 * Base URL the document server uses to reach this app (file + callback
 * URLs). Defaults to the public app URL; for a local Docker document
 * server it is http://host.docker.internal:3000.
 */
export function getEditorPublicUrl(): string {
  const url = (process.env.EDITOR_PUBLIC_URL ?? "").trim();
  if (url) return url.replace(/\/$/, "");
  return getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}
