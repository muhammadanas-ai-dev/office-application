// PDF export helpers (Phase B, feature 1) — pure functions, no secrets.
//
// The server-side conversion (ONLYOFFICE ConvertService call) lives
// in export.server.ts. Everything here is importable from server
// components, route handlers and tests. No value in this file is
// hardcoded per document, user or environment: limits are named
// constants, file names are derived from the document title, and the
// document server URL/secret come from the environment at call time.

import { getEditorFileType } from "@/lib/editor";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";

/**
 * Sanitize a file name for a download header. Different from
 * sanitizeFileName (which is for Storage paths): spaces are kept
 * because a quoted Content-Disposition filename may contain them,
 * while quotes, backslashes, slashes, control characters and
 * non-ASCII characters are replaced so the header can never break
 * out of its quoted value.
 */
export function sanitizeDownloadName(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9 ._-]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || "document";
}

/** A conversion may take a while on a slow server; 2 minutes is the cap. */
export const EXPORT_TIMEOUT_MS = 2 * 60 * 1000;

/** An exported PDF may not exceed the 50 MB upload cap. */
export const MAX_EXPORT_BYTES = MAX_UPLOAD_BYTES;

/** Per-user export rate limit: 10 exports per minute. */
export const EXPORT_RATE_LIMIT_MAX = 10;
export const EXPORT_RATE_LIMIT_WINDOW_MS = 60 * 1000;

/**
 * Whether a MIME type can be exported to PDF. Every format the
 * editor opens is convertible, except PDF itself (already a PDF —
 * use Download instead).
 */
export function isExportableToPdf(mimeType: string | null): boolean {
  const fileType = getEditorFileType(mimeType);
  return fileType !== null && fileType !== "pdf";
}

/** File name for the downloaded PDF, e.g. "Quarterly report.pdf". */
export function getExportFileName(title: string): string {
  const base = title.trim() || "document";
  const withoutPdf = base.replace(/\.pdf$/i, "");
  return `${sanitizeDownloadName(withoutPdf)}.pdf`;
}

/**
 * File name to hand to the converter as the source document's name,
 * e.g. "Quarterly report.docx". The converter needs the real
 * extension so it knows the input format.
 */
export function getSourceFileName(title: string, fileType: string): string {
  const base = title.trim() || "document";
  const withoutExt = base.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  return `${sanitizeDownloadName(withoutExt)}.${fileType}`;
}

/**
 * Content-Disposition for the download. The ASCII `filename` is the
 * safe fallback; `filename*` carries the original title in UTF-8
 * (RFC 5987) so non-English titles survive the download.
 */
export function buildContentDisposition(title: string): string {
  const ascii = getExportFileName(title);
  const utf8 = `${(title.trim() || "document").replace(/\.pdf$/i, "")}.pdf`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`;
}

/** The ConvertService request body (without the JWT token). */
export interface ConvertRequestBody {
  async: boolean;
  filetype: string;
  key: string;
  outputtype: string;
  title: string;
  url: string;
}

export function buildConvertRequest(args: {
  fileType: string;
  key: string;
  title: string;
  fileUrl: string;
  outputType?: string;
}): ConvertRequestBody {
  return {
    async: false,
    filetype: args.fileType,
    key: args.key,
    outputtype: args.outputType ?? "pdf",
    title: args.title,
    url: args.fileUrl,
  };
}

export type ConvertResponse =
  { ok: true; fileUrl: string } | { ok: false; error: string };

/**
 * Parse a ConvertService.ashx XML response. Success carries a
 * FileUrl; failure carries an Error code. Anything else is a
 * malformed response — never treated as a success.
 */
export function parseConvertResponse(text: string): ConvertResponse {
  const errorMatch = text.match(/<Error>([^<]*)<\/Error>/);
  if (errorMatch) {
    return { ok: false, error: `Conversion failed (code ${errorMatch[1]})` };
  }
  const urlMatch = text.match(/<FileUrl>([^<]+)<\/FileUrl>/);
  const endMatch = text.match(/<EndConvert>([^<]*)<\/EndConvert>/);
  if (!urlMatch) {
    return { ok: false, error: "Unexpected conversion response" };
  }
  if (endMatch && endMatch[1] !== "True") {
    return { ok: false, error: "Conversion did not finish" };
  }
  const fileUrl = urlMatch[1].replace(/&amp;/g, "&");
  if (!fileUrl.startsWith("http://") && !fileUrl.startsWith("https://")) {
    return { ok: false, error: "Conversion returned an unsafe file URL" };
  }
  return { ok: true, fileUrl };
}

/**
 * In-memory per-key rate limiter (fixed window). One instance per
 * server process: it bounds abuse on a single-instance deployment
 * and is honest about that limit — a multi-instance deployment
 * needs a shared (database-backed) limiter instead, which is a
 * Day 14 hardening item. The `now` function is injectable so
 * tests can control time.
 */
export class FixedWindowRateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<
    string,
    { count: number; start: number }
  >();

  constructor(
    max: number,
    windowMs: number,
    now: () => number = () => Date.now()
  ) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.start >= this.windowMs) {
      this.buckets.set(key, { count: 1, start: now });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (bucket.count < this.max) {
      bucket.count += 1;
      return { allowed: true, retryAfterMs: 0 };
    }
    return {
      allowed: false,
      retryAfterMs: bucket.start + this.windowMs - now,
    };
  }
}
