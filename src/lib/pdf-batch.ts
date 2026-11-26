// Batch PDF export (F28) — pure helpers.
//
// One request converts several library PDFs with the
// text-based exporters (F24/F25 + plain text) and returns
// one ZIP. This module owns the request limits and the
// output file naming (safe, de-duplicated); the server
// module does the conversions.

export const MAX_BATCH_DOCUMENTS = 10;

export type BatchExportFormat = "txt" | "xlsx" | "pptx";

export const BATCH_EXPORT_FORMATS: {
  key: BatchExportFormat;
  label: string;
  extension: string;
}[] = [
  { key: "txt", label: "Text (.txt)", extension: "txt" },
  { key: "xlsx", label: "Excel (.xlsx)", extension: "xlsx" },
  { key: "pptx", label: "PowerPoint (.pptx)", extension: "pptx" },
];

export function batchExtension(format: BatchExportFormat): string {
  return format;
}

/** A filesystem-safe base name from a document title. */
export function safeBatchBaseName(title: string): string {
  const base = title
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return base.length > 0 ? base : "document";
}

/**
 * The output file name for one document in the batch ZIP,
 * de-duplicated against the names already taken (appends
 * " (2)", " (3)", …). Records the result in `taken`.
 */
export function batchFileName(
  title: string,
  format: BatchExportFormat,
  taken: Set<string>
): string {
  const base = safeBatchBaseName(title);
  const extension = batchExtension(format);
  let candidate = `${base}.${extension}`;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} (${n}).${extension}`;
    n += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

export function getBatchZipName(): string {
  return "forma-batch-export.zip";
}
