// User fonts (F33) — pure helpers.
//
// A user can upload a TTF/OTF font and use it in Forma's
// own tools (the PDF draw page's Add text). This module
// owns the format detection (magic bytes, never the file
// name), the name validation and the picker ordering
// (favourites first, then most recently used).
import { PdfEditError } from "@/lib/pdf-edit";

export const MAX_FONT_BYTES = 10 * 1024 * 1024;
export const MAX_FONT_NAME_CHARS = 80;
export const MAX_USER_FONTS = 50;

export type UserFontFormat = "ttf" | "otf";

export interface UserFontRow {
  id: string;
  name: string;
  format: UserFontFormat;
  sizeBytes: number;
  isFavourite: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Detect the font format from the file's magic bytes.
 *  Returns null for anything that is not a single TTF/OTF
 *  font (collections and other formats are refused). */
export function detectFontFormat(bytes: Uint8Array): UserFontFormat | null {
  if (bytes.length < 4) return null;
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag === "OTTO") return "otf";
  if (tag === "true" || tag === "typ1") return "ttf";
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00)
    return "ttf";
  return null;
}

/** Validate a font display name. */
export function validateFontName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new PdfEditError(400, "Give the font a name.");
  }
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0) {
    throw new PdfEditError(400, "Give the font a name.");
  }
  if (name.length > MAX_FONT_NAME_CHARS) {
    throw new PdfEditError(
      400,
      `The font name must be at most ${MAX_FONT_NAME_CHARS} characters.`
    );
  }
  return name;
}

/** A font name from the uploaded file's name (fallback). */
export function fontNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "").trim();
  return (base || "My font").slice(0, MAX_FONT_NAME_CHARS);
}

/**
 * Picker order: favourites first, then most recently used,
 * then the rest A–Z. Never-used fonts sort by name inside
 * their group.
 */
export function sortFontsForPicker<T extends UserFontRow>(fonts: T[]): T[] {
  return [...fonts].sort((a, b) => {
    if (a.isFavourite !== b.isFavourite) return a.isFavourite ? -1 : 1;
    const aUsed = a.lastUsedAt ? Date.parse(a.lastUsedAt) : NaN;
    const bUsed = b.lastUsedAt ? Date.parse(b.lastUsedAt) : NaN;
    if (!Number.isNaN(aUsed) && !Number.isNaN(bUsed)) return bUsed - aUsed;
    if (!Number.isNaN(aUsed)) return -1;
    if (!Number.isNaN(bUsed)) return 1;
    return a.name.localeCompare(b.name);
  });
}
