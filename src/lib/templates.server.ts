// Template file bytes (Day 16) — server-only.
//
// Reads the committed template DOCX from disk (the same
// process.cwd() pattern the blank-template and OCR modules use).
// If a template file is missing, the apply action fails with a
// clear error instead of creating an empty document.
//
// This module uses node:fs and must never be imported by a client
// component (the registry lives in templates.ts).
import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTemplate, type TemplateId } from "@/lib/templates";

export function getTemplateBytes(id: TemplateId): Buffer {
  const template = getTemplate(id);
  const path = join(
    process.cwd(),
    "src",
    "lib",
    "templates",
    template.fileName
  );
  try {
    return readFileSync(path);
  } catch {
    throw new Error(
      `The ${template.name} template file is missing. Regenerate it with scripts/generate-templates.py.`
    );
  }
}
