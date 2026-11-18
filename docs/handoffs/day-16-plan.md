# Day 16 plan — Templates (original gallery: resume, letter, report)

Owner instruction (2026-11-18 16:16 PKT): "okay go head" — start
with resume, letter and report as the first three templates.
Audit queue item 2 (`docs/project-brief/FEATURE_AUDIT.md` §16).
The Day 15 blank-document fix is the prerequisite (applying a
template = creating a document from a template file instead of
from a blank file), and it is done.

## 1. Research

### What a template is here
A template is a real DOCX file with real, original content
(Forma's own — no WPS template, no copied text), committed in
the project like the blank templates (Day 15). Applying it creates
a new document in the user's library from that file (the same
Storage + documents + versions pattern as `createDocument`).
The three templates:
- **Resume** — a one-page professional resume (name, contact,
  summary, experience, education, skills) with placeholder text
  the user replaces with their own details.
- **Letter** — a formal business letter (sender address, date,
  recipient, subject, body, closing, signature) with placeholders.
- **Report** — a structured business report (title page heading,
  executive summary, findings with sub-headings, a table,
  conclusion, recommendations).

All three are DOCX only in v1 (the blank-document types are
docx/xlsx/pptx, but a template gallery for spreadsheets and
presentations — budget tracker, pitch deck — is a later step;
the audit's remaining list keeps the gallery to documents first).

### How a template is built
python-docx (already installed, used for the blank DOCX on Day
15) builds a styled document: headings (Heading 1/2), normal
paragraphs, a table (for the report's findings and the resume's
skills), bold runs for labels. The generator script
`scripts/generate-templates.py` is the source of truth — it builds
the three DOCX files AND their preview data, so the preview can
never drift from the file.

### How the preview works (verified on this VM)
A real visual preview is possible without the document server:
LibreOffice headless converts DOCX → PDF (`soffice --headless
--convert-to pdf`), and `pdftoppm` (already used by the OCR
worker) renders the first page to PNG. Verified 2026-11-18: a
test DOCX converted to PDF (13,912 bytes) and rendered to a
first-page PNG (12,211 bytes). The javaldx warning is harmless
(Java is not needed for the conversion). The generator script
renders each template's first page to a PNG thumbnail
(`public/templates/<slug>.png`, served as a static asset) and
extracts the structured text (headings + paragraphs, in order)
into a preview JSON (`src/lib/templates/<slug>.preview.json`).
The gallery shows the thumbnail + the structured text; both are
committed and reproducible from the script.

### The data model
Templates are app-level (not per-user, not per-workspace) — a
fixed gallery of Forma's own templates. No database table in v1:
the registry is a pure module (`src/lib/templates.ts`) listing
id (slug), name, description, category, the file name, the
thumbnail path, and the preview (imported from the JSON). The
server module (`src/lib/templates.server.ts`) reads the DOCX bytes
(the Day 15 split: pure list client-safe, bytes server-only).
"Save a custom template" (turn one of your documents into a
template) is NOT in this feature — it needs a per-user template
store (a table + Storage), which is a separate feature; it is
recorded as the follow-up in §8.

### The apply flow
A new server action `applyTemplate(templateId, title, folderId)`
in `src/features/library/actions.ts` (next to `createDocument`):
validate the template id against the registry (Zod enum of the
known slugs — an unknown id is rejected, not silently defaulted),
check the editor role, read the template bytes, upload them to
Storage at the v1 path, insert the documents row + the version-1
row, remove the uploaded file if either insert fails. The file
name is the user's title + `.docx`; the title is the user's title.
The gallery page (`/templates`, which is currently a placeholder)
lists the three templates with their thumbnail, name, description
and preview, and each has a "Use this template" form (title +
hidden template id) that posts to the action.

## 2. Small tasks (in order)

1. **Generate the templates.** Write
   `scripts/generate-templates.py` (python-docx): build the three
   DOCX files with real, original content and structure; convert
   each to PDF with LibreOffice headless; render the first page
   to a PNG thumbnail in `public/templates/`; extract the
   structured text (headings + paragraphs in order) to
   `src/lib/templates/<slug>.preview.json`. Verify each DOCX
   (unzip, main part parses), each PNG exists and is a valid PNG,
   each JSON lists the template's real headings.
   *Test: the verification output for all three templates.*
2. **Pure registry + unit tests.** `src/lib/templates.ts`:
   `TEMPLATES` (id, name, description, category, file name,
   thumbnail path, preview — the preview JSON imported), `get
   Template(id)`, `isTemplateId(id)`. `src/lib/templates.
   server.ts`: `getTemplateBytes(id)` (reads the DOCX from disk,
   clear error if missing). `src/lib/templates.test.ts`: the
   registry lists exactly the three templates; every template's
   file exists and is a valid DOCX (ZIP magic + word/document.xml);
   every thumbnail exists and is a valid PNG; every preview JSON
   is non-empty and its first heading matches the template; an
   unknown id is rejected.
   *Test: the new unit tests pass.*
3. **Schema + server action.** Add `applyTemplateSchema`
   (`templateId` = the enum of the three slugs, `title`, `folderId`)
   to `src/features/library/schemas.ts` + tests. Add
   `applyTemplate` to `src/features/library/actions.ts` (the
   createDocument pattern: validate, role check, read bytes,
   upload as v1, insert rows, clean up on failure).
   *Test: the schema tests pass; the action is covered by the
   live e2e.*
4. **Gallery UI.** Replace the placeholder in
   `src/app/(workspace)/templates/page.tsx` with the real gallery:
   a server component that lists `TEMPLATES` — each card shows
   the thumbnail (`/templates/<slug>.png`), name, description,
   the preview text (headings + first lines), and a "Use this
   template" form (title input + hidden template id, posts to
   `applyTemplate`). The form lives in
   `src/components/library/library-forms.tsx` (next to
   `CreateDocumentForm`) or a new `templates-client.tsx` — put it
   in the library forms file, since it is a library action.
   *Test: the gallery renders the three templates (checked in
   the live e2e page load).*
5. **Live e2e harness.** `scripts/e2e-templates-test.mjs`
   (focused, the Day 15 form-POST pattern): as user A, load
   /templates (200, shows Resume/Letter/Report + the thumbnails),
   extract the apply action fields from the rendered form, POST
   the form for each template, then verify in the database that
   each new document has a file, the DOCX MIME type, version 1
   and a version-1 row, and that the stored bytes contain the
   template's distinctive text (e.g. the resume's name heading);
   user B does not see A's applied document; an unknown template
   id is refused (no document created); signed-out POST redirects
   to login (307).
   *Test: the harness passes end to end.*
6. **Checks + docs + commit.** Typecheck, lint, Prettier, build,
   restart the app. Update `WPS_LEVEL_PLAN.md` (the Templates
   row → Done, first three), `feature-matrix.csv` (FORMA-025),
   `known-limitations.md` (templates are DOCX-only in v1; no
   custom-template saving yet), `CHANGELOG.md` (Day 16 entry),
   `FEATURE_AUDIT.md` (§9 + §16 item 2 → Done), `docs/handoffs/
   day-16.md`. Commit on branch `day-16-templates`. Update
   `~/MEMORY.md`. Reply to the owner.

## 3. What is NOT in this feature

- Spreadsheet/presentation templates (budget tracker, pitch deck)
  — a later step; the gallery is DOCX-only in v1.
- "Save a custom template" — needs a per-user template store (a
  table + Storage); recorded as the follow-up.
- No change to the editor, the upload flow, or the blank-document
  flow. No migration (no new table in v1).
- No WPS template, branding or font is used; the content is
  Forma's own.
