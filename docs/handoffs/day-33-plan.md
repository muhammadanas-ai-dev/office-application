# Day 33 plan — Insert pages from an image

Owner instruction (2026-11-25 01:19 PKT): "okay go head
implement the next feature properly by using feature loop.md
i run the query". The next feature is the next item of the
follow-up list (Day 32 handoff §6): insert-pages-from-an-image
— audit §6.2 row "Insert pages from another PDF or image",
currently Partial: Day 18 did "from another PDF in the
library", "from an image — not started".

## 1. Research (done)

- **The pattern is the Day 18 insert-pages** (pdf-page-tools
  part 1): a pure function in `src/lib/pdf-page-tools.ts`
  (`insertBlankPageInPdf`, `insertPagesFromPdf`) that operates
  on PDF bytes; the route
  `src/app/api/documents/[id]/pdf/insert-pages/route.ts` (Zod
  body validation + the shared rate limiter + `saveNewVersion`);
  and the Insert pages section in
  `src/components/pdf-tools/pdf-tools-client.tsx` (a source
  select — blank / another PDF — a position select, and an
  `onInsert` handler that posts JSON via `runVersionTool`).
  Every insert creates a new immutable version — the original
  file is never overwritten.
- **The insert family lives in one module** (`pdf-page-tools.ts`),
  so the image variant belongs there too, next to
  `insertPagesFromPdf`. It reuses `InsertPosition`,
  `validatePosition` and `neighbourSize` (the blank page is
  sized from a neighbouring page).
- **The image embedding is proven** (Day 22 pdf-images,
  Day 32 image watermark): `doc.embedPng` / `doc.embedJpg`
  after a file-signature check (`validateFileSignature` in
  `src/lib/file-signatures.ts`). The Day 32 lesson: it takes
  an EXTENSION ("png"/"jpg"), not a MIME type.
- **The route needs multipart form data** for the image files
  (JSON cannot carry a file). The Day 32 add-watermark route
  shows the shape: branch on the content-type, JSON for the
  existing sources, multipart for the image source. The
  existing JSON path stays unchanged.
- **The page sizing decision:** a new page matches the size of
  its neighbours (the same `neighbourSize` as the blank page),
  and the image is drawn centred, scaled to fit inside the
  page minus a 36pt margin, preserving its aspect ratio. A
  3000px photo must not make a 3000pt page, and a portrait
  photo on a landscape page centres with white space — that
  is what a user expects from a photo page in their document.

## 2. The feature (scope)

| Piece | Behaviour |
|---|---|
| Insert pages from an image | One or more uploaded PNG/JPEG images (at most 50 at once, the same cap as the PDF insert), each becoming one new page, inserted before a page, after a page, or at the end, in the order chosen. Each new page is sized from its neighbours and carries its image centred, scaled to fit with a 36pt margin, aspect ratio preserved. |
| Route | The existing `POST /api/documents/[id]/pdf/insert-pages` gains a multipart branch: `source=image` + one or more `image` files (PNG/JPEG, each at most 10 MB) + the position fields. The JSON path (blank / another PDF) is unchanged. |
| UI | The Insert pages section on the PDF tools page gains a third source, "Pages from an image", with a file input (multiple, PNG/JPEG). The `onInsert` handler branches: for the image source it builds a FormData and posts it (a `runVersionToolForm` helper next to `runVersionTool`). |
| Errors | A non-image file, an image over 10 MB, more than 50 images, and a bad position are all refused with a real reason (400). |

**Honest limits to record:** one image becomes one page (no
multi-image collage, no cropping or rotation of the image at
insert time — crop/rotate the image before uploading, or use
the page tools after inserting); the image is embedded at its
original resolution (no downscaling, so a very large photo
makes a large PDF); the page size comes from the neighbours,
so a portrait photo in a landscape document has white space
at the sides.

## 3. Small tasks (in order)

1. **Pure function.** `insertPagesFromImageInPdf` in
   `src/lib/pdf-page-tools.ts` (bytes, images: { bytes, mime }[],
   position): validate each image (PNG/JPEG by signature,
   at most 10 MB, at most 50 images), embed it, insert a new
   page at the position (in order) sized from its neighbours,
   draw the image centred and scaled to fit with a 36pt
   margin. Throws PdfEditError(400, …) for bad input; never
   modifies the input bytes. Test: the unit tests below.
2. **Route.** Extend `insert-pages/route.ts` with the multipart
   branch (source=image + the image files + the position).
   The JSON path is unchanged. Test: the live e2e.
3. **UI.** The Insert pages section in `pdf-tools-client.tsx`:
   a third source option ("Pages from an image"), a file
   input (multiple, PNG/JPEG), and the `onInsert` branch that
   posts a FormData via a new `runVersionToolForm` helper.
   Also update the section's description (it currently says
   "a blank page, or pages from another PDF"). Test: the live
   e2e (the option and the file input are present).
4. **Unit tests.** In `src/lib/pdf-page-tools.test.ts` (with the
   other insert tests): one image inserts one page with the
   image embedded, two images insert two pages in order, the
   position (before/after/end) is honoured, the new page is
   the neighbours' size, and the rejections (a non-image, an
   image over 10 MB, more than 50 images, a bad position).
   Test: the suite passes.
5. **Live e2e.** A Day 33 harness (`scripts/e2e-insert-image-test.mjs`,
   the Day 17/19 pattern): upload a PDF, insert one image
   page (the page count grows, the image is embedded on the
   new page, the old version is untouched), insert two images
   at the end, a bad input is refused (400), cross-user
   isolation, signed-out 307. Test: the harness passes.
6. **Docs + commit + handoff + reply.** Feature matrix
   (FORMA-041), known-limitations, CHANGELOG, the audit §6.2
   row → Done, the loop queue (add a Day 33 row), MEMORY.md,
   the handoff, the commit on `day-33-insert-image-pages`,
   the GitHub snapshot push, the reply.
