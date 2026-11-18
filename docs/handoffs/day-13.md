# Day 13 handoff — OCR for scanned files (Phase C)

Date: 2026-11-18. Owner instruction (14:39 PKT): "okay go
Tesseract ocr with this cloned and setup make a separte folder
in the project root directory and then setup there and then like
with the application properly and implement the feature by
following the feature looping to how to integrate this properly
with proper enigneering not a patch coding avoid this patch
coding and follow the looping feature .md to implement the ocr
in the application". Standing loop applied: research → plan →
small tasks → implement → test.

## 1. What was researched

- **The engine (owner chose after a GitHub comparison).**
  `docs/handoffs/day-13-ocr-research.md` (loop step 1, before
  the build): GitHub stars/forks/license/Urdu, live from the
  API on 2026-11-18 — PaddleOCR 92,842 stars (heaviest, Python,
  Urdu unverified), Tesseract 77,574 (Apache 2.0, urd/ara packs
  exist), Umi-OCR 48,789 (a Windows desktop app, not a library),
  tesseract.js 38,841 (same engine in JS), OCRmyPDF 35,342 (a
  wrapper, not an engine), EasyOCR 30,151 (Urdu verified, but
  PyTorch — gigabytes, slow on CPU), Surya 21,604 (no Urdu in
  its listed languages), DeepSeek-OCR 24,177 (needs a GPU).
  The owner picked Tesseract.
- **How to build it from source.** Tesseract needs Leptonica.
  This machine has cmake 3.28.3, g++ 13.3, make, pkg-config,
  git, curl, libpng-dev, zlib1g-dev, 138 GB free. libjpeg-dev
  installed via apt. libtiff-dev is BLOCKED (apt: libzstd-dev
  wants libzstd1 1.5.5+dfsg2-2build1.1 but
  1.5.5+dfsg2-2build1.1+hatch1 is installed; held broken
  packages) — so Leptonica was built `--without-libtiff` and
  TIFF is refused by the feature. autoconf/automake/libtool
  were installed for Leptonica's autogen.sh. Node v24.22.1
  runs TypeScript directly (no tsx needed for the worker).
- **How the app calls it.** `execFile` on the built binary,
  output `tsv`, `--psm 6`, one run per page, a 30 s timeout
  per page; the TSV gives per-word confidence. PDF pages are
  rendered with `pdftoppm` (poppler-utils 24.02.0, already
  installed) at 300 DPI — pdf-lib cannot render pages.
  OCR takes seconds per page, so it runs as a background job,
  not inside a web request (the design the owner was told
  before the build).
- **Two build gotchas, both found by running it.** (1) The
  `tsv` config was silently ignored until the configs were
  copied into the tessdata dir — Tesseract looks for its
  `tsv`/`hocr` configs next to the language data, and the
  install puts them under `vendor/share/tessdata/configs/`.
  (2) CMake's TIFF check falsely reports "Leptonica was build
  with TIFF support" (its link test fails but the message
  prints anyway) — harmless, but `--list-langs` prints
  `Error in pixReadMemTiff: function not present`, which is
  cosmetic and does not affect PNG/JPEG OCR.

## 2. Completed functionality

- **The engine, built from source in `ocr/`** (a separate
  folder in the project root, as instructed): `ocr/tesseract/`
  (clone, tag 5.5.4), `ocr/leptonica/` (clone), `ocr/vendor/`
  (the local install prefix — bin, lib, include), `ocr/tessdata/`
  (tessdata_fast eng/urd/ara + configs). The binary finds its
  own libraries through an rpath of `$ORIGIN/../lib` (verified
  with `ldd`). Everything under `ocr/` persists across VM
  resets (the home directory persists; apt packages do not) —
  that is why the engine lives in the project, not in /usr.
  The clones and the built binaries are gitignored (install
  artifacts, like node_modules); the committed source of truth
  is `ocr/README.md` + `ocr/worker.ts` + `ocr/tessdata/`.
- **OCR a file (PDF, PNG or JPEG).** `src/lib/ocr.ts`:
  `ocrDocument` (PDF → render pages with pdftoppm → Tesseract
  per page; image → one page), `ocrImageFile` (execFile with a
  timeout, TSV parse), `parseTesseractTsv` (words + line-broken
  text + mean confidence), the guards (20-page cap, accepted
  MIME types, TIFF refused with a clear message). The original
  file is never modified.
- **Jobs + a worker.** Migration `20261118050000_forma_ocr.sql`:
  `ocr_jobs` (status pending/processing/done/failed, language,
  page_count, processed_pages, error) with a unique index for
  one active job per document, and `document_ocr_results` (one
  row per page: text, mean_confidence, language); RLS on the
  documents pattern (workspace_id + app_private helpers) plus
  the grants (the grants were missing at first — the local RLS
  run caught it, T19b failed, and the fix went into the
  migration). `ocr/worker.ts`: `node ocr/worker.ts` polls for
  pending jobs, claims one (status guard), downloads the file
  from private Storage, OCRs it, stores the results, marks the
  job done/failed; stale "processing" jobs are re-queued on
  start. It reads `.env.local` itself (it is not a Next.js
  process) and uses the service role key.
- **Routes.** `POST /api/documents/[id]/ocr` (enqueue;
  Zod language eng/urd/ara, default eng; 409 when a job is
  already in progress; 400 for a non-OCR file; rate-limited
  10/min) and `GET /api/documents/[id]/ocr` (latest job +
  its results, RLS-enforced).
- **UI.** `/documents/[id]/ocr` — language picker, Start OCR,
  status/progress (polls every 3 s while a job is active), the
  extracted text per page with its confidence, Copy all; an
  honest empty state when the document was never OCR'd and a
  clear error when a job fails. An "OCR" link in the library
  for PDF, PNG and JPEG documents.
- **Verified engine numbers.** English test image reads
  exactly (13 words, mean confidence 96.3). Urdu test image:
  "یہ ایک اردو جانچ ہے" reads exactly; "فارما آفس" came back
  as "فارما آفقفس" (one extra character) — Urdu is usable,
  not perfect, and the claim is recorded that way.

## 3. Code and data changes

- `ocr/` (new): `tesseract/`, `leptonica/` (clones, gitignored),
  `vendor/` (built binaries/libs, gitignored), `tessdata/`
  (eng/urd/ara + configs), `worker.ts`, `README.md`.
- `src/lib/ocr.ts` (new): the engine. `src/lib/ocr.server.ts`
  (new): rate limiter, `fetchOcrDocument` (RLS, PDF/PNG/JPEG),
  `enqueueOcrJob` (23505 → 409), `getLatestOcrJobAndResults`.
- `src/app/api/documents/[id]/ocr/route.ts` (new): POST + GET.
- `src/app/(workspace)/documents/[id]/ocr/page.tsx` (new) +
  `src/components/ocr/ocr-client.tsx` (new): the OCR page.
- `src/components/library/library-forms.tsx` +
  `library-list.tsx`: an `ocrHref` prop and the "OCR" link.
- `supabase/migrations/20261118050000_forma_ocr.sql` (new):
  the two tables, the unique active-job index, RLS + grants.
  A copy for the dashboard paste:
  `~/workspace/your_files/forma-ocr-migration.sql`.
- `src/types/database.types.ts`: the two tables added by hand
  (same DRAFT note as the other tables — replace with
  `supabase gen types` once live).
- `tsconfig.json`: `ocr/tesseract`, `ocr/leptonica`, `ocr/vendor`
  excluded (CMake writes `compiler_depend.ts` files that tsc
  tried to typecheck), and `allowImportingTsExtensions: true`
  (the worker imports its engine by a `.ts` path, which Node's
  native TS runner needs).
- `supabase/tests/rls-local.sql`: T19a–f (outsider cannot
  enqueue/read/insert; editor can enqueue/insert; a second
  active job is refused). `scripts/verify-rls-local.sh`:
  applies the Day 13 migration.
- `src/lib/ocr.test.ts` (new, 15 tests) + fixtures
  `src/lib/__fixtures__/ocr-english.png` and `ocr-urdu.png`
  (known text, rendered with DejaVu Sans / Noto Sans Arabic).
- `.gitignore`: the clones + `ocr/vendor/` are install artifacts.
- Docs: `docs/handoffs/day-13-ocr-research.md`,
  `docs/handoffs/day-13-plan.md`, `WPS_LEVEL_PLAN.md` (OCR →
  Done, with the live-e2e caveat), `docs/feature-matrix.csv`
  (FORMA-022), `docs/known-limitations.md` (OCR limits),
  `CHANGELOG.md` (Day 13 entry).

## 4. Tests

- **Unit: 172/172 (17 files, 9 skipped — the pre-existing
  skips).** The 15 new OCR tests pass: the TSV parser (words,
  line breaks, mean confidence, malformed input), the language
  and MIME guards, a real OCR run on the English fixture
  (reads exactly, confidence > 90), a real run on the Urdu
  fixture (the second line exactly, confidence > 50), a
  missing binary giving a clear 503, a single-image OCR, a
  PDF built from the fixture text, a non-OCR file refused,
  a PDF over the 20-page cap refused, invalid PDF bytes refused.
- **Local RLS: PASSED (T19a–f added).** The run caught a real
  bug: the migration had no grants, so the editor got
  "permission denied for table ocr_jobs" — fixed in the
  migration, re-run green.
- **Live RLS: 9/9 (unchanged, re-run on Day 11).** Not re-run
  on Day 13 — the OCR tables do not exist live yet (see §5).
- **Typecheck, lint, build: pass.** Two fixes on the way: the
  tsconfig exclusions (CMake's `.ts` files) and the
  `allowImportingTsExtensions` flag (the worker's `.ts`
  imports); the OCR client's initial load was restructured so
  no setState runs synchronously in an effect
  (`react-hooks/set-state-in-effect`).
- **Worker smoke test:** `node ocr/worker.ts` starts, connects
  to Supabase, and reports the missing table honestly
  ("Could not find the table 'public.ocr_jobs' in the schema
  cache") — it cannot process a job until the migration is live.
- **Live e2e: 22/22 PASSED (2026-11-18, after the owner applied
  the migration).** `scripts/e2e-ocr-test.mjs` (a focused harness
  — the full edit harness needs its /tmp fixtures, which a VM
  reset wiped; the edit/form/builder sections were already
  proven 70/70 on Day 12). As a real signed-in user A: a
  2-page scanned PDF (image-only, no text layer) enqueued and
  finished done; page 1 reads "Forma Office OCR test / The
  quick brown fox jumps / over the lazy dog" and page 2 reads
  "Second page of the scan / Pack my box with five dozen /
  liquor jugs", page 1 confidence 96.18; the document stayed
  version 1 with byte-identical v1; a Urdu image finished done
  with "یہ ایک اردو جانچ ہے" exactly (first line shows the
  known one-character error, "فارما آفقفس"); a plain-text file
  refused 400, an unsupported language refused 400, a second
  job while one is in progress refused 409; user B gets 404 on
  enqueue and status; signed-out gets 307 on both; the OCR
  page loads for A and shows "Document not found" for B.
- **A real gap found by the live e2e and fixed the same day:**
  PNG/JPEG could not be uploaded at all — the `documents`
  bucket's allowed MIME types and the app's
  ALLOWED_UPLOAD_TYPES only listed the 12 office formats, so
  the image side of OCR was unreachable through the UI. Fixed:
  the bucket now allows image/png + image/jpeg (migration
  20261118060000, applied live through the Storage API, and
  recorded in that file) and the upload list accepts PNG/JPG;
  the file picker's `accept` list follows the map
  automatically. The storage unit test that asserted PNG was
  rejected was updated (it now rejects BMP) and a new test
  asserts PNG/JPEG are accepted. Unit tests 173/173 after the
  fix (172 + the new storage test).

## 5. Deployment verification

- App rebuilt and restarted on :3000 (new build, OCR route
  and page included); `/api/supabase-status` returns 200.
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.
- **Owner step (one paste):** apply
  `~/workspace/your_files/forma-ocr-migration.sql` in the
  Supabase Dashboard SQL Editor (the same paste as Days 3–6),
  then say "migration applied" and the live e2e runs.
  **DONE 2026-11-18 15:15 PKT** — the owner applied it; both
  tables verified live (200) and the live e2e ran 22/22 (§4).
- **VM RESET during the live e2e run (2026-11-18 ~15:19 PKT).**
  The service restarted mid-harness: /tmp was wiped (all
  fixtures + logs), the app and the worker were stopped, and
  the local Postgres install was gone (`service postgresql
  start` reports "Unit postgresql.service not found" — the
  package was wiped, not just stopped). Recovered: the app
  rebuilt + restarted on :3000 (200), the worker restarted
  (from the project root — the first attempt ran from /home
  and failed with MODULE_NOT_FOUND, a reminder that a
  backgrounded `cd` does not carry to a later `setsid` in the
  same command), the OCR fixtures rebuilt, the harness
  re-run as a focused OCR script. The local Postgres reinstall
  is still owed (the local RLS re-run is blocked on it, but
  the live e2e does not need it). The interrupted harness run
  left its test users in Supabase (the finally block never
  ran) — the next harness run creates fresh users; the stale
  ones should be cleaned up in the dashboard when convenient.
- **Worker:** start it next to the app with
  `node ocr/worker.ts` from the project root. It does not
  survive a VM reset — restart it with the app. It logs to
  stdout. (A cosmetic Node warning about the module type
  appears on start — the worker runs as ESM anyway.)

## 6. Security/licensing checks

- Tesseract 5.5.4 + Leptonica 1.88.0: Apache 2.0 (Tesseract)
  and the Leptonica licence (BSD-style) — no SaaS disclosure
  duty, no white-labelling restriction. tessdata_fast models:
  the same Tesseract licence. No cloud OCR service is used;
  the file never leaves this machine.
- No secrets in code or in the repo. The worker reads the
  service role key from `.env.local` only, and never logs a
  value. The OCR routes use the signed-in user's client
  (RLS) for enqueue/status; the worker uses the service role
  only to process jobs that were enqueued by an authorised user.
- The OCR rate limiter is per-process in-memory (10/min),
  the same as the PDF tools — a shared limiter is the
  multi-instance hardening item (unchanged).

## 6b. Verification notes and fixes made during Day 13

- The grants were missing from the OCR migration (T19b failed
  with "permission denied for table ocr_jobs") — fixed in the
  migration, not in the test.
- The `tsv` config was silently ignored until the configs were
  copied into `ocr/tessdata/configs/` — the engine now writes
  real TSV (verified: 13 words, mean confidence 96.3).
- `allowImportingTsExtensions` was needed for the worker's
  `.ts` imports; the CMake `.ts` files needed a tsconfig
  exclusion. Both are one-line config changes, recorded in §3.
- The OCR client's initial load was restructured for the
  `react-hooks/set-state-in-effect` lint rule (the fetch is an
  async continuation, not a synchronous setState in the effect).

## 7. Known defects and limitations

- **Live e2e not run** — the migration is not applied live
  yet (owner step, §5). The engine is proven by unit tests
  and direct CLI runs, not by a live user round-trip.
- **No TIFF support.** Leptonica was built without it
  (libtiff-dev cannot install here). TIFF images are refused
  with a clear message. The pipeline renders PDF pages to PNG
  and accepts PNG/JPEG, so TIFF is not on the path.
- **Urdu is usable, not perfect.** One character error on a
  two-line test image. Accuracy depends on the font and the
  scan; no claim beyond that is made.
- **20 pages per job** (v1 cap). Handwriting is not recognised.
  Tables/layouts come out as plain text.
- **The worker must be running** for jobs to complete, and it
  does not survive a VM reset. A job left "processing" by a
  dead worker is re-queued on the next worker start (10 min).
- **Cosmetic:** `--list-langs` prints TIFF errors (the missing
  TIFF support); the worker prints a Node module-type warning
  on start. Neither affects OCR.
- **tessdata_fast models** (not the "best" models) — smaller,
  a little less accurate. Switching is a one-line change
  (replace the three `.traineddata` files).

## 8. Tomorrow's target

- **First: the live e2e, once the owner confirms the
  migration.** Extend the harness: upload a scanned PDF built
  from known text (English) and an Urdu image, enqueue OCR
  through the route as user A, wait for the worker, check the
  expected words come back with a confidence, check the
  original file is untouched (same version, same bytes), check
  a second enqueue while one is in progress is refused (409),
  cross-user 404, signed-out 307. **DONE 2026-11-18 — 22/22,
  §4.** The WPS plan row's "pending" caveat is dropped.
- **Next feature in the queue: the conversion hub (Phase D).**
  Convert between the 12 formats (DOCX/XLSX/PPTX/PDF and the
  rest) through the ONLYOFFICE ConvertService — the same
  research → plan → small tasks → implement → test loop.
  Note: the ConvertService live checks still need the
  document server, which is wiped (see Day 11).
