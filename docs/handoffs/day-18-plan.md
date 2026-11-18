# Day 18 plan — PDF page tools, second half (part 1: insert pages + page numbers)

Owner instruction (2026-11-18 16:38 PKT): "okay go head implement
this properly by using feature loop.md" — build the PDF page
tools second half, starting with insert pages + page numbers
(the two named in the Day 17 reply). Audit queue item 4
(`docs/project-brief/FEATURE_AUDIT.md` §16). The rest of item 4
(crop, add text, hyperlinks, shapes) follows as part 2.

## 1. Research

### Insert pages (pdf-lib)
- `doc.insertPage(index, page?)` — inserts at the 0-based index.
  With no page it creates a blank page of **A4** size (the
  default in pdf-lib's source: `dims = PageSizes.A4`). A blank
  A4 page in a Letter document would be the wrong size, so the
  blank page is inserted with the size of a neighbouring page:
  `insertPage(index, [width, height])` where width/height come
  from `page.getWidth()` / `page.getHeight()` of the page before
  (or after) the insertion point. For an empty document there is
  no neighbour — not possible here (a PDF always has ≥ 1 page).
- `doc.copyPages(srcDoc, indices)` — copies pages from another
  document, then `insertPage(index, copiedPage)` places each one.
  The copied pages keep their own size, fonts and content.
- **The source for "insert from another PDF" is the library.**
  The pdf-tools page already loads the other PDFs in the same
  workspace (for merging); the insert form reuses that list, so
  the user picks a PDF from the library and selects its pages.
  Uploading a new PDF to insert from is a later step — they
  upload it to the library first, then insert from it.
- **Insertion positions (1-based, the user's language).**
  "Before page N" (index N-1), "After page N" (index N), "At the
  end" (index = page count). Multiple pages inserted at once keep
  their order (insert them in order, each at the next index).
- **Validation.** The position must be within 1..(pageCount+1)
  for "after" / "at the end", and 1..pageCount for "before". The
  source pages must exist in the source PDF. A blank insert is
  one page; an insert from another PDF is 1–50 pages at once.

### Page numbers (pdf-lib)
- Drawn onto the page content with `page.drawText(text, {x, y,
  size, font, color})` — they become part of the page, not
  annotations, so they are permanent (the standard approach; WPS
  does the same). A standard font is embedded once:
  `doc.embedFont(StandardFonts.Helvetica)` (the Day 9–10 pattern
  for replacement text).
- **Position** (bottom centre / bottom right / top centre / top
  right), computed from the page's own width/height (so it works
  on any page size): the text is centred on its width
  (`font.widthOfTextAtSize(text, size)`) with a 36 pt margin from
  the edge. Bottom centre is the default.
- **Format:** "1" (the number only), "Page 1", "1 of 5". The
  total ("of 5") is the page count AFTER any insert in the same
  operation — but insert and page numbers are separate operations
  here, so the total is the current page count.
- **Range:** all pages, or from page N (so the cover / title page
  stays unnumbered). The starting number defaults to 1 and can
  be set (so a document that continues another one starts at 6).
- **Validation.** The start page must be within 1..pageCount; the
  starting number must be ≥ 1; the format must be one of the three.
- **A page number drawn twice.** Applying page numbers twice
  draws a second number over the first (they are part of the
  content, not a removable layer). The UI says so honestly, and
  the route does not try to detect an existing number (there is
  no reliable way to tell a page number from any other text).

### Where it lives
- The **pdf-tools page** (`/documents/[id]/pdf-tools`) is the
  page-operations page (merge/split/rotate/compress already live
  there). Insert pages + page numbers extend it — two new
  sections in `PdfToolsClient`, reusing the `otherPdfs` list the
  page already loads. No new page.
- **The pure functions** go in `src/lib/pdf-page-tools.ts` (new):
  `insertBlankPageInPdf(bytes, {position})`,
  `insertPagesFromPdf(bytes, sourceBytes, {pages, position})`,
  `addPageNumbersToPdf(bytes, {position, format, fromPage,
  startNumber})`. They follow the `deletePagesInPdf` /
  `reorderPagesInPdf` pattern in `src/lib/pdf-edit.ts` (load with
  `loadPdf`, validate, operate, save; throw `PdfEditError`).
- **The routes** follow the edit-pages route pattern (one POST
  route per operation, Zod body, the pdf-edit server module's
  `fetchEditableDocument` + `saveNewVersion`, the pdf-edit rate
  limiter): `POST /api/documents/[id]/pdf/insert-pages` and
  `POST /api/documents/[id]/pdf/page-numbers`. The insert route
  loads the source PDF from the library (through RLS, so the user
  must have access to it) — it does NOT accept an uploaded file
  in v1.
- **The save rule (established).** Every change creates a NEW
  immutable version — never an overwrite.

## 2. Small tasks (in order)

1. **Verify the mechanism (proof of concept).** A Node script
   (in the project dir, so it can import pdf-lib): create a 3-page
   PDF with pdf-lib (each page "Page N"), insert a blank page
   before page 2 (sized from the neighbour), insert pages 1–2
   from a second PDF at the end, and add page numbers (bottom
   centre, "Page N of M") to all pages. Verify with pdf-lib
   (the page count, the page sizes, the text on the new pages)
   and with qpdf --check. Render page 1 to PNG with pdftoppm
   and confirm the page number is visible (a text check via
   pdfjs-dist `getTextContent` is more reliable than a pixel
   check).
   *Test: the script prints PASS for every check.*
2. **Pure module + unit tests.** `src/lib/pdf-page-tools.ts`:
   the three functions above, with the validation (a position
   out of range, a source page that does not exist, an empty
   page list, a bad format, a start page out of range, a starting
   number < 1). The unit tests build fixture PDFs in the test
   (pdf-lib) and assert the page count, the order, the blank
   page's size (it matches the neighbour), the copied pages'
   text, and the page numbers' text (via pdfjs-dist
   `getTextContent` — the drawn text is real text, so it is
   extractable).
   *Test: the new unit tests pass.*
3. **Routes.** `src/app/api/documents/[id]/pdf/insert-pages/
   route.ts` (POST: `{source: "blank" | {documentId, pages},
   position: {kind: "before"|"after"|"end", page?}}`) and
   `.../page-numbers/route.ts` (POST: `{position, format,
   fromPage?, startNumber?}`). Both follow the edit-pages route
   pattern (Zod, the pdf-edit server module, the rate limiter,
   `{ok, version, documentId, title}`).
   *Test: the routes are covered by the live e2e.*
4. **UI.** Extend `PdfToolsClient` (`src/components/pdf-tools/
   pdf-tools-client.tsx`) with two new sections: "Insert pages"
   (a blank page, or pages from a library PDF — a dropdown of
   the other PDFs + a page list + a position) and "Page numbers"
   (position, format, from page, starting number). Each posts to
   its route and reloads on success. The pdf-tools page already
   loads `otherPdfs`, so no page change is needed.
   *Test: the page loads (checked in the live e2e).*
5. **Live e2e harness.** `scripts/e2e-page-tools-test.mjs`
   (focused, the Day 13–17 pattern): as user A, upload a 3-page
   PDF and a 2-page source PDF; insert a blank page before page
   2 (the count goes 3→4, the new page is blank and the right
   size, the old pages keep their order); insert pages 1–2 from
   the source at the end (4→6, the copied pages carry the source
   text); add page numbers bottom centre "Page N of M" from page
   1 (the text is extractable on every page, the numbers are
   1..6); verify version 1 is unchanged; verify the pdf-tools
   page loads (200) for A and shows "Document not found" for B;
   a bad position / a missing source page / a bad format are
   refused (400); user B gets 404 on both routes; signed-out
   gets 307.
   *Test: the harness passes end to end.*
6. **Checks + docs + commit.** Typecheck, lint, Prettier, build,
   restart the app. Update `WPS_LEVEL_PLAN.md` (the page-tools
   row → Partial: insert + page numbers done), `feature-matrix.csv`
   (FORMA-027), `known-limitations.md` (page numbers drawn twice;
   insert from the library only), `CHANGELOG.md` (Day 18 entry),
   `FEATURE_AUDIT.md` (§6.3 + §16 item 4 → Partial),
   `docs/handoffs/day-18.md`. Commit on branch
   `day-18-pdf-page-tools`. Update `~/MEMORY.md`. Reply to the
   owner.

## 3. What is NOT in this feature

- Crop a page, add text, hyperlinks and shapes — part 2 of item
  4 (the next day).
- Inserting pages from a newly uploaded file (the source must be
  a PDF already in the library).
- Removing page numbers (they are drawn into the content; the
  only undo is the version history).
- No change to the editor, the upload flow, or the form /
  annotation tools. No migration (nothing new is stored).
- No WPS page tool, branding or font is used; the implementation
  is Forma's own on pdf-lib.
