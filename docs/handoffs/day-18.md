# Day 18 handoff — PDF page tools, second half (part 1: insert pages + page numbers)

Date: 2026-11-18. Owner instruction (16:38 PKT): "okay go head
implement this properly by using feature loop.md" — build the PDF
page tools second half, starting with insert pages + page numbers
(the two named in the Day 17 reply). Audit queue item 4
(`docs/project-brief/FEATURE_AUDIT.md` §16). The rest of item 4
(crop, add text, hyperlinks, shapes) follows as part 2.

## 1. What was researched

- **Insert pages (pdf-lib).** `doc.insertPage(index, page?)`
  inserts at the 0-based index. With no page it creates a blank
  page of **A4** size (the default in pdf-lib's source) — a blank
  A4 page in a Letter document would be the wrong size, so the
  blank page is inserted with the size of a neighbouring page
  (`insertPage(index, [width, height])`, from `getWidth()` /
  `getHeight()`). `doc.copyPages(srcDoc, indices)` copies pages
  from another document, then `insertPage(index, copiedPage)`
  places each one; the copied pages keep their own size, fonts
  and content.
- **The source for "insert from another PDF" is the library.**
  The pdf-tools page already loads the other PDFs in the same
  workspace (for merging); the insert form reuses that list, so
  the user picks a PDF from the library and selects its pages.
  Uploading a new PDF to insert from is a later step — they
  upload it to the library first, then insert from it.
- **Insertion positions (1-based, the user's language).**
  "Before page N" (index N-1), "After page N" (index N), "At the
  end" (index = page count). Multiple pages inserted at once keep
  their order (each at the next index).
- **Page numbers (pdf-lib).** Drawn onto the page content with
  `page.drawText(text, {x, y, size, font, color})` — they become
  part of the page, not annotations, so they are permanent (the
  standard approach; WPS does the same). A standard font is
  embedded once: `doc.embedFont(StandardFonts.Helvetica)` (the
  Day 9–10 pattern). The position is computed from the page's own
  width/height (bottom centre / bottom right / top centre / top
  right), the text centred on its width
  (`font.widthOfTextAtSize(text, size)`) with a 36 pt margin.
  Format: "1", "Page 1", "Page 1 of 5" (the total is the
  document's page count). Range: all pages, or from page N (so a
  cover page stays unnumbered); the starting number can be set.
- **Where it lives.** The pdf-tools page
  (`/documents/[id]/pdf-tools`) is the page-operations page
  (merge/split/rotate/compress already live there). Insert pages
  + page numbers extend it — two new sections in
  `PdfToolsClient`, reusing the `otherPdfs` list the page already
  loads. No new page. The pure functions follow the
  `deletePagesInPdf` / `reorderPagesInPdf` pattern; the routes
  follow the edit-pages route pattern (Zod, the pdf-edit server
  module, the rate limiter, `{ok, version, documentId, title}`).
- **The save rule (established).** Every change creates a NEW
  immutable version — never an overwrite.

## 2. Completed functionality

- **The pure module** (`src/lib/pdf-page-tools.ts`):
  `insertBlankPageInPdf(bytes, position)` (the blank page sized
  from a neighbour), `insertPagesFromPdf(bytes, sourceBytes,
  {pages, position})` (1-based source pages, in the order they
  are inserted, duplicates removed), `addPageNumbersToPdf(bytes,
  {position, format, fromPage, startNumber})`. Validation throws
  `PdfEditError` (a position beyond the last page, a source page
  that does not exist, an empty page list, more than 50 pages at
  once, a first page beyond the last page, a starting number
  below 1).
- **The routes** (`src/app/api/documents/[id]/pdf/insert-pages/
  route.ts` + `.../page-numbers/route.ts`): POST, Zod bodies,
  the pdf-edit rate limiter, `fetchEditableDocument` + `fetch-
  DocumentPdf` (the source PDF is loaded through RLS, so the
  user must have access to it), `saveNewVersion`. The insert
  route refuses inserting from the same document (400). The
  routes catch both `PdfEditError` and `PdfToolsError` — the
  latter is what `fetchDocumentPdf` throws (a 404 for a document
  the user cannot access), and catching only the former would
  have returned a 500 for that case.
- **The UI** (two new sections in `PdfToolsClient`, on the
  pdf-tools page): "Insert pages" (a blank page, or pages from a
  library PDF — a dropdown of the other PDFs + a page list + a
  position) and "Page numbers" (position, format, first page,
  starting number). Both POST to their routes and report the new
  version. A new helper `runVersionTool` (POSTs JSON and returns
  the version) sits next to `runTool` (which downloads a file) —
  the two tools save a version, they do not download. The page's
  intro text now says so.

## 3. Code and data changes

- `src/lib/pdf-page-tools.ts` (new, pure) +
  `src/lib/pdf-page-tools.test.ts` (new, 17 tests).
- `src/app/api/documents/[id]/pdf/insert-pages/route.ts` (new) +
  `src/app/api/documents/[id]/pdf/page-numbers/route.ts` (new).
- `src/components/pdf-tools/pdf-tools-client.tsx` (two new
  sections + `runVersionTool` + the intro text).
- `scripts/e2e-page-tools-test.mjs` (new, focused harness).
  `scripts/prove-page-tools.mjs` was temporary and deleted.
- Docs: `docs/handoffs/day-18-plan.md`,
  `WPS_LEVEL_PLAN.md` (the page-tools rows — part 1 Done, part 2
  Not started), `docs/feature-matrix.csv` (FORMA-027),
  `docs/known-limitations.md` (page-tools limits),
  `CHANGELOG.md` (Day 18 entry),
  `docs/project-brief/FEATURE_AUDIT.md` (§6.3 + §16 item 4 →
  Partial), `docs/project-brief/FEATURE_LOOP.md` (queue: item 4
  Partial), `~/MEMORY.md` (Day 18 entry).
- `~/workspace/nextjs-supabase-app/AGENTS.md` was read this day
  (the runtime asked for it): it is the standard Next.js agent
  rules block — the established patterns were already followed,
  so nothing changed.

## 4. Tests

- **Proof of concept (task 1): 16/16** (`scripts/prove-page-
  tools.mjs`, deleted after use). A 3-page PDF and a 2-page source
  PDF; a blank page inserted before page 2 (the neighbour's size);
  the source's pages 1–2 inserted at the end; page numbers
  (bottom centre, "Page N of M") on all pages. Verified with
  pdf-lib (the page count, the sizes) and pdfjs-dist
  `getTextContent` (the order, the blank page carrying only its
  number, the copied pages' text, every page's number).
- **Unit: 253/253 (21 files passed, 1 skipped, 9 tests skipped —
  the pre-existing skips).** 17 new: a blank page before page 2
  (the order, the blank page empty), the blank page's size (it
  matches the neighbour), an insert at the end, the input PDF not
  modified, a position beyond the last page refused; an insert
  from a source (the order, the copied text), an insert before a
  page, a missing source page / an empty page list / a bad
  position refused; page numbers as "Page N of M", as a bare
  number, as "Page N", from a page with a starting number, the
  input PDF not modified, a first page beyond the last page and a
  starting number below 1 refused.
- **Live e2e: 25/25 (`scripts/e2e-page-tools-test.mjs`).** As a
  real signed-in user A: the target (3 pages) and the source (2
  pages) upload; inserting a blank page before page 2 succeeds
  (version 2, 3→4 pages, page 2 blank, the order kept); inserting
  the source's pages 1–2 at the end succeeds (version 3, 4→6,
  the copied pages carry the source text); adding page numbers
  bottom centre "Page N of M" succeeds (version 4, every page
  carries its number, the blank page has only its number);
  version 1 stays byte-identical to the upload; the pdf-tools
  page loads (200) for A showing both new sections, and shows
  "Document not found" for B; a position beyond the last page, a
  missing source page, inserting from the same document, an
  unknown format and a first page beyond the last page are all
  refused (400); user B gets 404 on both routes; signed-out gets
  307 on both.
- **Typecheck, lint, build: pass.** Prettier applied to the Day
  18 TS files.

## 5. Deployment verification

- App rebuilt and restarted on :3000 (new build, the insert /
  page-numbers routes + the pdf-tools page included);
  `/api/supabase-status` returns 200.
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.
- **Docserver:** still wiped, .deb download still 403. The
  editor browser round-trip and the conversion proof still wait
  on it. The OCR worker is still running.

## 6. Security/licensing checks

- No new engine, no new licence: pdf-lib, already in the
  project. No WPS page tool, branding or font is used.
- No secrets in code. The inputs are validated by Zod (the
  position kind, the page numbers, the format enum, at most 50
  source pages) and again by the pure module; the editor-role and
  workspace checks are unchanged (the routes load through RLS,
  and the source PDF is loaded through RLS too — a user cannot
  insert pages from a PDF they cannot access).

## 6b. Verification notes and fixes made during Day 18

- **The proof script caught a wrong check, not a bug.** The
  "page 2 is the blank page" check asserted the page carried no
  "Page 2" text — but the page number itself is "Page 2 of 6".
  The check now asserts the blank page's text is exactly its
  page number (only the number, no body text). 16/16 after the
  fix.
- **The route code caught a real error-handling gap before the
  tests did.** `fetchDocumentPdf` throws `PdfToolsError` (not
  `PdfEditError`), so the routes catch both — otherwise a source
  PDF the user cannot access would have returned a 500 instead
  of a 404.
- **The unit test caught a bad import, not a bug.** The test
  imported `PdfEditError` from the page-tools module (which does
  not export it) — fixed to import it from pdf-edit.

## 7. Known defects and limitations

- **Insert only from a PDF already in the library.** Inserting
  from a newly uploaded file is a later step (upload it to the
  library first, then insert from it).
- **Page numbers are drawn into the content.** Applying them
  twice draws a second number over the first; the only undo is
  the version history, and there is no way to remove them except
  by going back to an earlier version.
- **No crop, no add text, no hyperlinks, no shapes yet** — part 2
  of item 4, the next day.
- **The editor browser round-trip is still unproven** (the
  docserver is down). The pdf-tools page loads (200); a human
  using the two new sections in it is the missing proof, same as
  for every other editor feature.

## 8. Tomorrow's target

- **Next feature in the queue: PDF page tools, part 2 (#4).**
  Crop a page, add text, hyperlinks and shapes. "Add text" and
  "add shapes" need a placement UI (click-to-place, like the form
  builder) — that is the fiddliest part, so start with crop
  (a rectangle per page, pdf-lib's `setCropBox`) and hyperlinks
  (a link annotation, like the Day 17 annotations), then add text
  and shapes with the click-to-place UI.
