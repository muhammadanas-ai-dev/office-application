// Private Storage rules for the document library (Day 4).
//
// Bucket `documents` is private. Every object path starts with the
// workspace id — <workspace_id>/<document_id>/v<n>/<filename> —
// because the storage.objects RLS policies read the workspace from
// the first path segment. A path that does not start with a workspace
// uuid is denied by those policies (fail-closed).
//
// Validation runs server-side in the upload action; the browser's
// `accept` attribute is only a hint. The extension and the declared
// MIME type are checked here; the file's actual bytes are checked
// against the extension by `validateFileSignature`
// (src/lib/file-signatures.ts, Day 27 hardening) in the upload
// action, before anything is written to Storage.

export const DOCUMENTS_BUCKET = "documents";

/** Free-plan upload cap: 50 MB per file. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pdf: "application/pdf",
  txt: "text/plain",
  odt: "application/vnd.oasis.opendocument.text",
  // Phase A (WPS level): spreadsheets and presentations.
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  odp: "application/vnd.oasis.opendocument.presentation",
  // Phase C (OCR): scanned images, so a photo of a page can be read.
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  // F34: WEBP and TIFF images (converted to PNG by the
  // images-to-PDF tool; OCR still takes PNG/JPEG).
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

export const ALLOWED_UPLOAD_EXTENSIONS = Object.keys(ALLOWED_UPLOAD_TYPES);

export const SUPPORTED_UPLOAD_MESSAGE =
  "Supported uploads: DOCX, DOC, PDF, TXT, ODT, XLSX, XLS, CSV, ODS, PPTX, PPT, ODP, PNG, JPG, WEBP, TIFF — up to 50 MB each.";

/** Keep file names safe inside a Storage path segment. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return cleaned || "file";
}

export function getExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? (parts.pop() ?? "").toLowerCase() : "";
}

/** Object path for a document version. Version 1 is the upload. */
export function buildStoragePath(
  workspaceId: string,
  documentId: string,
  version: number,
  fileName: string
): string {
  return `${workspaceId}/${documentId}/v${version}/${sanitizeFileName(fileName)}`;
}

/** Object path for a user-created template (Day 31).
 *
 * The template file lives in the `documents` bucket under the
 * workspace id, so the existing Storage policies apply unchanged
 * (they read the workspace from the first path segment). */
export function buildTemplateStoragePath(
  workspaceId: string,
  templateId: string,
  fileName: string
): string {
  return `${workspaceId}/templates/${templateId}/${sanitizeFileName(fileName)}`;
}

export type UploadValidation =
  | { ok: true; extension: string; mimeType: string }
  | { ok: false; error: string };

/**
 * Validate an upload by extension, declared MIME type and size.
 * Returns a user-facing error string on failure (never the raw
 * browser MIME value, which is attacker-controlled).
 */
export function validateUpload(file: {
  name: string;
  type: string;
  size: number;
}): UploadValidation {
  const extension = getExtension(file.name);
  const expectedMime = ALLOWED_UPLOAD_TYPES[extension];
  if (!expectedMime) {
    return {
      ok: false,
      error: `That file type is not supported. ${SUPPORTED_UPLOAD_MESSAGE}`,
    };
  }
  // Browsers sometimes report an empty type for .doc/.odt; trust the
  // extension then. A mismatched non-empty type is rejected.
  if (file.type && file.type !== expectedMime) {
    return {
      ok: false,
      error: `The file says it is ${file.type}, but its .${extension} extension expects a different format.`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That file is larger than the 50 MB upload limit.`,
    };
  }
  return { ok: true, extension, mimeType: expectedMime };
}

/** Human file size for the library list, e.g. "2.4 MB". */
export function formatBytes(size: number | null | undefined): string {
  if (size === null || size === undefined) return "—";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
