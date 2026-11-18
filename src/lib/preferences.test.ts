// Unit tests for Settings / preferences (Day 24) — the
// defaults, the validators, and the export-images link.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  getExportImagesHref,
  isImageExportDpi,
  isImageExportFormat,
  isOcrLanguageValue,
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
