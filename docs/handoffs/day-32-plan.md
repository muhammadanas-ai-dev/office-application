# Day 32 plan — Stamps / watermarks

Owner instruction (2026-11-24 23:52 PKT): "now i want you
to go head implement the next feature properly by using
feature loop.md". The next feature is the next item of the
follow-up list (Day 31 handoff §6): stamps/watermarks —
audit §6.4 rows "Stamps / custom stamps" and "Text watermark
/ image watermark (opacity, position, rotation)", both
"Not started".

## 1. Research (done)

- **The pattern is the Day 17/19 PDF tools** (annotations,
  page tools, draw): a pure, unit-testable module
  (`src/lib/pdf-*.ts`) that operates on PDF bytes; a server
  module (`src/lib/pdf-*.server.ts`) that fetches the document
  (RLS) and saves a NEW version (v(n+1) in Storage + a
  document_versions row + the documents row update, via
  `saveNewVersion` in `src/lib/pdf-edit.server.ts`); an API
  route `src/app/api/documents/[id]/pdf/<op>/route.ts` (Zod
  body validation + the shared rate limiter); and a page
  `src/app/(workspace)/documents/[id]/pdf-<op>/page.tsx` with
  a client component. Every change creates a new immutable
  version — the original file is never overwritten.
- **The pdf-lib primitives already exist in the codebase**
  (`src/lib/pdf-page-tools.ts`): `page.drawText(text, { x, y,
  size, font, color })` (page numbers, add-text) and
  `page.drawRectangle` (add-shape). pdf-lib's drawText and
  drawImage both accept `opacity` and `rotate` (degrees), so
  the watermark options (opacity, position, rotation) are
  native. `page.drawImage` is already used in
  `src/lib/pdf-images.ts`.
- **The entry point is `DocumentActions`** (the per-document
  actions row): it takes `pdf*Href` props, and
  `src/components/library/library-list.tsx` sets them for PDF
  documents (`isPdfMimeType`). A `pdfStampHref` prop + a
  "Stamps & watermarks" link follows the same shape as
  `pdfAnnotateHref` / `pdfDrawHref`.
- **The stamp is a rubber-stamp box**: a bordered rectangle
  with the text centred inside it, in a colour (red/green/
  blue/black), at a chosen position — the same
  `drawRectangle` + `drawText` primitives, with the text
  width measured (`font.widthOfTextAtSize`) to centre it.
- **The image watermark** needs an uploaded PNG or JPEG,
  validated by its file signature (the Day 27
  `validateFileSignature` in `src/lib/file-signatures.ts`
  already does this for uploads). The route takes multipart
  form data (like the upload route), not JSON.

## 2. The feature (scope)

| Piece | Behaviour |
|---|---|
| Text watermark | Custom text, drawn on the chosen pages (all pages, or a page range like 2–5), at a position (centre-diagonal, centre, top-centre, bottom-centre), with a font size, a colour, an opacity (0.1–1) and a rotation (0/30/45/60/90°). The diagonal centre is the classic watermark: large, light, rotated 45°. |
| Image watermark | An uploaded PNG or JPEG, drawn on the chosen pages at a position (centre, top-left, top-right, bottom-left, bottom-right), scaled to a fraction of the page width, with an opacity and a rotation. |
| Stamp | A preset (CONFIDENTIAL, DRAFT, APPROVED, REVIEWED) or custom text, drawn as a bordered box with the text centred inside, in a colour, at a position (top-centre, top-right, bottom-centre, bottom-right), on the chosen pages. |
| Page | One page (`/documents/[id]/pdf-stamp`) with three tabs (Text watermark / Image watermark / Stamp), each a form that posts to its API route and reports the new version. |
| Link | A "Stamps & watermarks" link in the document actions (PDF documents only), next to Annotate / Draw on PDF. |

**Honest limits to record:** a watermark/stamp is drawn INTO
the PDF content (it is not a PDF annotation, so it cannot be
removed later except by restoring an earlier version); the
image watermark is PNG/JPEG only (no SVG, no transparency
beyond the opacity setting); the stamp box is a rectangle
(no rounded corners — pdf-lib has no rounded-rectangle draw);
the text is Helvetica only (the standard PDF font, so it
renders everywhere); a watermark on a scanned-image PDF
draws over the image, it does not sit behind it.

## 3. Small tasks (in order)

1. **Pure module.** `src/lib/pdf-stamp.ts`: `addTextWatermarkToPdf`
   (bytes, input) + `addImageWatermarkToPdf` (bytes, imageBytes,
   imageMime, input) + `addStampToPdf` (bytes, input) + the shared
   helpers (page-range parsing, position calculation, colour map,
   opacity/rotation validation). Every function throws
   `PdfEditError(400, …)` for bad input and never modifies the
   input bytes. Test: the unit tests below.
2. **Server module.** `src/lib/pdf-stamp.server.ts`: re-export the
   pure functions + a `saveStampedVersion` wrapper (the annotate
   pattern: fetchEditableDocument + saveNewVersion). Test: the
   live e2e.
3. **API routes.** `src/app/api/documents/[id]/pdf/add-watermark/route.ts`
   (JSON body for a text watermark; multipart form data with the
   image file for an image watermark) and
   `src/app/api/documents/[id]/pdf/add-stamp/route.ts` (JSON body).
   Both validate with Zod, rate-limit with the shared limiter, and
   return `{ ok, version, documentId, title }`. Test: the live e2e.
4. **The page.** `src/app/(workspace)/documents/[id]/pdf-stamp/page.tsx`
   + a client component (three tabs, each a form posting to its
   route, showing the new version on success). Test: the live e2e
   (the page loads, the forms are present).
5. **The link.** A `pdfStampHref` prop on `DocumentActions`
   (library-forms.tsx) + a "Stamps & watermarks" link, wired in
   `library-list.tsx` for PDF documents. Test: the live e2e (the
   link is on the library page).
6. **Unit tests.** `src/lib/pdf-stamp.test.ts`: the text watermark
   (drawn on all pages, on a range, the diagonal centre, the
   opacity), the stamp (the box + text, the preset texts, the
   custom text), the image watermark (PNG + JPEG, the scale, the
   position), and the rejections (empty text, opacity out of
   range, a bad page range, a non-PDF). Test: the suite passes.
7. **Live e2e.** A Day 32 harness (`scripts/e2e-pdf-stamp-test.mjs`,
   the Day 17/19 pattern): upload a PDF, add a text watermark
   (the bytes change, the text is extractable from the new
   version, the old version is untouched), add a stamp, add an
   image watermark, a bad input is refused (400), cross-user
   isolation, signed-out 307. Test: the harness passes.
8. **Docs + commit + handoff + reply.** Feature matrix (FORMA-040),
   known-limitations, CHANGELOG, the audit §6.4 rows → Done,
   the loop queue (add a Day 32 row), MEMORY.md, the handoff, the
   commit on `day-32-pdf-stamps`, the GitHub snapshot push, the
   reply.
