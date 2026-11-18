# Day 15 plan — Fix "New blank document" (create a real blank file)

Owner instruction (2026-11-18 16:07 PKT): keep Supabase Storage
(the library stays on it; only the quota/plan/cloud-drive UI is
skipped), start with audit item #1 — "New blank document" — and
implement it with the feature loop; the same process follows for
the rest of the queue. Audit: `docs/project-brief/FEATURE_AUDIT.md`
§16 item 1.

## 1. Research

### The bug
`createDocument` (`src/features/library/actions.ts`, line ~411)
inserts a document row with only a title — no `file_path`, no
`mime_type`, no `size_bytes`, and no `document_versions` row.
The button says "New blank document" but the result cannot be
opened in the editor (the editor needs a file), has no version 1,
and shows up in the library with no file to download. It is a
decorative control, not a working feature (the audit's definition
of done catches it).

### What a blank office file is
A DOCX/XLSX/PPTX is a ZIP (OOXML) with `[Content_Types].xml`,
`_rels/.rels`, and the main part (`word/document.xml`,
`xl/workbook.xml` + `xl/worksheets/sheet1.xml`,
`ppt/presentation.xml` + `ppt/slides/slide1.xml`). A file made by
a real Office library (python-docx, openpyxl, python-pptx) is a
valid Office file that ONLYOFFICE opens as word/cell/slide.
Verified on this VM: python-docx, openpyxl and python-pptx 1.0.2
are all installed and import cleanly (python-pptx was installed
with `pip install --break-system-packages` for this task; it does
not survive a VM reset, but the generated files do — they are
committed).

### Approaches considered
1. **Generate the blank file in code at runtime** (a ZIP library
   in Node). Rejected: no ZIP library is in node_modules, adding
   one for three tiny files is the wrong weight, and hand-rolling
   a ZIP writer is error-prone.
2. **Committed minimal templates + a generator script** (chosen).
   Three small binary files (`blank.docx`, `blank.xlsx`,
   `blank.pptx`) generated once by `scripts/generate-blank-
   templates.py` (python-docx / openpyxl / python-pptx) and
   committed in `src/lib/blank-templates/`. The script is the
   source of truth — the files are not magic binaries, they are
   reproducible. The server reads them from disk (the same
   `process.cwd()` pattern the OCR worker uses for its binary).
   They are a few KB each, version-controlled, and verifiable
   (unzip + XML parse + content-type check).
3. **Ask the ONLYOFFICE editor to create a new document.**
   Rejected: it needs the document server, which is down.

### The established pattern to follow
`uploadDocument` and `duplicateDocument` (same file) are the
pattern: validate the input (Zod), check the editor role, upload
or copy the file in Storage at
`buildStoragePath(workspace.id, newId, 1, fileName)`, insert the
`documents` row (file_path, mime_type, size_bytes, version 1) and
the `document_versions` row (version 1), and remove the uploaded
file again if either insert fails. `createDocument` will do the
same, with the template bytes as the file instead of an uploaded
one.

### Decisions
- The form gains a type selector: **Document (.docx)** /
  **Spreadsheet (.xlsx)** / **Presentation (.pptx)**. Default:
  Document. The type is a Zod enum in `documentTitleSchema`
  (so an unknown type is rejected with a clear error, not
  silently defaulted).
- The file name in Storage is the user's title + the extension,
  sanitised the same way the upload sanitises a file name
  (`[^A-Za-z0-9._-]+` → `_`); the documents-row title is the
  user's title without the extension (the same rule as the
  upload).
- MIME types come from `ALLOWED_UPLOAD_TYPES` (docx/xlsx/pptx
  are already there) — no new MIME table.
- The blank files open in the editor as word/cell/slide through
  the existing `getEditorFileType` mapping; nothing in the
  editor integration changes.
- The old title-only rows (created before this fix) are left as
  they are — they are still visible in the library, and the
  library already handles a document with no file (no open
  link). No migration, no backfill.

## 2. Small tasks (in order)

1. **Generate the blank templates.** Write
   `scripts/generate-blank-templates.py` (python-docx → a blank
   document with one empty paragraph; openpyxl → a blank
   workbook with one empty sheet; python-pptx → a blank
   presentation with one blank slide). Run it; verify each file
   (unzip, `[Content_Types].xml` lists the right main part,
   the main XML parses, the size is a few KB). Commit the three
   files in `src/lib/blank-templates/` + the script.
   *Test: the verification output for all three files.*
2. **Pure module + unit tests.** `src/lib/blank-templates.ts`:
   `BLANK_TEMPLATE_TYPES` (docx/xlsx/pptx with label, mime
   type, extension, file name), `getBlankTemplateBytes(ext)`
   (reads the file from disk, throws a clear error if it is
   missing), `getBlankTemplateFileName(title, ext)`.
   `src/lib/blank-templates.test.ts`: every type returns bytes
   that start with the ZIP magic `PK\x03\x04`; the bytes unzip
   and contain `[Content_Types].xml`; the mime types match
   `ALLOWED_UPLOAD_TYPES`; unknown types are rejected; the file
   name sanitises the title.
   *Test: the new unit tests pass.*
3. **Schema.** Extend `documentTitleSchema` with
   `type: z.enum(["docx","xlsx","pptx"]).default("docx")`.
   Add schema tests in `src/features/library/schemas.test.ts`.
   *Test: the schema tests pass (unknown type rejected, missing
   type defaults to docx).*
4. **Server action.** Rewrite `createDocument` in
   `src/features/library/actions.ts`: parse the schema, check
   the editor role, generate the new id, read the template
   bytes, upload to Storage at the v1 path, insert the documents
   row + the version-1 row, remove the uploaded file if either
   insert fails (the upload/duplicate pattern). Return
   `{ok: true}`.
   *Test: the action's behaviour is covered by the live e2e.*
5. **UI.** `CreateDocumentForm` in
   `src/components/library/library-forms.tsx`: a type selector
   (three radio buttons or a select — Document / Spreadsheet /
   Presentation) next to the title input, posted as `type`.
   *Test: the form renders the three options (checked in the
   live e2e page load).*
6. **Live e2e harness.** `scripts/e2e-blank-document-test.mjs`
   (focused, same auth pattern as the convert harness): as user
   A, load /files, extract the createDocument action id from
   the rendered form, POST the form (title + type) for each of
   docx/xlsx/pptx, then verify in the database that each new
   document has a file_path, the right mime_type, version 1, and
   a version-1 row; download the stored bytes and check the ZIP
   magic + `[Content_Types].xml`; load the editor page for the
   blank DOCX (200, right document type); user B cannot create
   in A's workspace (the action is workspace-scoped — verify B
   gets an error, not a document in A's workspace); signed-out
   POST redirects to login (307). If the action-id extraction
   proves too brittle, fall back to verifying the created
   document through the file route + editor page after creating
   it through the form — and record which mechanism ran.
   *Test: the harness passes end to end.*
7. **Checks + docs + commit.** Typecheck, lint, Prettier,
   build, restart the app. Update `WPS_LEVEL_PLAN.md` (the
   "Upload/open" row + the Templates prerequisite note),
   `feature-matrix.csv` (FORMA-024), `known-limitations.md`
   (the blank-document gap is closed), `CHANGELOG.md` (Day 15
   entry), `FEATURE_AUDIT.md` (§15 item 1 + §16 item 1 →
   Done), `docs/handoffs/day-15.md`. Commit on branch
   `day-15-blank-document`. Update `~/MEMORY.md`. Reply to the
   owner.

## 3. What is NOT in this feature

- Templates (the next feature) — this only makes a blank file;
  applying a template is a separate feature that will use this
  one.
- No change to the editor, the upload flow, or the library list.
- No migration (the schema does not change; the old title-only
  rows stay as they are).
