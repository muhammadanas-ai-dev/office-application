# Day 21 handoff — Searchable PDF after OCR + extract text

Date: 2026-11-18. Owner instruction (17:00 PKT): "okay go head
implement this properly by using feature loop.md" — build audit
queue item 6 (`docs/project-brief/FEATURE_AUDIT.md` §16):
searchable PDF after OCR + extract text.

## 1. What was researched

- **The standard approach** (OCRmyPDF, Tesseract's PDF
  output): embed the recognised words as *invisible* text in
  the PDF — text rendering mode 3 ("neither fill nor stroke"),
  so the text is invisible but present in the content stream,
  hence searchable, selectable and copyable, while the scanned
  image is untouched.
- **pdf-lib and rendering mode 3 (verified in the proof
  script).** `page.drawText` has NO rendering-mode option, so
  the text layer is built with the low-level operators pdf-lib
  exports: `beginText()`, `setFontAndSize(fontKey, size)`,
  `setTextRenderingMode(TextRenderingMode.Invisible)` (mode 3),
  `setTextMatrix(1, 0, 0, 1, x, y)`, `showText(encoded)`,
  `endText()`, pushed with `page.pushOperators()`. The font key
  comes from `page.setFont(font)` then reading `page.fontKey`
  (a `PDFName` — private in the .d.ts, so the module reads it
  through a narrow cast, documented in the code). The encoded
  text comes from `font.encodeText(word)`. **Verified:** the
  decompressed content stream contains `3 Tr`; PDF.js
  `getTextContent` returns the invisible words; a rendered PNG
  has 0 non-white pixels in the invisible-text band (and the
  visible heading still renders). **The opacity-0 alternative
  was tested and works too** (`drawText` with `opacity: 0` is
  searchable), but rendering mode 3 is the standard and the
  proper one — the text is invisible *by definition* (no fill,
  no stroke), not just transparent, so it cannot appear in any
  reader.
- **Word positions.** The OCR module's `OcrWord` was only
  `{text, confidence}` — it dropped the bounding box, even
  though the Tesseract TSV has it (columns left, top, width,
  height, in image pixels at the render DPI). **`OcrWord` is
  extended to `{text, confidence, left, top, width, height}`**
  (image pixels at 300 DPI), and the words are stored. The box
  is converted to PDF points (× 72/300) with the origin flipped
  (the image's top is the PDF's bottom): `pdfX = left × 72/300`,
  `pdfY = pageHeight − (top + height) × 72/300`. The font size
  is the word's height in PDF points, and the text baseline
  starts at the box's bottom-left — so the invisible text sits
  exactly over the word in the image. (The width is not forced
  to match the box — the text is invisible, so a slight width
  difference does not matter visually; the position is what
  makes selection work.)
- **Where the words come from.** The OCR worker already
  computes the words (with boxes, after the extension) — so the
  words are stored in the database and "Make searchable" reads
  them. **A migration adds a `words` JSONB column to
  `document_ocr_results`** (nullable; an array of `{text,
  confidence, left, top, width, height}` per page). The worker
  stores the words when it saves the results. **If no words are
  stored** (an OCR result from before this feature), the route
  returns a clear 400: "Run OCR again, then make it searchable."
  **No synchronous re-run** in the route (a 20-page PDF would
  take up to ~100 s of Tesseract — too slow for an HTTP
  request).
- **Extract text.** The extractor already exists (Day 9,
  `listPdfTextRuns` in `src/lib/pdf-edit.ts`): it reads a PDF's
  text runs (with positions and fonts). A new helper
  `extractPdfText(bytes)` (in `src/lib/pdf-searchable.ts`)
  groups the runs into lines (by baseline y) and returns the
  text per page and the full text. The route `GET /api/
  documents/[id]/pdf/extract-text` returns it as a downloadable
  `.txt` file. **A scanned PDF with no text layer returns an
  empty file** (flagged with `X-Forma-Extract-Empty: 1`) — that
  is honest, and it is exactly the case "Make searchable"
  fixes.

## 2. Completed functionality

- **The pure module** (`src/lib/pdf-searchable.ts`):
  `embedOcrWordsInPdf(bytes, pages)` — loads the PDF, embeds
  Helvetica once, and for each word pushes the invisible-text
  operators at the converted position. Words that cannot be
  encoded in the standard font (e.g. Urdu/Arabic — Helvetica is
  Latin only) are skipped and counted, not failed; a word
  outside the page is skipped too; a missing page / no words
  is a 400. `extractPdfText(bytes)` — the text per page and the
  full text, grouped into lines.
- **The OCR module change** (`src/lib/ocr.ts`): `OcrWord`
  gains the box; `parseTesseractTsv` keeps it. The worker
  (`ocr/worker.ts`) stores the words in the new column. The
  migration `supabase/migrations/20261118070000_forma_ocr_words.
  sql` adds the column; a copy is saved to
  `~/workspace/your_files/forma-ocr-words-migration.sql` for the
  owner to run in the Dashboard.
- **The server module** (`src/lib/pdf-searchable.server.ts`):
  `getLatestOcrWords(userClient, documentId)` (the latest done
  OCR job's stored words, via the user's client — RLS; a 400
  when the job is not done, when the results have no words, or
  when the `words` column is missing — PGRST204 — i.e. the
  migration has not been applied) + re-exports of the pdf-edit
  server helpers.
- **The routes**: `POST /api/documents/[id]/pdf/make-searchable`
  (no body; the pdf-edit route pattern; the pdf-edit rate
  limiter; a new version; the skipped-words count in the
  `X-Forma-Searchable-Skipped-Words` header) and `GET /api/
  documents/[id]/pdf/extract-text` (the .txt download, the
  empty flag in `X-Forma-Extract-Empty`).
- **The UI**: the OCR page gains a "Make searchable" button
  (when OCR is done and the document is a PDF) with a success /
  error message; the library gains an "Extract text" link (PDFs
  only, a direct download link to the route).

## 3. Code and data changes

- `src/lib/pdf-searchable.ts` (new, pure) +
  `src/lib/pdf-searchable.test.ts` (new, 10 tests) +
  `src/lib/pdf-searchable.server.ts` (new, server-only).
- `src/lib/ocr.ts` (the `OcrWord` box) + `src/lib/ocr.test.ts`
  (the box assertion) + `ocr/worker.ts` (stores the words) +
  `src/types/database.types.ts` (the `words` column).
- `supabase/migrations/20261118070000_forma_ocr_words.sql`
  (new) + the copy `~/workspace/your_files/
  forma-ocr-words-migration.sql` (for the owner to run).
- `src/app/api/documents/[id]/pdf/make-searchable/route.ts`
  (new) + `src/app/api/documents/[id]/pdf/extract-text/route.ts`
  (new).
- `src/components/ocr/ocr-client.tsx` (the "Make searchable"
  button) + `src/components/library/library-forms.tsx` +
  `library-list.tsx` (the "Extract text" link,
  `extractTextHref` prop).
- `scripts/e2e-searchable-test.mjs` (new, focused harness).
  `scripts/prove-searchable.mjs` was temporary and deleted.
- Docs: `docs/handoffs/day-21-plan.md`,
  `WPS_LEVEL_PLAN.md` (the searchable-PDF row → Done),
  `docs/feature-matrix.csv` (FORMA-030),
  `docs/known-limitations.md` (the searchable limits),
  `CHANGELOG.md` (Day 21 entry),
  `docs/project-brief/FEATURE_AUDIT.md` (§6.6 + §16 item 6 →
  Done, live e2e pending the migration), `docs/project-brief/
  FEATURE_LOOP.md` (queue: item 6 Done, PDF↔image next),
  `~/MEMORY.md` (Day 21 entry).

## 4. Tests

- **Proof of concept (task 1): all checks pass**
  (`scripts/prove-searchable.mjs`, deleted after use). A 1-page
  PDF with a visible heading; invisible words added two ways
  (opacity 0, and rendering mode 3 via the low-level
  operators). **Rendering mode 3 is verified:** the
  decompressed content has `3 Tr`; PDF.js returns the invisible
  words; a rendered PNG has 0 non-white pixels in the
  invisible-text band (the heading still renders). Opacity 0
  also works but is not used (rendering mode 3 is the
  standard). (Two proof bugs were the checks, not the code:
  `page.fontKey` is a `PDFName`, not a string, and the content
  stream is Flate-compressed, so `3 Tr` is only visible after
  decompressing.)
- **Unit: 292/292 (23 files passed, 1 skipped, 9 tests skipped —
  the pre-existing skips).** 10 new: the words are extractable
  via PDF.js (the right text on the right page), the content
  stream has `Tr 3`, the text is placed at the word's position,
  the input PDF is not modified, a non-Latin word is skipped
  (not failed), a word outside the page is skipped, a missing
  page / an empty word list is refused; extract-text returns the
  text page by page, reads the invisible layer too, and returns
  empty text for a PDF with no text layer.
- **Live e2e: 7/8 (`scripts/e2e-searchable-test.mjs`) — the
  extract-text checks pass; the searchable checks wait on the
  migration.** As a real signed-in user A: the scanned PDF
  uploads (v1); extract-text on it returns 200 with empty text
  (no text layer) and the empty flag in a header, and the
  download is a .txt file; signed-out gets 307 on both routes.
  The only failure is the migration check itself (the `words`
  column does not exist yet) — the make-searchable checks were
  correctly skipped. **Re-run the harness after the owner
  applies the migration** — it then runs OCR (the worker stores
  the words), makes the PDF searchable (version 2, both pages
  searchable via PDF.js), checks extract-text returns the text,
  the OCR page shows "Make searchable", version 1 is
  byte-identical, and user B gets 404 on both routes.
- **Typecheck, lint, build: pass.** Prettier applied to the Day
  21 TS files.

## 5. Deployment verification

- App rebuilt and restarted on :3000 (new build, both routes +
  the OCR page + the library link included);
  `/api/supabase-status` returns 200.
- **The OCR worker was restarted** with the new code (it now
  stores the word boxes) — the old worker (PID 2355, from the
  Day 13 recovery) was stopped and a new one started from the
  project root; the log shows "[ocr worker] started — polling
  for OCR jobs."
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.
- **The Day 21 migration is NOT applied yet** — the owner runs
  `~/workspace/your_files/forma-ocr-words-migration.sql` in the
  Supabase Dashboard SQL Editor, then the harness is re-run.

## 6. Security/licensing checks

- No new engine licence to clear: pdf-lib + Tesseract, already
  in the project. No WPS feature, branding or font is used.
- No secrets in code. No migration touches existing data (it
  only adds a nullable column).

## 6b. Verification notes and fixes made during Day 21

- **Two wrong test assumptions, both the tests, not the code.**
  (1) The OCR test asserted the first word's box as
  `{left: 100, top: 50, width: 120, height: 30}` — the fixture
  TSV row is actually `left 45, top 49, width 100, height 37,
  conf 96.78`. Fixed to the real values. (2) The searchable
  test filtered the parsed operators by `op.name === "Tr"` —
  the field is `op.operator` (the Day 19 pattern), and the
  operand is a number token, not a bare number. Fixed.
- **PDF.js detaches the ArrayBuffer it is given.** In the
  searchable test, `pageText` (pdfjs-dist) ran before
  `pageOperators` (pdf-lib) on the same bytes, and
  `PDFDocument.load` then failed with "No PDF header found"
  because the buffer was detached. Fixed by copying the bytes
  (`bytes.slice()`) before handing them to PDF.js — in the
  test helpers and in the harness.
- **A syntax error from an edit.** Adding `extractPdfText` to
  `pdf-searchable.ts` consumed the opening lines of the
  `embedOcrWordsInPdf` doc comment, leaving its tail orphaned
  (TS1109). Fixed by restoring the comment's opening.
- **`loadPdf` is private in pdf-edit.ts** (and in
  pdf-page-tools.ts) — it is not exported. The searchable
  module defines its own private `loadPdf` (the same pattern:
  `looksLikePdf` + `PDFDocument.load(bytes,
  {ignoreEncryption: false})`).

## 7. Known defects and limitations

- **The invisible text layer is Latin only (Helvetica).**
  Urdu/Arabic words are skipped (counted in the
  `X-Forma-Searchable-Skipped-Words` header, not failed)
  because the standard font cannot encode them. A font with
  those glyphs is a follow-up.
- **The words come from the stored OCR result** (the `words`
  column, Day 21 migration). A PDF with no OCR result, or an
  OCR result from before the migration, is refused with a clear
  message (run OCR again). "Make searchable" does not re-run
  OCR (too slow for long PDFs).
- **A scanned PDF with no text layer extracts to an empty file**
  (flagged in a header) — that is the case "Make searchable"
  fixes.
- **The editor browser round-trip is still unproven** (the
  docserver is down). The OCR page loads (200); a human running
  OCR and clicking "Make searchable" is the missing proof, same
  as for every other editor feature.

## 8. Tomorrow's target

- **Next feature in the queue: PDF↔image (#7).** Two parts:
  (1) export a PDF's pages to PNG/JPG (pdftoppm is already on
  the VM and used by the OCR pipeline — reuse it); (2) create a
  PDF from images (pdf-lib embeds PNG/JPEG). Both create a new
  document in the library (an image set) / a new PDF document.
  The export needs a decision on the output form (a ZIP of
  images, or one image per page as separate documents).
