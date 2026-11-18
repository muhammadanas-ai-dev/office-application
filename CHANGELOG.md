# Changelog

All notable changes to Forma Office are recorded here. Use dates and
specific behavior; do not use vague claims such as "WPS clone complete".

## [Unreleased]

### Added

- Day 25 — Single-user sharing (2026-11-18). A shareable link
  per document (`/s/<token>`): a random 32-hex-char token,
  only its SHA-256 hash stored in the database (migration
  `20261118090000_forma_shares.sql`), 1/7/30 days or never,
  revocable. Anyone with the link can open the public share
  page and download the document's current version — no
  account. The library gains a "Share" link; a manage page
  creates, lists and revokes links. Unit tests 319/319
  (7 new); live e2e 3/4 — the migration check is the only
  failure (the migration is written but not yet applied).
  Limits: download only (no in-browser preview), the link
  gives the current version, no password on a link, no
  "export with comments" / "local reviewer notes" (future
  work), no multi-user sharing.

- Day 24 — Settings / preferences (2026-11-18). A Preferences
  section on the Settings page: the OCR default language
  (English/Urdu/Arabic), the image export format (PNG/JPG)
  and the image export DPI (72/150/300). Stored as three
  columns on the profiles table (migration
  `20261118080000_forma_preferences.sql`); the OCR page's
  language select defaults to the user's language and the
  library "Export images" link is built from their format/DPI.
  Unit tests 312/312 (6 new); live e2e 14/14 (after the owner
  applied the migration). Limits: three preferences only (no locale, no
  default new-document format, no timezone).

- Day 23 — Versions UI (2026-11-18). A versions page lists
  every version of a document (newest first) with the version
  number, when it was saved, its size, and whether it is the
  current version; a Download link per version and a Restore
  button (restoring creates a NEW version from the old file —
  it never overwrites and never deletes). The library gains a
  "Versions" link. Unit tests 308/308 (6 new); live e2e 20/20.
  Limits: no version deletion in the UI, no version diff.

- Day 22 — PDF↔image (2026-11-18). Export a PDF's pages as
  images: a ZIP download with one PNG or JPG per page
  (pdftoppm, 72/150/300 DPI, at most 20 pages). Create a PDF
  from images: choose PNG/JPEG images from the library and get
  a new PDF document (one page per image, fit on an A4 page,
  centred, aspect kept). The library gains an "Export images"
  link (PDFs); the sidebar gains an "Images to PDF" page. Unit
  tests 302/302 (10 new); live e2e 20/20. Limits: PNG/JPEG
  only, at most 20 pages/images; pdftoppm and `zip` are system
  binaries (reinstall after a VM reset).

- Day 21 — Searchable PDF after OCR + extract text
  (2026-11-18). Make a scanned PDF searchable: embed the OCR
  words as an invisible text layer (text rendering mode 3), so
  the scan becomes searchable, selectable and copyable while the
  image is untouched. The words come from the stored OCR result
  (the `words` column, migration
  20261118070000_forma_ocr_words.sql). Extract a PDF's text as a
  downloadable .txt file (GET /api/documents/[id]/pdf/
  extract-text). The OCR page gains a "Make searchable" button;
  the library gains an "Extract text" link. Limits: the
  invisible text is Latin only (Urdu/Arabic words are skipped);
  a PDF with no OCR result, or an OCR result from before the
  migration, is refused (run OCR again). Unit tests 292/292 (10
  new); live e2e 7/8 (the extract-text checks pass; the
  searchable checks run after the user applies the migration).

- Day 20 — PDF security: password-protect, permissions, unlock
  (2026-11-18). Password-protect a PDF (256-bit or 128-bit AES,
  user + optional owner password, qpdf as the engine — pdf-lib
  cannot encrypt). Set permissions (printing, copying text,
  editing, annotating). Unlock a protected PDF with its password
  (a wrong password is refused with a clear message). The new
  /documents/[id]/pdf-security page ("PDF security" in the
  library) shows the current state and the right form; every
  change creates a new version. Limits: no 40-bit encryption, no
  password recovery, qpdf is a system binary (reinstall after a
  VM reset). Unit tests 282/282 (9 new); live e2e 24/24 (protect,
  unlock, version 1 unchanged, cross-user isolation, signed-out
  307).

- Day 19 — PDF page tools, part 2: crop, hyperlinks, add text,
  shapes (2026-11-18). Crop a page by dragging a rectangle (this
  page or all pages). Add a hyperlink by dragging a rectangle and
  entering a web address (a standard link annotation). Add text by
  clicking a point and typing (three standard fonts, 8–72 pt,
  five colours). Draw a rectangle, ellipse or line by dragging
  (filled or outline). All four live on the /documents/[id]/
  pdf-draw page ("Draw on PDF" in the library); every change
  creates a new version. Limits: a fixed colour set, three
  standard fonts, no rotation, no edit/remove after adding. Unit
  tests 273/273 (20 new); live e2e 29/29 (crop, link, text,
  shape, version 1 unchanged, cross-user isolation, signed-out
  307).

- Day 18 — PDF page tools, part 1: insert pages + page numbers
  (2026-11-18). Insert a blank page (sized from its neighbours)
  or pages from another PDF in the library, before / after a page
  or at the end. Add page numbers (bottom/top, centre/right;
  number / "Page N" / "Page N of M"; from a page, from a starting
  number). Every change creates a new version. Limits: insert
  only from a library PDF in v1; page numbers are drawn into the
  content, so applying them twice draws a second number. Unit
  tests 253/253 (17 new); live e2e 25/25 (insert blank, insert
  from source, page numbers, version 1 unchanged, cross-user
  isolation, signed-out 307).

- Day 17 — PDF annotations (2026-11-18). Highlight, underline,
  strikethrough, sticky notes and freehand drawing on a PDF, with
  the annotations stored in the PDF itself (standard annotation
  dictionaries) so they travel with the file and open in any PDF
  reader. The /documents/[id]/pdf-annotate page renders the PDF
  with PDF.js, with a selectable text layer, an annotation overlay
  and freehand drawing; every change creates a new version.
  Limits: no appearance stream (/AP) in v1, five fixed colours,
  no free-text annotation. Unit tests 236/236 (15 new); live e2e
  33/33 (all five kinds, PDF.js reads them back, removal, cross-
  user isolation, signed-out 307).

- Day 16 — Templates gallery: resume, letter, report
  (2026-11-18). Forma's own original templates, as real DOCX
  files with bracketed placeholders for personal details. The
  /templates gallery shows each template's first-page thumbnail
  (rendered at authoring time with LibreOffice + pdftoppm) and a
  preview of its real content, and "Use this template" creates a
  new document in the library from the template file (version 1,
  opens in the editor). The generator script
  (scripts/generate-templates.py) builds the DOCX files, the
  thumbnails and the preview JSON, so the preview can never drift
  from the file. Limits: DOCX-only in v1 (no spreadsheet or
  presentation templates yet), no proposal/invoice/minutes/
  certificate yet, no "save a custom template" yet. Unit tests
  221/221 (19 new); live e2e 30/30.

- Day 15 — "New blank document" creates a real file (2026-11-18).
  The library's "New blank document" used to insert a title-only
  row with no file, so the document could not be opened in the
  editor. It now creates a real blank Office file — Document
  (.docx), Spreadsheet (.xlsx) or Presentation (.pptx), chosen
  in the form — uploaded to Storage as version 1 with a
  version-1 row, so it opens in the editor like any upload. The
  blank files are real Office files (python-docx / openpyxl /
  python-pptx) committed in src/lib/blank-templates/, generated
  by scripts/generate-blank-templates.py. Unit tests 202/202
  (9 new); live e2e 25/25 (all three types, the blank DOCX
  opens in the editor, an unknown type is refused, cross-user
  isolation, signed-out 307). Also: vitest now stubs the
  `server-only` package (the app build remains the guard), so a
  server action can use a server-only module without breaking
  the suite.

- Day 14 — Conversion hub (Phase D) (2026-11-18).
  Convert any supported document to another format, as a
  "Convert" action in the library and a /documents/[id]/convert
  page. The matrix is what the ONLYOFFICE engine actually
  performs (from its own "Download as" tables, restricted to
  Forma's formats): within a family, every editable format to
  PDF, and PDF back to DOCX/TXT. The result is saved as a NEW
  document in the same workspace and folder — the original is
  never modified. The converted bytes are validated for the
  target format (PDF magic, Office ZIP magic, plain-text check)
  before anything is saved. The Day 7 export now runs on the
  same general converter (behaviour unchanged). Limits: no
  cross-family conversion, no docx → doc or xlsx → xls, no
  PDF-to-Excel in v1. **The conversion itself is not proven
  live yet** — the document server is still wiped (its .deb
  download returns 403, re-checked 2026-11-18), so a conversion
  returns an honest 502 and creates nothing; the validation,
  RLS and page paths are proven live 13/13. Unit tests 193/193
  (20 new).

- Day 13 — OCR for scanned files (Phase C) (2026-11-18).
  The WPS OCR feature, as a Forma-own clean-room implementation
  on Tesseract 5.5.4, cloned and built from source into ocr/ in
  the project root (Leptonica 1.88.0, tessdata_fast eng/urd/ara;
  the binary finds its own libraries through an rpath, so it
  survives a VM reset). The app calls the project's own binary —
  no apt-installed Tesseract, no cloud OCR service, the file is
  never sent anywhere. A job runs in the background: the route
  enqueues it in ocr_jobs, the worker (node ocr/worker.ts) renders
  the PDF's pages with pdftoppm and runs Tesseract per page, and
  the text is stored per page in document_ocr_results with a
  confidence score. UI: /documents/[id]/ocr — pick a language,
  watch the progress, read and copy the text per page; an "OCR"
  link in the library for PDF, PNG and JPEG files. English reads
  exactly (96% mean confidence on the test image); Urdu reads
  with one character error on a two-line test — usable, not
  perfect. Limits: 20 pages per job, no TIFF, no handwriting.
  Live e2e 22/22 on 2026-11-18 after the owner applied the
  migration (scanned PDF + Urdu image, original untouched,
  cross-user 404s, signed-out 307s). A real gap found by that
  run and fixed the same day: PNG/JPEG could not be uploaded at
  all (the bucket and the app's upload list only allowed the 12
  office formats), so the image side of OCR was unreachable —
  the bucket now allows image/png + image/jpeg (migration
  20261118060000, applied live through the Storage API) and
  the upload list accepts PNG/JPG.

- Day 12 — PDF form builder (Phase B, feature 5) (2026-11-18).
  The WPS "online form builder" feature, as a Forma-own
  clean-room implementation on pdf-lib. Adds a form field to a
  PDF — text, checkbox, radio group, dropdown or option list —
  placed on a page, so a plain PDF becomes a fillable form (the
  Day 11 fill feature then fills it, as does any PDF viewer).
  UI: /documents/[id]/pdf-builder — pick a field type, click on
  a page to place it (a dashed outline shows where it will go),
  set its name, options and properties (multi-line, max length,
  multi-select, required, read-only, default value), and add it;
  a field list shows every field on the PDF with a remove
  button. A radio group is laid out as a vertical column of
  options. Every add/remove creates a new version; the original
  is never overwritten. Validation is atomic and pre-checked: a
  duplicate name, a name that is already a group of fields, an
  invalid name, a placement outside the page, a page that does
  not exist, and an XFA PDF are all refused with a clear 400.
  Two pdf-lib facts found by testing: removeField() does NOT
  remove the widget from the page's /Annots (it removes the
  appearance and field refs, neither of which is in /Annots) —
  the builder removes the widget refs itself, or the page keeps
  a dangling reference; and pdf-lib's error classes cannot be
  caught with instanceof (the ES5 extends-Error pattern breaks
  the prototype chain — verified by running it), so the builder
  pre-validates everything and matches on messages only as a
  safety net. Unit tests: 18 new (157 total). Live end-to-end
  proof: 70/70 checks (the 50 edit + form checks plus 20 new
  builder checks, including filling a built field).
- Day 11 — PDF form fill (Phase B, feature 4) (2026-11-18).
  Built with the standing feature loop (research → plan → small
  tasks → implement → test; see
  docs/project-brief/FEATURE_LOOP.md). Lists and fills a PDF's
  AcroForm fields — text (single and multi-line), checkbox, radio
  group, dropdown, option list — with a Forma-own engine on
  pdf-lib (the ONLYOFFICE pdf/form editor was not chosen: the fill
  must be testable here without a browser). Validation is atomic:
  one bad value (unknown field, wrong type, read-only field, over
  the max length, option not in the list) refuses the whole fill
  and nothing is saved. The appearance streams are regenerated so
  the filled values show in viewers and survive a reopen. Every
  fill creates a new immutable version; the original is never
  overwritten. An XFA PDF is refused with a clear message, never
  silently stripped (pdf-lib deletes XFA on getForm/save, so the
  check runs on the catalog before any getForm call). Signature
  fields are listed as unsupported. UI: /documents/[id]/pdf-form
  (PDF.js viewer + field panel, one input per type) with a "Fill
  form" link in the library; a PDF with no fields reports that
  honestly. The form client imports pdfjs-dist dynamically so the
  page renders on the server (a static import breaks SSR with
  DOMMatrix — the edit page still has that pre-existing gap).
  Unit tests: 19 new (139 total). Live end-to-end proof: 50/50
  checks (the 29 edit checks plus 21 new form checks).
- Day 10 — Editing: fonts, styling, every format (2026-11-18).
  The PDF text edit now keeps the original styling: the
  replacement is drawn in the closest standard font to the run's
  BaseFont name (family, weight and slant — Arial/Liberation Sans
  to Helvetica, Times/Liberation Serif to Times, Courier/monospace
  to Courier; bold and italic kept) and in the run's fill colour
  (rg/g/k, CMYK converted to RGB). The replacement block is
  wrapped in q...Q so its font and colour never leak into later
  runs. The content-stream extractor was fixed to the spec along
  the way: BT now resets only the text matrix and text line
  matrix (the font, size, leading, spacing and colour persist
  across text objects), and the whole text state is saved and
  restored by q/Q — a test caught the old reset dropping a run
  that shared its font with the previous text object. The editor
  is now proven live for every format: DOCX (word), XLSX (cell)
  and PPTX (slide) each open with the right document type and a
  simulated save creates version 2 with the edited text, and a
  styled file in each format (bold red / italic blue / plain
  black) exports to a PDF that keeps the bold and italic fonts
  (Liberation Sans-Bold, Liberation Serif-Italic, Carlito) and
  the red and blue colours. Unit tests: 14 files, 120 tests
  (qpdf --check validates the edited PDFs). Live end-to-end
  proof: 41/41 checks (export/tools/editor, incl. the new
  styled-format section) and 29/29 checks (PDF editing, incl.
  the new styled font/colour section).
- Day 9 / Phase B feature 3 — PDF editing (2026-11-18): edit
  text, replace an image, delete pages and reorder pages, each as
  its own operation on one shared pipeline. Text editing
  (`POST /api/documents/[id]/pdf/edit-text`) removes the old text
  from the content stream — never just covers it — and draws the
  replacement at the same baseline, size and rotation in standard
  Helvetica (the page does not reflow); it matches by exact text,
  by joining consecutive runs, or by position for CID fonts with
  no ToUnicode CMap (ONLYOFFICE PDFs), where the run is located by
  baseline position and font size and an ambiguous position is
  refused. Image replacement (`POST .../pdf/edit-image`,
  multipart PNG/JPEG, 10 MB cap, magic-byte check) embeds the new
  image in exactly the old frame. Page delete/reorder (`POST
  .../pdf/edit-pages`) refuse deleting every page and a reorder
  that is not a permutation. Every edit creates a new immutable
  version (upload v(n+1), version row, guarded documents update)
  — the original file is never overwritten. A PDF edit page
  (`/documents/[id]/pdf-edit`) renders the PDF with PDF.js
  (pdfjs-dist 5.7.284, worker served from
  `public/pdf.worker.min.mjs`), with clickable text and image
  overlays and a pages panel, plus an "Edit PDF" link in the
  library. Shared pipeline: RLS through the signed-in user's
  client, 50 MB cap, 10 operations/minute per user, clear 400s
  for bad input and 404s for another user's document. Own
  content-stream engine (`src/lib/pdf-content.ts`: tokenizer,
  operator parser, ToUnicode CMap parser, text-run extraction
  with positions, re-serializer) and operations
  (`src/lib/pdf-edit.ts`). Unit tests: 14 files, 111 tests.
  Live end-to-end proof: 21/21 checks as a real signed-in user
  (text edit exact + CID position, image replace, page delete +
  reorder, version increments, original untouched, cross-user
  404s, signed-out 307s) via `scripts/e2e-edit-test.mjs`; the
  Day 7–8 PDF features were re-proven live at the same time
  (24/24 via `scripts/e2e-pdf-test.mjs`).
- Day 8 / Phase B feature 2 — PDF utilities (2026-11-18): merge,
  split, rotate and compress as four separate operations on one
  production-grade pipeline. Merge (`POST
  /api/documents/[id]/pdf/merge`, 2–20 PDFs, in order, 500-page
  cap); split (`POST .../pdf/split`, page ranges like `1-3, 5`,
  duplicates kept); rotate (`POST .../pdf/rotate`, `all` or a
  range, 90/180/270 clockwise, additive to each page's current
  rotation); compress (`POST .../pdf/compress`, Ghostscript
  screen/ebook/printer levels — real compression, never a larger
  file, savings reported in the
  `X-Forma-Compress-Saved-Bytes` header). Shared pipeline: RLS
  through the signed-in user's client, PDF byte validation, 50 MB
  cap, 10 operations/minute per user, a dedicated PDF tools page
  (`/documents/[id]/pdf-tools`) with one form per tool, and a
  "PDF tools" link in the library for PDF documents. pdf-lib
  1.17.1 and Ghostscript 10.02.1. Unit tests: 11 files, 90 tests.
- Day 7 / Phase B feature 1 — PDF export (2026-11-17): `GET
  /api/documents/[id]/export?format=pdf` converts any editable
  document (DOCX, DOC, ODT, TXT, XLSX, XLS, CSV, ODS, PPTX, PPT,
  ODP) to PDF and streams it back as a download. Access is decided
  by RLS through the signed-in user's client; the conversion runs
  server-side through the ONLYOFFICE ConvertService (JWT-signed,
  HMAC file token) and the document server URL never reaches the
  browser. Production details: 10 exports per minute per user
  (in-memory, per-instance — a shared limiter is the multi-instance
  hardening item), 2-minute conversion timeout, 50 MB cap, the
  converted file is validated as a real PDF before it is returned,
  the download filename carries the original title in UTF-8 (RFC
  5987) with a safe ASCII fallback, and the original file is never
  modified. "Export as PDF" action in the library (only for
  exportable formats). Unit tests: 10 files, 70 tests.
- Day 6 / Phase A — WPS level (2026-11-17): the project scope is
  now the full WPS level, per the owner's direction — every editor,
  every format, proper OCR and all paid features as Forma's own
  clean-room features (see `docs/project-brief/WPS_LEVEL_PLAN.md`).
  No Docker files: no Dockerfile, no docker-compose, no container
  image for the app or the document server.
- Day 6 / Phase A: Spreadsheet editor — ONLYOFFICE `cell`
  documentType for XLSX, XLS, CSV, ODS; Presentation editor —
  `slide` documentType for PPTX, PPT, ODP. Uploads, the file
  picker, the library "Open in editor" links and the editor page
  all accept the new formats. The `documents` Storage bucket's
  allowed MIME types were extended live to 12 types; migration
  `20261117040000_forma_spreadsheet_presentation.sql` records it.
- Day 6 / Phase A: the save callback is now format-agnostic — it
  stores the save in the document's own MIME type (was hardcoded
  to DOCX), rejects a save whose filetype does not match the
  document's format, and validates Office saves by ZIP magic
  bytes, PDFs by their `%PDF-` header, and TXT by size only.
  Unit tests: 9 files, 55 tests. Local RLS verification still
  18/18. Engine proofs: XLSX→PDF and PPTX→PDF conversions on the
  running document server return the exact proof text.
- Day 5 (2026-11-17): ONLYOFFICE Docs 10.0.0 Community (AGPLv3)
  editor integration — `/editor/[id]` page, signed DocEditor config
  (JWT, random document key, 1-hour expiry), controlled file fetch
  (`GET /api/editor/file/[id]`, HMAC token) and JWT-verified save
  callback (`POST /api/editor/callback`, status-2 saves become a new
  immutable version; duplicate deliveries acknowledged without
  writing twice). `editor_sessions` table (migration
  `20261117030000_forma_editor_sessions.sql`, RLS with no policies —
  admin-only). "Open in editor" links in the library for files the
  editor can open.
- Day 5: Editor integration doc
  (`docs/architecture/editor-integration.md`) and ADR-001 updated
  with the owner's decision (proceed with Community evaluation;
  WPS inspiration-only, not a clone) and the verified version,
  install page and config reference. Unit tests: 9 files, 52 tests.
  Local RLS verification now 18/18 checks (T18 covers
  editor_sessions).
- Day 4 (2026-11-17): Document library — `/files` (folder tree,
  breadcrumbs, search, sort by name/modified/size, create folder,
  create blank document, upload), `/home` (workspace overview +
  recent), `/recent`, `/starred`, `/trash` (restore + permanent
  delete). Server actions for create/rename/move/delete/duplicate/
  star/upload with Zod validation and RLS enforcement.
- Day 4: Migration `supabase/migrations/20261117020000_forma_documents_library.sql`
  — folders, documents, document_versions, document_stars, RLS
  policies, storage.objects policies for the private `documents`
  bucket, and the `workspaces.is_personal` one-personal-workspace
  rule (Day 3 dedupe cleanup). NOT YET APPLIED to the live project
  — apply Day 3 first, then Day 4, in the dashboard SQL Editor.
- Day 4: Private `documents` Storage bucket created live (50 MB
  per-file limit; DOCX, DOC, PDF, TXT, ODT). Uploads validated
  server-side (extension, MIME, size); download via a signed-URL
  route (`GET /api/documents/[id]/download`, 1-hour expiry).
- Day 4: Library model + storage rationale
  (`docs/architecture/library-and-storage.md`). Unit tests: 8 files,
  41 tests. Local RLS verification now 17/17 checks (T11–T17 cover
  library + storage + is_personal); live RLS test extended with
  document/file cases, still gated on the migrations.
- Day 3 (2026-11-17): Supabase Auth pages — sign up, sign in, reset
  password, choose a new password — plus the `/auth/callback` route
  handler and server actions for sign in/out/up, password reset and
  profile update (Zod-validated, generic errors to the browser).
- Day 3: Migration `supabase/migrations/20261117010000_forma_auth_workspace.sql`
  — profiles, workspaces, workspace_members, role checks, RLS
  policies, membership helpers in the private `app_private` schema,
  and least-privilege grants. NOT YET APPLIED to the live project
  (direct Postgres is blocked from this machine; apply via the
  Supabase dashboard SQL Editor — see
  docs/architecture/schema-and-rls.md).
- Day 3: Idempotent provisioning (`ensureProfileAndWorkspace`) — a
  personal workspace + owner membership are created on sign-up,
  sign-in and email-callback via the admin client. No trigger on
  auth.users, no SECURITY DEFINER trigger.
- Day 3: Route protection in the proxy — workspace routes redirect
  signed-out visitors to `/auth/login?next=…`; signed-in users are
  redirected away from the auth pages. Session cookies and cache
  headers are copied onto redirect responses.
- Day 3: Real profile form in Settings (display name, RLS-protected)
  and a header user menu (initial + sign out).
- Day 3: `src/types/database.types.ts` (hand-written draft matching
  the migration; replace with `supabase gen types` once live),
  role-hierarchy helper (`canPerform`), auth Zod schemas, and the
  schema/RLS rationale doc (`docs/architecture/schema-and-rls.md`).
- Day 3: RLS tests — local Postgres assertions
  (`supabase/tests/rls-local.sql`, 10 checks) with
  `scripts/verify-rls-local.sh`, and a live two-account test
  (`supabase/tests/rls-live.test.ts`, run with `npm run test:live`
  after the migration is applied). Unit tests: 5 test files, 22 tests.
  Local RLS verification PASSED 10/10 on Postgres 16 after two
  grant corrections (see Fixed).
- Day 2 (2026-11-17): Responsive Forma app shell — sidebar navigation
  (Home, Recent, My files, Shared with me, Starred, Templates, Trash,
  Settings, Plan and usage), header with disabled search/create actions,
  mobile drawer, and honest placeholder pages for every nav item.
- Day 2: FormaLogo component, EmptyState, Skeleton/PageSkeleton, and
  loading/error/not-found states for the app and the workspace group.
- Day 2: Zod-validated environment (`src/lib/env.ts` public,
  `src/lib/env.server.ts` server-only) with pure, tested parsers; the
  publishable key is the only key the browser ever sees.
- Day 2: Vitest + Testing Library + jsdom; 3 test files, 11 tests.
- Day 2: Scripts `typecheck`, `test`, `format`, `format:check`;
  Prettier config; `react-hook-form` installed for Day 3 auth forms.
- Day 1 (2026-11-17): Forma Office build kit saved under
  `docs/project-brief/` (all 16 brief files).
- Day 1: Dated WPS feature inventory
  (`docs/reverse-engineering/day-01-wps-inventory.md`) from official
  WPS pages, using the comprehensive_research skill (Standard mode).
- Day 1: ADR-001 — ONLYOFFICE Docs as the evaluated editor engine,
  with commercial launch BLOCKED pending licence/hosting decision.
- Day 1: `docs/feature-matrix.csv` (researched/planned status),
  `docs/known-limitations.md`, and this changelog.
- Day 1: Forma brand tokens (BRAND_GUIDELINES.md) applied to the app
  shell and a wireframe homepage with honest coming-soon states.
- Day 1: Local Git initialised; `day-01-discovery` branch.

### Changed

- Homepage is now the Forma Office wireframe (was the Next.js +
  Supabase connection status page). Connection status remains
  available at `/api/supabase-status` and `/api/db-status`.
- Day 3: Supabase clients are now typed with the `Database` generic.
  The proxy copies refreshed session cookies onto redirect responses
  (the Supabase docs' `cookies.setAll` does not exist in this
  Next.js 16.4.6 build — cookies are copied one by one instead).
- Day 3: `dotenv` added as a dev dependency for the live RLS test;
  new script `test:live` (gated on FORMA_LIVE_DB=1).
- Day 2: Homepage now links to the real workspace (`/home`, `/files`,
  `/templates`); "Create a document" stays honestly disabled.
- Day 2: `@types/node` upgraded ^20 → ^24 (required by Vitest 5);
  Node on this machine is v24. Supabase clients now read validated
  env instead of raw `process.env!`.
- Day 2: `src/lib/supabase/middleware.ts` (shadcn reference) left
  untouched; the active session refresh is `src/lib/supabase/proxy.ts`.

### Fixed

- Day 5: The proxy redirected the document server's file and
  callback requests to sign-in (307) because every `/api/*` route
  except the two status endpoints was session-protected. The editor
  endpoints now bypass the session check — they authenticate with
  their own tokens (HMAC file token, ONLYOFFICE JWT) — and
  `/editor` was added to the protected workspace prefixes.
- Day 5: `server-only` threw in the test environment when the pure
  editor helpers were imported from tests and server components, so
  the pure helpers moved to `src/lib/editor.ts` and only the secret
  getters remain in `src/lib/editor.server.ts`.
- Day 5: The editor page used `actionLabel`/`actionHref` props the
  EmptyState component does not have; it now passes `icon` and an
  `action` node.
- Day 4: Zod 4's `z.uuid()` rejects the placeholder UUIDs used in
  tests (`11111111-1111-1111-1111-...` fails the version/variant
  nibble check) — test fixtures now use valid version-4 UUIDs.
  The same strictness applies to any id accepted by the library
  schemas.
- Day 4: `subtreeFolderIds` only walked non-deleted folders, so
  restoring or permanently deleting a trashed folder missed its
  descendants — it now takes an `includeDeleted` flag, and restore
  also restores ancestors so a folder never stays hidden under a
  deleted parent.
- Day 4: supabase-js type inference loops (TS7022) on the
  breadcrumb query and on embedded `document_stars` joins — the
  breadcrumb result is explicitly typed, star status is fetched
  with a separate small query, and the folders self-reference is
  omitted from the hand-written types (it still exists in the DB).
- Day 3: The migration revoked EXECUTE on the RLS helper functions
  from `authenticated` (following a best-practices example). Local
  verification proved that breaks every workspace/member policy on
  Postgres 16 — policies evaluate helpers as the querying user.
  EXECUTE now stays granted to `authenticated` (only `anon` is
  revoked), and `authenticated` gets USAGE on the `app_private`
  schema. Protection is the non-exposed schema + the `auth.uid()`
  check inside each helper. Caught before the migration was applied
  anywhere.
- Day 2: Removed the Day 1 leftover lint warning (unused
  eslint-disable in `src/lib/db.ts`) and added `server-only` to
  `admin.ts` and `db.ts`.

### Security

- No secrets added. `.env.local` remains gitignored; `.env.example`
  holds placeholders only. Server keys stay server-only.

### Known limitations

- See `docs/known-limitations.md`. No editor, no tables in the live
  project yet (migration written, not applied), no deployment yet.
