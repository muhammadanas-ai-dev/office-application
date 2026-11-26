// PDF redaction — pure helpers (F26).
//
// Redaction permanently removes content: the user marks
// rectangles on pages, and the engine (in pdf-edit.ts)
// deletes every text run and image placement that intersects
// a marked rectangle, removes annotations that intersect
// one, draws a solid black box over each rectangle, and the
// server then rebuilds the file with qpdf so image objects
// that are no longer drawn are dropped from the file
// entirely.
//
// This module holds the shared types, the request
// validation and the geometry. A text run is removed when
// its ESTIMATED box intersects a region — whole-run removal
// is deliberate: leaving half a word behind would leak the
// very content redaction exists to remove. The estimate
// (average glyph advance ≈ 0.55 × font size) errs on the
// side of removing slightly more, never less.
//
// Honest limits (stated in the UI and docs): vector path
// drawings under a box are covered by the box but their path
// data is not text or an image and is not removed; content
// in optional-content layers or attachments is out of scope.
import type { PdfTextRun } from "@/lib/pdf-content";

/** A redaction failure with the HTTP status the route
 *  should return (its own class so this module never imports
 *  pdf-edit — pdf-edit imports from here). */
export class RedactError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RedactError";
    this.status = status;
  }
}

/** One redaction rectangle, in PDF points (bottom-left
 *  origin), on a 1-based page. */
export interface RedactRegion {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The most regions one redaction accepts. */
export const MAX_REDACT_REGIONS = 50;

/** Validate the regions of a redaction request. Throws
 *  RedactError(400) with a user-readable message. */
export function validateRedactRegions(raw: unknown): RedactRegion[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new RedactError(
      400,
      "Mark at least one area to redact first."
    );
  }
  if (raw.length > MAX_REDACT_REGIONS) {
    throw new RedactError(
      400,
      `Redact at most ${MAX_REDACT_REGIONS} areas at once.`
    );
  }
  const regions: RedactRegion[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      throw new RedactError(400, "Each redaction area must be an object.");
    }
    const r = item as Record<string, unknown>;
    const page = r.page;
    const x = r.x;
    const y = r.y;
    const width = r.width;
    const height = r.height;
    if (
      typeof page !== "number" ||
      !Number.isInteger(page) ||
      page < 1 ||
      typeof x !== "number" ||
      !Number.isFinite(x) ||
      typeof y !== "number" ||
      !Number.isFinite(y) ||
      typeof width !== "number" ||
      !Number.isFinite(width) ||
      width <= 0 ||
      typeof height !== "number" ||
      !Number.isFinite(height) ||
      height <= 0
    ) {
      throw new RedactError(
        400,
        "Each redaction area needs a page and a rectangle with positive width and height."
      );
    }
    regions.push({ page, x, y, width, height });
  }
  return regions;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** True when two rectangles overlap (touching edges count —
 *  for redaction, near enough is reason enough to remove). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  );
}

/**
 * A text run's estimated box: baseline at (x, y), ascender
 * 0.85 × font size above, descender 0.25 × below, width from
 * the average glyph advance (0.55 × font size per character).
 */
export function estimateRunRect(run: PdfTextRun): Rect {
  return {
    x: run.x,
    y: run.y - run.fontSize * 0.25,
    width: Math.max(1, run.text.length * run.fontSize * 0.55),
    height: run.fontSize * 1.1,
  };
}
