# Day 21 plan — Searchable PDF after OCR + extract text

Owner instruction (2026-11-18 17:00 PKT): "okay go head
implement this properly by using feature loop.md" — build audit
queue item 6 (`docs/project-brief/FEATURE_AUDIT.md` §16):
searchable PDF after OCR + extract text.

## 1. Research

### Searchable PDF (the invisible text layer)
- **The standard approach** (OCRmyPDF, Tesseract's PDF
  output): embed the recognised words as *invisible* text in
  the PDF — text rendering mode 3 ("neither fill nor stroke"),
  so the text is invisible but present in the content stream,
  hence searchable, selectable and copyable, while the scanned
  image is untouched.
- **pdf-lib and rendering mode 3 (verified in the proof
  script).** `page.drawText` has NO rendering-mode option
  (`PDFPageDrawTextOptions` has no `renderingMode` field), so
  the text layer is built with the low-level operators that
  pdf-lib exports: `beginText()`, `setFontAndSize(fontKey,
  size)`, `setTextRenderingMode(TextRenderingMode.Invisible)`
  (mode 3), `setTextMatrix(1, 0, 0, 1, x, y)`, `showText
  (encoded)`, `endText()`, pushed with `page.pushOperators()`.
  The font key comes from `page.setFont(font)` then reading
  `page.fontKey` (a `PDFName` — private in the .d.ts, so the
  module reads it through a narrow cast, documented in the
  code). The encoded text comes from `font.encodeText(word)`.
  **Verified:** the decompressed content stream contains
  `3 Tr`; PDF.js `getTextContent` returns the invisible words;
  a rendered PNG has 0 non-white pixels in the invisible-text
  band (and the visible heading still renders).
  **The opacity-0 alternative was tested and works too**
  (`drawText` with `opacity: 0` is searchable), but rendering
  mode 3 is the standard and the proper one — the text is
  invisible *by definition* (no fill, no stroke), not just
  transparent, so it cannot appear in any reader.
- **Word positions.** The OCR module's `OcrWord` is only
  `{text, confidence}` — it drops the bounding box, even though
  the Tesseract TSV has it (columns left, top, width, height,
  in image pixels at the render DPI). **So `OcrWord` is extended
  to `{text, confidence, left, top, width, height}`** (image
  pixels at 300 DPI), and the words are stored. The box is
  converted to PDF points (× 72 / 300) with the origin flipped
  (the image's top is the PDF's bottom): `pdfX = left × 72/300`,
  `pdfY = (imageHeight − top − height) × 72/300`. The font size
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
  stores the words when it saves the results. "Make searchable"
  reads the latest OCR job's results (with words) for the
  document and embeds them. **If no words are stored** (an OCR
  result from before this feature), the route returns a clear
  400: "Run OCR again, then make it searchable." — the user
  re-runs OCR (async, via the worker) and the words are stored.
  **No synchronous re-run** in the route (a 20-page PDF would
  take up to ~100 s of Tesseract — too slow for an HTTP
  request).
- **The route** `POST /api/documents/[id]/pdf/make-searchable`
  follows the pdf-edit route pattern (Zod, the pdf-edit server
  module, the rate limiter, `{ok, version, documentId, title}`).
  It refuses a PDF that is not a PDF (400), a PDF with no OCR
  result (400, "run OCR first"), and an OCR result with no words
  (400, "run OCR again"). **It creates a NEW immutable version**
  — never an overwrite. The OCR page gets a "Make searchable"
  button (shown when OCR is done and the document is a PDF).
  The image height per page comes from the PDF itself (the
  page's height in points × 300/72 = the image height in
  pixels) — no extra data is needed.

### Extract text
- **The extractor already exists** (Day 9,
  `extractTextRuns` in `src/lib/pdf-content.ts`): it reads a
  PDF's text runs (with positions and fonts). A new route `GET
  /api/documents/[id]/pdf/extract-text` returns the PDF's text
  as a downloadable `.txt` file (plain text, one line per text
  run, grouped by page — the same grouping the OCR text uses).
  It follows the export route pattern (RLS, the file token is
  not needed — it is a GET on the document, the same as the
  download route; a 404 for a document the user cannot access).
  The library gets an "Extract text" link (PDFs only).
  **A scanned PDF with no text layer returns an empty file**
  (with a note in the response header) — that is honest, and it
  is exactly the case "Make searchable" fixes.

### Where it lives
- **The pure module** `src/lib/pdf-searchable.ts`:
  `embedOcrWordsInPdf(bytes, pages)` — `pages` is an array of
  `{pageNumber, imageHeightPx, words: OcrWord[]}`; it loads the
  PDF, embeds a standard font once, and for each word pushes
  the invisible-text operators at the converted position. It
  throws `PdfEditError` (a page that does not exist, a word
  outside the page, no words at all).
- **The OCR module change** (`src/lib/ocr.ts`): `OcrWord`
  gains `left, top, width, height` (image pixels); `parseTesseractTsv`
  keeps them. The worker (`ocr/worker.ts`) stores the words in
  the new column.
- **The migration** `supabase/migrations/
  20261118070000_forma_ocr_words.sql`: `ALTER TABLE
  document_ocr_results ADD COLUMN words jsonb` (nullable). The
  user applies it in the Dashboard (the established pattern) —
  a copy is saved to `~/workspace/your_files/
  forma-ocr-words-migration.sql` for him to run. **Until the
  migration is applied, "Make searchable" returns a clear 400
  ("the words column is missing — run the migration").**
- **The server module** `src/lib/pdf-searchable.server.ts`:
  `fetchSearchableDocument` (the pdf-edit server module) +
  `getLatestOcrWords(documentId)` (reads the latest done OCR
  job's results with words, via the user's client — RLS) +
  `saveSearchableVersion` (wraps `saveNewVersion`).
- **The routes**: `POST /api/documents/[id]/pdf/
  make-searchable` and `GET /api/documents/[id]/pdf/
  extract-text`.
- **The UI**: the OCR page gains a "Make searchable" button
  (when OCR is done and the document is a PDF). The library
  gains an "Extract text" link (PDFs only).

## 2. Small tasks (in order)

1. **Verify the mechanism (proof of concept).** The script
   `scripts/prove-searchable.mjs` (already run, in the project
   dir — keep it until the commit, then delete): a 1-page PDF
   with a visible heading; invisible words added two ways
   (opacity 0, and rendering mode 3 via the low-level
   operators). **Rendering mode 3 is verified:** the
   decompressed content has `3 Tr`; PDF.js returns the invisible
   words; a rendered PNG has 0 non-white pixels in the
   invisible-text band (the heading still renders). Opacity 0
   also works but is not used (rendering mode 3 is the
   standard).
   *Test: the script prints PASS for every check.*
2. **Extend the OCR word + the migration.** `OcrWord` gains the
   box; `parseTesseractTsv` keeps it; the worker stores the
   words; the migration adds the `words` column. Update the OCR
   unit tests (the fixture words now carry boxes).
   *Test: the OCR unit tests pass; the migration file is valid
   SQL.*
3. **Pure module + unit tests.** `src/lib/pdf-searchable.ts`
   (`embedOcrWordsInPdf`) + tests in `src/lib/pdf-searchable.
   test.ts`: the words are extractable via PDF.js (the right
   text on the right page), the content stream has `3 Tr`, the
   original PDF is not modified, a word outside the page / a
   missing page / no words are refused. The tests build the
   fixture PDF in the test (pdf-lib) and use the Day 19
   content-stream helper pattern (pdf-lib + zlib inflate).
   *Test: the new unit tests pass.*
4. **Server module + routes.** `src/lib/pdf-searchable.server.ts`
   + the two routes above.
   *Test: the routes are covered by the live e2e.*
5. **UI.** The OCR page's "Make searchable" button + the
   library "Extract text" link.
   *Test: the OCR page loads (checked in the live e2e).*
6. **Live e2e harness.** `scripts/e2e-searchable-test.mjs`
   (focused, the Day 13–21 pattern): as user A, upload the
   2-page scanned PDF; run OCR (via the POST route, then poll
   the GET route until the job is done — the worker is running);
   click "Make searchable" (the POST route) — succeeds (a new
   version), and PDF.js `getTextContent` on the new version
   returns the scanned text ("The quick brown fox jumps" etc.);
   extract-text returns a .txt download containing the same
   text; version 1 is unchanged; user B gets 404 on both
   routes; signed-out gets 307. **Note:** this harness depends
   on the user having applied the migration AND the worker
   storing words — if the migration is not applied, the harness
   reports it clearly and stops.
   *Test: the harness passes end to end.*
7. **Checks + docs + commit.** Typecheck, lint, Prettier,
   build, restart the app. Update `WPS_LEVEL_PLAN.md` (the
   searchable-PDF row → Done), `feature-matrix.csv` (FORMA-030),
   `known-limitations.md` (the searchable limits),
   `CHANGELOG.md` (Day 21 entry), `FEATURE_AUDIT.md` (§6.6 +
   §16 item 6 → Done), `docs/handoffs/day-21.md`. Save the
   migration copy to `~/workspace/your_files/
   forma-ocr-words-migration.sql` for the user to run. Commit on
   branch `day-21-searchable-pdf`. Update `~/MEMORY.md`. Reply
   to the owner (with the migration step, since "Make
   searchable" needs it).

## 3. What is NOT in this feature

- No synchronous OCR re-run in "Make searchable" (too slow for
  long PDFs — the words come from the stored OCR result).
- No forced width matching (the invisible text is sized by the
  word height, not stretched to the box width — the position is
  what matters for selection).
- No OCR on the extract-text route (a scanned PDF with no text
  layer returns an empty file — that is the case "Make
  searchable" fixes).
- No change to the editor, the upload flow, or the other PDF
  tools. No WPS feature, branding or font is used; the
  implementation is Forma's own on pdf-lib + Tesseract.
