# Day 19 plan — PDF page tools, second half (part 2: crop, hyperlinks, add text, shapes)

Owner instruction (2026-11-18 16:45 PKT): "okay go head implement
this properly by using feature loop.md" — build the rest of item 4
(crop, hyperlinks, add text, shapes), in the order the Day 18
reply proposed: crop + hyperlinks first, then add text + shapes
with the click-to-place UI. Audit queue item 4
(`docs/project-brief/FEATURE_AUDIT.md` §16). This finishes item 4.

## 1. Research

### Crop (pdf-lib)
- `page.setCropBox(x, y, width, height)` — sets the crop box, the
  region the page is clipped to when displayed or printed. The
  crop box defaults to the MediaBox. `page.getCropBox()` returns
  the current `{x, y, width, height}`. The box is in PDF points,
  origin bottom-left.
- **The crop rectangle is chosen by dragging on the page.**
  Cropping blind (typing numbers) is guesswork, so the crop UI
  renders the page and lets the user drag a rectangle — the same
  pointer pattern as the annotate page's ink drawing (a pointer
  overlay, viewport coords → PDF coords via
  `viewport.convertToPdfPoint`). The rectangle is normalised
  (top-left / bottom-right in viewport coords → the PDF rect in
  points). The crop is applied to the current page, or to all
  pages with the same rectangle.
- **Validation.** The rectangle must have a positive width and
  height, and it must lie inside the page's MediaBox (a crop
  outside the page is meaningless). The page must exist.

### Hyperlinks (pdf-lib, a link annotation)
- A hyperlink is a standard annotation dict (the Day 17 pattern
  — built by hand with pdf-lib, registered, added with
  `page.node.addAnnot(ref)`):
  `/Type /Annot`, `/Subtype /Link`, `/Rect [x0 y0 x1 y1]`,
  `/A << /S /URI /URI (url) >>`, `/Border [0 0 0]` (no border),
  `/C [0 0 1]` (blue, the standard link colour).
  PDF.js's `getAnnotations()` returns it with `subtype: "Link"`
  and the `url` — verified in the proof script.
- **The link rectangle is chosen by dragging on the page** (the
  same drag pattern as crop), then the user enters the URL. The
  URL must be http(s) — a bare domain gets `https://` prepended,
  and anything else is refused. The link is added to the current
  page only (a link belongs to one page).
- **Validation.** The rectangle must have a positive width and
  height and lie inside the page; the URL must be a valid http(s)
  URL after normalisation; the page must exist.

### Add text (pdf-lib)
- `page.drawText(text, {x, y, size, font, color})` — the same
  call as the page numbers (Day 18). The text is drawn at the
  clicked point (the click is the text's baseline start, in PDF
  points). The user picks the font (Helvetica / Times Roman /
  Courier — the three standard fonts), the size (8–72 pt), and
  the colour (a fixed set: black, dark grey, red, green, blue —
  the same named-colour approach as the annotations).
- **The position is chosen by clicking on the page** (the
  click-to-place pattern from the annotate page's note mode).
  The text is drawn with its baseline at the clicked point, so
  the click is where the text starts.
- **Validation.** The text must be non-empty (≤ 500 chars, the
  Day 9 limit); the size must be 8–72; the point must be inside
  the page; the page must exist.

### Shapes (pdf-lib)
- `page.drawRectangle({x, y, width, height, color, borderColor,
  borderWidth})` — `color` is the fill, `borderColor` the outline.
  `page.drawEllipse({x, y, xScale, yScale, color, borderColor,
  borderWidth})` — `x, y` is the CENTRE, `xScale`/`yScale` are
  the radii. `page.drawLine({start, end, thickness, color})`.
- **The shape is chosen by dragging a rectangle on the page**
  (the same drag pattern as crop/link). The user picks the shape
  (rectangle / ellipse / line), the colour, and filled vs outline
  only. A line uses the drag's start and end points; a rectangle
  / ellipse uses the dragged rectangle (the ellipse is inscribed
  in it, its centre at the rectangle's centre).
- **Validation.** The rectangle must have a positive width and
  height (a line must have a non-zero length) and lie inside the
  page; the page must exist.

### Where it lives
- **One new page** (`/documents/[id]/pdf-draw`, "Draw on PDF"
  in the library) with four modes (Crop / Link / Text / Shape).
  It renders one PDF page at a time with PDF.js (the annotate
  page's pattern: dynamic import, SCALE 1.5, a pointer overlay,
  prev/next), and each mode has its own interaction + form.
  It is a separate page from the annotate page — the annotate
  page is already large and mixes two different APIs (the
  annotation API vs the page-content drawing API), so the draw
  tools get their own page. Some rendering code is similar to the
  annotate client — that is fine, it is a separate tool.
- **The pure functions** extend `src/lib/pdf-page-tools.ts`
  (the Day 18 module): `cropPagesInPdf(bytes, {pages, rect})`,
  `addLinkToPdf(bytes, {page, rect, url})`,
  `addTextToPdf(bytes, {page, x, y, text, size, font, color})`,
  `addShapeToPdf(bytes, {page, shape, rect, color, filled})`.
  They follow the Day 18 pattern (load with `loadPdf`, validate,
  operate, save; throw `PdfEditError`).
- **The routes** follow the insert-pages / page-numbers route
  pattern (Zod, the pdf-edit server module, the rate limiter,
  `{ok, version, documentId, title}`): `POST /api/documents/
  [id]/pdf/crop`, `.../links`, `.../add-text`, `.../add-shape`.
- **The save rule (established).** Every change creates a NEW
  immutable version — never an overwrite.

## 2. Small tasks (in order)

1. **Verify the mechanism (proof of concept).** A Node script
   (in the project dir): create a 2-page PDF with pdf-lib (each
   page "Page N"); crop page 1 to its top half (`setCropBox`);
   add a link annotation to page 1 (a rectangle + a URL); draw
   text on page 2 ("Added text", Helvetica, 14 pt, red); draw a
   rectangle + an ellipse + a line on page 2. Verify with pdf-lib
   (the crop box, the page count) and pdfjs-dist (the link
   annotation reads back with the right URL and rect, the added
   text is extractable, the crop hides the text below the crop
   box — `getTextContent` on the cropped page returns only the
   text inside the crop region).
   *Test: the script prints PASS for every check.*
2. **Pure module + unit tests.** Extend `src/lib/pdf-page-
   tools.ts` with the four functions above, and add tests to
   `src/lib/pdf-page-tools.test.ts`. The tests build fixture PDFs
   in the test (pdf-lib) and assert the crop box, the link
   annotation (via pdfjs-dist `getAnnotations()`), the added
   text (via `getTextContent`), the shapes (via the content
   stream — a rectangle draws a `re` operator, an ellipse draws
   a `c` curve, a line draws an `m` + `l`; assert the operators
   are present), and the validation (a rectangle outside the
   page, a zero-size rectangle, a bad URL, empty text, a size
   out of range, a missing page).
   *Test: the new unit tests pass.*
3. **Routes.** The four POST routes above, following the
   insert-pages / page-numbers pattern (Zod, the pdf-edit server
   module, the rate limiter, both `PdfEditError` and
   `PdfToolsError` caught). The crop route takes `{pages: [1],
   rect: {x, y, width, height}}`; the link route takes `{page,
   rect, url}`; the add-text route takes `{page, x, y, text,
   size, font, color}`; the add-shape route takes `{page, shape,
   rect, color, filled}`.
   *Test: the routes are covered by the live e2e.*
4. **UI.** The new page `/documents/[id]/pdf-draw` + client
   `src/components/pdf-draw/pdf-draw-client.tsx`: renders one
   page at a time with PDF.js (dynamic import), a pointer overlay
   for dragging a rectangle (crop/link/shape) or clicking a point
   (text), a mode switcher (Crop / Link / Text / Shape), and a
   form per mode (crop: this page / all pages; link: the URL;
   text: the text + font + size + colour; shape: the shape +
   colour + filled/outline). Each posts to its route and reports
   the new version. Library "Draw on PDF" link (PDFs only).
   *Test: the page loads (checked in the live e2e).*
5. **Live e2e harness.** `scripts/e2e-draw-test.mjs` (focused,
   the Day 13–18 pattern): as user A, upload a 2-page PDF; crop
   page 1 to its top half (the crop box is set, the text below
   the crop is hidden); add a link to page 1 (the annotation
   reads back in PDF.js with the right URL); add text to page 2
   (the text is extractable); draw a rectangle on page 2 (the
   content stream has a `re` operator); verify each creates a new
   version and version 1 is unchanged; verify the draw page loads
   (200) for A and shows "Document not found" for B; a rectangle
   outside the page / a bad URL / empty text are refused (400);
   user B gets 404 on all four routes; signed-out gets 307.
   *Test: the harness passes end to end.*
6. **Checks + docs + commit.** Typecheck, lint, Prettier, build,
   restart the app. Update `WPS_LEVEL_PLAN.md` (the page-tools
   part 2 row → Done), `feature-matrix.csv` (FORMA-028),
   `known-limitations.md` (the draw limits), `CHANGELOG.md`
   (Day 19 entry), `FEATURE_AUDIT.md` (§6.3 + §16 item 4 →
   Done — item 4 is now complete), `docs/handoffs/day-19.md`.
   Commit on branch `day-19-pdf-page-tools-part2`. Update
   `~/MEMORY.md`. Reply to the owner.

## 3. What is NOT in this feature

- No free-form colour picker (a fixed named-colour set, like the
  annotations). No custom fonts (the three standard fonts only).
- No rotation of the added text / shapes (upright only, in v1).
- No editing or removing a link / text / shape after it is added
  (they are drawn into the content or stored as annotations;
  the only undo is the version history). Removing a link
  annotation is a later step (the annotations page's remove
  works on annotation dicts, but the link is added by a different
  route — a follow-up).
- No change to the editor, the upload flow, or the form /
  annotation tools. No migration (nothing new is stored).
- No WPS page tool, branding or font is used; the implementation
  is Forma's own on pdf-lib.
