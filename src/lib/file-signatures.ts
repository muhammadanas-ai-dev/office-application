// File byte-signature (magic-number) validation (Day 27, hardening).
//
// The upload check in storage.ts only looks at the extension and
// the DECLARED MIME type — both are attacker-controlled. A PNG
// renamed to .pdf passes it, and the app then treats a PNG as a
// PDF (the PDF tools, the editor and the converter all fail on it,
// and a crafted file could do worse). This module checks the file's
// actual bytes against the extension it claims.
//
// The check is server-side only (the browser `accept` attribute
// stays a hint). It runs in the upload action, after validateUpload
// passes and before anything is written to Storage.
//
// How each format is recognised:
// - PDF: `%PDF` at offset 0.
// - PNG: the 8-byte PNG magic. JPEG: `FF D8 FF`.
// - ZIP-based (DOCX, XLSX, PPTX, ODT, ODS, ODP): the ZIP magic
//   `PK\x03\x04` at offset 0, PLUS a format-specific marker inside
//   the ZIP — otherwise a DOCX renamed to .xlsx would pass.
//   OOXML (DOCX/XLSX/PPTX) carries `word/`, `xl/` or `ppt/`
//   entries in the ZIP central directory (at the END of the file).
//   ODF (ODT/ODS/ODP) stores an uncompressed `mimetype` entry
//   FIRST (the ODF spec requires it), whose content names the
//   type — so it is in the first bytes of the file.
// - Legacy OLE (DOC, XLS, PPT): the 8-byte OLE Compound File
//   magic. All three share it — the check does NOT distinguish
//   DOC from XLS from PPT (that needs the OLE stream names;
//   a follow-up). The extension + OLE magic is the honest v1.
// - TXT / CSV: no magic. Valid UTF-8 and no NUL bytes — a binary
//   file renamed to .txt is refused.
//
// No malware scan: that needs an external scanner and is out of
// scope (recorded in the Day 27 handoff).

/** The bytes the check needs: the whole file (uploads are capped
 *  at 50 MB, so this is bounded). */
export type FileSignatureResult = { ok: true } | { ok: false; error: string };

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_CENTRAL_MAGIC = [0x50, 0x4b, 0x01, 0x02]; // PK\x01\x02

/** How far into the file the ODF mimetype entry sits (it is the
 *  first entry, stored uncompressed). */
const ODF_MIMETYPE_SEARCH_BYTES = 1024;
/** How much of the file's tail to scan for the ZIP central
 *  directory (the directory is at the end; 64 KB covers it for
 *  any document-sized file). */
const ZIP_CENTRAL_SEARCH_BYTES = 64 * 1024;

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

function containsBytes(haystack: Uint8Array, needle: number[]): boolean {
  if (needle.length === 0 || haystack.length < needle.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function asciiBytes(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

/** The file names in the ZIP central directory (the last
 *  64 KB of the file). Each entry starts with PK\x01\x02; the
 *  file name length is a little-endian uint16 at offset 28 and
 *  the name itself starts at offset 46. The scan compares bytes
 *  in place (no slicing per position — slicing made this O(n²)
 *  and a 64 KB tail took seconds). */
function zipCentralFileNames(bytes: Uint8Array): string[] {
  const tail = bytes.slice(
    Math.max(0, bytes.length - ZIP_CENTRAL_SEARCH_BYTES)
  );
  const names: string[] = [];
  for (let i = 0; i + 46 <= tail.length; i++) {
    if (
      tail[i] !== ZIP_CENTRAL_MAGIC[0] ||
      tail[i + 1] !== ZIP_CENTRAL_MAGIC[1] ||
      tail[i + 2] !== ZIP_CENTRAL_MAGIC[2] ||
      tail[i + 3] !== ZIP_CENTRAL_MAGIC[3]
    ) {
      continue;
    }
    const nameLen = tail[i + 28] | (tail[i + 29] << 8);
    const nameStart = i + 46;
    if (nameStart + nameLen > tail.length) continue;
    const name = new TextDecoder("utf-8").decode(
      tail.slice(nameStart, nameStart + nameLen)
    );
    names.push(name);
  }
  return names;
}

/** The ODF mimetype content, from the first bytes of the file
 *  (the mimetype entry is stored uncompressed, first). Returns
 *  the full mimetype string, or null when it is not there. */
function odfMimetype(bytes: Uint8Array): string | null {
  const head = bytes.slice(0, ODF_MIMETYPE_SEARCH_BYTES);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(head);
  const prefix = "application/vnd.oasis.opendocument.";
  const at = text.indexOf(prefix);
  if (at < 0) return null;
  const rest = text.slice(at + prefix.length);
  const match = /^[a-z]+/.exec(rest);
  return match ? prefix + match[0] : null;
}

/** Is the byte array valid UTF-8 text with no NUL bytes? (The
 *  TXT / CSV check — a binary file renamed to .txt is refused.) */
function isPlainText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** What format the bytes look like, from the magic alone.
 *  Returns the extension the bytes match, or null when the
 *  bytes match no known format. (ZIP-based formats all return
 *  "zip" here — the inner marker is what distinguishes them.) */
function isWebp(bytes: Uint8Array): boolean {
  // RIFF container with the WEBP form type at offset 8.
  return (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP"
  );
}

function isTiff(bytes: Uint8Array): boolean {
  // Little-endian II*\0 or big-endian MM\0*.
  return (
    startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])
  );
}

export function detectFileType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, PDF_MAGIC)) return "pdf";
  if (startsWith(bytes, PNG_MAGIC)) return "png";
  if (startsWith(bytes, JPEG_MAGIC)) return "jpg";
  if (isWebp(bytes)) return "webp";
  if (isTiff(bytes)) return "tiff";
  if (startsWith(bytes, OLE_MAGIC)) return "ole";
  if (startsWith(bytes, ZIP_MAGIC)) return "zip";
  if (isPlainText(bytes)) return "txt";
  return null;
}

/**
 * Check that a file's bytes match the extension it claims.
 * Returns `{ ok: true }` on a match, or `{ ok: false, error }`
 * with a user-facing message on a mismatch. The error names
 * what the bytes actually look like when that is known, so the
 * user can fix the file (rename it, or re-save it in the right
 * format).
 */
export function validateFileSignature(
  bytes: Uint8Array,
  extension: string
): FileSignatureResult {
  const ext = extension.toLowerCase();
  const detected = detectFileType(bytes);
  const mismatch = (expected: string): FileSignatureResult => {
    const looksLike =
      detected === "ole"
        ? "an old Office file (DOC, XLS or PPT)"
        : detected === "zip"
          ? "a ZIP-based Office file (DOCX, XLSX, PPTX, ODT, ODS or ODP)"
          : detected === "txt"
            ? "plain text"
            : detected
              ? `a ${detected.toUpperCase()} file`
              : "an unknown format";
    return {
      ok: false,
      error: `This file is not a ${expected.toUpperCase()} file — its contents look like ${looksLike}. Rename it to the right extension, or re-save it as ${expected.toUpperCase()}.`,
    };
  };

  switch (ext) {
    case "pdf":
      return startsWith(bytes, PDF_MAGIC) ? { ok: true } : mismatch("pdf");
    case "png":
      return startsWith(bytes, PNG_MAGIC) ? { ok: true } : mismatch("png");
    case "jpg":
    case "jpeg":
      return startsWith(bytes, JPEG_MAGIC) ? { ok: true } : mismatch("jpg");
    case "webp":
      return isWebp(bytes) ? { ok: true } : mismatch("webp");
    case "tif":
    case "tiff":
      return isTiff(bytes) ? { ok: true } : mismatch("tiff");
    case "doc":
    case "xls":
    case "ppt":
      return startsWith(bytes, OLE_MAGIC) ? { ok: true } : mismatch(ext);
    case "docx":
    case "xlsx":
    case "pptx": {
      if (!startsWith(bytes, ZIP_MAGIC)) return mismatch(ext);
      const marker = ext === "docx" ? "word/" : ext === "xlsx" ? "xl/" : "ppt/";
      const names = zipCentralFileNames(bytes);
      return names.some((n) => n.startsWith(marker))
        ? { ok: true }
        : mismatch(ext);
    }
    case "odt":
    case "ods":
    case "odp": {
      if (!startsWith(bytes, ZIP_MAGIC)) return mismatch(ext);
      const expected =
        ext === "odt"
          ? "application/vnd.oasis.opendocument.text"
          : ext === "ods"
            ? "application/vnd.oasis.opendocument.spreadsheet"
            : "application/vnd.oasis.opendocument.presentation";
      return odfMimetype(bytes) === expected ? { ok: true } : mismatch(ext);
    }
    case "txt":
    case "csv":
      return isPlainText(bytes) ? { ok: true } : mismatch(ext);
    default:
      return {
        ok: false,
        error: `That file type is not supported.`,
      };
  }
}
