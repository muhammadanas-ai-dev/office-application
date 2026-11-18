import { describe, expect, it } from "vitest";
import {
  buildStoragePath,
  formatBytes,
  getExtension,
  sanitizeFileName,
  validateUpload,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";

describe("validateUpload", () => {
  it("accepts a DOCX with the right MIME type and size", () => {
    const result = validateUpload({
      name: "report.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 1234,
    });
    expect(result).toEqual({
      ok: true,
      extension: "docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });

  it("accepts a file with an empty browser MIME type (trusts the extension)", () => {
    const result = validateUpload({ name: "notes.txt", type: "", size: 10 });
    expect(result.ok).toBe(true);
  });

  it("rejects an unsupported extension", () => {
    const result = validateUpload({
      name: "photo.bmp",
      type: "image/bmp",
      size: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not supported");
    }
  });

  it("accepts a PNG and a JPEG (scanned images, for OCR)", () => {
    const png = validateUpload({
      name: "scan.png",
      type: "image/png",
      size: 100,
    });
    expect(png).toEqual({
      ok: true,
      extension: "png",
      mimeType: "image/png",
    });
    const jpg = validateUpload({
      name: "scan.jpg",
      type: "image/jpeg",
      size: 100,
    });
    expect(jpg).toEqual({
      ok: true,
      extension: "jpg",
      mimeType: "image/jpeg",
    });
  });

  it("rejects a mismatched MIME type", () => {
    const result = validateUpload({
      name: "report.docx",
      type: "application/pdf",
      size: 100,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty file", () => {
    const result = validateUpload({
      name: "empty.txt",
      type: "text/plain",
      size: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a file over the 50 MB limit", () => {
    const result = validateUpload({
      name: "big.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: MAX_UPLOAD_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("50 MB");
    }
  });
});

describe("buildStoragePath", () => {
  it("starts with the workspace id, then document id and version", () => {
    expect(buildStoragePath("ws-1", "doc-1", 2, "My Report.docx")).toBe(
      "ws-1/doc-1/v2/My_Report.docx"
    );
  });
});

describe("sanitizeFileName", () => {
  it("strips path separators and unsafe characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("my file (1).docx")).toBe("my_file_1_.docx");
  });
});

describe("getExtension", () => {
  it("lowercases the extension and handles missing dots", () => {
    expect(getExtension("Report.DOCX")).toBe("docx");
    expect(getExtension("noextension")).toBe("");
  });
});

describe("formatBytes", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
    expect(formatBytes(null)).toBe("—");
  });
});
