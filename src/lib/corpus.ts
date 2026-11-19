// Compatibility test corpus (Day 26) — pure helpers.
//
// The corpus is a fixed set of representative documents +
// a manifest (`corpus/manifest.json`) + a runner
// (`scripts/corpus-test.mjs`). The manifest is the source of
// truth for what is in the corpus and what each file tests:
// one entry per file, naming the format, the features it
// exercises, and the checks the runner must run on it.
//
// The generator (`scripts/generate-corpus.py`) writes the
// manifest, so it can never drift from the files. This module
// validates a manifest object (type guards), says which
// checks apply to a file, and formats the runner's results.
// Nothing here touches the filesystem or a network, so it is
// safe to import from anywhere, including tests.

/** Every check the runner can run on a corpus file. */
export const CORPUS_CHECKS = [
  "upload",
  "pdf-tools",
  "ocr",
  "security",
  "corrupt",
  "images-to-pdf",
  "pdf-export",
  "round-trip",
  "page-count",
] as const;

export type CorpusCheck = (typeof CORPUS_CHECKS)[number];

export function isCorpusCheck(value: unknown): value is CorpusCheck {
  return (
    typeof value === "string" &&
    (CORPUS_CHECKS as readonly string[]).includes(value)
  );
}

/**
 * The checks that need the ONLYOFFICE docserver. While the
 * docserver is down the runner skips them with a clear note
 * instead of claiming they passed.
 */
export const DOCSERVER_CHECKS: readonly CorpusCheck[] = [
  "pdf-export",
  "round-trip",
] as const;

/** True when the check needs the ONLYOFFICE docserver. */
export function needsDocserver(check: CorpusCheck): boolean {
  return (DOCSERVER_CHECKS as readonly string[]).includes(check);
}

/** One file in the corpus (one entry in the manifest). */
export interface CorpusFile {
  /** A short stable id, e.g. "docx-rich". */
  id: string;
  /** The file name inside corpus/, e.g. "docx-rich.docx". */
  file: string;
  /** The upload format, e.g. "docx". */
  format: string;
  /** A human-readable title, e.g. "Rich Word document". */
  title: string;
  /** The features this file exercises, e.g. ["table", "image"]. */
  features: string[];
  /** The checks the runner must run on this file. */
  checks: CorpusCheck[];
  /**
   * Text the OCR check expects to find (for scanned PDFs and
   * images). Absent when the file has no OCR check.
   */
  expectedText?: string;
  /**
   * The password for a protected file (for the security check).
   * This is the corpus fixture's PUBLIC test password — it is
   * not a real credential and must never be a real one.
   */
  password?: string;
}

/** The corpus manifest (`corpus/manifest.json`). */
export interface CorpusManifest {
  /** The manifest format version (1 for the first corpus). */
  version: number;
  /** The files, in the order the runner checks them. */
  files: CorpusFile[];
}

/** Thrown when a manifest object is not a valid corpus manifest. */
export class CorpusManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorpusManifestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Validate a manifest object (from JSON) and return it typed.
 * Throws CorpusManifestError with a clear message on the
 * first problem found: wrong version, missing fields, an
 * unknown check, a duplicate file id, or a file name that
 * would escape the corpus directory.
 */
export function parseCorpusManifest(data: unknown): CorpusManifest {
  if (!isRecord(data)) {
    throw new CorpusManifestError("The manifest must be a JSON object.");
  }
  if (data.version !== 1) {
    throw new CorpusManifestError(
      `Unsupported manifest version: ${String(data.version)} (expected 1).`
    );
  }
  if (!Array.isArray(data.files) || data.files.length === 0) {
    throw new CorpusManifestError("The manifest must list at least one file.");
  }
  const seenIds = new Set<string>();
  const files: CorpusFile[] = data.files.map((raw, i) => {
    const where = `file #${i + 1}`;
    if (!isRecord(raw)) {
      throw new CorpusManifestError(`${where} must be an object.`);
    }
    if (typeof raw.id !== "string" || raw.id.length === 0) {
      throw new CorpusManifestError(`${where} needs a non-empty id.`);
    }
    if (seenIds.has(raw.id)) {
      throw new CorpusManifestError(`Duplicate file id: ${raw.id}.`);
    }
    seenIds.add(raw.id);
    if (typeof raw.file !== "string" || raw.file.length === 0) {
      throw new CorpusManifestError(
        `${where} (${raw.id}) needs a non-empty file name.`
      );
    }
    // A file name must be a plain name inside corpus/ — no
    // path separators, so a manifest can never point outside
    // the corpus directory.
    if (raw.file.includes("/") || raw.file.includes("\\")) {
      throw new CorpusManifestError(
        `${where} (${raw.id}): the file name must not contain a path: ${raw.file}.`
      );
    }
    if (typeof raw.format !== "string" || raw.format.length === 0) {
      throw new CorpusManifestError(
        `${where} (${raw.id}) needs a non-empty format.`
      );
    }
    if (typeof raw.title !== "string" || raw.title.length === 0) {
      throw new CorpusManifestError(
        `${where} (${raw.id}) needs a non-empty title.`
      );
    }
    if (!isStringArray(raw.features)) {
      throw new CorpusManifestError(
        `${where} (${raw.id}) needs a features array of strings.`
      );
    }
    if (
      !Array.isArray(raw.checks) ||
      raw.checks.length === 0 ||
      !raw.checks.every(isCorpusCheck)
    ) {
      throw new CorpusManifestError(
        `${where} (${raw.id}) needs at least one known check.`
      );
    }
    if (
      raw.expectedText !== undefined &&
      typeof raw.expectedText !== "string"
    ) {
      throw new CorpusManifestError(
        `${where} (${raw.id}): expectedText must be a string.`
      );
    }
    if (raw.password !== undefined && typeof raw.password !== "string") {
      throw new CorpusManifestError(
        `${where} (${raw.id}): password must be a string.`
      );
    }
    return {
      id: raw.id,
      file: raw.file,
      format: raw.format,
      title: raw.title,
      features: raw.features,
      checks: raw.checks as CorpusCheck[],
      ...(raw.expectedText !== undefined
        ? { expectedText: raw.expectedText as string }
        : {}),
      ...(raw.password !== undefined
        ? { password: raw.password as string }
        : {}),
    };
  });
  return { version: 1, files };
}

/** The checks the runner must run on a file, in manifest order. */
export function checksForFile(file: CorpusFile): CorpusCheck[] {
  return [...file.checks];
}

/** One check result from the runner. */
export interface CorpusResult {
  fileId: string;
  check: CorpusCheck;
  status: "pass" | "fail" | "skip";
  /** A short note (the failure reason, or why it was skipped). */
  detail?: string;
}

/** One line of the runner's report, e.g. "PASS  docx-rich  upload". */
export function formatCorpusResult(result: CorpusResult): string {
  const label =
    result.status === "pass"
      ? "PASS"
      : result.status === "fail"
        ? "FAIL"
        : "SKIP";
  const detail = result.detail ? ` — ${result.detail}` : "";
  return `${label}  ${result.fileId}  ${result.check}${detail}`;
}

/** The counts for a run's results. */
export interface CorpusSummary {
  pass: number;
  fail: number;
  skip: number;
  total: number;
}

/** Count the pass / fail / skip results of a run. */
export function summariseCorpusResults(results: CorpusResult[]): CorpusSummary {
  let pass = 0;
  let fail = 0;
  let skip = 0;
  for (const r of results) {
    if (r.status === "pass") pass++;
    else if (r.status === "fail") fail++;
    else skip++;
  }
  return { pass, fail, skip, total: results.length };
}

/** One line summarising a run, e.g. "18/20 checks passed (2 skipped)". */
export function formatCorpusSummary(summary: CorpusSummary): string {
  const skipped = summary.skip > 0 ? ` (${summary.skip} skipped)` : "";
  return `${summary.pass}/${summary.total} checks passed${skipped}`;
}
