# Changelog

All notable changes to Forma Office are recorded here. Use dates and
specific behavior; do not use vague claims such as "WPS clone complete".

## [Unreleased]

### Added

- F38 — Insert image on a page (2026-11-26, checklist completion run). The Draw page gains an Insert image mode: choose an image from the library (PNG/JPEG directly; WEBP/TIFF are decoded first, using a multi-page TIFF's first page), click where its bottom-left corner should go, set the width in points — the height follows the image's shape — and the image is drawn onto the page as a new version. Placements that would spill off the page are refused with the reason. Unit: 2 new (47 in `pdf-page-tools`). Live e2e 5/5 (`scripts/e2e-insert-image-on-page-test.mjs`).
- F37 — Page labels (2026-11-26, checklist completion run). The PDF tools page gains Page labels: define ranges — a start page, a style (1, 2, 3 / i, ii, iii / I, II, III / A, B, C / a, b, c / no number), an optional prefix like "A-", and a starting value — with a live preview of the labels, and Forma writes the standard /PageLabels tree into the PDF as a new version. These are the numbers every reader (including Forma's own viewer engine, PDF.js — which the tests verify against) shows in its page box and thumbnails. Unit: 4 new. Live e2e 5/5 (`scripts/e2e-page-labels-test.mjs`).
- F36 — Batch page tools + PDF repair (2026-11-26, checklist completion run). The library's batch bar gains page tools: rotate all pages (90°/180°/270°) or compress (eBook quality) across up to 10 ticked PDFs at once — each document gets a new version, and the per-document results (including failures, e.g. someone else's PDF) are listed in place. Separately, the PDF tools page gains Repair PDF: qpdf rebuilds the file's cross-reference tables and object streams, fixing the usual corruption; qpdf's own notes about what it fixed come back with the result, and a healthy file whose rebuild changes nothing saves no new version. Unit: 2 new. Live e2e 6/6 (`scripts/e2e-batch-pages-test.mjs`).
- F35 — Draft auto-save & recovery (2026-11-26, checklist completion run). Forma's own writing surfaces no longer lose unsent text: the reviewer-note composer and the Draw page's Add-text box keep a draft in the browser's local storage (keyed per user, document and surface, saved as you type, cleared when the content is really saved). Coming back — even after a browser restart — restores the text with a "Draft restored" note and a Discard option; drafts expire after 7 days. The document editor's own drafting is its server-side autosave and stays with the editor. Unit: 4 new. Live e2e 4/4 (`scripts/e2e-drafts-test.mjs`; the storage logic itself is unit-tested against a storage adapter, since local storage is browser-only).
- F34 — WEBP and TIFF images (2026-11-26, checklist completion run). The library now accepts WEBP and TIFF uploads (with real magic-byte signature checks), and Images to PDF converts them: WEBP is decoded to PNG with sharp, and a multi-page TIFF contributes one page per TIFF page. The documents Storage bucket keeps its own MIME allowlist, so the two types are added to it by a short SQL update in the combined file at the end of this run — until then Storage itself refuses the upload (verified live). The remaining long-tail document formats (DOCM, RTF, PDF/A, and TIFF/BMP/GIF/SVG as editable documents) belong to the conversion engine and stay blocked with the document server; OCR still takes PNG/JPEG. Unit: 6 new. Live e2e 4/4 (`scripts/e2e-image-formats-test.mjs`).
- F33 — Your fonts (2026-11-26, checklist completion run). Settings gains a Your fonts manager: upload a TTF or OTF font (validated by its magic bytes, never its file name; 10 MB cap; up to 50 fonts), mark favourites, delete. Uploaded fonts appear in the PDF Draw page's Add-text font picker — favourites first (★), then most recently used — and text drawn with one is embedded and subset into the PDF with fontkit, so it renders identically everywhere. The catalogue is a new `user_fonts` table (RLS: your fonts are only yours) arriving with the combined SQL file at the end of this run; until then the manager shows a setup notice and every path fails cleanly. Honest limits: uploaded fonts work in Forma's PDF tools, not in the document editor (its own font set), and Forma's own text search/extraction cannot decode subset-font text (readers like PDF.js read it correctly) — recorded in known-limitations. Unit: 4 new. Live e2e 5/5 (`scripts/e2e-fonts-test.mjs`, pre-migration behaviour).
- F32 — Settings pack (2026-11-26, checklist completion run). Settings gains an Appearance & language section: theme (light / dark / match system — dark remaps Forma's own palette across the workspace; the document editor keeps its own theme, stated in the form), language (English UK/US, Urdu — drives the page language and date formatting; full interface translation is a later step), date format (26 Nov 2026 / Nov 26, 2026 / 2026-11-26) and number format (1,234.56 / 1.234,56 / 1 234,56), plus three accessibility switches — reduce motion, larger text, high contrast — all applied immediately on save and reapplied on every load by a bootstrap script in the workspace layout. Library "Modified" dates now use the user's format. A keyboard-shortcut reference joins the Settings page. The seven new profile columns arrive with the combined SQL file at the end of this run; until then Settings shows the setup notice and the defaults apply. Unit: 4 new (10 in `preferences`). Live e2e 7/7 (`scripts/e2e-appearance-test.mjs`).
- F31 — Print view (2026-11-26, checklist completion run). Every PDF gains a Print page (library Print link): all pages rendered at print resolution with an optional comments list printed after the document — the reviewed-document printout. Print CSS hides the app sidebar/header and puts one PDF page per sheet; the browser's print dialog handles the printer or "Save as PDF". Documents over 100 pages print the first 100 with a note to print the rest in parts. Live e2e 4/4 (`scripts/e2e-print-test.mjs` — route, access rules and the print stylesheet; the canvas rendering itself is browser-side).
- F30 — Import comments (2026-11-26, checklist completion run). The Annotate page gains an Import comments panel: pick another PDF from the library and every comment on it is copied onto the same page numbers here, as a new version. The copy is a true deep copy (annotation dictionaries with their appearance streams and popups), done by routing each annotated page through pdf-lib's page copy and moving the annotation references onto the real pages. Comments on pages this PDF does not have are skipped and counted in the result message. Unit: 2 new (20 in `pdf-annotate`). Live e2e 7/7 (`scripts/e2e-import-annotations-test.mjs`).
- F29 — Document properties (2026-11-26, checklist completion run). Every document gains a Properties page (library link): the Forma facts (type, size, version, created/modified) and, for a PDF, the file's own information dictionary — pages, creator, producer, file dates, and the editable title, author, subject and keywords. Saving writes the fields into the PDF itself as a new version, so they travel with the file; the library title stays separate and unchanged. Creator and producer are shown read-only — they are the producing software's record. Unit: 4 new. Live e2e 8/8 (`scripts/e2e-properties-test.mjs`).
- F28 — Batch export (2026-11-26, checklist completion run). The library gains a Batch export bar: tick up to 10 PDFs, choose Text, Excel or PowerPoint (the text-based exporters), and download one ZIP with a converted file per PDF. A PDF that cannot be exported — no access, not a PDF, no extractable text — does not fail the batch: it is named in `batch-errors.txt` inside the ZIP, and the response headers report how many succeeded and failed. Only a batch where every PDF fails returns an error. Unit: 3 new. Live e2e 8/8 (`scripts/e2e-batch-test.mjs`).
- F27 — Page resize (2026-11-26, checklist completion run). The PDF tools page gains Resize pages: rebuild selected pages (or all) at a standard size — A4, Letter, A5, Legal — with the content fitted and centred keeping its proportions, or scale pages by 10–400%. Pages you do not select are copied unchanged. Saved as a new version. Honest limit, stated in the UI: resized pages are rebuilt from the original page drawing, so annotations on a resized page do not carry over. Unit: 4 new (45 in `pdf-page-tools`). Live e2e 8/8 (`scripts/e2e-resize-test.mjs`, page boxes verified from storage).
- F26 — Redaction (2026-11-26, checklist completion run). The Annotate page gains a Redact mode: drag a box over anything that must be removed for good, mark as many areas as needed, and apply. Redaction is real removal, not a cover-up: every text run under a box is deleted from the page's content stream, every image under a box loses its draw operation and its resource reference, annotations touching a box are removed (their text could quote the content), a black box is drawn over each area, and qpdf rebuilds the file so the removed image objects leave the file entirely — verified end-to-end (after redaction the text no longer exists for search, and no image objects remain). Saved as a new version; the UI states plainly that earlier versions keep the original, so you redact the copy you share. Honest limits: vector path drawings under a box are covered but their path data is not removed, and whole text runs are removed when a box touches them (never half a word left behind). Unit: 7 new. Live e2e 8/8 (`scripts/e2e-redact-test.mjs`).
- F25 — Export PDF to PPTX, text-based (2026-11-26, checklist completion run). A new "Export to PPTX" action on PDF documents produces a real .pptx deck (PptxGenJS): one slide per PDF page, the page's first text line as the slide title and the remaining lines as the body; a text-less page still gets a slide so the count matches the pages. It is a text export — layout, images and formatting are not reproduced, and the copy says so. A PDF with no extractable text is refused with a pointer to OCR. Unit: 5 new. Live e2e 6/6 (`scripts/e2e-pdf-pptx-test.mjs`).
- F24 — Export PDF to XLSX, text-based (2026-11-26, checklist completion run). A new "Export to XLSX" action on PDF documents produces a real .xlsx workbook (ExcelJS): one sheet per page carrying the page's text lines, plus one sheet per detected table (the F23 detector) with the table's cells in a real grid. It is a text export — the PDF's layout is not reproduced and numbers are written as text, and the copy says so. A PDF with no extractable text is refused with a pointer to OCR. Unit: 5 new. Live e2e 7/7, reading the workbook back with ExcelJS (`scripts/e2e-pdf-xlsx-test.mjs`).
- F23 — Extract tables (2026-11-26, checklist completion run). A new "Extract tables" action on PDF documents downloads a ZIP with one CSV per detected table. Detection is a text-alignment heuristic over the PDF's text layer: lines are grouped by baseline, run x-starts are clustered into columns, and a table is a run of at least two lines that map onto shared columns. It finds the common generated-report/statement tables; ruled-only, merged-cell, and scanned-image tables cannot be detected, and a PDF with no detectable table is refused with that explanation. Unit: 7 new. Live e2e 6/6 (`scripts/e2e-extract-tables-test.mjs`).
- F22 — Extract embedded images (2026-11-26, checklist completion run). A new "Extract images" action on PDF documents downloads a ZIP of the images embedded in the PDF — the actual image objects at their stored resolution and format (poppler `pdfimages`), not page renders (that stays "Export images"). An image's alpha mask comes out as its own file, as pdfimages reports it. A PDF with no embedded images is refused with a clear reason that points at Export images instead. Live e2e 5/5 (`scripts/e2e-extract-images-test.mjs`).
- F21 — The PDF viewer, finished (2026-11-26, checklist completion run). The Annotate page's viewer gains: a **Pages panel** (thumbnails for the first 60 pages, current page highlighted) and an **Outline panel** (the PDF's bookmarks resolved to page numbers; a PDF without bookmarks says so); **zoom** (50–250%) with **Fit width** and **Fit page** — the zoom flows through the PDF.js viewport, so text selection and annotation coordinates stay correct at any zoom; a **page-number jump** input; a **Read mode** (all pages in a scroll, Continuous or Facing layout, the page indicator tracking the scroll) and a **Full screen** button. Markup tools stay on the Annotate surface, and the UI says so. Unit: 4 new (the outline resolver). Regression e2e 4/4 (the annotate/search APIs after the rework). Honest limit: canvas rendering is browser-side — verified by typecheck, build and API regression, not by pixels from this VM.
- F20 — PDF text search (2026-11-26, checklist completion run). The Annotate page gains a search box: type a query (match case and whole word options) and every match in the PDF's text layer is listed by page with a highlighted context snippet; clicking a result opens that page. The search runs server-side on the Day 21 extractor, is capped at 500 matches, and never changes the document. A scanned PDF with no text layer returns no matches, and the UI points at "Make searchable". Unit: 10 new. Live e2e 9/9 (`scripts/e2e-pdf-search-test.mjs`, on the shared harness `scripts/e2e-shared.mjs`). Honest limit: matches never span a page break.
- F19 — Small leftovers (2026-11-26, checklist completion run). The placeholder /plan route is deleted (the sidebar link went on Day 28; the route itself now 404s), and every bare `console.error` in the app (97 sites, 59 files) now goes through the Day 27 structured `logError` (JSON lines, secret redaction). Unit 443/443 — qpdf is back on the VM (11.9.0), so the 2 qpdf-dependent tests pass again.
- Day 34 — Export with comments + local reviewer notes (2026-11-26). The Day 25 half. (1) **Export with comments**: the PDF tools page gains an "Export with comments" section (it shows the document's comment count) — one click creates a new version with the annotations drawn INTO the page content (highlight quads as translucent rectangles in the annotation's own colour, underline/strikeout as lines, ink strokes as polylines), the annotation dicts removed, and a comments summary page appended at the end listing every annotation in page order (page, kind, author/date when present, the text truncated at 200 chars). A document with no comments is refused with a real reason. (2) **Local reviewer notes**: every document gains a "Notes" link and a notes page — the owner's private notes on the document (add, list newest first, resolve/reopen, delete; plain text, at most 2000 chars), stored in the new `document_notes` table (RLS owner-only), never written into the file and never shown on a share link. The migration is owner-applied (the Days 24/25/31 pattern); until it runs, the notes routes answer with a clear setup message. Unit: 7 new (the flatten removes every annotation and keeps the original untouched, the summary lists every annotation in order, the note body validation). **Live e2e (export half) CLOSED 2026-11-26 (13/13)**: annotate, export (4 pages, the summary lists both comments, no annotations left in the copy), no-comments refused (400), cross-user isolation, signed-out 307, and the notes setup message verified. The notes round-trip runs after the owner applies the migration. Honest limits: note annotations are not drawn into the flattened pages — their text lives only on the summary page; the summary page is plain text (no clickable jump back); the flattened copy cannot be un-flattened — restore an earlier version instead.
- Day 33 — Insert pages from an image (2026-11-25). The Insert pages section on the PDF tools page gains a third source, "Pages from an image": one or more uploaded PNG/JPEG images (each at most 10 MB, at most 50 at once), each becoming one new page, inserted before a page, after a page, or at the end, in the order chosen. Each new page is sized from its neighbours (the same as a blank page) and carries its image centred, scaled to fit with a 36pt margin, aspect ratio preserved. The existing `POST /api/documents/[id]/pdf/insert-pages` route gains a multipart branch for the image files; the JSON path (a blank page, pages from another PDF) is unchanged. Every insert creates a new immutable version — the original file is never overwritten. Unit 436/436 (4 new: one image inserts one page with the image embedded, two images insert two pages in order, the input PDF is untouched, and the rejections). **Live e2e CLOSED 2026-11-25 (16/16)**: the tools page offers the option, one image inserts one page at the end (the neighbours' size, the image embedded, version 1 untouched), two images insert before page 2 in order, the JSON blank-page path still works, bad input is refused (a non-image file, no image at all, a position past the end), cross-user isolation, signed-out 307. Honest limits: one image becomes one page (no collage, no cropping or rotation at insert time); the image is embedded at its original resolution, so a very large photo makes a large PDF; a portrait photo in a landscape document has white space at the sides.
- Day 32 — Stamps / watermarks (2026-11-24). A PDF document gets a "Stamps & watermarks" page (`/documents/[id]/pdf-stamp`, linked from the document actions next to Annotate / Draw on PDF) with three tabs: a text watermark (custom text, all pages or a page range like 1-3, 5, a position — diagonal across the centre, centre, top-centre or bottom-centre — a font size, a colour, an opacity and a rotation of 0/30/45/60/90°), an image watermark (an uploaded PNG or JPEG, validated by its file signature, drawn at a position, scaled to a fraction of the page width, with an opacity and a rotation), and a rubber stamp (a preset — CONFIDENTIAL, DRAFT, APPROVED, REVIEWED — or custom text, drawn as a bordered box with the text centred inside it, in a colour, at a position). Every change creates a new immutable version — the original file is never overwritten. Unit 432/432 (10 new: the text watermark on all pages and on a range, the stamp presets + custom text, the image watermark embedding, and the rejections). **Live e2e CLOSED 2026-11-24 (18/18)**: the page loads with the three tabs, the library link is present, the text watermark lands on all pages and on page 2 only, the stamp lands on all pages, the image watermark embeds, bad input is refused (empty text, a page past the end, a non-image file), cross-user isolation, signed-out 307. Honest limits: a watermark/stamp is drawn INTO the page content, so it cannot be removed except by restoring an earlier version; the image watermark is PNG/JPEG only; the stamp box is a rectangle (no rounded corners); the text is Helvetica only.
- Day 31 — Save a custom template (2026-11-21). A document can be saved as a reusable template from its Manage menu in the files (a name + an optional description). The document's file is copied to `<workspace_id>/templates/<template_id>/<filename>` in Storage — a snapshot, so later edits to the document never change the template — and a row in the new `user_templates` table records the name, description, file path, MIME type and size. The Templates gallery has a "My templates" section (file-type icon + name + description + file type + saved date, with a form to use it and forms to rename or delete it). Applying a custom template creates a new document (version 1) by copying the template file inside Storage; deleting a template removes the row and its Storage file but never the source document. Unit 422/422 (8 new: the template Storage path, the save/apply/delete/rename schemas). **Live e2e CLOSED 2026-11-21 (29/29)** after the owner applied the migration: save, gallery listing, apply, rename, delete, cross-user isolation, signed-out 307. Honest limit: a custom template has no thumbnail and no content preview (LibreOffice is not available in the app runtime, so no first-page render can be made at save time).
- Day 30 — Remaining templates (2026-11-21). The gallery now has nine templates: the six remaining from audit §3.12/§8 — Business Proposal, Invoice, Meeting Minutes, Certificate of Achievement (DOCX), Monthly Budget Tracker (XLSX, with SUM formulas and a Remaining row) and Pitch Deck (PPTX, 7 slides). The registry carries a `fileType` field, and the apply action now uses the template's own type for the new document's extension and MIME type (a budget tracker is stored as a spreadsheet, a pitch deck as a presentation — not as a Word document). The generator builds all nine files + thumbnails + preview JSONs; the XLSX/PPTX preview extractors read the sheet names + cell values and the slide titles + text, so the gallery preview works for all three types. `scripts/vercel-setup.py` rebuilds all nine from nothing, so the Vercel build ships the full gallery. Unit 414/414 (28 new template tests); live e2e 68/68 (all nine applied as a real user, the right MIME type + extension each, the template itself unchanged, cross-user isolation, signed-out 307). Two real bugs found and fixed in the work: the budget's Total-income SUM started at the wrong row (`=SUM(B7:B7)` — it now sums the whole income block), and the pitch deck's title-slide subtitle was never written (the title layout's subtitle placeholder is type SUBTITLE, not BODY). Honest limit: the XLSX preview shows the formulas, not the computed results; the PPTX deck has title + body text only (no charts, images or animations).
- Day 29 — Vercel deployment preparation + WPS-style UI polish (2026-11-20). The app is deployment-ready: `vercel.json` (the build command runs `scripts/vercel-setup.py` then `npm run build`) and a new `scripts/vercel-setup.py` that regenerates the binary assets the GitHub snapshot cannot carry (the blank templates, the template DOCX files + preview JSONs, and clean branded PNG thumbnails — LibreOffice is not on Vercel, so the thumbnails are Pillow cards with the template's real headings and body lines). The UI is polished WPS-style: the sidebar is grouped (Workspace / Tools / System) with a prominent "New" button and the stale day-04 footer replaced; the home page has a "Create new" row (Document / Spreadsheet / Presentation cards that create a blank file) and a "Recent" section; the library shows a coloured file-type icon and a type label per document. **The deploy itself is blocked**: the Vercel connector returns 403 on every call (the `muhmmad-anas-projects` team scope is not authorized, and the `authorize_team_access` tool is not available) — the owner must re-authorize Vercel team access or import the repo from the Vercel dashboard. qpdf is back locally (11.9.0), so the full unit suite is green: 386 passed, 0 failed. Honest limit: on Vercel the editor/export/conversion (no docserver), OCR (no Tesseract/worker) and PDF security (no qpdf) will show "not configured" until the external services exist.
- Day 28 — UX gaps (2026-11-20). The last queue item. (1)
  **No dead sidebar controls**: Templates is a real gallery
  (Day 16); Shared is now a real page listing the share
  links the user created (with the expiry, the Live/Expired/
  Revoked status and a Revoke button); Plan was removed from
  the sidebar (no plan UI, per the owner's decision). (2)
  **Drag-and-drop upload**: dropping files on the library
  upload area uploads each one through the same upload action
  (so the byte-signature check applies), with a per-file
  status. (3) **Responsive layout**: the shell has a mobile
  drawer, the library and tool pages wrap and shrink — verified
  by a class audit (the local Chromium is blocked by the
  managed-browser policy, so no live 390px render). (4)
  **Document tabs**: open documents appear as tabs in the app
  shell (localStorage, max 10, the active one highlighted);
  opening a document in the editor registers it. Unit tests
  382/384 (the 2 failures are the qpdf-dependent pdf-edit /
  pdf-form tests — qpdf was wiped by a VM reset and the system
  apt replay was still running); live e2e 9/9. Limits: the
  Shared page shows the links the user created, not documents
  others shared with them; the full link cannot be shown again
  (the token is returned once at creation); drag-and-drop
  uploads one file per action call with no per-file progress
  bar; tabs reload the editor when switching (the editor is
  an iframe); the /plan route still exists, unreachable from
  the nav.
- Day 27 — Hardening (2026-11-19). The release gate, six
  sub-items. (1) **Byte-signature upload validation**: the
  upload action checks the file's actual bytes against the
  extension it claims (PDF `%PDF`, PNG/JPEG magic, ZIP +
  inner marker for DOCX/XLSX/PPTX/ODT/ODS/ODP, OLE magic
  for DOC/XLS/PPT, valid UTF-8 for TXT/CSV) and refuses a
  mismatch before any Storage write — a PNG renamed to .pdf
  is refused. (2) **Auth rate limiting**: sign-in and
  sign-up are limited to 10 attempts per 15 minutes per
  email (a success clears the counter); Supabase Auth also
  rate-limits server-side. (3) **Health + logging**: a
  `/api/health` endpoint reports app/database/storage/
  docserver, and errors are logged as one JSON line with
  secrets redacted (`src/lib/log.ts`). (4) **Backup/restore**:
  `scripts/backup-metadata.mjs` exports the 11 tables to a
  timestamped JSON file, with the procedure in
  `docs/BACKUP_RESTORE.md`. (5) **Privacy**: a `/privacy`
  page discloses what is stored and which services process
  documents. (6) **Licence audit**: `docs/LICENSES.md`
  (generated by `scripts/license-audit.mjs`) lists all 33
  npm packages (all MIT/Apache/BSD/ISC) plus the system
  tools, flagging ONLYOFFICE (AGPLv3), Ghostscript (AGPLv3)
  and poppler (GPLv2+) for a commercial release. Unit tests
  369/369 (31 new); live e2e 11/11. Limits: the OLE check
  does not distinguish DOC from XLS from PPT; no malware
  scan; the limiters are per-process in-memory; no external
  error tracker; the backup is metadata-only via REST (no
  `pg_dump` from this VM); the privacy page is not a legal
  review and the licence audit is an inventory, not a legal
  opinion.
- Day 21 — Searchable PDF after OCR + extract text (2026-11-18).
  **Closed 2026-11-19: live e2e 21/21 after the owner applied the
  `words` migration.** This also fixed a real bug the first
  re-run found: `extractPdfText` sorted all text runs by y
  first, which scrambled the word order when OCR word boxes on
  one line sat at two slightly different baselines — the line
  now groups by baseline tolerance and sorts by x within the
  line. (Unit tests 339/339 at the time; the fix added 1 test.)
- Day 26 — Compatibility test corpus (2026-11-19). A fixed
  set of 19 representative documents (`corpus/` + `manifest.json`)
  that exercise the formats and the features, with a runner
  (`scripts/corpus-test.mjs`) that uploads each file as a test
  user and runs the checks the manifest names. The corpus covers
  all 12 upload formats plus PNG/JPG: a rich DOCX (mixed fonts,
  table, image, header, footer, section break, footnote), a rich
  XLSX (formulas, chart, styled cells, multiple sheets), a rich
  PPTX (table, chart, image), the legacy formats (DOC, XLS, PPT)
  and OpenDocument (ODT, ODS, ODP) derived via LibreOffice, plain
  TXT + CSV, a rich PDF, a scanned PDF, a 30-page PDF, a
  password-protected PDF, a PNG + JPG text image, and a corrupt
  PDF + DOCX. The generator (`scripts/generate-corpus.py`) is the
  source of truth and writes the manifest. A pure module
  (`src/lib/corpus.ts`) validates the manifest. Unit tests
  338/338 (17 new, incl. one that validates the real committed
  manifest); the runner reports 56 passed, 0 failed, 22 skipped
  (78 total) — the 22 skips are the docserver checks
  (pdf-export + round-trip) while the docserver is down. Limits:
  no pivot table in the XLSX and no animation in the PPTX
  (the libraries cannot create them — recorded, not faked);
  round-trip and PDF export are unproven until the docserver
  is back; no UI page in v1. The /tmp fixtures also got a
  committed rebuild script (`scripts/rebuild-fixtures.py`) so
  the next VM reset is one command.

- Day 25 — Single-user sharing (2026-11-18). A shareable link
  per document (`/s/<token>`): a random 32-hex-char token,
  only its SHA-256 hash stored in the database (migration
  `20261118090000_forma_shares.sql`), 1/7/30 days or never,
  revocable. Anyone with the link can open the public share
  page and download the document's current version — no
  account. The library gains a "Share" link; a manage page
  creates, lists and revokes links. Unit tests 319/319
  (7 new); live e2e **23/23 after the owner applied the
  corrected migration** (the first run was 3/4 with the
  migration pending; the migration had a wrong two-argument
  helper call, fixed in commit a633190). Limits: download
  only (no in-browser preview), the link gives the current
  version, no password on a link, no "export with comments" /
  "local reviewer notes" (future work), no multi-user sharing.

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
