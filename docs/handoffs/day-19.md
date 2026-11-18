# Day 19 handoff — PDF page tools, second half (part 2: crop, hyperlinks, add text, shapes)

Date: 2026-11-18. Owner instruction (16:45 PKT): "okay go head
implement this properly by using feature loop.md" — build the
rest of item 4 (crop, hyperlinks, add text, shapes), in the order
the Day 18 reply proposed: crop + hyperlinks first, then add text
+ shapes with the click-to-place UI. Audit queue item 4
(`docs/project-brief/FEATURE_AUDIT.md` §16). **Item 4 is now
complete.**

## 1. What was researched

- **Crop (pdf-lib).** `page.setCropBox(x, y, width, height)`
  sets the crop box, the region the page is clipped to when
  displayed or printed; it defaults to the MediaBox.
  `page.getCropBox()` returns the current box. The box is in PDF
  points, origin bottom-left. **The crop rectangle is chosen by
  dragging on the page** — cropping blind (typing numbers) is
  guesswork, so the draw page renders the page and lets the user
  drag a rectangle (the annotate page's pointer pattern: a
  pointer overlay, viewport coords → PDF coords via
  `viewport.convertToPdfPoint`). The crop applies to the current
  page, or to all pages with the same rectangle.
- **Hyperlinks (pdf-lib, a link annotation).** A standard
  annotation dict (the Day 17 pattern — built by hand with
  pdf-lib, registered, added with `page.node.addAnnot(ref)`):
  `/Type /Annot`, `/Subtype /Link`, `/Rect`, `/A << /S /URI /URI
  (url) >>`, `/Border [0 0 0]` (no border), `/C [0 0 1]` (blue,
  the standard link colour). PDF.js's `getAnnotations()` returns
  it with `subtype: "Link"` and the `url` — verified in the proof
  script. **The link rectangle is chosen by dragging on the
  page**, then the user enters the URL. A bare domain gets
  `https://` prepended; anything that is not a valid http(s) URL
  is refused.
- **Add text (pdf-lib).** `page.drawText(text, {x, y, size, font,
  color})` — the same call as the page numbers (Day 18). The text
  is drawn with its baseline at the clicked point (the click is
  where the text starts). The user picks the font (Helvetica /
  Times Roman / Courier — the three standard fonts), the size
  (8–72 pt), and the colour (a fixed set of five, the same
  named-colour approach as the annotations). **The position is
  chosen by clicking on the page** (the annotate page's note-mode
  pattern).
- **Shapes (pdf-lib).** `page.drawRectangle({x, y, width, height,
  color, borderColor, borderWidth})` — `color` is the fill,
  `borderColor` the outline. `page.drawEllipse({x, y, xScale,
  yScale, ...})` — `x, y` is the CENTRE, `xScale`/`yScale` are
  the radii. `page.drawLine({start, end, thickness, color})`.
  **The shape is chosen by dragging a rectangle on the page.**
  A rectangle / ellipse is inscribed in the dragged rectangle;
  a line runs from the drag's start point to its end point (the
  drag direction is kept — the route receives the two endpoints,
  not a normalised rect).
- **Where it lives.** One new page (`/documents/[id]/pdf-draw`,
  "Draw on PDF" in the library) with four modes (Crop / Link /
  Text / Shape). It renders one PDF page at a time with PDF.js
  (the annotate page's pattern: dynamic import, SCALE 1.5, a
  pointer overlay, prev/next), and each mode has its own
  interaction + form. It is a separate page from the annotate
  page — the annotate page is already large and mixes two
  different APIs (the annotation API vs the page-content drawing
  API), so the draw tools get their own page. Some rendering code
  is similar to the annotate client — that is fine, it is a
  separate tool.
- **The pure functions** extend `src/lib/pdf-page-tools.ts`
  (the Day 18 module): `cropPagesInPdf`, `addLinkToPdf`,
  `addTextToPdf`, `addShapeToPdf` (the Day 18 pattern: load with
  `loadPdf`, validate, operate, save; throw `PdfEditError`).
- **The routes** follow the insert-pages / page-numbers pattern
  (Zod, the pdf-edit server module, the rate limiter, both
  `PdfEditError` and `PdfToolsError` caught,
  `{ok, version, documentId, title}`).
- **The save rule (established).** Every change creates a NEW
  immutable version — never an overwrite.

## 2. Completed functionality

- **The pure module** (`src/lib/pdf-page-tools.ts`, extended):
  `cropPagesInPdf(bytes, {pages, rect})` (the rect is the two
  drag endpoints, normalised; it must lie inside the page),
  `addLinkToPdf(bytes, {page, rect, url})` (the URL is
  normalised by `normaliseLinkUrl`, exported for the route),
  `addTextToPdf(bytes, {page, x, y, text, size, font, color})`,
  `addShapeToPdf(bytes, {page, shape, rect, color, filled})`.
  Shared helpers: `DragRect` / `PageRect`, `normaliseDragRect`,
  `validateRectInPage`, `validatePageNumber`, `DRAW_COLORS` /
  `DRAW_FONTS`, `MAX_ADDED_TEXT_CHARS` (500), `MIN/MAX_ADDED_
  TEXT_SIZE` (8–72), `DEFAULT_SHAPE_BORDER_WIDTH` (2).
- **The routes** (`src/app/api/documents/[id]/pdf/crop/`,
  `.../links/`, `.../add-text/`, `.../add-shape/`, each a POST):
  Zod bodies (the drag rect is four finite numbers; the text size
  8–72; the font and colour are enums), the pdf-edit rate
  limiter, `fetchEditableDocument` + `fetchDocumentPdf`,
  `saveNewVersion`.
- **The UI** (the new page `/documents/[id]/pdf-draw` + client
  `src/components/pdf-draw/pdf-draw-client.tsx`): renders one
  page at a time with PDF.js (dynamic import), a pointer overlay
  for dragging a rectangle (crop/link/shape) or clicking a point
  (text), a mode switcher (Crop / Link / Text / Shape), and a
  form per mode (crop: this page / all pages; link: the URL;
  text: the text + font + size + colour; shape: the shape +
  colour + filled/outline). The drag rectangle is drawn live as
  a dashed overlay (a line for a line shape); the text click
  point shows as a dot. Each posts to its route and reports the
  new version, then reloads. Library "Draw on PDF" link (PDFs
  only).

## 3. Code and data changes

- `src/lib/pdf-page-tools.ts` (extended: the four functions +
  the shared helpers) + `src/lib/pdf-page-tools.test.ts` (20 new
  tests, 37 total in the file).
- `src/app/api/documents/[id]/pdf/crop/route.ts` (new) +
  `.../links/route.ts` (new) + `.../add-text/route.ts` (new) +
  `.../add-shape/route.ts` (new).
- `src/app/(workspace)/documents/[id]/pdf-draw/page.tsx` (new) +
  `src/components/pdf-draw/pdf-draw-client.tsx` (new).
- `src/components/library/library-forms.tsx` + `library-list.tsx`
  (the "Draw on PDF" link, `pdfDrawHref` prop).
- `scripts/e2e-draw-test.mjs` (new, focused harness).
  `scripts/prove-draw.mjs` was temporary and deleted.
- Docs: `docs/handoffs/day-19-plan.md`,
  `WPS_LEVEL_PLAN.md` (the page-tools part 2 row → Done),
  `docs/feature-matrix.csv` (FORMA-028),
  `docs/known-limitations.md` (the draw limits),
  `CHANGELOG.md` (Day 19 entry),
  `docs/project-brief/FEATURE_AUDIT.md` (§6.2–6.3 + §16 item 4 →
  Done — item 4 is now complete), `docs/project-brief/
  FEATURE_LOOP.md` (queue: item 4 Done, PDF security next),
  `~/MEMORY.md` (Day 19 entry).

## 4. Tests

- **Proof of concept (task 1): 10/10** (`scripts/prove-draw.mjs`,
  deleted after use). A 2-page PDF; page 1 cropped to its top
  half; a link annotation on page 1; text + a rectangle + an
  ellipse + a line on page 2. Verified with pdf-lib (the crop
  box, the annotation count) and pdfjs-dist (the cropped page's
  viewport is half the height — PDF.js honours the crop box; the
  link reads back with the right URL and rect; the added text is
  extractable).
- **Unit: 273/273 (21 files passed, 1 skipped, 9 tests skipped —
  the pre-existing skips).** 20 new: crop (the top half, several
  pages at once, the input PDF not modified, a rectangle outside
  the page / a zero-size rectangle / a missing page refused);
  link (PDF.js reads it back with the right URL and rect, a bare
  domain gets https://, a non-web URL and a rectangle outside
  the page refused); text (extractable, the input PDF not
  modified, empty text / a size outside 8–72 / a position outside
  the page refused); shape (the rectangle / ellipse / line
  operators in the content stream, a zero-length line and a
  rectangle outside the page refused).
- **Live e2e: 29/29 (`scripts/e2e-draw-test.mjs`).** As a real
  signed-in user A: the PDF uploads (v1); cropping page 1 to its
  top half succeeds (version 2, the viewport is half the height,
  page 2 unchanged); adding a link succeeds (version 3, the
  annotation reads back with the right URL and rect); adding text
  succeeds (version 4, the text is extractable); drawing a
  rectangle succeeds (version 5, the document still has 3 pages,
  the page has a constructed path); version 1 stays byte-
  identical to the upload; the draw page loads (200) for A (the
  client component mounts — the toolbar renders in the browser
  after the PDF loads) and shows "Document not found" for B; a
  crop rectangle outside the page, a non-web URL, empty text, a
  zero-length line and a missing page are all refused (400);
  user B gets 404 on all four routes; signed-out gets 307 on all
  four.
- **Typecheck, lint, build: pass.** Prettier applied to the Day
  19 TS files.

## 5. Deployment verification

- App rebuilt and restarted on :3000 (new build, the four draw
  routes + the draw page included); `/api/supabase-status`
  returns 200.
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.
- **Docserver:** still wiped, .deb download still 403. The
  editor browser round-trip and the conversion proof still wait
  on it. The OCR worker is still running.

## 6. Security/licensing checks

- No new engine, no new licence: pdf-lib + PDF.js, both already
  in the project. No WPS page tool, branding or font is used.
- No secrets in code. The inputs are validated by Zod (the drag
  rect is four finite numbers, the text size 8–72, the font and
  colour are enums) and again by the pure module (the rectangle
  inside the page, the URL http(s) only, the text non-empty and
  ≤ 500 chars, the line non-zero); the editor-role and workspace
  checks are unchanged (the routes load through RLS).
  **A non-web URL is refused** — `javascript:` (and any other
  non-http(s) scheme) cannot be used as a link, so a link cannot
  run code.

## 6b. Verification notes and fixes made during Day 19

- **The unit tests caught two wrong assumptions about how
  pdf-lib draws shapes.** (1) PDF.js's `getOperatorList()`
  consolidates path construction into a single "constructPath",
  so it cannot tell a rectangle from an ellipse — the first
  version of the shape tests checked for "rectangle" /
  "curveTo" / "moveTo" and all three failed. Fixed by reading
  the raw content stream (pdf-lib + zlib inflate, parsed by
  pdf-content.ts's `tokenizeContent` + `parseOperations`) and
  checking the real operators. (2) pdf-lib does NOT draw a
  rectangle with the `re` operator — it draws it as a path
  (`m`, `l`, `l`, `l`, `h`, `B`). The rectangle test now checks
  for a closed straight path (m + l + h, no `c`); the ellipse
  checks for `c`; the line checks for `m` + `l`. 37/37 after
  the fixes.
- **A plain Node script cannot import a .ts file.** The
  operator-listing probe failed with a Node error because it
  imported `./src/lib/pdf-content.ts` — the probe was rewritten
  to print the raw content stream instead (which is how the
  `re` assumption was disproved), and the test helper does the
  parsing inside vitest, where .ts imports work.

## 7. Known defects and limitations

- **No free-form colour picker** (a fixed set of five colours,
  like the annotations) and **no custom fonts** (Helvetica,
  Times, Courier only).
- **The added text and shapes are upright only** — no rotation
  in v1.
- **A link, text or shape cannot be edited or removed after it
  is added** (the only undo is the version history). Removing a
  link annotation is a follow-up — the annotations page's remove
  works on annotation dicts, but the link is added by a
  different route.
- **A line runs from where you started dragging to where you
  stopped** (the drag direction is kept).
- **The editor browser round-trip is still unproven** (the
  docserver is down). The draw page loads (200); a human
  dragging a rectangle and adding text in it is the missing
  proof, same as for every other editor feature.

## 8. Tomorrow's target

- **Next feature in the queue: PDF security (#5).** Password-
  protect a PDF (an owner password + a user password, AES
  encryption), set permissions (printing, copying, editing,
  annotating), and unlock a protected PDF (with the password).
  It needs one decision first: the encryption library. pdf-lib
  cannot encrypt or decrypt — the usual open-source options are
  qpdf (a command-line tool, already installed on this VM for
  the e2e checks) or a JS library. Ask the owner, or start with
  qpdf (it is already here and proven) as the engine.
