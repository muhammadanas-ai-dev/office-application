// Appearance, language & accessibility preferences (F32) —
// pure helpers.
//
// Kept separate from preferences.ts on purpose: that module
// imports the OCR module (a server module using
// node:child_process), and client components must be able
// to import these helpers without pulling Node builtins
// into the browser bundle. preferences.ts re-exports
// everything here for server-side callers.

export const THEMES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEMES)[number];

export const LOCALES = ["en-GB", "en-US", "ur-PK"] as const;
export type LocalePreference = (typeof LOCALES)[number];

export const DATE_FORMATS = ["dmy", "mdy", "ymd"] as const;
export type DateFormatPreference = (typeof DATE_FORMATS)[number];

export const NUMBER_FORMATS = [
  "comma-dot",
  "dot-comma",
  "space-comma",
] as const;
export type NumberFormatPreference = (typeof NUMBER_FORMATS)[number];

export interface AppearancePreferences {
  theme: ThemePreference;
  locale: LocalePreference;
  dateFormat: DateFormatPreference;
  numberFormat: NumberFormatPreference;
  reduceMotion: boolean;
  largerText: boolean;
  highContrast: boolean;
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  theme: "system",
  locale: "en-GB",
  dateFormat: "dmy",
  numberFormat: "comma-dot",
  reduceMotion: false,
  largerText: false,
  highContrast: false,
};

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

/** Appearance preferences with defaults for anything missing
 *  or invalid (values come from the database — never trusted). */
export function withDefaultAppearance(partial: {
  theme?: unknown;
  locale?: unknown;
  dateFormat?: unknown;
  numberFormat?: unknown;
  reduceMotion?: unknown;
  largerText?: unknown;
  highContrast?: unknown;
}): AppearancePreferences {
  return {
    theme: oneOf(partial.theme, THEMES, DEFAULT_APPEARANCE.theme),
    locale: oneOf(partial.locale, LOCALES, DEFAULT_APPEARANCE.locale),
    dateFormat: oneOf(
      partial.dateFormat,
      DATE_FORMATS,
      DEFAULT_APPEARANCE.dateFormat
    ),
    numberFormat: oneOf(
      partial.numberFormat,
      NUMBER_FORMATS,
      DEFAULT_APPEARANCE.numberFormat
    ),
    reduceMotion: partial.reduceMotion === true,
    largerText: partial.largerText === true,
    highContrast: partial.highContrast === true,
  };
}

/** The <html> classes the appearance layer keys off. */
export function appearanceHtmlClasses(
  prefs: AppearancePreferences
): string[] {
  const classes: string[] = [];
  if (prefs.theme === "dark") classes.push("forma-dark");
  if (prefs.theme === "system") classes.push("forma-theme-system");
  if (prefs.largerText) classes.push("forma-larger-text");
  if (prefs.reduceMotion) classes.push("forma-reduce-motion");
  if (prefs.highContrast) classes.push("forma-high-contrast");
  return classes;
}

const NUMBER_LOCALES: Record<NumberFormatPreference, string> = {
  "comma-dot": "en-US",
  "dot-comma": "de-DE",
  "space-comma": "fr-FR",
};

/** Format a number with the user's number-format preference
 *  (1,234.56 / 1.234,56 / 1 234,56). */
export function formatNumberWithPreference(
  value: number,
  prefs: Pick<AppearancePreferences, "numberFormat">
): string {
  return new Intl.NumberFormat(NUMBER_LOCALES[prefs.numberFormat], {
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format a date with the user's locale + date-order
 *  preference (26 Nov 2026 / Nov 26, 2026 / 2026-11-26). */
export function formatDateWithPreference(
  value: Date | string,
  prefs: Pick<AppearancePreferences, "locale" | "dateFormat">
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (prefs.dateFormat === "ymd") {
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  const formatted = new Intl.DateTimeFormat(prefs.locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  return formatted;
}
