// Blank template bytes (Day 15) — server-only.
//
// Reads the committed template files from disk (the same
// process.cwd() pattern the OCR worker uses for its binary). If a
// template is missing, the server action fails with a clear error
// instead of creating a title-only document — the bug this feature
// fixes.
//
// This module uses node:fs and must never be imported by a client
// component (the pure type list lives in blank-templates.ts).
import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BlankTemplateExt } from "@/lib/blank-templates";

export function getBlankTemplateBytes(ext: BlankTemplateExt): Buffer {
  const path = join(
    process.cwd(),
    "src",
    "lib",
    "blank-templates",
    `blank.${ext}`
  );
  try {
    return readFileSync(path);
  } catch {
    throw new Error(
      `The blank ${ext.toUpperCase()} template is missing. Regenerate it with scripts/generate-blank-templates.py.`
    );
  }
}
