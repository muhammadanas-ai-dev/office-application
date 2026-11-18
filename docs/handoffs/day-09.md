# Day 9 handoff — PDF editing (Phase B, feature 3)

Date: 2026-11-18 (early morning). Branch: `day-09-pdf-editing`.
Owner instruction (2026-11-18 00:24 PKT): "test the pdf features
make sure built properly and if yes then go to second feature and
built it properly" — interpreted as: first prove the Day 7–8 PDF
features live (now unblocked by the applied migrations), then build
the next feature, PDF editing (Phase B, feature 3).

## 1. What was researched

- **Migrations applied (owner, 2026-11-18 00:19 PKT).** The owner
  pasted the combined file (`~/workspace/your_files/forma-migrations-all.sql`,
  all four migrations in order) into the Supabase dashboard SQL
  Editor; it returned "Success. No rows returned".
- **Live verification of the migrations.** All 8 tables exist
  (200, 0 rows each via service_role); the `documents` bucket
  exists with all 12 MIME types. The live RLS test passes 9/9
  (two real users via admin API: A reads own workspace/document/
  file, B cannot see A's workspace/profile/document, cannot insert
  into A's workspace, cannot download A's file; test users deleted
  after). The `npm run test:live` script itself needed three fixes
  to run at all (commit `d2bae7c`): the vitest config `include`
  missed `supabase/tests/rls-live.test.ts` ("No test files found"),
  the live test's admin-client import tripped the `server-only`
  guard (neutralised with `vi.mock` + node environment), and the
  browser client throws in Node on sign-in (switched to a plain
  supabase-js client with an in-memory session).
- **Session cookies for live testing.** To call the running app as
  a real signed-in user, the harness builds the @supabase/ssr
  session cookie by hand: cookie `sb-<ref>-auth-token` =
  `base64-` + base64url(JSON.stringify(session)), where the session
  comes from a real `signInWithPassword` call. Verified against
  the @supabase/ssr source (`cookies.js`: `BASE64_PREFIX =
  "base64-"`, chunked-cookie decoding). This is what the e2e
  harnesses use.
- **PDF content streams (what text editing must handle).** Two
  shapes were dumped and compared:
  - pdf-lib PDFs: text drawn with `Tj` and a hex string that
    decodes directly to ASCII (`<504446...> Tj`), font a standard
    Helvetica (`/Helvetica-... 20 Tf`), position via `Tm`.
  - ONLYOFFICE PDFs: text drawn with `TJ` arrays of 2-byte hex
    glyph codes (`<000300040005...>TJ`), fonts are Type0 (CID)
    subset fonts, position via `Td`. The fonts carry **no
    ToUnicode CMap** (verified: `ToUnicode` lookup is false for
    both F1 and F2), so the server cannot decode the glyph codes
    to Unicode at all. Text on those PDFs is therefore located by
    baseline position and font size, not by decoded text.

## 2. Completed functionality

- **Day 7–8 PDF features proven live (24/24).** A new harness
  (`scripts/e2e-pdf-test.mjs`) signs in as a real user, uploads a
  DOCX and PDFs, and proves: export returns a real PDF with the
  document's text and the right download name; PDF source and bad
  formats are refused (400); merge (5 pages, both texts), split
  (exact pages), rotate (90°, additive), compress (6.75 MB image
  PDF → 1.1 MB, 84% smaller, page intact) all return correct
  output; cross-user access is refused (404); signed-out requests
  redirect to login (307). The editor is proven at the API level:
  the editor page loads (200) with a valid document key and HMAC
  file URL, the file route serves the DOCX, and a simulated
  ONLYOFFICE save callback (status 2, JWT-signed) creates
  version 2 with the edited text. Two harness bugs were found and
  fixed (the test DOCX was missing `+xml` in its Override content
  type, so ONLYOFFICE rendered the raw XML; the key regex did not
  account for escaped quotes in the RSC payload).
- **PDF editing (Phase B, feature 3) — DONE.** Four operations on
  one shared pipeline, each creating a new immutable version:
  - **Edit text** (`POST /api/documents/[id]/pdf/edit-text`):
    the old text is removed from the content stream — never just
    covered — and the replacement is drawn at the same baseline,
    size and rotation in standard Helvetica. Match order: exact
    decoded text, consecutive runs that join to the text, then a
    position match (CID fonts). 500-char cap; non-WinAnsi
    replacements refused with a clear 400.
  - **Replace image** (`POST .../pdf/edit-image`, multipart):
    PNG/JPEG only (magic-byte check), 10 MB cap; the new image is
    embedded and drawn in exactly the old frame.
  - **Delete pages / reorder pages** (`POST .../pdf/edit-pages`):
    deleting every page and a non-permutation reorder are refused.
  - **Edit page** (`/documents/[id]/pdf-edit`): PDF.js renders
    the pages; text runs and image frames are clickable overlays;
    a pages panel deletes and reorders. An "Edit PDF" link is in
    the library for PDF documents.
- **Shared pipeline.** RLS through the signed-in user's client,
  50 MB cap, 10 operations/minute per user (shared
  `FixedWindowRateLimiter`), clear 400s for bad input, 404s for
  another user's document, 307 for signed-out requests. Every
  edit saves a new version (upload v(n+1) → version row → guarded
  documents update); the original file is never overwritten.

## 3. Code and data changes

- `src/lib/pdf-content.ts` (new): the content-stream engine —
  tokenizer (literal/hex strings, names, arrays, dicts, comments),
  operator parser, ToUnicode CMap parser (`beginbfchar` /
  `beginbfrange`, single + array targets, UTF-16BE with surrogate
  pairs), WinAnsi decode/encode, text-run extraction (text state:
  font, size, text matrix, CTM via `q/Q`/`cm`; `Tf`/`Td`/`TD`/
  `Tm`/`T*`/`TL`/`Tc`/`Tw`/`Tz`/`Ts`; `Tj`/`TJ`), image-placement
  extraction (`Do` + CTM), and the re-serializer (drop ops,
  insert replacement ops). Scope is narrow and loud: only the
  operators the editor needs are understood; anything else is
  preserved verbatim; an unparseable stream is refused.
- `src/lib/pdf-edit.ts` (new): the operations on pdf-lib +
  pdf-content — `editTextInPdf` (exact / joined / position match,
  replacement ops at the run's own text matrix, Helvetica added to
  the page resources), `listPdfImages` + `replaceImageInPdf`
  (XObject entry repointed at the embedded replacement),
  `deletePagesInPdf`, `reorderPagesInPdf`, `listPdfTextRuns`,
  `assertEditablePdf`, `detectImageMime` (magic bytes).
- `src/lib/pdf-edit.server.ts` (new): server-only wiring —
  `saveNewVersion` (the version bookkeeping, mirroring the editor
  callback), `fetchEditableDocument` (full row incl. workspace +
  version through the user's client), `pdfEditRateLimiter`,
  `editJsonResponse`, and re-exports so routes import from one
  place.
- Routes (new): `src/app/api/documents/[id]/pdf/edit-text/route.ts`,
  `.../edit-image/route.ts` (FormData), `.../edit-pages/route.ts`.
  All POST, Zod-validated, rate-limited, `PdfEditError` → its
  status + message, unexpected → 500 generic.
- UI (new): `src/app/(workspace)/documents/[id]/pdf-edit/page.tsx`
  (server: RLS document load, page count + image list, honest
  empty states) and `src/components/pdf-edit/pdf-edit-client.tsx`
  (PDF.js rendering, text/image overlays, edit forms, pages panel
  with delete + up/down reorder, version confirmation).
  `public/pdf.worker.min.mjs` (copied from pdfjs-dist 5.7.284 —
  the worker is served from `public/` so Turbopack does not have
  to bundle it; re-copy on a pdfjs-dist upgrade).
- Library: `DocumentActions` gained a `pdfEditHref` prop
  ("Edit PDF" link for PDFs) in `library-forms.tsx` +
  `library-list.tsx`.
- Deps: `pdfjs-dist@5.7.284` installed.
- Harnesses (dev only, committed for repeatability):
  `scripts/e2e-pdf-test.mjs` (24 checks) and
  `scripts/e2e-edit-test.mjs` (21 checks). They need the app on
  :3000 (and, for the editor callback, the docserver on :8083 and
  a file server on :8899 serving `/tmp/e2e/`), and they create
  real test users and delete them afterwards.
- Docs: `docs/project-brief/WPS_LEVEL_PLAN.md` (PDF editing Done,
  form fill next), `docs/feature-matrix.csv` (FORMA-015–019 added,
  42 rows), `docs/known-limitations.md` (rewritten to Day 9:
  migrations applied, live proofs, text-edit limits),
  CHANGELOG (Day 9 entry).

## 4. Tests

- **Unit: 111/111 pass (14 files)** — up from 90. New:
  `src/lib/pdf-content.test.ts` (9 tests: tokenizer, CMap,
  WinAnsi round-trip, run extraction on a pdf-lib PDF and on an
  ONLYOFFICE PDF) and `src/lib/pdf-edit.test.ts` (12 tests: text
  edit exact + CID position with the old text gone from
  `pdftotext`, refusals, delete/reorder + permutation check,
  image list/replace + frame preservation, magic-byte detection).
- **Live RLS: 9/9 pass** (`npm run test:live`, after the
  `d2bae7c` fixes). Normal suite still skips it without
  `FORMA_LIVE_DB=1`.
- **Local RLS: 18/18 pass** (`bash scripts/verify-rls-local.sh`,
  re-run, no regression — no schema change this day).
- **Live e2e PDF features: 24/24 pass**
  (`node scripts/e2e-pdf-test.mjs`).
- **Live e2e PDF editing: 21/21 pass**
  (`node scripts/e2e-edit-test.mjs`): text edit exact (v2, old
  text gone, v1 untouched, second edit → v3), text edit CID
  position (v2, replacement visible, old line gone), image
  replace (v2, valid 1-page PDF), delete page (v4, 2 pages),
  reorder (v5, pages swapped), missing text / delete-all refused
  (400), cross-user edit/pages refused (404), signed-out edit
  redirects (307), edit page loads for A (200) and shows
  "Document not found" for B.
- **Live gates (no session):** edit-text POST → 307, edit-image
  POST → 307, edit-pages POST → 307, pdf-edit page → 307, app
  root → 200, `/api/supabase-status` reachable.

## 5. Deployment verification

- Build passes; routes `/api/documents/[id]/pdf/edit-text`,
  `/edit-image`, `/edit-pages` and page `/documents/[id]/pdf-edit`
  are in the build output. Typecheck, lint and format pass.
  The app server was restarted with the new build (old
  next-server PIDs killed by explicit PID — never `pkill -f`
  with a pattern in my own command line, which SIGTERMs my own
  shell).
- Preview deployment: NOT PERFORMED (no Git/Vercel remote
  access). No Preview URL is claimed.

## 6. Security/licensing checks

- Secret scan of the staged diff: clean (no keys in code; the
  e2e harnesses read `.env.local` at runtime and never print
  secrets).
- RLS is the enforcement on every edit route: the document row is
  fetched through the signed-in user's client, and the file bytes
  are downloaded only after that check (via `fetchDocumentPdf`).
  Cross-user edits return 404 (no leak of which document exists).
- The replacement image is validated by magic bytes (not the
  declared MIME type), capped at 10 MB, and embedded as a new
  image object — the old image data is removed from the document.
- The replacement text is WinAnsi-encoded; characters outside
  WinAnsi are refused rather than rendered as garbage.
- The content-stream rewrite never trusts the browser's text: the
  server re-derives the run from the file itself (exact text or
  position), and refuses when it cannot find it.
- ONLYOFFICE licence: unchanged (Community AGPLv3 for the
  evaluation; a proprietary commercial launch still needs the
  Developer licence + legal review). PDF editing itself uses
  pdf-lib + PDF.js (open-source) and needs no ONLYOFFICE licence.

## 6b. Verification notes and fixes made during Day 9

- **Three real bugs found by the tests and fixed:**
  1. `doc.context.flateStream()` returns a direct `PDFRawStream`
     object, not a ref. Setting it as a page's Contents corrupts
     the page tree on save (`pdfinfo: Kid object (page 1) is
     wrong type`). Fixed by registering it first
     (`doc.context.register(stream)`) and setting the returned ref.
  2. Content streams are latin1-decoded for parsing but were
     re-encoded with a UTF-8 `TextEncoder`, which expands every
     byte above 127 into two bytes. Fixed with a latin1
     byte-conversion (`charCodeAt & 0xff`).
  3. `PDFDict.entries()` yields `PDFName` objects, not strings.
     Both `getPageFonts` and `listPdfImages` keyed their maps by
     the `PDFName` object, so no font or image ever matched a
     lookup by string. Fixed with `nameObj.decodeText()`.
- **Two more pdf-lib API facts learned the hard way:**
  `PDFStream.getContents()` returns the raw (still Flate-encoded)
  bytes for a `PDFRawStream` — decode with `decodePDFRawStream`
  (whose `Stream.getBytes(length)` needs an explicit length; the
  `length` getter is not in pdf-lib's types, so it is read through
  a cast). And `PDFStream` must be imported as a value, not a
  `type`, when used with `instanceof`.
- **pdfjs-dist 5.x:** `page.render` takes `canvas` (the element),
  not `canvasContext`; `RenderParameters` requires `canvas`.
- **The e2e DOCX fixture** (Day 8 harness) was missing `+xml` in
  its Override content type, so ONLYOFFICE rendered the raw XML;
  fixed and the fixture was regenerated (`debug-export.pdf` now
  has clean text).

## 7. Known defects and limitations

- Text editing does not reflow: the replacement sits where the
  old text was (same baseline/size/rotation, Helvetica font).
  A longer replacement overflows; the UI says so.
- CID fonts (ONLYOFFICE PDFs) are matched by position; an
  ambiguous position (two runs within 2 points) is refused.
- A replaced image fills the old frame (aspect ratio stretched).
- The browser UI round-trip (a human typing in the ONLYOFFICE
  editor) is still NOT proven — no browser here can reach the
  local docserver (see §1). The API-level proof is done.
- The edit/image/pages rate limit is in-memory per process (same
  multi-instance hardening item as export/PDF tools).
- `public/pdf.worker.min.mjs` is a vendored copy of the pdfjs-dist
  worker; re-copy it on a pdfjs-dist upgrade.
- The CSV edge case from Day 6 (a CSV edited in the editor may
  save back as XLSX and be rejected by the callback's filetype
  check) is still untested live.

## 8. Tomorrow's target

- Highest-priority feature: **Phase B, feature 4 — PDF form
  fill** (per `docs/project-brief/WPS_LEVEL_PLAN.md`): fill
  AcroForm fields in a PDF, via ONLYOFFICE Docs (pdf, form) or a
  Forma-own implementation — one feature, deeply and
  production-grade, per the owner's method. Acceptance: a filled
  field shows the entered value and survives a reopen; the
  original file is never overwritten (a new version is created);
  a PDF with no form fields reports that honestly instead of
  faking a form.
- Dependencies/blockers: none new. The document server and
  Ghostscript still run locally only (manual start, do not
  survive a VM restart); the browser UI round-trip still needs a
  real browser on a machine that can reach the app + docserver.
