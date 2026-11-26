// Settings / preferences (Day 24) — pure helpers.
//
// Three per-user preferences, stored as columns on the profiles
// table (1:1 with the user): the OCR page's default language,
// the library "Export images" link's default format, and its
// default DPI. Nothing here touches the filesystem or a network,
// so it is safe to import from anywhere, including tests.
import {
  IMAGE_EXPORT_DPIS,
  IMAGE_EXPORT_FORMATS,
  type ImageExportDpi,
  type ImageExportFormat,
} from "@/lib/pdf-images";
import { isOcrLanguage, type OcrLanguage } from "@/lib/ocr";

/** The preferences a user has when they have never set any. */
export const DEFAULT_PREFERENCES = {
  ocrLanguage: "eng",
  imageExportFormat: "png",
  imageExportDpi: 150,
} as const;

export interface UserPreferences {
  ocrLanguage: OcrLanguage;
  imageExportFormat: ImageExportFormat;
  imageExportDpi: ImageExportDpi;
}

/**
 * The preferences with the defaults filled in for anything
 * missing or invalid. The values come from the database (a
 * string / number / null), so they are validated here, not
 * trusted.
 */
export function withDefaultPreferences(partial: {
  ocrLanguage?: unknown;
  imageExportFormat?: unknown;
  imageExportDpi?: unknown;
}): UserPreferences {
  return {
    ocrLanguage: isOcrLanguageValue(partial.ocrLanguage)
      ? partial.ocrLanguage
      : DEFAULT_PREFERENCES.ocrLanguage,
    imageExportFormat: isImageExportFormat(partial.imageExportFormat)
      ? partial.imageExportFormat
      : DEFAULT_PREFERENCES.imageExportFormat,
    imageExportDpi: isImageExportDpi(partial.imageExportDpi)
      ? partial.imageExportDpi
      : DEFAULT_PREFERENCES.imageExportDpi,
  };
}

export function isOcrLanguageValue(value: unknown): value is OcrLanguage {
  return typeof value === "string" && isOcrLanguage(value);
}

export function isImageExportFormat(
  value: unknown
): value is ImageExportFormat {
  return (
    typeof value === "string" &&
    (IMAGE_EXPORT_FORMATS as readonly string[]).includes(value)
  );
}

export function isImageExportDpi(value: unknown): value is ImageExportDpi {
  return (
    typeof value === "number" &&
    (IMAGE_EXPORT_DPIS as readonly number[]).includes(value)
  );
}

/**
 * The library "Export images" link for a PDF, built from the
 * user's preferences. Only the non-default parameters are
 * included, so the default link stays clean
 * (`/api/documents/<id>/pdf/export-images`).
 */
export function getExportImagesHref(
  documentId: string,
  preferences: UserPreferences
): string {
  const params = new URLSearchParams();
  if (preferences.imageExportFormat !== DEFAULT_PREFERENCES.imageExportFormat) {
    params.set("format", preferences.imageExportFormat);
  }
  if (preferences.imageExportDpi !== DEFAULT_PREFERENCES.imageExportDpi) {
    params.set("dpi", String(preferences.imageExportDpi));
  }
  const query = params.toString();
  return `/api/documents/${documentId}/pdf/export-images${query ? `?${query}` : ""}`;
}

export {
  THEMES,
  LOCALES,
  DATE_FORMATS,
  NUMBER_FORMATS,
  DEFAULT_APPEARANCE,
  withDefaultAppearance,
  appearanceHtmlClasses,
  formatNumberWithPreference,
  formatDateWithPreference,
  type ThemePreference,
  type LocalePreference,
  type DateFormatPreference,
  type NumberFormatPreference,
  type AppearancePreferences,
} from "@/lib/appearance";
