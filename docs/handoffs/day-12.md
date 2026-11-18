# Day 12 handoff — PDF form builder (Phase B, feature 5)

Date: 2026-11-18. Branch: `day-12-pdf-form-builder`.
Owner instruction (2026-11-18 14:12 PKT): "okay now move to the
next feature find which feature which have in the wps see and
then implement them properly". This day follows the standing
loop (research → plan → small tasks → implement → test).
The research + plan live in `docs/handoffs/day-12-plan.md`.

## 1. What was researched

- **What WPS has.** The Day 1 WPS inventory records WPS's
  **online form builder**: add form fields to a PDF — text
  fields, checkboxes, radio buttons, dropdowns — so the PDF
  becomes a fillable form. That is the feature this day builds,
  as a Forma-own clean-room implementation on pdf-lib. WPS also
  has a date field type; pdf-lib has no native date field (a date
  field is a text field with a date format in the AcroForm
  model), so the builder offers the five pdf-lib field types and
  claims no native date field.
- **pdf-lib's create-field API** (read from node_modules/pdf-lib):
  `form.createTextField(name)`, `createCheckBox`,
  `createDropdown`, `createOptionList`, `createRadioGroup`;
  `field.addToPage(page, options)` places the widget (x, y,
  width, height in PDF points, origin bottom-left) with
  textColor/backgroundColor/borderColor/borderWidth, and sets the
  appearance stream (default font Helvetica). Defaults when
  omitted: x=0, y=0, width=200, height=50 (text field).
- **Radio groups are special:** each option is its own widget,
  placed with `radioGroup.addOptionToPage(option, page, options)`.
  The builder lays the options out as a vertical column starting
  at the anchor, 20 pt per option (16 pt box + 4 pt gap), going
  down (decreasing y). The whole column must fit on the page.
- **Field properties:** `textField.enableMultiline()`,
  `textField.setMaxLength(n)`, `field.enableRequired()`,
  `field.enableReadOnly()`, `dropdown.addOptions([...])`,
  `optionList.addOptions([...])`, `optionList.enableMultiselect()`,
  `dropdown.enableMultiselect()`.
- **Widget Rect quirk:** `createWidget` grows the rect by the
  border width and centres the border on the requested edge, so
  the raw /Rect is the requested rect expanded by half a point
  on every side (x = requested x - 0.5, width = requested
  width + 1, with borderWidth 1). The unit tests assert the
  expanded rect exactly.
- **Coordinate conversion (UI):** PDF.js renders with origin
  top-left, y down; PDF coordinates have origin bottom-left, y
  up. For a click at CSS pixel (cx, cy) on a page rendered at
  scale s with page height H (PDF points): pdfX = cx / s,
  pdfY(top) = H - cy / s, and the field's bottom-left y is
  pdfY(top) - height. The client clamps the rect onto the page
  (the server re-validates against the real page size).

## 2. Completed functionality

- **Add a field** (`POST /api/documents/[id]/pdf/add-field`):
  text, checkbox, radio group, dropdown, option list, placed on
  a page at a position, with name, options, multi-line, max
  length, multi-select, required, read-only and a default value.
  Every add creates a NEW immutable version; the original is
  never overwritten.
- **Remove a field** (`POST /api/documents/[id]/pdf/remove-field`):
  removes the field and its widget(s) completely (see §6b — the
  builder removes the widget refs from the pages itself, because
  pdf-lib's removeField does not).
- **UI** (`/documents/[id]/pdf-builder`): PDF.js viewer, a
  toolbar to pick a field type, click-to-place (a dashed outline
  shows where the field will go; clicking elsewhere moves it), a
  properties panel (name, options one per line, width/height,
  multi-line, max length, multi-select, required, read-only,
  default value), an "Add field" button, and a field list with a
  remove button per field. A "Fill form" link goes to the Day 11
  fill page; a "Build form" link was added to the library for PDF
  documents. A PDF with no fields yet is a blank canvas, not an
  error: the first field added creates the form.

## 3. Code and data changes

- `src/lib/pdf-form-builder.ts` (new): `PdfFormBuilderError`
  (status), `addFormField(bytes, spec)` (atomic pre-validation:
  name, page, rect, options, default value, duplicate name,
  non-terminal name — then create + place, radio column layout),
  `removeFormField(bytes, name)` (getFieldMaybe + removeField +
  the widget-ref cleanup), re-exports `listPdfFormFields`.
- `src/lib/pdf-form-builder.server.ts` (new): rate limiter
  (10/min), reuses `fetchFormDocument` /
  `fetchFormDocumentBytes` / `saveFilledVersion` from
  pdf-form.server.ts (the same RLS, rate limit and version
  bookkeeping as the fill feature), `builderJsonResponse`.
- Routes: `src/app/api/documents/[id]/pdf/add-field/route.ts`
  (POST, Zod spec) and `src/app/api/documents/[id]/pdf/remove-field/route.ts`
  (POST, Zod name). Both catch PdfFormBuilderError (400s) and
  PdfFormError (the 404 from fetchFormDocument).
- UI: `src/app/(workspace)/documents/[id]/pdf-builder/page.tsx`
  (server: RLS load, page count + fields, honest empty states)
  and `src/components/pdf-form-builder/pdf-form-builder-client.tsx`
  (PDF.js viewer with dynamic import, click-to-place, properties
  panel, field list).
- Library: `DocumentActions` gains a `pdfBuilderHref` prop and a
  "Build form" link (`library-forms.tsx`, `library-list.tsx`).
- Tests: `src/lib/pdf-form-builder.test.ts` (18 tests; fixtures
  built in-test with pdf-lib, including an XFA fixture saved with
  `updateFieldAppearances: false` and a raw-/Rect helper).
- Harness: `scripts/e2e-edit-test.mjs` gains section 7 (20
  builder checks) on the plain PDF (pdf1Id, at version 5).
- Docs: `docs/project-brief/WPS_LEVEL_PLAN.md` (form builder
  Done, OCR Next), `docs/feature-matrix.csv` (FORMA-021),
  `docs/known-limitations.md` (builder limits), CHANGELOG
  (Day 12 entry).

## 4. Tests

- **Unit: 157/157 pass (16 files)** — 18 new builder tests.
- **Live RLS: 9/9 pass** (`npm run test:live` — unchanged).
  Local RLS was not re-run this day (no migration or policy
  change; the builder reuses the form feature's RLS path).
- **Live e2e PDF editing + form fill + form builder: 70/70 pass**
  (`node scripts/e2e-edit-test.mjs`) — the 50 Day 9/10/11
  checks plus 20 new builder checks: add a text field (v6),
  a dropdown (v7), a radio group (v8); all three listed; the
  built fields fillable via the fill-form route (v9) with the
  filled value showing in the PDF; duplicate name, out-of-bounds
  placement and a missing page refused (400); remove the
  dropdown (v10), the list keeps the other two, v10 still a
  valid 2-page PDF; removing a non-existent field refused (400);
  cross-user 404s; signed-out 307s; builder page loads for A
  (200, shows "Build form"), B sees "Document not found".
- **Lint: 0 errors, 0 warnings. Typecheck, build: pass.**
  (The format check flags 4 pre-existing Day 11 files
  — pdf-form.ts, pdf-form.server.ts, pdf-form.test.ts,
  pdf-form-client.tsx — which were not touched this day and
  were left alone.)

## 5. Deployment verification

- Build passes; the app server was restarted with the new build
  (next-server stopped via `fuser -k 3000/tcp`, then `next start
  -p 3000`). App root 200, supabase-status reachable.
- Preview deployment: NOT PERFORMED (no Git/Vercel remote
  access). No Preview URL is claimed.

## 6. Security/licensing checks

- Secret scan of the staged diff: clean (no keys; the harness
  reads `.env.local` at runtime and never prints secrets).
- No new permissions. The builder routes reuse the form
  feature's RLS pattern, the same 10/min per-user rate limit,
  and the same version bookkeeping.
- pdf-lib is already a dependency; no new dependency. No
  ONLYOFFICE use for the builder (its licence is unchanged).

## 6b. Verification notes and fixes made during Day 12

- **pdf-lib's `removeField()` leaves an orphan widget on the
  page.** Its page cleanup calls `page.node.removeAnnot` with
  the widget's APPEARANCE ref and with the FIELD ref — neither
  of which is ever in the page's /Annots (the WIDGET ref is).
  Both calls are no-ops, so the page keeps a dangling reference
  to the deleted widget. The unit test caught it (Annots size
  stayed 1 after a remove). Fix: the builder collects each
  widget's ref + page BEFORE removeField (via
  `doc.context.getObjectRef(widget.dict)` and
  `doc.findPageForAnnotationRef`), then removes those refs from
  the pages itself. `removeAnnot` is safe to call (it only
  removes when the ref is actually present).
- **pdf-lib's error classes cannot be caught with instanceof.**
  Verified by running it: `form.getField("Nope")` throws an
  error whose `constructor.name` is `Error` and for which
  `instanceof NoSuchFieldError` is `false`. All of pdf-lib's
  error classes are built with the ES5 extends-Error pattern
  (`_this = _super.call(this, msg) || this`), whose constructor
  returns a plain Error object and breaks the prototype chain.
  Fix: the builder pre-validates everything (duplicate name,
  non-terminal name, invalid name parts) instead of relying on
  catching, uses `getFieldMaybe` (returns undefined) instead of
  the throwing `getField`, and matches on the error MESSAGE only
  as a safety net. The Day 11 fill feature was already safe
  (it pre-validates max length and options before calling
  setText/select).
- **The widget Rect is the requested rect expanded by half a
  point** (borderWidth 1: x - 0.5, width + 1). The unit tests
  assert the expanded rect exactly, with an explanatory comment.
- **The 4 pre-existing Day 11 files flagged by format:check**
  were left alone (not this day's files; reformatting them
  would add noise to the diff).

## 7. Known defects and limitations

- The ONLYOFFICE docserver is still NOT installed (VM reset
  before Day 11). The export/editor live e2e cannot run until
  it is reinstalled. The builder does not need it.
- The edit page (`/documents/[id]/pdf-edit`) still imports
  pdfjs-dist statically, so it renders no client content on the
  server (DOMMatrix). It works in a browser.
- Form builder: no native date field; fields are placed by
  clicking, not by dragging; a radio group is always a vertical
  column; field names must be unique in the PDF; the new
  field's appearance is drawn in Helvetica, not a custom font;
  XFA PDFs are refused.
- qpdf, Ghostscript, python-pptx and the docserver do not
  survive a VM reset (reinstall on demand). The /tmp fixtures
  do not survive either.
- The CSV edge case from Day 6 (a CSV edited in the editor may
  save back as XLSX and be rejected) is still untested live.

## 8. Tomorrow's target

- Highest-priority feature: **Phase C — OCR** (per
  `docs/project-brief/FEATURE_LOOP.md`): OCR a file (image or
  scanned PDF) into searchable text, on Tesseract (open-source),
  one feature, deeply and production-grade, per the standing
  loop. Acceptance: a scanned PDF/image uploaded to Forma
  returns its text; the text is stored and searchable; the
  original file is never overwritten.
- Dependencies/blockers: the docserver reinstall (for the
  export/editor e2e) and the edit page's SSR fix are both open
  but neither blocks OCR (Tesseract runs locally, no browser
  needed).
