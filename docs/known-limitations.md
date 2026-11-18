# Known Limitations — Forma Office

Updated: 2026-11-18 (Day 12)

## Day 9 — honest state

- **All four migrations ARE applied** (owner ran the combined file
  in the Supabase dashboard SQL Editor, 2026-11-18 00:19 PKT).
  Verified live: all 8 tables exist, the `documents` bucket has
  all 12 MIME types, and the live RLS test passes 9/9
  (`npm run test:live`). The authenticated end-to-end PDF flows
  are now proven live (see below).
- **The PDF features are proven live, authenticated.** Export,
  merge/split/rotate/compress (Days 7–8) and PDF editing (Day 9)
  were all verified against the running app as a real signed-in
  user: 24/24 checks for export/tools/editor and 21/21 for PDF
  editing (`scripts/e2e-pdf-test.mjs`, `scripts/e2e-edit-test.mjs`).
  Cross-user access is refused (404) and signed-out requests
  redirect to login (307) on every route.
- **The editor (ONLYOFFICE) round-trip is proven at the API
  level for DOCX, XLSX and PPTX, not in a browser.** For each
  format the editor page loads with the right document type
  (word/cell/slide), the file route serves the document, and a
  simulated ONLYOFFICE save callback (status 2) creates version 2
  with the edited text — all proven live (41/41 checks). Styled
  files prove the fonts and colours survive: a bold red / italic
  blue / plain black DOCX, XLSX and PPTX each export to a PDF
  with Liberation Sans-Bold, Liberation Serif-Italic and Carlito
  embedded and the red/blue colours in the content stream. What
  is still NOT proven: a human typing in the editor UI in a
  browser and the save round-tripping, because no browser here
  can reach the local document server (cloud browser is a
  separate VM that rejects loopback; local Chromium is blocked by
  Local Network Access checks; no tunnel works through the egress
  proxy). A real browser on a machine that can reach the app +
  docserver is still needed for that proof.
- **PDF text editing does not reflow the page.** The replacement
  is drawn at the same baseline, size and rotation as the old
  text. A longer replacement will overflow the space the old text
  occupied; a shorter one leaves a gap. The UI says so.
- **PDF text editing keeps the font family, weight, slant and
  colour — but not the exact font.** The replacement is drawn in
  the closest standard font to the original's BaseFont name
  (Arial/Liberation Sans -> Helvetica, Times/Liberation Serif ->
  Times, Courier/monospace -> Courier; bold and italic kept) and
  in the original's fill colour (rg/g/k, CMYK converted). The
  original font itself is never reused: an embedded subset almost
  never contains the replacement text's glyphs. A run drawn
  stroked (text rendering mode 1/2, stroking colour RG) keeps its
  fill colour only — the stroke colour is not tracked.
- **PDF text editing on CID fonts matches by position.** Some
  producers (ONLYOFFICE among them) embed subset CID fonts with
  no ToUnicode CMap, so the server cannot decode the text at all.
  Those runs are located by their baseline position and font size
  as the browser (PDF.js) reports them; a position match must be
  unique within 2 points or it is refused as ambiguous.
- **A replaced image fills the same frame.** The new image is
  drawn at the old image's position and size, so a different
  aspect ratio is stretched to fit that frame.
- **Uploads are not byte-signature checked.** Extension, declared
  MIME type and size are validated server-side; a magic-number
  check is a Day 12 hardening item. The editor callback DOES check
  Office magic bytes, and the image-replacement route checks PNG/
  JPEG magic bytes.
- **Shared with me and Templates are still placeholders** (Days 10
  and 11). Plan and usage is a placeholder (Day 13).
- **Direct Postgres does not connect from this VM.** The Supabase REST
  API works; direct `db.<ref>.supabase.co:5432` (and the pooler on 6543)
  fail because the runtime network policy answers the Postgres TLS
  handshake with a plain-text proxy message. Use the REST/Data API
  and the Supabase dashboard for schema work until the direct route
  is verified from another network.
- **No Vercel / Git deployment yet.** Local Git only (branches
  day-01-discovery through day-09-pdf-editing). No remote, no
  Vercel project. Preview deployment is NOT PERFORMED — access
  required. No Preview URL is claimed.
- **Tests exist, E2E is a scripted harness, not Playwright.**
  Vitest unit/component tests: 14 files, 111 tests, all passing.
  The live RLS test passes 9/9 (`npm run test:live`). The
  authenticated end-to-end PDF proofs are Node harnesses
  (`scripts/e2e-pdf-test.mjs`, `scripts/e2e-edit-test.mjs`) that
  need the app (and, for the editor, the docserver) running. No
  Playwright E2E suite yet (Day 14).
- **Local RLS verification is done** — 18/18 checks pass on local
  Postgres 16 (`bash scripts/verify-rls-local.sh`).
- **The document server runs locally only.** The DEB install of
  ONLYOFFICE Docs 10.0.0 listens on port 8083 and is started
  manually; it does not survive a VM restart, and the VM is below
  the official 4 GB RAM spec. Ghostscript 10.02.1 (for PDF
  compress) is installed the same way and also does not survive a
  VM reset.
- **Docker on this VM is limited.** `docker.io` is installed, but
  the daemon runs with `--iptables=false --bridge=none` (no
  NET_ADMIN for the NAT chain), overlayfs extraction fails on this
  filesystem (vfs is the fallback), and the egress proxy cuts large
  downloads from registry-1.docker.io (three failed pulls of the
  ONLYOFFICE image). The daemon is started manually and does not
  survive a VM restart. No Docker files are created for Forma
  (owner instruction, 2026-11-17).
- **Local Postgres is installed but not auto-started.** The cluster
  (`16/main`) stops when the VM restarts; run
  `service postgresql start` before `scripts/verify-rls-local.sh`.
- **Dark mode is not supported.** The shell renders in the light Forma
  palette; the shadcn dark tokens are unused.
- **WPS inventory is documentation-based only.** No hands-on WPS
  session was available on Day 1. Pricing is region-dependent and is
  not hardcoded in product copy.
- **ONLYOFFICE licence is unresolved for commercial launch.** See
  docs/architecture/ADR-001-office-editor-engine.md. Commercial
  integration is blocked until the owner decides and, for a proprietary
  product, obtains a Developer licence + legal review.

## What is NOT claimed

- No WPS parity claim yet — the project is now scoped to the WPS
  level (see `docs/project-brief/WPS_LEVEL_PLAN.md`), built one
  feature at a time, production-grade, one loop per feature
  (research → plan → small tasks → implement → test; see
  `docs/project-brief/FEATURE_LOOP.md`). Built so far: Writer,
  Spreadsheet and Presentation editors (ONLYOFFICE) with 12 upload
  formats, PDF export (Phase B, feature 1), PDF merge/split/rotate/
  compress (Phase B, feature 2), PDF editing — text, image
  replace, page delete/reorder (Phase B, feature 3), PDF form
  fill (Phase B, feature 4) — and PDF form building (Phase B,
  feature 5), and OCR for scanned files (Phase C, Day 13).
  No AI, conversion hub or template gallery yet
  — those are the next features in order.
- **OCR limits (Day 13).** OCR works on PDF, PNG and JPEG only.
  TIFF images are refused: the project's Leptonica was built
  without TIFF support (libtiff-dev cannot install on this
  machine — apt reports held broken packages around libzstd-dev).
  A job handles at most 20 pages. The engine is Tesseract 5.5.4
  with the tessdata_fast models — English reads cleanly (a test
  image reads exactly at 96% mean confidence); Urdu reads but
  is not perfect (a test image's first line came back with one
  extra character — accuracy depends on the font and the scan).
  Handwriting is not recognised, and tables/layouts come out as
  plain text, not structured data. The worker is a separate
  process (`node ocr/worker.ts`) that must be running for jobs
  to complete, and it does not survive a VM reset. The live
  end-to-end proof ran 22/22 on 2026-11-18 after the owner
  applied the migration (scanned PDF + Urdu image read by a
  real signed-in user, original untouched, cross-user 404s,
  signed-out 307s).
- **PDF form builder limits.** The builder offers the five
  pdf-lib field types — text, checkbox, radio group, dropdown,
  option list. There is no native date field (a date field is a
  text field with a date format in the AcroForm model, and WPS's
  date field is not reproduced). Fields are placed by clicking,
  not by dragging, and a radio group is always laid out as a
  vertical column of options. A field's name must be unique in
  the PDF, and the new field's appearance is drawn in a standard
  font (Helvetica), not a custom font. XFA PDFs are refused.
- **PDF form fill limits.** The filled value is drawn in a
  standard font (Helvetica), not the field's original font, and a
  value the standard font cannot display (e.g. Urdu/Arabic script,
  emoji) is refused with a clear message instead of producing a
  broken appearance. XFA forms are refused, never silently
  stripped (pdf-lib deletes XFA on getForm/save, so the check runs
  before any getForm call). Digital signature fields are listed
  as unsupported — signing is not supported yet (a deferred
  feature needing a legal decision). The filled form stays
  editable (it is NOT flattened).
- PDF compress needs Ghostscript on the host (10.02.1 on this VM).
  Without it the compress route returns 503 with a clear message;
  merge, split, rotate and editing do not need it.
- The export and PDF-tools/edit rate limits are in-memory per
  server process: they bound abuse on a single-instance deployment.
  A multi-instance deployment needs a shared (database-backed)
  limiter.
- **Conversion hub limits (Day 14).** The matrix offers only
  conversions the ONLYOFFICE engine's own "Download as" tables
  list, restricted to Forma's formats: within a family (word →
  word, spreadsheet → spreadsheet, presentation →
  presentation), every editable format → PDF, and PDF → DOCX /
  TXT. No cross-family conversion, no same-format conversion,
  no image input. `docx → doc` and `xlsx → xls` are not offered
  (the engine's own list does not include them), and `pdf →
  xlsx` (WPS's "PDF-to-Excel") is not offered in v1 (the PDF
  editor's list has no XLSX) — if a live test against the
  docserver proves either, the matrix grows (it is data, not
  code). **The conversion itself is not proven live yet:** the
  document server is still wiped (its .deb download returns 403
  through the proxy, re-checked 2026-11-18), so a conversion
  returns an honest 502 and creates nothing. The route's
  validation, RLS and page paths ARE proven live (13/13). The
  full conversion proof runs the day the docserver is back —
  flip `DOCSERVER_LIVE` in scripts/e2e-convert-test.mjs.
- **Templates limits (Day 16).** The gallery is DOCX-only in v1
  (resume, letter, report); there are no spreadsheet or
  presentation templates yet, and no proposal / invoice / meeting
  minutes / certificate templates yet. There is no "save a custom
  template" yet — turning one of your documents into a template
  needs a per-user template store (a table + Storage), which is a
  separate feature. The thumbnails are first-page renders made at
  authoring time (LibreOffice + pdftoppm); a template with more
  than one page only shows its first page in the gallery.
- **Security limits (Day 20).** No 40-bit encryption (insecure —
  not offered). No password recovery — if the password is
  forgotten, the PDF cannot be opened (that is the point of
  encryption). To change the password or permissions on a
  protected PDF, unlock it first, then protect it again. qpdf is
  a system binary (installed via apt) — it does NOT survive a VM
  reset, so reinstall it (`sudo apt-get install qpdf`) if the
  security page reports it missing; it will not be on a Vercel
  serverless function either. The passwords are passed to qpdf
  as command-line arguments (briefly visible in the process list
  — a known qpdf limitation) and are never stored, logged, or
  written to a file.
- **Sharing limits (Day 25).** Download only — the public
  share page shows the document title, type, size and expiry
  plus a Download button; there is no in-browser preview.
  The link gives the document's CURRENT version. No password
  on a link (the token itself is the credential). No
  "export with comments" and no "local reviewer notes" (they
  need a comments/notes model — future work). No multi-user
  sharing (the "Shared with me" page stays a placeholder).
  The token is returned ONCE, at creation — after that it is
  unrecoverable (the database only holds its hash), so the
  owner must copy the link when it is shown. The shares need
  the Day 25 migration (`20261118090000_forma_shares.sql`).
  A missing TABLE is PostgREST code PGRST205 (not PGRST204,
  which is a missing column) — the sharing server module
  checks for PGRST204, PGRST205 and 42703. **Do NOT use
  `export const dynamic = "force-dynamic"`** — it is not
  compatible with `nextConfig.cacheComponents` (the build
  fails); pages that read cookies or the current time are
  already dynamic.
- **Preferences limits (Day 24).** Three preferences only
  (OCR default language, image export format, image export
  DPI). No locale preference (the app has no i18n — a locale
  setting would change nothing). No default new-document
  format (the "New" button already lets the user pick) and no
  timezone preference (dates use the browser's timezone). The
  preferences need the Day 24 migration
  (`20261118080000_forma_preferences.sql`) — until it is
  applied, the Settings page shows the defaults + a notice and
  the save action returns a clear "run the migration" error.
  The e2e harness session cookie must hold the session as a
  JSON OBJECT, not an array (auth-js's `_isValidSession`
  checks for the access_token / refresh_token / expires_at
  properties, which an array does not have — the array form
  makes getSession return absent and every protected route
  307 to login).
- **Versions limits (Day 23).** The versions are immutable —
  there is no version deletion in the UI (the RLS allows
  owner/admin delete, but the UI does not offer it; deleting
  history is a separate decision). Restoring creates a NEW
  version (current + 1) from the old file — it never overwrites
  and never deletes. Restoring the current version is refused
  (400). There is no version comparison / diff. The version
  download is a signed URL (1 hour, the Day 4 pattern).
- **PDF↔image limits (Day 22).** A PDF's pages export as a
  ZIP (one image per page, `page-1.png`, …), PNG or JPG, at 72,
  150 or 300 DPI, at most 20 pages — a longer PDF is refused
  (a 100-page PDF at 300 DPI would be hundreds of MB). The
  export is a download, not a document (it creates no version).
  Images-to-PDF takes PNG/JPEG only (the formats the library
  stores), at most 20 images, all in one workspace; each image
  becomes one A4 page, fit and centred, aspect kept (a small
  image is never scaled up). pdftoppm and `zip` are system
  binaries — they do NOT survive a VM reset (reinstall:
  `sudo apt-get install poppler-utils zip`).
- **Searchable PDF limits (Day 21).** The invisible text layer
  is Latin only (Helvetica) — Urdu/Arabic words are skipped
  (counted, not failed) because the standard font cannot encode
  them; a font with those glyphs is a follow-up. The words come
  from the stored OCR result (the `words` column, Day 21
  migration) — a PDF with no OCR result, or an OCR result from
  before the migration, is refused with a clear message (run OCR
  again). "Make searchable" does not re-run OCR (too slow for
  long PDFs). A scanned PDF with no text layer extracts to an
  empty file (flagged in a header) — that is the case "Make
  searchable" fixes.
- **Draw limits (Day 19).** No free-form colour picker (a fixed
  set of five colours, like the annotations) and no custom fonts
  (Helvetica, Times, Courier only). The added text and shapes are
  upright only — no rotation. A link, text or shape cannot be
  edited or removed after it is added (the only undo is the
  version history); removing a link annotation is a follow-up
  (the annotations page's remove works on annotation dicts, but
  the link is added by a different route). A line runs from where
  you started dragging to where you stopped.
- **Page tools limits (Day 18).** Insert pages only from a PDF
  already in the library — inserting from a newly uploaded file
  is a later step (upload it to the library first, then insert
  from it). Page numbers are drawn onto the page content, so
  applying them twice draws a second number over the first (the
  only undo is the version history), and there is no way to remove
  them except by going back to an earlier version.
- **Annotations limits (Day 17).** No appearance stream (/AP) is
  written in v1 — PDF.js renders the annotations from the
  QuadPoints / InkList, and Adobe Reader / Preview generate
  appearances on open, so the annotations are visible in every
  reader but a reader that only trusts /AP may not show them.
  The colour set is fixed (yellow highlight, green underline, red
  strikethrough, yellow note, red ink) — no free-form colour
  picker. No free-text annotation (typing text onto the page) —
  that is the PDF page-tools feature. The annotation toolbar
  renders in the browser after the PDF loads (a client component),
  so the initial server HTML only carries the loading state.
- No production release.
