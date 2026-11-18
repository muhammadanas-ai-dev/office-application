# Day 13 plan — OCR (Phase C) with Tesseract, built from source

Date: 2026-11-18. Owner instruction (14:39 PKT): "okay go
Tesseract ocr with this cloned and setup make a separte folder
in the project root directory and then setup there and then like
with the application properly and implement the feature by
following the feature looping to how to integrate this properly
with proper enigneering not a patch coding avoid this patch
coding and follow the looping feature .md to implement the ocr
in the application". This day follows the standing loop
(research → plan → small tasks → implement → test).

## 1. Research — the engine (done before this plan)

The owner chose Tesseract after a GitHub comparison (stars,
forks, license, Urdu support — see the 2026-11-18 14:31
research): tesseract-ocr/tesseract, 77,574 stars, 10,919
forks, Apache 2.0, C++, updated 2026-11-15. English, Urdu and
Arabic language packs all exist. It is a command-line program,
not a library — the app calls it and it returns text. Nothing
is sent to an outside service.

## 2. Research — how to build it from source (done)

- **What Tesseract needs:** Leptonica (the image library) —
  Tesseract cannot build without it. Leptonica needs the image
  dev libraries: libpng, libjpeg, libtiff, zlib.
- **What this machine has:** cmake 3.28.3, g++ 13.3, make,
  pkg-config, git, curl; libpng-dev and zlib1g-dev already
  installed; 138 GB free disk. Node v24.22.1 (runs TypeScript
  directly — no tsx needed for the worker).
- **What is missing, and the fix:** libjpeg-dev installed via
  apt (works). libtiff-dev is BLOCKED — apt reports unmet
  dependencies (libzstd-dev wants libzstd1 1.5.5+dfsg2-2build1.1
  but 1.5.5+dfsg2-2build1.1+hatch1 is installed; held broken
  packages). So Leptonica is built WITHOUT TIFF support
  (`--without-libtiff`). That is acceptable: the pipeline renders
  PDF pages to PNG and accepts PNG/JPEG uploads — TIFF is not
  on the OCR path, and the limitation is recorded.
- **Where it lives:** `ocr/` in the project root (a separate
  folder, as instructed) — `ocr/tesseract/` (clone, tag 5.5.4,
  shallow), `ocr/leptonica/` (clone, shallow), `ocr/vendor/`
  (the local install prefix: bin, lib, include), `ocr/tessdata/`
  (the language data: eng, urd, ara, from tessdata_fast).
  Everything under `ocr/` persists across VM resets (the home
  directory persists; apt-installed packages do not) — that is
  why the engine lives in the project, not in /usr.
- **Linking:** Leptonica is built shared into `ocr/vendor/lib/`,
  and Tesseract is built against it with an rpath of
  `$ORIGIN/../lib`, so the binary finds its own libraries
  wherever the project folder sits. Verified with `ldd`.
- **Language data:** tessdata_fast (the fast models — smaller,
  good accuracy; the "best" models are much larger). Set
  `TESSDATA_PREFIX=ocr/tessdata`. English first; Urdu and
  Arabic installed at the same time, tested before any claim.
- **How the app calls it:** `execFile` on the built binary
  (absolute path from an env var `OCR_TESSERACT_BIN`, defaulting
  to `ocr/vendor/bin/tesseract`), with `TESSDATA_PREFIX` set.
  Output as TSV (`--psm 3` default, `tsv` output) so every word
  carries a confidence score. A run is bounded: a timeout per
  page (30 s) and a page cap per job (20 pages for v1).
- **PDF pages → images:** `pdftoppm` (poppler-utils 24.02.0,
  already installed) renders each page to PNG at 300 DPI.
  pdf-lib cannot render pages, so this is the rendering step.
- **Why a worker, not a synchronous route:** OCR takes seconds
  per page, so a 20-page scan cannot finish inside one web
  request. The production-grade shape is a job queue: the route
  enqueues a job and returns immediately; a worker process
  polls the jobs table, claims one job, renders the pages, runs
  Tesseract per page, stores the text + confidence, and marks
  the job done/failed. The UI polls the job status. The worker
  is a separate Node process (`node ocr/worker.mjs` — see §4),
  started alongside the app and documented in `ocr/README.md`.
  Stale "processing" jobs (a worker that died mid-job) are
  re-queued on worker start.

## 3. Small tasks (in order)

1. Build Leptonica into `ocr/vendor/` (autogen.sh, configure
   --prefix=... --without-libtiff, make, make install).
2. Build Tesseract 5.5.4 into `ocr/vendor/` (cmake, prefix,
   Leptonica from the local build, rpath $ORIGIN/../lib).
3. Fetch tessdata_fast eng/urd/ara into `ocr/tessdata/`.
4. Verify the binary: `--version`, `--list-langs`, OCR a
   generated English test image and a generated Urdu test image;
   record the results in `ocr/README.md`.
5. `src/lib/ocr.ts` (pure, unit-testable): run Tesseract on an
   image (execFile, timeout, TSV parse → words with confidence),
   render PDF pages to PNGs (pdftoppm), OCR one file
   (PDF or image) page by page.
6. Migration `20261118050000_forma_ocr.sql`: `ocr_jobs`
   (id, document_id, user_id, status, language, page_count,
   processed_pages, error, timestamps) and
   `document_ocr_results` (id, document_id, job_id, page_number,
   text, mean_confidence, language, timestamps); RLS (owner
   only, via the document's workspace); a combined file for the
   dashboard paste.
7. `ocr/worker.mjs` (the worker process): polls `ocr_jobs`
   for pending jobs, claims one (status guard), downloads the
   file from Storage, renders + OCRs it, stores the results,
   marks the job done/failed; re-queues stale processing jobs
   on start; logs to stdout.
8. Routes: `POST /api/documents/[id]/ocr` (enqueue; Zod:
   language eng/urd/ara, default eng; refuses non-PDF/image,
   refuses a job already pending/processing) and
   `GET /api/documents/[id]/ocr` (job status + results).
9. UI: `/documents/[id]/ocr` — start OCR (language picker),
   status/progress, the extracted text per page with its
   confidence, a copy button; a "OCR" link in the library for
   PDF and image documents.
10. Unit tests: `src/lib/ocr.test.ts` — TSV parsing, the
    timeout, the page cap, a real OCR run on a generated image
    (English, and Urdu if the pack verifies).
11. Live e2e: extend the harness — upload a scanned PDF built
    from known text, enqueue OCR, wait for the worker, check
    the expected words come back with a confidence, check the
    original file is untouched, cross-user 404, signed-out 307.
12. Docs + commit + handoff + memory.

## 4. The worker, and what it needs to run

- `node ocr/worker.mjs` (from the project root). It reads
  `.env.local` for the Supabase URL + service role key and the
  Tesseract binary path. It runs until stopped (Ctrl-C).
- It is a separate process from `next start`, started the same
  way (a background process on this VM). It does not survive a
  VM reset — the start command is in `ocr/README.md` and in
  the Day 13 handoff, next to the app's own start command.
- The migration must be applied in the Supabase dashboard
  (the owner pastes the combined file, as for Days 3–6) before
  the live e2e can run — the jobs/results tables must exist in
  the cloud project. The engine, the worker logic and the unit
  tests are proven before that step; the live e2e runs after
  the owner confirms the migration.

## 5. Acceptance

- A scanned PDF or image uploaded to Forma returns its text,
  per page, with a confidence score; the text is stored and
  shown in the UI; the original file is never changed.
- English OCR is proven on a generated test image and on a
  scanned PDF in the live e2e. Urdu is claimed only if its
  test image reads correctly (the plan's acceptance: no OCR
  claim without a tested language pack).
- A job that fails (a corrupt file, a timeout) is marked failed
  with a clear error, not stuck in "processing".
- Another user cannot start OCR on, or read the results of,
  a document they cannot access (404); a signed-out user is
  redirected (307).
- The engine lives in `ocr/` in the project root, built from
  the cloned source, and the app calls that binary — no
  apt-installed Tesseract, no cloud OCR service.
