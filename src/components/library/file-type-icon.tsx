// A coloured file-type icon (Day 29, UI polish) — WPS shows
// each document with a coloured icon for its type (Word blue,
// Spreadsheet green, Presentation orange, PDF red), so the
// library reads at a glance instead of a grey FileText for
// everything.
//
// The colour comes from the document type (word/cell/slide/pdf
// from getEditorDocumentType) or the MIME type for images.
// Unknown types get the neutral grey.
import {
  FileImage,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  Presentation,
} from "lucide-react";
import { getEditorDocumentType } from "@/lib/editor";

/** The icon + colour for a document, by its MIME type. */
export function FileTypeIcon({
  mimeType,
  size = 18,
}: {
  mimeType: string | null;
  size?: number;
}) {
  const type = getEditorDocumentType(mimeType);
  if (
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp" ||
    mimeType === "image/tiff"
  ) {
    return (
      <FileImage
        size={size}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[#7c3aed]"
      />
    );
  }
  if (type === "word") {
    return (
      <FileText
        size={size}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[#2b579a]"
      />
    );
  }
  if (type === "cell") {
    return (
      <FileSpreadsheet
        size={size}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[#217346]"
      />
    );
  }
  if (type === "slide") {
    return (
      <Presentation
        size={size}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[#d24726]"
      />
    );
  }
  if (type === "pdf") {
    return (
      <FileText
        size={size}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[#c0392b]"
      />
    );
  }
  return (
    <FileIcon
      size={size}
      aria-hidden="true"
      className="mt-0.5 shrink-0 text-[#667389]"
    />
  );
}

/** The file extension label for a document (e.g. "DOCX", "PDF"). */
export function fileTypeLabel(mimeType: string | null): string {
  const type = getEditorDocumentType(mimeType);
  if (mimeType === "image/png") return "PNG";
  if (mimeType === "image/jpeg") return "JPG";
  if (mimeType === "image/webp") return "WEBP";
  if (mimeType === "image/tiff") return "TIFF";
  if (type === "word") return "Word";
  if (type === "cell") return "Spreadsheet";
  if (type === "slide") return "Presentation";
  if (type === "pdf") return "PDF";
  return "File";
}
