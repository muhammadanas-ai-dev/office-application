# Day 22 handoff — PDF↔image (export pages to PNG/JPG, images to PDF)

Date: 2026-11-18. Owner instruction (17:14 PKT): "okay go head
implement this properly by using feature loop.md" — build audit
queue item 7 (`docs/project-brief/FEATURE_AUDIT.md` §16):
PDF↔image.

## 1. What was researched

- **PDF → image.** The renderer is **pdftoppm
  (poppler-utils)**, already on this VM and already used by the
  OCR pipeline (it renders PDF pages at 300 DPI for
  Tesseract). Verified: `/usr/bin/pdftoppm`, flags `-png` /
  `-jpeg`, `-r <dpi>` (default 150), `-f` / `-l`. The OCR
  module's `renderPdfPagesToImages` is hardcoded to PNG at 300
  DPI, so the image export has its own renderer in
  `src/lib/pdf-images.server.ts` (same pattern: temp dir,
  execFile, ENOENT → 503, other error → 502) with the format
  and DPI as parameters. **The output form is one ZIP file,
  all pages** — the standard (WPS, Adobe): a single download,
  not one document per page (that would flood the library) and
  not one page at a time. The ZIP is built with the `zip`
  command (verified: `/usr/bin/zip`, `zip -j` to store just
  the file names) from the rendered files in a temp dir, then
  the ZIP bytes are streamed back. **No new npm dependency.**
  The file names inside are `page-1.png`, `page-2.png`, …
  (1-based, in page order). The DPI is capped at 300 and the
  page count at 20 (a 100-page PDF at 300 DPI would be hundreds
  of MB). The export is a download (like Day 7) — it creates
  no document and no version.
- **Images → PDF.** The engine is **pdf-lib**
  (`doc.embedPng` / `doc.embedJpg`, both accept a
  `Uint8Array`). The embedded image has `width` and `height`
  (pixels) and a `scale(factor)` method. **Each image becomes
  one page**, sized to fit within an A4 page (595.28×841.89
  pt) keeping the aspect ratio, centred — the standard
  "images to PDF" layout (a 1-pixel = 1-point page would make
  a phone photo a 3000×4000 pt page). A small image is never
  scaled up. The PDF is created with `PDFDocument.create()`
  (no source PDF needed). **PNG and JPEG only** (the two
  image formats the app stores) — the mime type must match the
  bytes (a PNG that claims to be a JPEG is refused — the
  byte-signature check from the hardening queue, applied
  here). The result is a NEW document in the library (the
  conversion hub pattern: `buildStoragePath`, a documents row
  + a document_versions row version 1; on insert failure the
  uploaded file is removed). The source images are never
  touched.

## 2. Completed functionality

- **The pure module** (`src/lib/pdf-images.ts`):
  `IMAGE_EXPORT_FORMATS` ("png"|"jpg"),
  `IMAGE_EXPORT_DPIS` (72/150/300),
  `MAX_IMAGE_EXPORT_PAGES = 20`,
  `MAX_IMAGES_TO_PDF = 20`, the A4 size in points,
  `fitImageInPage(imageWidthPx, imageHeightPx)` (the scale +
  the centred x/y on an A4 page), `getImageExportFileName`
  (the ZIP name), `getImagesToPdfFileName` (the PDF name),
  `buildImagesPdf(images)` (pdf-lib: a new PDF, one page per
  image, fit + centred; refuses an unsupported mime type, a
  mismatched file, an empty list, more than 20 images).
- **The server module** (`src/lib/pdf-images.server.ts`):
  `renderPdfPagesToImages(bytes, dir, format, dpi)`,
  `zipImageFiles(dir, imagePaths)`, `withTempDir(fn)` (a
  fresh temp dir, removed afterwards).
- **The routes**: `GET /api/documents/[id]/pdf/export-images?
  format=png|jpg&dpi=72|150|300` (defaults PNG, 150 DPI; the
  ZIP download, `application/zip`, `Content-Disposition:
  attachment`) and `POST /api/documents/images-to-pdf` (a
  library-level action — body `{documentIds, title?}`; the
  images in the order given; all in one workspace; returns
  `{ok, document: {id, title, mimeType}}`).
- **The UI**: the page `/images-to-pdf` (server: the user's
  PNG/JPEG images via the user client, RLS; the client:
  checkboxes with the page number in the PDF, a title input,
  a "Create PDF" button, a success link to the new PDF's
  download) + a sidebar link ("Images to PDF") + a library
  "Export images" link (PDFs, a direct download link to the
  route).

## 3. Code and data changes

- `src/lib/pdf-images.ts` (new, pure) +
  `src/lib/pdf-images.test.ts` (new, 10 tests) +
  `src/lib/pdf-images.server.ts` (new, server-only).
- `src/app/api/documents/[id]/pdf/export-images/route.ts`
  (new) + `src/app/api/documents/images-to-pdf/route.ts`
  (new).
- `src/app/(workspace)/images-to-pdf/page.tsx` (new) +
  `src/components/images-to-pdf/images-to-pdf-client.tsx`
  (new) + `src/components/layout/app-shell.tsx` (the sidebar
  link, `FileImage` icon) + `src/components/library/
  library-forms.tsx` + `library-list.tsx` (the "Export
  images" link, `exportImagesHref` prop).
- `scripts/e2e-images-test.mjs` (new, focused harness).
  `scripts/prove-images.mjs` was temporary and deleted.
- Docs: `docs/handoffs/day-22-plan.md`,
  `docs/feature-matrix.csv` (FORMA-031),
  `docs/known-limitations.md` (the image limits),
  `CHANGELOG.md` (Day 22 entry),
  `docs/project-brief/FEATURE_AUDIT.md` (§16 item 7 → Done),
  `docs/project-brief/FEATURE_LOOP.md` (queue: item 7 Done,
  Versions UI next), `~/MEMORY.md` (Day 22 entry).
- **No migration** (the images live in the documents table
  and Storage already; the export is a download, the PDF is a
  new document).

## 4. Tests

- **Proof of concept (task 1): all checks pass**
  (`scripts/prove-images.mjs`, deleted after use). pdftoppm
  renders 3 PNG pages (1275×1650 at 150 DPI); `zip -j` makes
  a valid ZIP with 3 entries; pdf-lib builds a 2-page PDF from
  two images.
- **Unit: 302/302 (24 files passed, 1 skipped, 9 tests skipped
  — the pre-existing skips).** 10 new: the fit math (a wide
  image, a tall image, a small image — the exact x/y/width/
  height), the file names, the format/DPI checks, the PDF
  builder (2 images → 2 pages, A4, in order), the refusals
  (an empty list, more than 20 images, a non-image mime type,
  a mismatched file).
- **Live e2e: 20/20 (`scripts/e2e-images-test.mjs`).** As a
  real signed-in user A: the PDF, PNG, JPEG and DOCX upload;
  the PNG export (200, `application/zip`, 3 entries
  `page-1..3.png`, each non-empty, the download named after
  the document); the JPG export (200, 3 `.jpg` entries); an
  unknown format / a bad DPI refused (400); images-to-PDF
  (200, a new PDF document, 2 pages, A4, the source PNG
  untouched — version 1, same bytes); a non-image document /
  an empty list refused (400); the images-to-PDF page loads
  for A (200, shows "Images to PDF") and for B (200, an empty
  list); user B gets 404 on both routes; signed-out gets 307
  on both. The ZIP entries are listed by reading the ZIP's
  central directory (no dependency); the JPEG fixture is made
  from the PNG fixture with PIL (a real JPEG, not a renamed
  PNG).
- **Typecheck, lint, build: pass.** Prettier applied to the
  Day 22 files.

## 5. Deployment verification

- App rebuilt and restarted on :3000 (new build, both routes
  + the images-to-PDF page + the sidebar/library links
  included); `/api/supabase-status` returns 200.
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.

## 6. Security/licensing checks

- No new engine licence to clear: pdftoppm (GPL, a system
  binary — the same as the OCR pipeline), pdf-lib, `zip`
  (Info-ZIP). No WPS feature, branding or font is used.
- No secrets in code. The images-to-PDF route validates the
  mime type against the bytes (the byte-signature check) and
  loads the images through the user's client (RLS).

## 6b. Verification notes and fixes made during Day 22

- **pdftoppm's JPEG flag is `-jpeg`, not `-jpg`.** The first
  e2e run passed the PNG checks (5/5) then failed on the JPG
  export: the route returned a tiny (76-byte) ZIP because
  pdftoppm had errored on the unknown `-jpg` flag. Fixed in
  the server module (`format === "jpg" ? "-jpeg" : "-png"`;
  the files still use the `.jpg` extension). **The harness's
  ZIP reader was fine** — the 76-byte file was the symptom,
  not the cause.
- **TypeScript: `mime_type` is `string | null` in the database
  types.** The images-to-PDF route first narrowed it with
  `!d!.mime_type` checks, but TypeScript does not carry that
  narrowing across loops (the elements are array accesses
  through a non-null assertion). Fixed by validating and
  narrowing in ONE place: a typed `imageDocs` array
  (`file_path: string`, `mime_type: string`) built in the
  validation loop, used by everything downstream. The
  images-to-PDF page uses a type-guard filter for the same
  reason.
- **TypeScript: `new NextResponse(Uint8Array, ...)` is a type
  error** (`Uint8Array<ArrayBufferLike>` is not `BodyInit`).
  Fixed by copying into a fresh `Uint8Array` (`new
  Uint8Array(zipBytes)`) and using `new Response(...)` — the
  export route's pattern. (A Buffer's `.buffer` may be a
  shared pool, so it is not used directly.)
- **ESLint: an unused parameter.** `getImageExportFileName`
  took a `format` it never used (the ZIP name does not need
  it). Removed from the signature, the route and the test.

## 7. Known defects and limitations

- **PNG/JPEG only** (the formats the library stores). No
  TIFF/BMP/WebP.
- **At most 20 pages / 20 images.** A longer PDF is refused
  (400); more than 20 images is refused (400).
- **The export is a download, not a document** (it creates no
  version). There is no per-page image download route (the ZIP
  covers it).
- **No image editing** (crop/rotate the images before the
  PDF — the PDF tools already crop pages; the images go in as
  they are). **No OCR on the images-to-PDF** (the images are
  embedded as images, not OCR'd — run OCR on the resulting PDF
  if the text is needed).
- **pdftoppm and `zip` are system binaries** — they do NOT
  survive a VM reset (reinstall: `sudo apt-get install
  poppler-utils zip`); if missing, the routes return a clear
  503.
- **The editor browser round-trip is still unproven** (the
  docserver is down). The images-to-PDF page loads (200); a
  human clicking through it is the missing proof, same as for
  every other editor feature.

## 8. Tomorrow's target

- **Next feature in the queue: Versions UI (#8).** A page
  that lists a document's versions (the `document_versions`
  table already has them — every edit creates a new immutable
  version) with a download link per version and a "restore"
  action (restoring creates a NEW version from the old one's
  file, it never overwrites). The editor callback's `url` /
  `changesurl` history is the related open item (the callback
  already saves a new version on status 2).
