// Conversion hub (Phase D) — pure functions, no secrets.
//
// The matrix is what the ONLYOFFICE engine actually performs,
// taken from its own Help Center "Download as" tables (the
// editor's own list of what it produces for each input format),
// restricted to formats Forma can store and open (the 12 upload
// formats + PDF). Image outputs (JPG/PNG thumbnails) and
// EPUB/FB2/HTML/RTF/MD are excluded: Forma cannot store or open
// them as documents, and a thumbnail is not a document.
//
// Honest limits recorded in the matrix itself:
// - No cross-family conversions: a word document cannot become a
//   spreadsheet, and a spreadsheet cannot become a presentation.
//   The engine converts within a family, plus every editable
//   format to PDF, plus PDF back to DOCX/TXT.
// - docx -> doc and xlsx -> xls are NOT offered: the editor's
//   own "Download as" list does not include them (the engine
//   moves forward to the modern format, not back to the legacy
//   one). If a live test against the docserver later proves the
//   ConvertService does them, the matrix grows — it is data,
//   not code.
// - pdf -> xlsx (WPS's "PDF-to-Excel") is NOT offered in v1:
//   the PDF editor's "Download as" list is DOCX, DOTX, EPUB,
//   FB2, HTML, JPG, PDF/A-2a, PNG, RTF, TXT — no XLSX. Same
//   rule: if a live test proves it, the matrix grows.
// - The same-format target is never offered (converting a DOCX
//   to DOCX is a no-op).

import { looksLikeOfficeZip } from "@/lib/editor";
import { sanitizeDownloadName } from "@/lib/export";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/storage";

/** Every format a conversion can start from (a Forma document). */
export type ConvertibleSourceExt =
  | "docx"
  | "doc"
  | "odt"
  | "txt"
  | "xlsx"
  | "xls"
  | "ods"
  | "csv"
  | "pptx"
  | "ppt"
  | "odp"
  | "pdf";

/** Every format a conversion can produce (a Forma document). */
export type ConvertibleTargetExt = ConvertibleSourceExt;

/** The MIME type of a converted file, by extension. */
export const CONVERT_TARGET_MIME_TYPES: Record<ConvertibleTargetExt, string> = {
  ...ALLOWED_UPLOAD_TYPES,
  pdf: "application/pdf",
} as Record<ConvertibleTargetExt, string>;

/**
 * The conversion matrix. Each key is a source extension; the
 * value is the list of target extensions the engine performs
 * for it (in the order the UI offers them: the modern format
 * first, then PDF, then the plain-text form).
 */
export const CONVERSION_MATRIX: Record<
  ConvertibleSourceExt,
  ConvertibleTargetExt[]
> = {
  docx: ["odt", "pdf", "txt"],
  doc: ["docx", "odt", "pdf", "txt"],
  odt: ["docx", "pdf", "txt"],
  txt: ["docx", "odt", "pdf"],
  xlsx: ["csv", "ods", "pdf"],
  xls: ["csv", "ods", "xlsx", "pdf"],
  ods: ["csv", "xlsx", "pdf"],
  csv: ["ods", "xlsx", "pdf"],
  pptx: ["odp", "pdf"],
  ppt: ["odp", "pptx", "pdf"],
  odp: ["pptx", "pdf"],
  pdf: ["docx", "txt"],
};

/** The target formats offered for a source extension, or [] if the source is not convertible. */
export function getConvertibleTargets(
  sourceExt: string | null
): ConvertibleTargetExt[] {
  if (!sourceExt) return [];
  return CONVERSION_MATRIX[sourceExt as ConvertibleSourceExt] ?? [];
}

/** Whether the engine converts `from` to `to` (and they differ). */
export function isConversionSupported(
  from: string | null,
  to: string | null
): boolean {
  if (!from || !to || from === to) return false;
  return getConvertibleTargets(from).includes(to as ConvertibleTargetExt);
}

/** The MIME type of a converted file, or null for an unknown extension. */
export function getTargetMimeType(ext: string | null): string | null {
  if (!ext) return null;
  return CONVERT_TARGET_MIME_TYPES[ext as ConvertibleTargetExt] ?? null;
}

/** A plain-language label for a format, for the UI. */
export function getFormatLabel(ext: string): string {
  switch (ext) {
    case "docx":
      return "Word document (.docx)";
    case "doc":
      return "Word 97-2003 document (.doc)";
    case "odt":
      return "OpenDocument text (.odt)";
    case "txt":
      return "Plain text (.txt)";
    case "xlsx":
      return "Excel workbook (.xlsx)";
    case "xls":
      return "Excel 97-2003 workbook (.xls)";
    case "ods":
      return "OpenDocument spreadsheet (.ods)";
    case "csv":
      return "CSV (.csv)";
    case "pptx":
      return "PowerPoint presentation (.pptx)";
    case "ppt":
      return "PowerPoint 97-2003 presentation (.ppt)";
    case "odp":
      return "OpenDocument presentation (.odp)";
    case "pdf":
      return "PDF (.pdf)";
    default:
      return ext;
  }
}

function isPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
  );
}

function isPlainText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  // A wrong-format response (a ZIP or a PDF) is not text.
  return !looksLikeOfficeZip(bytes) && !isPdf(bytes);
}

/**
 * Validate converted bytes for a target format, before anything
 * is saved. Returns null when the bytes are valid, or a clear
 * reason when they are not. Never returns partial or
 * wrong-format bytes as valid.
 */
export function validateConvertedBytes(
  bytes: Uint8Array,
  targetExt: string
): string | null {
  if (bytes.length === 0) return "The converted file is empty.";
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return "The converted file is larger than the 50 MB limit.";
  }
  switch (targetExt) {
    case "pdf":
      return isPdf(bytes) ? null : "The converted file is not a PDF.";
    case "docx":
    case "doc":
    case "xlsx":
    case "xls":
    case "pptx":
    case "ppt":
    case "odt":
    case "ods":
    case "odp":
      return looksLikeOfficeZip(bytes)
        ? null
        : `The converted file is not a valid .${targetExt} file.`;
    case "txt":
    case "csv":
      return isPlainText(bytes)
        ? null
        : `The converted file is not valid .${targetExt} text.`;
    default:
      return `Unsupported target format: ${targetExt}.`;
  }
}

/** File name for the converted file, e.g. "Quarterly report.pdf". */
export function getConvertedFileName(title: string, targetExt: string): string {
  const base = title.trim() || "document";
  const withoutExt = base.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  return `${sanitizeDownloadName(withoutExt)}.${targetExt}`;
}

/** Title for the new document created by a conversion. */
export function getConvertedTitle(title: string, targetExt: string): string {
  const base = title.trim() || "document";
  const withoutExt = base.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  return `${withoutExt}.${targetExt}`;
}
