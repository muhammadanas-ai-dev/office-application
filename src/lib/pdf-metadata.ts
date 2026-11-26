// PDF document metadata / properties (F29).
//
// Reads and writes the PDF information dictionary (title,
// author, subject, keywords, creator, producer, dates)
// with pdf-lib. Editing saves a new version — the file's
// own metadata changes, unlike Forma's library title,
// which lives in the database only.
import { PDFDocument } from "pdf-lib";
import { PdfEditError } from "@/lib/pdf-edit";

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  createdAt: string | null;
  modifiedAt: string | null;
  pageCount: number;
}

export interface PdfMetadataEdit {
  title: string;
  author: string;
  subject: string;
  keywords: string;
}

export const METADATA_LIMITS = {
  title: 300,
  author: 200,
  subject: 500,
  keywords: 500,
} as const;

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch {
    throw new PdfEditError(400, "This file could not be read as a PDF.");
  }
}

function toIso(date: Date | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Read the information dictionary of a PDF. */
export async function readPdfMetadata(
  bytes: Uint8Array
): Promise<PdfMetadata> {
  const doc = await loadPdf(bytes);
  return {
    title: doc.getTitle() ?? "",
    author: doc.getAuthor() ?? "",
    subject: doc.getSubject() ?? "",
    keywords: doc.getKeywords() ?? "",
    creator: doc.getCreator() ?? "",
    producer: doc.getProducer() ?? "",
    createdAt: toIso(doc.getCreationDate()),
    modifiedAt: toIso(doc.getModificationDate()),
    pageCount: doc.getPageCount(),
  };
}

/** Validate an edit: trimmed, within the length limits. */
export function validateMetadataEdit(raw: {
  title?: unknown;
  author?: unknown;
  subject?: unknown;
  keywords?: unknown;
}): PdfMetadataEdit {
  const read = (value: unknown, field: keyof typeof METADATA_LIMITS) => {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") {
      throw new PdfEditError(400, `The ${field} must be text.`);
    }
    const trimmed = value.trim();
    if (trimmed.length > METADATA_LIMITS[field]) {
      throw new PdfEditError(
        400,
        `The ${field} is too long (at most ${METADATA_LIMITS[field]} characters).`
      );
    }
    return trimmed;
  };
  return {
    title: read(raw.title, "title"),
    author: read(raw.author, "author"),
    subject: read(raw.subject, "subject"),
    keywords: read(raw.keywords, "keywords"),
  };
}

/**
 * Apply an edit to the information dictionary and stamp
 * the modification date. Creator and producer are the
 * producing software's own record and are left alone.
 */
export async function applyPdfMetadata(
  bytes: Uint8Array,
  edit: PdfMetadataEdit
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  doc.setTitle(edit.title);
  doc.setAuthor(edit.author);
  doc.setSubject(edit.subject);
  doc.setKeywords(
    edit.keywords
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean)
  );
  doc.setModificationDate(new Date());
  return doc.save();
}
