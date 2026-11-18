# Day 17 plan — PDF annotations (highlight, underline, strikethrough, sticky note, freehand)

Owner instruction (2026-11-18 16:26 PKT): "okay go head implement
this properly by using feature loop.md" — build PDF annotations
with annotations stored in the PDF itself (the owner's go-ahead
on the recommendation), following the feature loop. Audit queue
item 3 (`docs/project-brief/FEATURE_AUDIT.md` §16).

## 1. Research

### What an annotation is (PDF spec, ISO 32000)
An annotation is a dictionary on a page's `/Annots` array:
`/Type /Annot`, `/Subtype` (the kind), `/Rect` (the bounding box
in PDF points, origin bottom-left), `/C` (the colour, [r g b]),
`/Contents` (the note text), `/T` (the author), `/M` (the date),
`/F 4` (the Print flag — the annotation prints). The five kinds:
- **Highlight** (`/Subtype /Highlight`): `/QuadPoints` — 8 numbers
  per line of the selection, one quad per line.
- **Underline** (`/Subtype /Underline`) and **Strikethrough**
  (`/Subtype /StrikeOut`): same shape as a highlight.
- **Sticky note** (`/Subtype /Text`): a 20×20 icon rect, `/Contents`
  is the note text, `/Name /Comment`, `/Open false`.
- **Freehand** (`/Subtype /Ink`): `/InkList` — an array of strokes,
  each a flat array of alternating x,y coordinates; `/Border
  [0 0 width]` is the line width.
- **No appearance stream (/AP) in v1.** PDF.js renders text-markup
  and ink annotations from the QuadPoints / InkList without an
  /AP (it draws them itself), and Adobe Reader / Preview generate
  appearances on open. Generating /AP streams by hand is a lot of
  work and error-prone, so v1 ships without them and says so.

### The quad order (verified in PDF.js's own source)
PDF.js's `calculateLinkPosition` (web/pdf_viewer.mjs) builds the
quad points from a DOM selection rect `[x0, y0, x1, y1]` (bottom-left
/ top-right in PDF coordinates) as:
`[x0, y1, x1, y1, x0, y0, x1, y0]` — i.e. **top-left, top-right,
bottom-left, bottom-right**, in PDF points, origin bottom-left.
The same order is read back by its link-inference code (indices
2,3 = top-right, 4,5 = bottom-left). The client builds the quads
in exactly this order.

### The coordinate conversion (client)
The annotation page renders with PDF.js (like the pdf-edit page).
The viewport maps PDF coordinates to CSS pixels; the inverse is
`viewport.convertToPdfPoint(x, y)` (a standard pdfjs-dist API).
- Text selection: `Range.getClientRects()` (one DOM rect per line)
  → for each rect, convert its corners to PDF points → one quad
  per rect → the bounding Rect is the min/max of all quads.
- Sticky note: a click point (viewport) → PDF point → a 20×20
  rect around it.
- Freehand: the pointer path (viewport points) → PDF points → one
  InkList stroke per drawn stroke (a stroke ends on pointer-up).

### How pdf-lib builds the dicts (verified on this VM)
pdf-lib has NO high-level annotation-creation API — the
`PDFAnnotation` class is a low-level wrapper (Rect, appearance,
flags). The dicts are built by hand with `doc.context.obj({...})`,
registered with `doc.context.register(dict)`, and added with
`page.node.addAnnot(ref)` (`PDFPageLeaf.addAnnot` / `.Annots()`
exist). Verified 2026-11-18: `context.obj` converts plain strings
to PDFName (`Type: 'Annot'` → `/Type /Annot`), number arrays to
PDFArray, and a `PDFString.of(text)` to a literal string
(`Contents: PDFString.of('hello note')` → `/Contents (hello
note)`) — so text values MUST be wrapped in `PDFString.of`, or
they become names. All of `PDFString`, `PDFName`, `PDFArray`,
`PDFDict`, `PDFNumber`, `PDFRef` are exported from pdf-lib.

### The list / remove mechanism
`page.node.Annots()` returns the Annots array. Listing reads each
dict (`/Subtype`, `/Rect`, `/QuadPoints`, `/Contents`, `/C`,
`/InkList`, `/T`, `/M`) and returns them with their index in the
page's Annots array. Removal takes `{page, index}`, re-reads the
Annots array fresh, and removes that entry. The index is valid
because each operation creates a new version from the latest
file — nothing changes the file between the list and the remove.

### The save rule (established)
Every annotation change creates a NEW immutable version of the
document (like the form tools, Days 11–12) — never an overwrite.
The routes and the server module follow the pdf-form pattern
(`pdf-form.server.ts`): load the document with RLS (404), rate
limit 10/min per user, return the new version.

## 2. Small tasks (in order)

1. **Verify the mechanism (proof of concept).** A Node script
   (in the project dir, so it can import pdf-lib): create a PDF
   with pdf-lib (one page, a line of text), add a highlight
   annotation (QuadPoints in the [tl, tr, bl, br] order) and an
   ink annotation, save, reload, and verify the Annots array
   contains both with the right Subtype / QuadPoints / InkList.
   Then load the saved PDF in pdfjs-dist and verify
   `page.getAnnotations()` returns the two annotations (proving
   PDF.js can read them). Render the first page to PNG with
   pdftoppm and confirm the highlight colour is visible (a pixel
   check).
   *Test: the script prints PASS for every check.*
2. **Pure module + unit tests.** `src/lib/pdf-annotate.ts`:
   `ANNOTATION_COLORS` (yellow highlight, green underline, red
   strikethrough, yellow note, red ink — fixed, named colours, no
   free-form colour picker in v1), `AnnotationInput` (the five
   kinds, validated), `addAnnotationsToPdf(pdfBytes, inputs)`
   (builds the dicts, registers them, adds them to the right
   pages), `listAnnotationsInPdf(pdfBytes)` (returns the
   annotations with page + index + subtype + rect + contents +
   colour), `removeAnnotationFromPdf(pdfBytes, {page, index})`.
   Pure + testable: the unit tests build a fixture PDF in the test
   (pdf-lib), add each kind, and assert the saved file contains
   the annotation with the right fields; they also assert the
   validation (an empty QuadPoints array, a bad page number, an
   unknown kind, a non-finite coordinate are all rejected).
   *Test: the new unit tests pass.*
3. **Server module + routes.** `src/lib/pdf-annotate.server.ts`
   (the pdf-form.server.ts pattern): `fetchAnnotateDocument`
   (RLS load, 404), the add/list/remove helpers that load the
   latest version, call the pure functions, and create a new
   version. Routes under
   `src/app/api/documents/[id]/pdf/annotations/route.ts` (GET =
   list, POST = add) and `.../annotations/[index]/route.ts`
   (DELETE = remove) — or a single POST route with an `action`
   field; use the REST shape (GET/POST/DELETE) since the actions
   are distinct. Rate limit 10/min per user, own limiter instance.
   *Test: the routes are covered by the live e2e.*
4. **Annotation UI.** Page `/documents/[id]/pdf-annotate` + client
   `src/components/pdf/pdf-annotate-client.tsx` (the pdf-edit
   page pattern, pdfjs-dist imported DYNAMICALLY inside the load
   effect — the static-import SSR trap from Day 11). The client:
   renders the PDF (one page at a time, with a page selector),
   draws the annotation layer (PDF.js's annotation layer renders
   the annotations from the file), lets the user select text and
   apply Highlight / Underline / Strikethrough (a toolbar that
   appears on selection), click to place a sticky note (a "Note"
   mode + a text input), draw freehand (an "Ink" mode, pointer
   events, a canvas overlay that shows the stroke as it is drawn),
   lists the annotations on the current page with a remove button
   each, and saves (POST, then reloads the PDF so the new
   annotations render). Library "Annotate" link.
   *Test: the page loads (checked in the live e2e); the
   annotation actions are covered by the live e2e.*
5. **Live e2e harness.** `scripts/e2e-annotate-test.mjs`
   (focused, the Day 13–14 pattern): as user A, upload a PDF,
   POST a highlight (with quads over the text), an underline, a
   strikethrough, a sticky note and an ink stroke; verify each
   creates a new version, the version-1 file is unchanged, and a
   GET lists all five with the right subtypes; verify the saved
   PDF loads in pdfjs-dist and `getAnnotations()` returns them;
   verify the annotation page loads (200) for A and shows
   "Document not found" for B; remove one annotation (DELETE)
   and verify the list shrinks and the removed one is gone;
   user B gets 404 on add/list/remove; signed-out gets 307.
   *Test: the harness passes end to end.*
6. **Checks + docs + commit.** Typecheck, lint, Prettier, build,
   restart the app. Update `WPS_LEVEL_PLAN.md` (the PDF
   annotations row → Done), `feature-matrix.csv` (FORMA-026),
   `known-limitations.md` (no /AP in v1; the colour set is fixed;
   no free-text annotation yet), `CHANGELOG.md` (Day 17 entry),
   `FEATURE_AUDIT.md` (§6 + §16 item 3 → Done),
   `docs/handoffs/day-17.md`. Commit on branch
   `day-17-pdf-annotations`. Update `~/MEMORY.md`. Reply to the
   owner.

## 3. What is NOT in this feature

- Free-text annotations (typing text directly onto the page) —
  that is the PDF page-tools feature (#4), not this one.
- Appearance streams (/AP) — v1 relies on PDF.js / the reader to
  render the annotations.
- A free-form colour picker — v1 uses five fixed, named colours
  (yellow highlight, green underline, red strikethrough, yellow
  note, red ink).
- No change to the editor, the upload flow, or the form tools.
  No migration (annotations live in the PDF, not in a table).
- No WPS annotation, branding or font is used; the implementation
  is Forma's own on pdf-lib + PDF.js.
