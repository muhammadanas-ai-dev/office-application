# Day 33 handoff — Insert pages from an image

Date: 2026-11-25 (owner instruction 01:19 PKT: "okay go head
implement the next feature properly by using feature loop.md
i run the query"). The next feature is the next item of the
follow-up list (Day 32 handoff §6): insert-pages-from-an-image
— audit §6.2 row "Insert pages from another PDF or image",
Partial: Day 18 did "from another PDF in the library", "from
an image — not started".

## 1. Research

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

## 2. What was built

- `insertPagesFromImageInPdf` in `src/lib/pdf-page-tools.ts`
  (bytes, images: { bytes, mime }[], position): validates each
  image (PNG/JPEG by signature, at most 10 MB, at most 50
  images — the same cap as the PDF insert), embeds it, inserts
  a new page at the position (in order) sized from its
  neighbours, and draws the image centred and scaled to fit
  with a 36pt margin. Throws PdfEditError(400, …) for bad
  input; never modifies the input bytes. Also refuses a result
  over MAX_PDF_PAGES (500).
- The `insert-pages` route gains a multipart branch
  (`source=image` + one or more `image` files +
  `position_kind`/`position_page`). The JSON path (blank /
  another PDF) is unchanged.
- The Insert pages section in `pdf-tools-client.tsx` gains a
  third source, "Pages from an image", with a file input
  (multiple, PNG/JPEG), and the `onInsert` handler branches
  to a new `runVersionToolForm` helper (FormData POST) for the
  image source. The section's description now mentions all
  three sources.

## 3. Tests

- **Unit: 436 passed, 0 failed, 9 skipped** (432 before + 4
  new in `src/lib/pdf-page-tools.test.ts`). The first full run
  had the same 16 failures as Day 32 — pre-existing, caused
  by a VM reset wiping /tmp/e2e/pdf1.pdf; rebuilt with
  `scripts/rebuild-fixtures.py`, then the suite went green.
  One new-test bug fixed in the work: `PDFName` was not
  imported in the test file.
- **Build passes** (the insert-pages route and the pdf-tools
  page are in the route table).
- **Live e2e CLOSED 2026-11-25 (16/16)** via
  `scripts/e2e-insert-image-test.mjs` (the Day 17/19 pattern):
  the tools page offers the option, one image inserts one
  page at the end (the neighbours' size, the image embedded,
  version 1 untouched), two images insert before page 2 in
  order, the JSON blank-page path still works, bad input is
  refused (a non-image file, no image at all, a position past
  the end), cross-user isolation, signed-out 307. One harness
  bug fixed in the work: the e2e fixture's text is "PDF One
  page N" (lowercase "page"), so the order check looked for
  "page 1"/"page 2"/"page 3", not "Page 1" etc.
- **The app was NOT running when the harness started** (curl
  :3000 returned 000 — it had stopped since the Day 32 run,
  probably a VM reset). Restarted with the Day 33 build
  (`fuser -k 3000/tcp`, then `setsid nohup npm run start -- -p 3000`);
  `/` 200.

## 4. Docs

- Feature matrix FORMA-041, known-limitations (the
  insert-from-image limits), CHANGELOG (Day 33), the audit
  §6.2 row → Done, FEATURE_LOOP item 17 → Done. MEMORY.md:
  restore the Day 32 entry (a background consolidation pass
  dropped it) and add Day 33.
- **No migration was needed** (no new table; the feature is
  pdf-lib drawing + the existing versions machinery).

## 5. Honest limits

- One image becomes one page (no collage, no cropping or
  rotation at insert time — crop/rotate the image before
  uploading, or use the page tools after inserting).
- The image is embedded at its original resolution (no
  downscaling), so a very large photo makes a large PDF.
- The new page is sized from its neighbours, so a portrait
  photo in a landscape document has white space at the sides.

## 6. Still owed after Day 33

- The follow-up list, in order: Day 25's "export with
  comments" + "local reviewer notes", deleting the /plan
  route, a live 390px render, the docserver reinstall. AI
  tools and cloud/collaboration/billing stay SKIPPED unless
  the owner restarts them.
- **Vercel deploy still blocked** (the team re-authorization —
  re-checked 2026-11-24: still 403 on muhmmad-anas-projects,
  list_teams empty). The app runs only on this VM at
  localhost:3000, which the owner cannot open from his own
  browser (he reported "no running" on 2026-11-21; the tunnels
  tried — Cloudflare Tunnel and localtunnel — are blocked by
  the egress policy). The owner can run it on his own machine
  from the GitHub repo, or unblock Vercel.
