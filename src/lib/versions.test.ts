// Unit tests for Versions UI (Day 23) — the size formatting,
// the labels, the restorable check, and the download file names.
import { describe, expect, it } from "vitest";
import {
  formatVersionSize,
  getVersionFileName,
  getVersionLabel,
  isRestorable,
} from "@/lib/versions";

describe("formatVersionSize", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatVersionSize(0)).toBe("0 bytes");
    expect(formatVersionSize(1)).toBe("1 byte");
    expect(formatVersionSize(512)).toBe("512 bytes");
    expect(formatVersionSize(1024)).toBe("1 KB");
    expect(formatVersionSize(12 * 1024)).toBe("12 KB");
    expect(formatVersionSize(1536)).toBe("1.5 KB");
    expect(formatVersionSize(1024 * 1024)).toBe("1 MB");
    expect(formatVersionSize(Math.round(1.2 * 1024 * 1024))).toBe("1.2 MB");
  });

  it("handles a null or invalid size", () => {
    expect(formatVersionSize(null)).toBe("Unknown size");
    expect(formatVersionSize(-5)).toBe("Unknown size");
    expect(formatVersionSize(Number.NaN)).toBe("Unknown size");
  });
});

describe("getVersionLabel and isRestorable", () => {
  it("marks the current version", () => {
    expect(getVersionLabel(3, true)).toBe("Version 3 · current");
    expect(getVersionLabel(2, false)).toBe("Version 2");
  });

  it("refuses to restore the current version", () => {
    expect(isRestorable(3, 3)).toBe(false);
    expect(isRestorable(2, 3)).toBe(true);
    expect(isRestorable(1, 3)).toBe(true);
  });
});

describe("getVersionFileName", () => {
  it("inserts the version before the extension", () => {
    expect(getVersionFileName("Report.pdf", 2)).toBe("Report v2.pdf");
    expect(getVersionFileName("Report", 1)).toBe("Report v1");
    expect(getVersionFileName("My file.docx", 3)).toBe("My file v3.docx");
  });

  it("falls back to 'document' for a blank title", () => {
    expect(getVersionFileName("  ", 2)).toBe("document v2");
  });
});
