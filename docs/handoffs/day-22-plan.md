# Day 22 plan — PDF↔image (export pages to PNG/JPG, images to PDF)

Owner instruction (2026-11-18 17:14 PKT): "okay go head
implement this properly by using feature loop.md" — build audit
queue item 7 (`docs/project-brief/FEATURE_AUDIT.md` §16):
PDF↔image.

## 1. Research

### PDF → image (export pages to PNG/JPG)
- **The renderer is pdftoppm (poppler-utils), already on this
  VM and already used by the OCR pipeline** (it renders PDF
  pages at 300 DPI for Tesseract). Verified: `/usr/bin/
  pdftoppm`, flags `-png` / `-jpeg`, `-r <dpi>` (default 150),
  `-f <first>` / `-l <last>`. The OCR module's
  `renderPdfPagesToImages` already wraps it (temp dir,
  `pdftoppm -png -r 300`, ENOENT → a clear 503) — the image
  export reuses the same pattern (a different DPI and format).
- **The output form: one ZIP file, all pages.** The standard
  (WPS, Adobe) — a single download, not one document per page
  (that would flood the library) and not one page at a time
  (the user would have to click once per page). The ZIP is
  built with the `zip` command (verified: `/usr/bin/zip`) from
  the rendered files in a temp dir (`zip -j output.zip
  <files>`), then the ZIP bytes are streamed back. **No new
  npm dependency** — `zip` is a system tool like qpdf and
  Ghostscript (it does NOT survive a VM reset; if it is
  missing, the route returns a clear 503). The file names
  inside are `page-1.png`, `page-2.png`, … (1-based, in page
  order).
- **The route** `GET /api/documents/[id]/pdf/export-images?
  format=png|jpg&dpi=72|150|300` — a GET (a download, like the
  export route). Defaults: PNG, 150 DPI. The DPI is capped at
  300 (higher is a huge file for no gain) and the page count at
  20 (the OCR cap — a 100-page PDF at 300 DPI would be hundreds
  of MB). The response is `application/zip` with a
  `Content-Disposition: attachment` file name
  `<title>-images.zip`. It follows the export route pattern
  (RLS, the file token is not needed — it is a GET on the
  document, the same as the download route; a 404 for a document
  the user cannot access). It does NOT create a document or a
  version (it is an export, like Day 7).

### Images → PDF (create a PDF from images)
- **The engine is pdf-lib** (`doc.embedPng` / `doc.embedJpg`,
  both accept a `Uint8Array`). The embedded image has `width`
  and `height` (pixels) and a `scale(factor)` method. **Each
  image becomes one page**, sized to fit within an A4 page
  (595×842 pt) keeping the aspect ratio, centred — the standard
  "images to PDF" layout (a 1-pixel = 1-point page would make a
  phone photo a 3000×4000 pt page, which is absurd). The PDF is
  created with `PDFDocument.create()` (no source PDF needed).
- **The route** `POST /api/documents/images-to-pdf` (a
  library-level action, not on one document — it takes several
  images). Body: `{ documentIds: string[] (1–20, UUIDs),
  title?: string }`. It loads each image document (RLS — the
  user's own images only), downloads each from Storage, embeds
  it, and creates a NEW document in the library (the conversion
  hub pattern: `buildStoragePath(workspace_id, newId, 1,
  fileName)`, a documents row + a document_versions row version
  1; on insert failure it removes the uploaded file). The title
  defaults to "Images to PDF" (or the first image's title).
  Returns `{ok, document: {id, title, mimeType}}`. It refuses a
  non-image document (400), a missing document (404), and more
  than 20 images (400). **PNG and JPEG only** (the two image
  formats the app stores).
- **The UI**: a page `/images-to-pdf` (a workspace page, like
  the convert page) that lists the user's images (PNG/JPEG) with
  checkboxes, in library order, plus a title input and a
  "Create PDF" button. On success it links to the new PDF's
  download. A "Images to PDF" link is added to the sidebar
  (under the library area) and to the library page header.

## 2. Small tasks (in order)

1. **Verify the mechanism (proof of concept).** The script
   `scripts/prove-images.mjs` (in the project dir — keep it
   until the commit, then delete): render `/tmp/e2e/pdf1.pdf`
   (3 pages) with pdftoppm to PNG at 150 DPI (3 files), zip
   them with `zip -j` (a valid ZIP with 3 entries), and build a
   PDF from two images with pdf-lib (2 pages, each image fit
   within A4, centred, aspect kept). Verify the ZIP with
   `unzip -l` and the PDF with pdfjs-dist (2 pages) + `qpdf
   --check`.
   *Test: the script prints PASS for every check.*
2. **Pure module + unit tests.** `src/lib/pdf-images.ts`:
   `IMAGE_EXPORT_FORMATS` ("png"|"jpg"), `IMAGE_EXPORT_DPIS`
   (72/150/300), `MAX_IMAGE_EXPORT_PAGES = 20`,
   `MAX_IMAGES_TO_PDF = 20`, `A4_WIDTH_PT = 595.28`,
   `A4_HEIGHT_PT = 841.89`, `fitImageInPage(imageWidthPx,
   imageHeightPx)` (the scale + the centred x/y on an A4 page),
   `getImageExportFileName(title, format)` (the ZIP name),
   `getImagesToPdfFileName(title)` (the PDF name),
   `buildImagesPdf(images: {bytes, mimeType}[])` (pdf-lib: a
   new PDF, one page per image, fit + centred; refuses an
   unsupported mime type / an empty list / more than 20).
   Tests in `src/lib/pdf-images.test.ts`: the fit math (a wide
   image, a tall image, a small image — the exact x/y/width/
   height), the file names, the PDF (2 images → 2 pages, the
   right size, the images embedded — verified with pdfjs-dist
   + the page size), the refusals.
   *Test: the new unit tests pass.*
3. **Server module + routes.** `src/lib/pdf-images.server.ts`
   (`import "server-only"`): `renderPdfPagesToImages` (reuse
   the OCR module's function — it is exported from
   `src/lib/ocr.ts` — with the format + DPI parameters),
   `zipImageFiles` (execFile `zip -j`, ENOENT → 503), and the
   images-to-PDF document creation (the convert route pattern).
   Routes: `GET /api/documents/[id]/pdf/export-images` and
   `POST /api/documents/images-to-pdf`.
   *Test: the routes are covered by the live e2e.*
4. **UI.** The page `/images-to-pdf` (server: the user's images
   via the user client, RLS; the client: checkboxes + title +
   Create PDF) + the sidebar link + the library header link.
   The convert page pattern for the client (a POST, a success
   link to the new document's download).
   *Test: the page loads (checked in the live e2e).*
5. **Live e2e harness.** `scripts/e2e-images-test.mjs`
   (focused, the Day 13–22 pattern): as user A, upload a
   3-page PDF and two images (PNG + JPEG) as library documents;
   export the PDF's pages as PNG at 150 DPI (a ZIP download,
   200, `application/zip`, 3 entries named `page-1.png`…,
   each a valid PNG with the right dimensions); export as JPG
   (a ZIP, 3 `.jpg` entries); an unknown format / a bad DPI /
   a 0-page request is refused (400); images-to-PDF with the
   two images (200, a new PDF document in the library, 2 pages,
   the right size, the original images untouched); a non-image
   document in the list is refused (400); user B gets 404 on
   both routes; signed-out gets 307. The images-to-PDF page
   loads (200) for A and shows "not found" for B.
   *Test: the harness passes end to end.*
6. **Checks + docs + commit.** Typecheck, lint, Prettier,
   build, restart the app. Update `WPS_LEVEL_PLAN.md` (the
   PDF↔image row → Done), `feature-matrix.csv` (FORMA-031),
   `known-limitations.md` (the image limits), `CHANGELOG.md`
   (Day 22 entry), `FEATURE_AUDIT.md` (§6.6 + §16 item 7 →
   Done), `docs/handoffs/day-22.md`. Commit on branch
   `day-22-pdf-images`. Update `~/MEMORY.md`. Reply to the
   owner.

## 3. What is NOT in this feature

- No per-page image download route (the ZIP covers it — one
  download, all pages).
- No image editing (crop/rotate the images before the PDF —
  the PDF tools already crop pages; the images go in as they
  are).
- No TIFF/BMP/WebP (the app only stores PNG/JPEG; pdftoppm
  can render TIFF but the library cannot store it).
- No OCR on the images-to-PDF (the images are embedded as
  images, not OCR'd — run OCR on the resulting PDF if the text
  is needed).
- No change to the editor, the upload flow, or the other PDF
  tools. No WPS feature, branding or font is used; the
  implementation is Forma's own on pdftoppm + pdf-lib + zip.
