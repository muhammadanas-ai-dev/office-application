// Versions UI (Day 23) — pure helpers.
//
// A document's versions are immutable rows in the
// document_versions table (one per saved file). This module
// holds the display helpers: a human file size, the version
// label, whether a version can be restored, and the download
// file name. Nothing here touches the filesystem or a network,
// so it is safe to import from anywhere, including tests.

/** A human file size — "12 KB", "1.2 MB", "0 bytes". */
export function formatVersionSize(sizeBytes: number | null): string {
  if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "Unknown size";
  }
  if (sizeBytes === 0) return "0 bytes";
  if (sizeBytes === 1) return "1 byte";
  if (sizeBytes < 1024) return `${sizeBytes} bytes`;
  const units = ["KB", "MB", "GB"];
  let value = sizeBytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded =
    value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/** The label for a version — "Version 3", or "Version 3 · current". */
export function getVersionLabel(
  versionNumber: number,
  isCurrent: boolean
): string {
  return isCurrent
    ? `Version ${versionNumber} · current`
    : `Version ${versionNumber}`;
}

/**
 * Whether a version can be restored. Restoring the current
 * version is a no-op, so it is refused.
 */
export function isRestorable(
  versionNumber: number,
  currentVersion: number
): boolean {
  return versionNumber !== currentVersion;
}

/** The download file name for a version — "Report v2.pdf". */
export function getVersionFileName(
  title: string,
  versionNumber: number
): string {
  const match = /^(.*?)(\.[^.]+)?$/.exec(title.trim()) ?? [title, title, ""];
  const base = (match[1] ?? "").trim() || "document";
  const extension = match[2] ?? "";
  return `${base} v${versionNumber}${extension}`;
}
