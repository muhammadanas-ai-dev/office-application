# Day 11 handoff — PDF form fill (Phase B, feature 4)

Date: 2026-11-18. Branch: `day-11-pdf-form-fill`.
Owner instruction (2026-11-18 13:31 PKT): "research how to
develope first and then make a plan and make a small tasks step by
step to implement and then implement that properly and then test
this loop apply for the all the next features till all the
features is developed". This day is the first run of that loop.
The loop is now the standing method:
`docs/project-brief/FEATURE_LOOP.md`. The research + plan for this
feature live in `docs/handoffs/day-11-plan.md`.

## 1. What was researched

- **What a PDF form is.** An AcroForm: a dictionary in the
  document catalog (`/AcroForm`) holding `/Fields` — a tree of
  field dictionaries. Types: `/Tx` text (single/multi-line,
  password, comb), `/Btn` button (checkbox, radio, pushbutton),
  `/Ch` choice (dropdown, option list), `/Sig` signature. Each
  field has a fully-qualified name, a read-only/required flag, and
  one or more widgets (the visible boxes, in page `/Annots`). A
  form can also be **XFA** (an XML form in the AcroForm `/XFA`
  entry) — a different technology pdf-lib does not support.
- **pdf-lib's AcroForm API** (read from node_modules/pdf-lib, not
  a summary): `doc.getForm()` with `getFields()`,
  `getTextField` / `getCheckBox` / `getDropdown` /
  `getRadioGroup` / `getOptionList` / `getSignature` /
  `getButton`; values via `getText`/`setText`,
  `isChecked`/`check`/`uncheck`, `getOptions`/`getSelected`/
  `select`; `setText` throws `ExceededMaxLengthError` over the
  field's max length; `form.updateFieldAppearances()` regenerates
  appearance streams for dirty fields (without it, most viewers
  show blank fields); `form.flatten()` bakes fields into the page
  and destroys them — NOT used.
- **Two traps, both verified in the source:**
  1. `doc.getForm()` **silently deletes XFA** (and creates an
     AcroForm when none exists). The XFA check must run FIRST, on
     the low-level catalog lookup, before any getForm call. An XFA
     PDF is refused with a clear 400, never silently stripped.
     (The same trap bites the fixture: `doc.save()` with the
     default `updateFieldAppearances: true` also strips XFA — the
     XFA test fixture must save with
     `{ updateFieldAppearances: false }`.)
  2. The filled value is drawn with a standard font (Helvetica),
     not the field's original font. A value that font cannot render
     is refused with a clear message instead of producing a broken
     appearance.
- **The alternative:** ONLYOFFICE Docs has a pdf/form editor, but
  it was NOT chosen for the fill: the fill must be testable here
  without a browser (the browser UI round-trip is unproven), and
  pdf-lib gives full control over values, validation and versions.
- **Widget pages:** a field's page is found via the widget's `/P`
  entry, or by `doc.context.getObjectRef(widget.dict)` +
  `doc.findPageForAnnotationRef` (both public APIs, mirroring
  pdf-lib's private `findWidgetPage`).

## 2. Completed functionality

- **List fields** (`GET /api/documents/[id]/pdf/form-fields`):
  every field with name, type, 1-based page, required, readOnly,
  current value, options, maxLength, multiline, multiselect.
  A PDF with no fields returns `{fields: [], hasForm: false}`.
- **Fill fields** (`POST /api/documents/[id]/pdf/fill-form`,
  `{values: {name: value}}`): text (string), checkbox (boolean),
  radio (one option string), dropdown/option list (string or
  string[]). Validation is atomic — every value is checked BEFORE
  anything changes, so one bad value refuses the whole fill.
  The filled form stays editable (not flattened). Every fill
  creates a NEW immutable version; the original is never
  overwritten.
- **UI** (`/documents/[id]/pdf-form`): PDF.js viewer + a field
  panel with the right input per type (text box, textarea,
  checkbox, radio group, select/multi-select), required and
  read-only badges, max-length notes, unsupported fields listed
  honestly (buttons, signatures). "Fill form" link in the library
  for PDF documents. A PDF with no fields shows an honest empty
  state, not a fake form.
- **SSR fix (form client only):** pdfjs-dist is now imported
  dynamically inside the load effect. A static import evaluates
  pdfjs-dist during server rendering, where `DOMMatrix` does not
  exist, so the page rendered nothing on the server (the edit page
  still has this pre-existing gap — see §7).

## 3. Code and data changes

- `src/lib/pdf-form.ts` (new): `PdfFormError` (HTTP status),
  `PdfFormField` / `PdfFormValue` types, `hasXfaForm` (catalog
  lookup, no getForm call), `listPdfFormFields`, `fillPdfForm`
  (atomic validation, appearance regeneration, no flatten),
  `assertFormFillablePdf`.
- `src/lib/pdf-form.server.ts` (new): `pdfFormRateLimiter`
  (10/min per user), `fetchFormDocument` (wraps
  `fetchEditableDocument` so callers only see PdfFormError —
  without this, its PdfEditError 404 surfaced as a 500),
  `fetchFormDocumentBytes`, `saveFilledVersion`,
  `fillJsonResponse`.
- Routes: `src/app/api/documents/[id]/pdf/form-fields/route.ts`
  (GET) and `src/app/api/documents/[id]/pdf/fill-form/route.ts`
  (POST, Zod: values record, max 200 fields, string values max
  5,000 chars).
- UI: `src/app/(workspace)/documents/[id]/pdf-form/page.tsx`
  (server: RLS load, fields + page count, honest empty states)
  and `src/components/pdf-form/pdf-form-client.tsx` (PDF.js viewer
  + field panel; only changed fields are sent; re-fetches the
  field list after a save).
- Library: `DocumentActions` gains a `pdfFormHref` prop and a
  "Fill form" link (`library-forms.tsx`, `library-list.tsx`).
- Tests: `src/lib/pdf-form.test.ts` (19 tests; fixtures built
  in-test with pdf-lib, including a low-level signature field and
  an XFA fixture saved with `updateFieldAppearances: false`).
- Harness: `scripts/e2e-edit-test.mjs` gains section 6 (21 form
  checks) and uploads `/tmp/e2e/form.pdf`; the CID position in
  section 2 updated to (50, 750) for the rebuilt fixture (see §6b).
- Docs: `docs/project-brief/FEATURE_LOOP.md` (the standing loop
  + the feature queue), `docs/handoffs/day-11-plan.md` (research
  + small tasks), `docs/project-brief/WPS_LEVEL_PLAN.md` (form
  fill Done, form builder Next), `docs/feature-matrix.csv`
  (FORMA-020), `docs/known-limitations.md` (form-fill limits),
  CHANGELOG (Day 11 entry).

## 4. Tests

- **Unit: 139/139 pass (15 files)** — 19 new form tests. (The
  count rose from 120 to 139: +19 form tests.)
- **Live RLS: 9/9 pass** (`npm run test:live` — unchanged).
  **Local RLS: 18/18 pass** (re-run, no regression).
- **Live e2e PDF editing + form fill: 50/50 pass**
  (`node scripts/e2e-edit-test.mjs`) — the 29 Day 9/10 edit
  checks plus 21 new form checks: field list (types, values,
  options, page, max length), fill → version 2, re-list shows
  the new values (reopen), version 1 untouched, max-length /
  bad-option / unknown-field refusals (400), plain PDF reports
  `hasForm: false` and fill refuses it (400), cross-user 404s,
  signed-out 307s, form page loads for A (200), B sees "Document
  not found", plain PDF page says it has no form fields.
- **Lint: 0 errors, 0 warnings. Typecheck, format, build: pass.**

## 5. Deployment verification

- Build passes; the app server was restarted with the new build
  (next-server stopped via `fuser -k 3000/tcp`, then `next start
  -p 3000`). App root 200, supabase-status reachable.
- Preview deployment: NOT PERFORMED (no Git/Vercel remote
  access). No Preview URL is claimed.

## 6. Security/licensing checks

- Secret scan of the staged diff: clean (no keys; the harness
  reads `.env.local` at runtime and never prints secrets).
- No new permissions. The form routes reuse the PDF RLS pattern
  (document row via the user's client, then the bytes), the same
  10/min per-user rate limit, and the same version bookkeeping as
  the text edit (upload v(n+1), insert version row, guarded
  documents update).
- pdf-lib is already a dependency; no new dependency. No
  ONLYOFFICE use for the fill (its licence is unchanged).

## 6b. Verification notes and fixes made during Day 11

- **The VM was reset before this day started.** The app, the
  docserver, Ghostscript, qpdf, python-pptx and every /tmp
  fixture were gone. Recovered during this day:
  - qpdf 11.9.0 reinstalled from the local apt cache
    (`dpkg -i` on the cached .debs — the apt lists were stale
    and a background OS-intent replay held the apt lock).
  - Ghostscript 10.02.1 reinstalled by the replay itself (it was
    in the recorded intent) — verified present afterwards.
  - Local Postgres 16 restarted (`service postgresql start`) for
    the local RLS verification.
  - The app rebuilt and restarted on port 3000.
  - /tmp fixtures rebuilt with pdf-lib: pdf1.pdf (3 pages),
    pdf2.pdf (2 pages), img.pdf (1 page, 1500x1500 noise PNG —
    6,753,024 bytes, matching the original 6,753,013),
    styled.pdf, form.pdf. debug-export.pdf was rebuilt by hand
    (see below).
  - **The ONLYOFFICE docserver is still NOT reinstalled.** The
    .deb is gone from the cache, no repo is configured, and the
    direct download URL returns 403 through the egress proxy.
    The export/editor live e2e (`e2e-pdf-test.mjs`, 41 checks)
    therefore cannot run right now. The form-fill e2e does not
    need the docserver (pdf-lib only) and is fully proven.
- **debug-export.pdf rebuilt by hand.** The original ONLYOFFICE
  export was wiped. A minimal PDF was hand-built in Python with
  a Type0/CID font and NO ToUnicode CMap (the shape the CID
  tests need): one run at (50, 750), size 10. qpdf --check
  passes; pdftotext shows only control characters (undecodable).
  Both CID unit tests pass with it. The e2e harness's hardcoded
  CID position was updated from (85.04, 774.27) to (50, 750).
- **Two real bugs found by the live e2e, both fixed:**
  1. Cross-user form calls returned 500 instead of 404:
     `fetchEditableDocument` throws PdfEditError, but the form
     routes only caught PdfFormError. Fixed with
     `fetchFormDocument` in pdf-form.server.ts, which converts
     PdfEditError to PdfFormError.
  2. The form page rendered no client content on the server:
     the static pdfjs-dist import throws `DOMMatrix is not
     defined` during SSR, so the page's HTML had no field panel
     (the "no form fields" text was missing). Fixed by importing
     pdfjs-dist dynamically inside the load effect. The edit page
     has the same pre-existing gap (its HTML also lacks client
     text) — left untouched this day; it works in a browser.
- **Fixture bugs found by the unit tests, both fixed:**
  1. `acroForm.addField` takes the field's REF, not the field
     object — passing the PDFAcroSignature object broke
     getFields() ("Expected instance of PDFDict, but got
     PDFAcroSignature").
  2. The XFA fixture must save with
     `{ updateFieldAppearances: false }` — the default save strips
     XFA (it calls getForm() internally).
- **Killing next-server:** the `ps | grep | xargs kill` pattern
  killed my own shell (SIGTERM) because the shell's own command
  line contains "next-server". Use `fuser -k 3000/tcp` (or an
  explicit PID from a listener lookup) instead.
- **A background OS-intent replay runs after a VM reset** and
  holds the apt/dpkg locks while it reinstalls recorded packages.
  Do not remove the lock files; wait for it, or install from the
  cached .debs with `dpkg -i` (which worked for qpdf while the
  replay held the apt lock).

## 7. Known defects and limitations

- The ONLYOFFICE docserver is NOT installed (VM reset). The
  export/editor live e2e cannot run until it is reinstalled
  (557 MB download; the direct URL is 403 through the proxy —
  the apt repo route needs trying). The editor, PDF export and
  the browser UI round-trip are all unproven live in the current
  environment state.
- The edit page (`/documents/[id]/pdf-edit`) still imports
  pdfjs-dist statically, so it renders no client content on the
  server (DOMMatrix). It works in a browser. The same dynamic-
  import fix used for the form page should be applied to it.
- Form fill: filled values are drawn in Helvetica, not the
  field's original font; non-WinAnsi values (Urdu/Arabic, emoji)
  are refused with a clear message; XFA forms are refused, never
  stripped; signature fields are listed as unsupported; the
  filled form is not flattened.
- qpdf, Ghostscript, python-pptx and the docserver do not survive
  a VM reset (reinstall on demand). The /tmp fixtures do not
  survive either — they are rebuilt by scripts in the project
  history, not committed. (The unit tests that read /tmp fixtures
  are a known fragility; the form tests build their fixtures
  in-test instead.)
- The CSV edge case from Day 6 (a CSV edited in the editor may
  save back as XLSX and be rejected) is still untested live.

## 8. Tomorrow's target

- Highest-priority feature: **Phase B, feature 5 — PDF form
  builder** (per `docs/project-brief/FEATURE_LOOP.md`): add form
  fields to a PDF (text, checkbox, radio, dropdown), placed on a
  page by the user — one feature, deeply and production-grade,
  per the standing loop. Acceptance: a field added in the UI
  appears in the PDF and is fillable by the form-fill feature;
  the original file is never overwritten (a new version is
  created).
- Dependencies/blockers: the docserver reinstall (for the
  export/editor e2e) and the edit page's SSR fix are both open
  but neither blocks the form builder (pdf-lib only).
