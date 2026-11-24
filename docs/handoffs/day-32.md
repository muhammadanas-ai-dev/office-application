# Day 32 handoff — Stamps / watermarks

Date: 2026-11-24 (owner instruction 23:52 PKT: "now i want you
to go head implement the next feature properly by using feature
loop.md"). The next feature is the next item of the follow-up
list (Day 31 handoff §6): stamps/watermarks — audit §6.4 rows
"Stamps / custom stamps" and "Text watermark / image watermark
(opacity, position, rotation)", both "Not started".

## 1. Research

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
  (`src/lib/pdf-page-tools.ts`): `page.drawText` (page numbers,
  add-text) and `page.drawRectangle` (add-shape); `page.drawImage`
  is used in `src/lib/pdf-images.ts`. pdf-lib's drawText and
  drawImage both accept `opacity` and `rotate` (degrees), so the
  watermark options (opacity, position, rotation) are native.
- **The entry point is `DocumentActions`** (the per-document
  actions row): it takes `pdf*Href` props, and
  `src/components/library/library-list.tsx` sets them for PDF
  documents (`isPdfMimeType`). A `pdfStampHref` prop + a
  "Stamps & watermarks" link follows the same shape as
  `pdfAnnotateHref` / `pdfDrawHref`.
- **The image watermark** needs an uploaded PNG or JPEG,
  validated by its file signature (the Day 27
  `validateFileSignature` in `src/lib/file-signatures.ts`).
  `validateFileSignature` takes an EXTENSION ("png"/"jpg"), not
  a MIME type — passing "image/png" falls through to "That file
  type is not supported" (caught by the unit test, fixed by
  mapping the MIME type to an extension first).

## 2. What was built

- `src/lib/pdf-stamp.ts` — the pure operations:
  `addTextWatermarkToPdf` (text, pages, position, size, colour,
  opacity, rotation; the diagonal centre is always 45°),
  `addImageWatermarkToPdf` (PNG/JPEG, pages, position, scale,
  opacity, rotation), `addStampToPdf` (a preset — CONFIDENTIAL,
  DRAFT, APPROVED, REVIEWED — or custom text, uppercased, drawn
  as a bordered box with the text centred inside, in a colour,
  at a position). Pages are "all" or a range like "1-3, 5"
  (the same parsePageRanges as the other tools). Every function
  throws PdfEditError(400, …) for bad input and never modifies
  the input bytes. The rotated text/image is centred on its
  target point by moving the draw position back along the
  rotation by half the width and half the height.
- `src/lib/pdf-stamp.server.ts` — the server wiring (the
  annotate pattern): re-exports the pure functions +
  `saveNewVersion`/`fetchEditableDocument`/`fetchDocumentPdf` +
  the shared `pdfStampRateLimiter`.
- `src/app/api/documents/[id]/pdf/add-watermark/route.ts` — JSON
  for a text watermark, multipart form data for an image
  watermark. `src/app/api/documents/[id]/pdf/add-stamp/route.ts`
  — JSON for a stamp. Both return `{ ok, version, documentId, title }`.
- `src/app/(workspace)/documents/[id]/pdf-stamp/page.tsx` +
  `src/components/pdf-stamp/pdf-stamp-client.tsx` — three tabs
  (Text watermark / Image watermark / Stamp), a pages field
  ("all" or a range), and a note that a watermark/stamp is drawn
  into the PDF and can only be removed by restoring an earlier
  version.
- The link: a `pdfStampHref` prop on `DocumentActions`
  (library-forms.tsx) + a "Stamps & watermarks" link, wired in
  library-list.tsx for PDF documents.

## 3. Tests

- **Unit: 432 passed, 0 failed, 9 skipped** (422 before + 10
  new in `src/lib/pdf-stamp.test.ts`). The first full run had
  16 failures in pdf-content/pdf-edit/pdf-form — pre-existing,
  caused by the VM reset wiping /tmp/e2e/pdf1.pdf; rebuilt with
  `scripts/rebuild-fixtures.py`, then the suite went green.
- **Build passes** (the add-watermark/add-stamp routes and the
  pdf-stamp page are in the route table).
- **Live e2e CLOSED 2026-11-24 (18/18)** via
  `scripts/e2e-pdf-stamp-test.mjs` (the Day 17/19 pattern):
  the stamp page loads with the three tabs, the library link
  is present, the text watermark lands on all pages and on
  page 2 only, the stamp lands on all pages, the image
  watermark embeds, bad input is refused (empty text, a page
  past the end, a non-image file), cross-user isolation,
  signed-out 307. Two harness bugs fixed in the work: the
  `cookieFor` template literal was redacted by the runtime
  (rewritten as string concatenation), and pdfjs-dist rejects
  a Node Buffer — `pageTexts` now always hands it a plain
  `new Uint8Array(bytes)`.
- **The app was NOT running when the harness started** (curl
  :3000 returned 000 — it had stopped since the Day 31 run,
  probably a VM reset). Restarted with the Day 32 build
  (`fuser -k 3000/tcp`, then `setsid nohup npm run start -- -p 3000`);
  `/` 200, `/api/health` 200.

## 4. Docs

- Feature matrix FORMA-040, known-limitations (the stamps /
  watermarks limits), CHANGELOG (Day 32), the audit §6.4 rows
  → Done, FEATURE_LOOP item 16 → Done. MEMORY.md: add Day 32.
- **No migration was needed** (no new table; the feature is
  pdf-lib drawing + the existing versions machinery).

## 5. Honest limits

- A watermark/stamp is drawn INTO the page content, so it
  cannot be removed except by restoring an earlier version.
- The image watermark is PNG/JPEG only (no SVG, no transparency
  beyond the opacity setting).
- The stamp box is a rectangle (pdf-lib has no rounded-rectangle
  draw).
- The watermark text is Helvetica only (the standard PDF font).
- A watermark on a scanned-image PDF draws over the image; it
  does not sit behind it.

## 6. Still owed after Day 32

- The follow-up list, in order: insert-pages-from-an-image,
  Day 25's "export with comments" + "local reviewer notes",
  deleting the /plan route, a live 390px render, the docserver
  reinstall. AI tools and cloud/collaboration/billing stay
  SKIPPED unless the owner restarts them.
- **Vercel deploy still blocked** (the team re-authorization —
  re-checked 2026-11-22: still 403 on muhmmad-anas-projects,
  list_teams empty). The app runs only on this VM at
  localhost:3000, which the owner cannot open from his own
  browser (he reported "no running" on 2026-11-21; the tunnels
  tried — Cloudflare Tunnel and localtunnel — are blocked by
  the egress policy). The owner can run it on his own machine
  from the GitHub repo, or unblock Vercel.
- **Day 31 close-out GitHub snapshot push still owed** (local
  commit c893ac1) — plus the Day 32 commit below, in the same
  snapshot.
