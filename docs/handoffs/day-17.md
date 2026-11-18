# Day 17 handoff — PDF annotations (highlight, underline, strikethrough, sticky note, freehand)

Date: 2026-11-18. Owner instruction (16:26 PKT): "okay go head
implement this properly by using feature loop.md" — build PDF
annotations with annotations stored in the PDF itself (the
owner's go-ahead on the recommendation), following the feature
loop. Audit queue item 3 (`docs/project-brief/FEATURE_AUDIT.md`
§16).

## 1. What was researched

- **What an annotation is (PDF spec, ISO 32000).** A dictionary
  on a page's `/Annots` array: `/Type /Annot`, `/Subtype` (the
  kind), `/Rect` (the bounding box in PDF points, origin
  bottom-left), `/C` (the colour, [r g b]), `/Contents` (the note
  text), `/T` (the author), `/M` (the date), `/F 4` (the Print
  flag). The five kinds: Highlight / Underline / StrikeOut
  (`/QuadPoints`, 8 numbers per line), Text (a 20×20 icon,
  `/Contents` is the note, `/Name /Comment`, `/Open false`), Ink
  (`/InkList`, one array per stroke; `/Border [0 0 width]` is the
  line width). **No appearance stream (/AP) in v1** — PDF.js
  renders text-markup and ink annotations from the QuadPoints /
  InkList without one, and Adobe Reader / Preview generate
  appearances on open.
- **The quad order (verified in PDF.js's own source).**
  PDF.js's `calculateLinkPosition` (web/pdf_viewer.mjs) builds
  the quad points from a DOM selection rect `[x0, y0, x1, y1]`
  (bottom-left / top-right in PDF coordinates) as `[x0, y1, x1,
  y1, x0, y0, x1, y0]` — i.e. **top-left, top-right, bottom-left,
  bottom-right**, in PDF points, origin bottom-left. The client
  builds the quads in exactly this order.
- **The coordinate conversion (client).** The viewport maps PDF
  coordinates to CSS pixels; the inverse is
  `viewport.convertToPdfPoint(x, y)` (a standard pdfjs-dist API).
  Text selection: `Range.getClientRects()` → one quad per rect.
  Sticky note: a click point → a 20×20 rect. Freehand: the
  pointer path → one InkList stroke per drawn stroke.
- **How pdf-lib builds the dicts (verified on this VM).** pdf-lib
  has NO high-level annotation-creation API — the `PDFAnnotation`
  class is a low-level wrapper (Rect, appearance, flags). The
  dicts are built by hand, registered with
  `doc.context.register(dict)`, and added with
  `page.node.addAnnot(ref)` (`PDFPageLeaf.addAnnot` / `.Annots()`
  exist). Verified 2026-11-18: `context.obj` converts plain
  strings to PDFName, number arrays to PDFArray, and a
  `PDFString.of(text)` to a literal string — so text values MUST
  be wrapped in `PDFString.of`, or they become names. All of
  `PDFString`, `PDFName`, `PDFArray`, `PDFDict`, `PDFNumber`,
  `PDFBool`, `PDFRef` are exported from pdf-lib.
- **The list / remove mechanism.** `page.node.Annots()` returns
  the Annots array. Listing reads each dict and returns it with
  its index in the page's Annots array. Removal takes
  `{page, index}`, re-reads the Annots array fresh, and removes
  that entry. The index is valid because each operation creates a
  new version from the latest file.
- **The save rule (established).** Every annotation change
  creates a NEW immutable version (like the form tools) — never
  an overwrite.

## 2. Completed functionality

- **The pure module** (`src/lib/pdf-annotate.ts`):
  `ANNOTATION_COLORS` (yellow highlight, green underline, red
  strikethrough, yellow note, red ink — fixed, named colours, no
  free-form picker in v1), `addAnnotationsToPdf` (validates, then
  builds the dicts and adds them to the right pages),
  `listAnnotationsInPdf` (every annotation, all pages, with page
  + index + subtype + rect + quads / ink list + contents + colour
  + author + date), `removeAnnotationFromPdf`. The date is a UTC
  PDF date (`D:…Z`); the author defaults to "Forma Office".
- **The server module + routes** (`src/lib/pdf-annotate.server.
  ts`, the pdf-form.server.ts pattern): `fetchAnnotateDocument`
  (RLS load, 404), `pdfAnnotateRateLimiter` (10/min per user, the
  PDF tools constants, `.check()` — the limiter's method is
  `check`, not `allow`), `fetchAnnotateDocumentBytes`,
  `saveAnnotatedVersion`. Routes:
  `GET /api/documents/[id]/pdf/annotations` (list),
  `POST …/annotations` (add, Zod body: an array of up to 50
  annotations), `DELETE …/annotations` (remove, `{page, index}`).
- **The UI** (`/documents/[id]/pdf-annotate` + client
  `src/components/pdf-annotate/pdf-annotate-client.tsx`): renders
  the PDF one page at a time with PDF.js (imported DYNAMICALLY
  inside the load effect — the static-import SSR trap from Day
  11), a selectable text layer (transparent spans, one per text
  item — the browser's native selection works over these), an
  annotation overlay drawn from the GET list (highlights as
  translucent yellow, underlines as a green line, strikethroughs
  as a red line, notes as a yellow icon, ink as red SVG
  polylines), three modes (Select text / Sticky note / Freehand),
  a markup toolbar on selection (Highlight / Underline /
  Strikethrough + an optional note), a note input on click, live
  freehand drawing (pointer events, an SVG overlay), and the
  annotation list for the current page with a remove button each.
  Library "Annotate" link (PDFs only).

## 3. Code and data changes

- `src/lib/pdf-annotate.ts` (new, pure) +
  `src/lib/pdf-annotate.test.ts` (new, 15 tests) +
  `src/lib/pdf-annotate.server.ts` (new, server-only).
- `src/app/api/documents/[id]/pdf/annotations/route.ts` (new:
  GET/POST/DELETE).
- `src/app/(workspace)/documents/[id]/pdf-annotate/page.tsx`
  (new) + `src/components/pdf-annotate/pdf-annotate-client.tsx`
  (new).
- `src/components/library/library-forms.tsx` + `library-list.tsx`
  (the "Annotate" link, `pdfAnnotateHref` prop).
- `scripts/e2e-annotate-test.mjs` (new, focused harness).
  `scripts/prove-annotations.mjs` was temporary and deleted.
- Docs: `docs/handoffs/day-17-plan.md`,
  `WPS_LEVEL_PLAN.md` (the annotations row → Done),
  `docs/feature-matrix.csv` (FORMA-026),
  `docs/known-limitations.md` (annotation limits),
  `CHANGELOG.md` (Day 17 entry),
  `docs/project-brief/FEATURE_AUDIT.md` (§6.4 + §16 item 3 →
  Done), `docs/project-brief/FEATURE_LOOP.md` (queue:
  annotations Done, PDF page tools second half next).

## 4. Tests

- **Proof of concept (task 1): 14/14** (`scripts/prove-
  annotations.mjs`, deleted after use). A highlight and an ink
  annotation built by hand, reloaded with pdf-lib (the Annots
  array holds both, the QuadPoints in [tl, tr, bl, br] order),
  read back by PDF.js (`getAnnotations()` returns both, the
  QuadPoints exact, the colour [255,255,0], the note text via
  `contentsObj.str`), and the rendered page shows a yellow pixel.
- **Unit: 236/236 (20 files passed, 1 skipped, 9 tests skipped —
  the pre-existing skips).** 15 new: a highlight with the right
  subtype/quads/colour/note/author/date; all five kinds with the
  right subtypes (and the note's 20×20 rect, the ink's stroke,
  the underline's green); the input PDF is not modified; the
  validation (an empty QuadPoints array, a QuadPoints array that
  is not a multiple of 8, a missing page, a note without a
  position, ink without a stroke, a stroke with fewer than two
  points, a non-finite coordinate, an empty input list); an empty
  list for a PDF with no annotations; removal keeps the rest and
  rejects a missing index / page.
- **Live e2e: 33/33 (`scripts/e2e-annotate-test.mjs`).** As a real
  signed-in user A: the PDF uploads (v1); adding each of the five
  kinds succeeds (200) and creates versions 2–6, the document row
  tracking each; version 1 stays byte-identical to the upload;
  the list shows all five with the right subtypes, the highlight's
  quads/colour/note and the ink's stroke; the saved file loads in
  pdfjs-dist and `getAnnotations()` returns all five; the
  annotation page loads (200) for A (the client component mounts
  — the toolbar renders in the browser after the PDF loads, so the
  initial HTML carries the loading state) and shows "Document not
  found" for B; removing the underline succeeds (version 7) and
  leaves the other four; a bad QuadPoints array is refused (400),
  a missing page (400), removing a missing annotation (404);
  user B gets 404 on list/add/remove; signed-out gets 307 on
  list/add.
- **Typecheck, lint, build: pass.** Prettier applied to the Day
  17 TS files.

## 5. Deployment verification

- App rebuilt and restarted on :3000 (new build, the annotation
  routes + page included); `/api/supabase-status` returns 200.
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.
- **Docserver:** still wiped, .deb download still 403. The
  editor browser round-trip and the conversion proof still wait
  on it. The OCR worker is still running.

## 6. Security/licensing checks

- No new engine, no new licence: pdf-lib + PDF.js, both already
  in the project. No WPS annotation, branding or font is used.
- No secrets in code. The annotation input is validated by Zod
  (kind enum, page ≥ 1, finite numbers, bounded arrays) and again
  by the pure module (page exists, quads a multiple of 8, strokes
  ≥ 2 points, contents ≤ 2000 chars); the editor-role and
  workspace checks are unchanged (the routes load through RLS).
  The author is the fixed string "Forma Office" in v1 (a per-user
  author is a later step).

## 6b. Verification notes and fixes made during Day 17

- **The proof script caught three wrong property reads, not bad
  data.** PDF.js returns `quadPoints` as a Float32Array (not a
  plain array), `color` as a Uint8ClampedArray (which
  stringifies as an object), and the note text as
  `contentsObj.str` (not `contents`). The annotations were
  correct; the checks were fixed to read the right properties.
  14/14 after the fixes.
- **The unit tests caught a real bug in listAnnotationsInPdf.**
  `PDFArray.lookup(i)` RESOLVES the ref, so it returns the dict
  itself — my code tested `instanceof PDFRef` and skipped every
  annotation. Fixed by testing `instanceof PDFDict` directly.
  15/15 after the fix.
- **The build caught a layering / typing mistake.** The first
  version built the dict with `context.obj(dict)` where `dict`
  was a `Record<string, unknown>` — TypeScript rejected it
  (the Literal type does not accept a conditionally-built dict).
  Fixed by building the dict entry by entry with
  `PDFDict.withContext` + `.set()` (fully typed). Along the way:
  `PDFBool` has no `.of` (use `PDFBool.False`), the viewport
  type is `PageViewport` (not `PDFPageViewport`), and the rate
  limiter's method is `.check()` (not `.allow()`).
- **ESLint caught two React mistakes.** The annotation list was
  loaded by calling `loadAnnotations()` synchronously in an
  effect body (fixed with the pdf-edit page's async-IIFE
  pattern), and the live ink stroke was read from a ref during
  render (fixed by keeping it in state).
- **The e2e harness caught a wrong expectation, not a bug.** The
  "shows the annotation tools" check expected the toolbar in the
  initial HTML, but the page is a client component — the server
  renders its loading state and the toolbar renders in the browser
  after the PDF loads. The check now asserts the client mounts
  (the loading state); the toolbar itself is a browser-only check.

## 7. Known defects and limitations

- **No appearance stream (/AP) in v1.** PDF.js renders the
  annotations from the QuadPoints / InkList, and Adobe Reader /
  Preview generate appearances on open, so the annotations are
  visible in every reader — but a reader that only trusts /AP may
  not show them.
- **The colour set is fixed** (yellow highlight, green underline,
  red strikethrough, yellow note, red ink) — no free-form colour
  picker.
- **No free-text annotation** (typing text directly onto the
  page) — that is the PDF page-tools feature (#4), not this one.
- **The author is "Forma Office"** in v1, not the user's name.
- **The annotation toolbar renders in the browser** after the PDF
  loads (a client component) — the initial server HTML only
  carries the loading state, so a server-side check cannot see
  the tools.
- **The editor browser round-trip is still unproven** (the
  docserver is down). The annotation page loads (200); a human
  selecting text and drawing in it is the missing proof, same as
  for every other editor feature.

## 8. Tomorrow's target

- **Next feature in the queue: PDF page tools, second half (#4).**
  Insert pages, crop a page, page numbers, add text, hyperlinks
  and shapes. It builds on the PDF editing work (Days 9–10) and
  the annotation overlay (Day 17). It needs one decision first:
  which half to build first — the page tools (insert / crop /
  page numbers) are the most-used, while add-text / hyperlinks /
  shapes are the fiddliest. Ask the owner, or start with insert
  pages + page numbers as the first two.
