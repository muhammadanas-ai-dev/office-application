// Unit tests for Settings / preferences (Day 24) — the
// defaults, the validators, and the export-images link.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_PREFERENCES,
  appearanceHtmlClasses,
  formatDateWithPreference,
  formatNumberWithPreference,
  getExportImagesHref,
  isImageExportDpi,
  isImageExportFormat,
  isOcrLanguageValue,
  withDefaultAppearance,
  withDefaultPreferences,
} from "@/lib/preferences";

describe("withDefaultPreferences", () => {
  it("fills in the defaults for anything missing", () => {
    expect(withDefaultPreferences({})).toEqual(DEFAULT_PREFERENCES);
    expect(withDefaultPreferences({ ocrLanguage: "urd" })).toEqual({
      ocrLanguage: "urd",
      imageExportFormat: "png",
      imageExportDpi: 150,
    });
  });

  it("falls back to the defaults for bad values", () => {
    expect(
      withDefaultPreferences({
        ocrLanguage: "fra" as never,
        imageExportFormat: "tiff" as never,
        imageExportDpi: 200 as never,
      })
    ).toEqual({
      ocrLanguage: "eng",
      imageExportFormat: "png",
      imageExportDpi: 150,
    });
  });

  it("keeps valid values", () => {
    expect(
      withDefaultPreferences({
        ocrLanguage: "ara",
        imageExportFormat: "jpg",
        imageExportDpi: 300,
      })
    ).toEqual({
      ocrLanguage: "ara",
      imageExportFormat: "jpg",
      imageExportDpi: 300,
    });
  });
});

describe("validators", () => {
  it("accepts only the real values", () => {
    expect(isOcrLanguageValue("eng")).toBe(true);
    expect(isOcrLanguageValue("urd")).toBe(true);
    expect(isOcrLanguageValue("ara")).toBe(true);
    expect(isOcrLanguageValue("fra")).toBe(false);
    expect(isOcrLanguageValue(42)).toBe(false);
    expect(isImageExportFormat("png")).toBe(true);
    expect(isImageExportFormat("jpg")).toBe(true);
    expect(isImageExportFormat("tiff")).toBe(false);
    expect(isImageExportDpi(72)).toBe(true);
    expect(isImageExportDpi(150)).toBe(true);
    expect(isImageExportDpi(300)).toBe(true);
    expect(isImageExportDpi(200)).toBe(false);
    expect(isImageExportDpi("150")).toBe(false);
  });
});

describe("getExportImagesHref", () => {
  it("keeps the default link clean (no query params)", () => {
    expect(
      getExportImagesHref("doc-1", {
        ocrLanguage: "eng",
        imageExportFormat: "png",
        imageExportDpi: 150,
      })
    ).toBe("/api/documents/doc-1/pdf/export-images");
  });

  it("adds only the non-default parameters", () => {
    expect(
      getExportImagesHref("doc-1", {
        ocrLanguage: "eng",
        imageExportFormat: "jpg",
        imageExportDpi: 300,
      })
    ).toBe("/api/documents/doc-1/pdf/export-images?format=jpg&dpi=300");
    expect(
      getExportImagesHref("doc-1", {
        ocrLanguage: "eng",
        imageExportFormat: "jpg",
        imageExportDpi: 150,
      })
    ).toBe("/api/documents/doc-1/pdf/export-images?format=jpg");
  });
});

describe("appearance preferences (F32)", () => {
  it("fills defaults and rejects invalid values", () => {
    expect(withDefaultAppearance({})).toEqual(DEFAULT_APPEARANCE);
    const prefs = withDefaultAppearance({
      theme: "dark",
      locale: "xx-YY",
      dateFormat: "mdy",
      reduceMotion: true,
      largerText: "yes",
    });
    expect(prefs.theme).toBe("dark");
    expect(prefs.locale).toBe("en-GB");
    expect(prefs.dateFormat).toBe("mdy");
    expect(prefs.reduceMotion).toBe(true);
    expect(prefs.largerText).toBe(false);
  });

  it("maps preferences to html classes", () => {
    expect(appearanceHtmlClasses(DEFAULT_APPEARANCE)).toEqual([
      "forma-theme-system",
    ]);
    expect(
      appearanceHtmlClasses({
        ...DEFAULT_APPEARANCE,
        theme: "dark",
        largerText: true,
        highContrast: true,
      })
    ).toEqual(["forma-dark", "forma-larger-text", "forma-high-contrast"]);
    expect(
      appearanceHtmlClasses({ ...DEFAULT_APPEARANCE, theme: "light" })
    ).toEqual([]);
  });

  it("formats numbers per the number-format preference", () => {
    expect(
      formatNumberWithPreference(1234567.5, { numberFormat: "comma-dot" })
    ).toBe("1,234,567.5");
    expect(
      formatNumberWithPreference(1234567.5, { numberFormat: "dot-comma" })
    ).toBe("1.234.567,5");
    expect(
      formatNumberWithPreference(1234.5, { numberFormat: "space-comma" })
    ).toBe("1\u202f234,5");
  });

  it("formats dates per the locale + order preference", () => {
    const date = new Date("2026-11-26T12:00:00Z");
    expect(
      formatDateWithPreference(date, { locale: "en-GB", dateFormat: "dmy" })
    ).toBe("26 Nov 2026");
    expect(
      formatDateWithPreference(date, { locale: "en-US", dateFormat: "mdy" })
    ).toBe("Nov 26, 2026");
    expect(
      formatDateWithPreference(date, { locale: "en-GB", dateFormat: "ymd" })
    ).toBe("2026-11-26");
    expect(
      formatDateWithPreference("not-a-date", {
        locale: "en-GB",
        dateFormat: "dmy",
      })
    ).toBe("");
  });
});
