// PDF export helpers — pure functions, no DOM needed.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  EXPORT_RATE_LIMIT_MAX,
  EXPORT_RATE_LIMIT_WINDOW_MS,
  FixedWindowRateLimiter,
  buildContentDisposition,
  buildConvertRequest,
  getExportFileName,
  getSourceFileName,
  isExportableToPdf,
  parseConvertResponse,
} from "@/lib/export";

const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

describe("isExportableToPdf", () => {
  it("is true for every editable format and false for PDF and others", () => {
    for (const mime of [
      DOCX,
      "application/msword",
      "application/vnd.oasis.opendocument.text",
      "text/plain",
      XLSX,
      "application/vnd.ms-excel",
      "text/csv",
      "application/vnd.oasis.opendocument.spreadsheet",
      PPTX,
      "application/vnd.ms-powerpoint",
      "application/vnd.oasis.opendocument.presentation",
    ]) {
      expect(isExportableToPdf(mime)).toBe(true);
    }
    expect(isExportableToPdf("application/pdf")).toBe(false);
    expect(isExportableToPdf("image/png")).toBe(false);
    expect(isExportableToPdf(null)).toBe(false);
  });
});

describe("getExportFileName / getSourceFileName", () => {
  it("appends .pdf once and sanitizes unsafe characters", () => {
    expect(getExportFileName("Quarterly report")).toBe("Quarterly report.pdf");
    expect(getExportFileName("report.pdf")).toBe("report.pdf");
    expect(getExportFileName("Report.PDF")).toBe("Report.pdf");
    expect(getExportFileName("")).toBe("document.pdf");
    expect(getExportFileName("   ")).toBe("document.pdf");
    expect(getExportFileName("My/Report: Q1")).toBe("My_Report_ Q1.pdf");
  });

  it("names the source file with its real extension", () => {
    expect(getSourceFileName("Report", "docx")).toBe("Report.docx");
    expect(getSourceFileName("Report.docx", "docx")).toBe("Report.docx");
    expect(getSourceFileName("", "xlsx")).toBe("document.xlsx");
    expect(getSourceFileName("Budget 2026", "pptx")).toBe("Budget 2026.pptx");
  });
});

describe("buildContentDisposition", () => {
  it("carries an ASCII fallback and a UTF-8 filename", () => {
    const header = buildContentDisposition("Quarterly report");
    expect(header).toBe(
      `attachment; filename="Quarterly report.pdf"; filename*=UTF-8''Quarterly%20report.pdf`
    );
  });

  it("encodes a non-English title instead of dropping it", () => {
    const header = buildContentDisposition("رپورٹ");
    expect(header).toContain('filename="_.pdf"');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent("رپورٹ") + ".pdf");
  });

  it("never lets a quote or newline break out of the header", () => {
    const header = buildContentDisposition('a"b\nc');
    expect(header).not.toContain('"b');
    expect(header).not.toContain("\n");
    expect(header.startsWith("attachment; filename=")).toBe(true);
  });
});

describe("buildConvertRequest", () => {
  it("builds a synchronous PDF conversion request", () => {
    const body = buildConvertRequest({
      fileType: "docx",
      key: "forma-export-abc",
      title: "Report.docx",
      fileUrl: "http://localhost:3000/api/editor/file/1?t=x",
    });
    expect(body).toEqual({
      async: false,
      filetype: "docx",
      key: "forma-export-abc",
      outputtype: "pdf",
      title: "Report.docx",
      url: "http://localhost:3000/api/editor/file/1?t=x",
    });
  });
});

describe("parseConvertResponse", () => {
  const success = `<?xml version="1.0" encoding="utf-8"?><FileResult><FileUrl>http://localhost:8083/cache/files/data/conv_x/output.pdf/test.pdf?md5=abc&amp;expires=1&amp;filename=test.pdf</FileUrl><FileType>pdf</FileType><Percent>100</Percent><EndConvert>True</EndConvert></FileResult>`;

  it("accepts a finished conversion and decodes the URL", () => {
    const result = parseConvertResponse(success);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fileUrl).toContain("output.pdf/test.pdf");
      expect(result.fileUrl).toContain("md5=abc&expires=1");
    }
  });

  it("rejects an error code", () => {
    expect(
      parseConvertResponse(
        `<?xml version="1.0"?><FileResult><Error>-3</Error></FileResult>`
      )
    ).toEqual({ ok: false, error: "Conversion failed (code -3)" });
  });

  it("rejects an unfinished conversion", () => {
    expect(
      parseConvertResponse(
        success.replace(
          "<EndConvert>True</EndConvert>",
          "<EndConvert>False</EndConvert>"
        )
      )
    ).toEqual({ ok: false, error: "Conversion did not finish" });
  });

  it("rejects a non-HTTP file URL", () => {
    expect(
      parseConvertResponse(
        success.replace(
          "http://localhost:8083/cache/files/data/conv_x/output.pdf/test.pdf?md5=abc&amp;expires=1&amp;filename=test.pdf",
          "ftp://evil.example.com/x.pdf"
        )
      )
    ).toEqual({
      ok: false,
      error: "Conversion returned an unsafe file URL",
    });
  });

  it("rejects malformed responses", () => {
    expect(parseConvertResponse("")).toEqual({
      ok: false,
      error: "Unexpected conversion response",
    });
    expect(parseConvertResponse("<html>not xml</html>")).toEqual({
      ok: false,
      error: "Unexpected conversion response",
    });
  });
});

describe("FixedWindowRateLimiter", () => {
  it("allows the limit, then blocks, per key", () => {
    const limiter = new FixedWindowRateLimiter(3, 60_000);
    expect(limiter.check("user-1").allowed).toBe(true);
    expect(limiter.check("user-1").allowed).toBe(true);
    expect(limiter.check("user-1").allowed).toBe(true);
    const blocked = limiter.check("user-1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
    // Another user is unaffected.
    expect(limiter.check("user-2").allowed).toBe(true);
  });

  it("resets after the window passes", () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(2, 60_000, () => now);
    expect(limiter.check("u").allowed).toBe(true);
    expect(limiter.check("u").allowed).toBe(true);
    expect(limiter.check("u").allowed).toBe(false);
    now += 60_000;
    expect(limiter.check("u").allowed).toBe(true);
  });

  it("honours the production constants", () => {
    expect(EXPORT_RATE_LIMIT_MAX).toBe(10);
    expect(EXPORT_RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });
});
