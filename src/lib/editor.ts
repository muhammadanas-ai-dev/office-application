// ONLYOFFICE editor helpers (Day 5) — pure functions, no secrets.
//
// These are safe to import from server components and tests. The secret
// getters live in editor.server.ts (server-only).

import crypto from "node:crypto";

/** File tokens live for one hour. */
export const FILE_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * A 20-hex-character document key for ONLYOFFICE. Random per editor
 * session (not derived from the document id): the callback maps it
 * back through the editor_sessions table, so the key itself reveals
 * nothing and cannot be guessed.
 */
export function newDocumentKey(): string {
  return crypto.randomBytes(10).toString("hex");
}

export interface FileTokenPayload {
  documentId: string;
  version: number;
  expiresAt: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Sign a short-lived file-download token for one document version. */
export function signFileToken(
  secret: string,
  payload: FileTokenPayload
): string {
  const body = `${payload.documentId}.${payload.version}.${payload.expiresAt}`;
  const sig = base64url(
    crypto.createHmac("sha256", secret).update(body).digest()
  );
  return `${body}.${sig}`;
}

export type FileTokenVerification =
  { ok: true; payload: FileTokenPayload } | { ok: false; error: string };

/** Verify a file token: shape, signature (timing-safe) and expiry. */
export function verifyFileToken(
  secret: string,
  token: string
): FileTokenVerification {
  const parts = token.split(".");
  if (parts.length !== 4) {
    return { ok: false, error: "Malformed token" };
  }
  const [documentId, versionRaw, expiresRaw, sig] = parts;
  const version = Number(versionRaw);
  const expiresAt = Number(expiresRaw);
  if (!documentId || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "Malformed token" };
  }
  if (!Number.isInteger(expiresAt)) {
    return { ok: false, error: "Malformed token" };
  }
  const body = `${documentId}.${version}.${expiresAt}`;
  const expected = base64url(
    crypto.createHmac("sha256", secret).update(body).digest()
  );
  const sigBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expected);
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return { ok: false, error: "Bad signature" };
  }
  if (Date.now() > expiresAt) {
    return { ok: false, error: "Token expired" };
  }
  return { ok: true, payload: { documentId, version, expiresAt } };
}

export type EditorDocumentType = "word" | "cell" | "slide" | "pdf";

/** ONLYOFFICE documentType for a MIME type (Phase A: word + cell + slide + pdf). */
export function getEditorDocumentType(
  mimeType: string | null
): EditorDocumentType | null {
  switch (mimeType) {
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/msword":
    case "application/vnd.oasis.opendocument.text":
    case "text/plain":
      return "word";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.ms-excel":
    case "text/csv":
    case "application/vnd.oasis.opendocument.spreadsheet":
      return "cell";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    case "application/vnd.ms-powerpoint":
    case "application/vnd.oasis.opendocument.presentation":
      return "slide";
    case "application/pdf":
      return "pdf";
    default:
      return null;
  }
}

export function getEditorFileType(mimeType: string | null): string | null {
  switch (mimeType) {
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "application/msword":
      return "doc";
    case "application/vnd.oasis.opendocument.text":
      return "odt";
    case "text/plain":
      return "txt";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "xlsx";
    case "application/vnd.ms-excel":
      return "xls";
    case "text/csv":
      return "csv";
    case "application/vnd.oasis.opendocument.spreadsheet":
      return "ods";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "pptx";
    case "application/vnd.ms-powerpoint":
      return "ppt";
    case "application/vnd.oasis.opendocument.presentation":
      return "odp";
    case "application/pdf":
      return "pdf";
    default:
      return null;
  }
}

/** Whether the format opens editable (word/cell/slide) or view-only (pdf). */
export function isEditableDocumentType(
  documentType: EditorDocumentType | null
): boolean {
  return (
    documentType === "word" ||
    documentType === "cell" ||
    documentType === "slide"
  );
}

/**
 * Office files (DOCX, XLSX, PPTX, ODT, ODS, ODP) are ZIP archives:
 * they start with the ZIP magic bytes PK\x03\x04.
 */
export function looksLikeOfficeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** Backwards-compatible alias (Day 5 name). */
export const looksLikeDocx = looksLikeOfficeZip;
