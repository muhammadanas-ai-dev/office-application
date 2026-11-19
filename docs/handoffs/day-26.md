# Day 26 handoff — Compatibility test corpus (audit queue item 11)

Date: 2026-11-19. Owner instruction (21:08 PKT): "okay now
resume which feature you left and move to the next feature
with proper follow the loop.md to implement the feature".
The feature left was Day 25 sharing — closed first (the
migration is applied; the sharing harness re-ran 23/23 on
2026-11-19). This is audit queue item 11
(`docs/project-brief/FEATURE_AUDIT.md` §16 + §10):
a compatibility test corpus.

## 1. What was researched

- **What a compatibility corpus is.** A fixed set of
  representative documents that exercise the formats and
  the features, run through the app's operations, and
  compared before/after. It makes the format claims
  testable instead of ad-hoc. The audit (§10) said the
  state was: round-trip proven live at the API level for
  DOCX, XLSX and PPTX only (Day 10, 41/41); every other
  format unproven; the e2e fixtures ad-hoc. The named
  gaps were: no mixed-font / table / image / header /
  footer / section-break / footnote / chart / pivot /
  slide-master / animation / password-protected corpus,
  and no page-count comparison before/after round-trip.
- **How the files are built.** The project pattern
  (Day 15/16): a Python generator script is the source of
  truth and the generated files are committed.
  - **python-docx 1.1.0** — DOCX: paragraphs, mixed
    fonts, tables, headers/footers, section breaks.
    Footnotes have NO high-level API — they need raw XML
    (`w:footnoteReference` + a `footnotes.xml` part).
  - **openpyxl 3.1.2** — XLSX: sheets, formulas, styled
    cells, charts. Pivot tables have NO creation API.
  - **python-pptx 1.0.2** (installed this day via pip
    `--break-system-packages`; pip packages do NOT survive
    a VM reset) — PPTX: slides, tables, charts, images.
    Animations have NO high-level API.
  - **PIL 10.2.0** — PNG/JPG text images.
  - **LibreOffice 24.2.7.2** (in the base image) —
    converts the rich sources to the legacy formats (DOC,
    XLS, PPT) and OpenDocument (ODT, ODS, ODP), and to PDF.
  - **pdf-lib** (in the project) — PDFs in Node; **qpdf
    11.9.0** makes the password-protected PDF.
  - **Corrupt files** are a real file truncated to 200
    bytes (they keep the format's magic bytes, so the file
    is recognised but too short to parse).
- **What the runner checks (and skips).** The runner is a
  Node harness (`scripts/corpus-test.mjs`), in the e2e
  harness pattern: it signs in test users and drives the
  live app over HTTP. Per file it runs the checks the
  manifest names: upload, pdf-tools (rotate keeps the page
  count), ocr (the expected text), security (pdf-lib
  refuses the protected PDF with 400; qpdf opens it with
  the password), corrupt (a 4xx, not a 5xx), images-to-pdf
  (a valid one-page PDF), pdf-export and round-trip
  (both need the ONLYOFFICE docserver — SKIPPED with a
  clear note while it is down, the Day 14 pattern),
  page-count (stable across an operation for PDFs; the
  file renders to PDF via LibreOffice for office files).
- **Where it lives.** `corpus/` at the project root (test
  data, NOT read by the app at runtime — unlike the blank
  templates, which the app reads). The files are committed
  to the local git repo so the corpus survives VM resets.
  (They are binaries, so they will NOT go through the
  GitHub snapshot push — the generator IS pushed, so they
  are regenerable.) `scripts/generate-corpus.py` is the
  generator (it writes `corpus/manifest.json`, so the
  manifest can never drift from the files).
  `src/lib/corpus.ts` is the pure module (manifest types
  and validation, which checks apply, result formatting).
  No UI page in v1 (the corpus is a developer/testing
  tool, like the other harnesses).

## 2. Completed functionality

- **The corpus** (`corpus/`, 19 files + `manifest.json`):
  a rich DOCX (mixed fonts, table, image, header, footer,
  section break, footnote), a rich XLSX (formulas, chart,
  styled cells, 3 sheets), a rich PPTX (table, chart,
  image, 3 slides), the legacy formats (DOC, XLS, PPT)
  and OpenDocument (ODT, ODS, ODP) derived via
  LibreOffice, plain TXT + CSV, a rich PDF (2 pages), a
  scanned PDF (2 image-only pages), a 30-page PDF, a
  password-protected PDF (AES-256, password `corpus123` —
  the corpus fixture's public test password, not a real
  credential), a PNG + JPG text image, and a corrupt PDF
  + DOCX (truncated to 200 bytes).
- **The generator** (`scripts/generate-corpus.py`): builds
  every file and writes the manifest. Verified: the DOCX
  has the footnote part + reference, 1 table, 2 sections;
  the XLSX has the formulas (`=B2*C2`, `=SUM(D2:D5)`) and
  a chart; the PPTX has 3 slides with a table and a chart;
  the PDFs have the right page counts (2, 2, 30); the
  protected PDF is encrypted (R=6, P=-1340); the corrupt
  files are 200 bytes; the manifest lists 19 files and
  none is missing.
- **The pure module** (`src/lib/corpus.ts`):
  `CORPUS_CHECKS` (9 checks), `isCorpusCheck`,
  `needsDocserver` (pdf-export + round-trip),
  `parseCorpusManifest` (validates version, fields, an
  unknown check, a duplicate id, and a file name with a
  path separator — a manifest can never point outside
  `corpus/`), `checksForFile`, `formatCorpusResult`,
  `summariseCorpusResults`, `formatCorpusSummary`.
- **The runner** (`scripts/corpus-test.mjs`): reads the
  manifest, uploads each file as a test user, runs the
  checks, and reports pass/fail/skip with a summary.
  It also checks user B cannot download A's documents
  (404) for every file.
- **The fixture rebuild script**
  (`scripts/rebuild-fixtures.py`): rebuilds the /tmp
  fixtures the unit tests need (pdf1.pdf, debug-export.pdf,
  img.pdf) — the Day 24 handoff suggested committing one
  so the next VM reset is a one-command recovery. It
  hand-builds debug-export.pdf (a Type0/CID font with NO
  ToUnicode, one run at (50, 750), size 10 — pdftotext
  shows only control characters) and img.pdf (a
  1500x1500 seeded-noise PNG at 500x500).

## 3. Code and data changes

- `src/lib/corpus.ts` (new, pure) + `src/lib/corpus.test.ts`
  (new, 17 tests, incl. one that validates the real
  committed `corpus/manifest.json` and that every file in
  it exists).
- `scripts/generate-corpus.py` (new) + `corpus/` (new:
  19 files + `manifest.json`).
- `scripts/corpus-test.mjs` (new, the runner).
- `scripts/rebuild-fixtures.py` (new) + the temporary
  Node helpers it writes (`scripts/build-pdf1-helper.mjs`,
  `scripts/build-corpus-pdf.mjs`, `scripts/build-img-helper.mjs`
  — generated at run time, not committed as source).
- Docs: `docs/handoffs/day-26-plan.md`,
  `docs/feature-matrix.csv` (FORMA-035),
  `docs/known-limitations.md` (the corpus limits),
  `CHANGELOG.md` (Day 26 entry + the Day 25 entry
  corrected to 23/23), `docs/project-brief/FEATURE_AUDIT.md`
  (§10 corpus note + §16 item 11 → Done),
  `docs/project-brief/FEATURE_LOOP.md` (queue: item 11
  Done, Hardening next), `~/MEMORY.md` (Day 26 entry).

## 4. Tests

- **Unit: 338/338 (28 files passed, 1 skipped, 9 tests
  skipped — the pre-existing skips).** 17 new in
  `src/lib/corpus.test.ts` (the check names, the docserver
  checks, the manifest validation — version, duplicate id,
  path separator, unknown check, no checks, missing fields
  — the result formatting and summary, and the real
  committed manifest). **Note:** the first full run after
  the VM reset showed 4 failures in `pdf-content.test.ts`
  / `pdf-edit.test.ts` — all four needed the /tmp fixtures
  (debug-export.pdf and img.pdf) that the reset had wiped.
  Rebuilt with the new `scripts/rebuild-fixtures.py` and
  the full suite went to 338/338.
- **Live e2e (the corpus runner): 56 passed, 0 failed,
  22 skipped (78 total)** (`scripts/corpus-test.mjs`).
  Every non-docserver check passes: upload + user B
  isolation for all 19 files, pdf-tools (rotate keeps the
  page count) for the 4 PDFs, page-count for every file,
  OCR for the scanned PDF + PNG + JPG, security for the
  protected PDF, corrupt for both corrupt files, and
  images-to-pdf for both images. The 22 skips are all the
  docserver checks (pdf-export + round-trip, 11 files × 2)
  while the docserver is down. The first run was 53/78
  with 3 OCR failures — the OCR text has line breaks
  ("Forma Office\nCompatibility Corpus") while the
  expected text is one line, so the runner now collapses
  all whitespace before comparing (the fix is in the
  runner, not the corpus — Tesseract reads the image
  correctly).
- **Typecheck, lint, build: pass.** Prettier applied to
  the Day 26 TS/JS files (the .py files are not handled
  by prettier).

## 5. Deployment verification

- App rebuilt and restarted on :3000 (the Day 26 build);
  `/api/supabase-status` returns 200. The OCR worker was
  restarted after the VM reset.
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.

## 6. Security/licensing checks

- No new engine licence to clear: the corpus is Forma's
  own documents, built with python-docx / openpyxl /
  python-pptx / PIL / LibreOffice / pdf-lib / qpdf. No WPS
  feature, branding or font is used.
- The protected PDF's password (`corpus123`) is the corpus
  fixture's PUBLIC test password — it is in the manifest so
  the runner can verify qpdf opens it. It is not a real
  credential and must never be one.
- No secrets in code. The corpus files are test data; the
  runner uses test users that it deletes in `finally`.

## 6b. Verification notes and fixes made during Day 26

- **A VM reset happened before Day 26 started** (the app
  was down, qpdf was gone, /tmp was wiped). Recovery:
  qpdf 11.9.0 reinstalled (the apt lock was held by the
  system's own replay — waited for it to finish, then the
  install reported "already the newest version"), pdf1.pdf
  rebuilt, the app rebuilt + restarted on :3000, the OCR
  worker restarted. **The Day 25 sharing harness was
  re-run first (23/23) to close Day 25 properly.**
- **The footnote relationship belongs on the DOCUMENT part.**
  The first generator put the footnotes part on the
  package (`doc.part.package.relate_to`) — the content
  type was registered but `word/_rels/document.xml.rels`
  had no footnotes relationship, so LibreOffice refused
  the DOCX ("source file could not be loaded").
  **Fix: `doc.part.relate_to(part, RT.FOOTNOTES)`.**
- **LibreOffice names a conversion `<source-stem>.<format>`.**
  The generator first wrote `docx-rich.doc` /
  `docx-rich.odt` but the manifest expected `doc-rich.doc`
  / `odt-rich.odt`. **Fix: rename after each conversion.**
- **OCR text has line breaks.** The first runner run
  failed the 3 OCR checks because Tesseract returns
  "Forma Office\nCompatibility Corpus" while the expected
  text is one line. **Fix: the runner collapses all
  whitespace (`/\s+/g` → a single space) before comparing.**
- **The /tmp fixtures are now rebuildable in one command.**
  `scripts/rebuild-fixtures.py` rebuilds pdf1.pdf,
  debug-export.pdf and img.pdf. It also fixed the 4 unit
  failures the VM reset caused. **The helper .mjs files it
  writes are generated at run time** (they are not
  committed as source).

## 7. Known defects and limitations

- **No pivot table** in the XLSX (openpyxl cannot create
  one) and **no animation** in the PPTX (python-pptx has
  no animation API) — both are recorded as gaps, not faked.
- **Round-trip and PDF export are unproven** until the
  docserver is back — the runner skips them honestly.
- The "huge file" edge case is a 30-page PDF, not a 50 MB
  file — a near-limit file would make every run slow.
- English-only in v1. No UI page in v1.
- The corpus files are binaries, so they do NOT go through
  the GitHub snapshot push — the generator is pushed, so
  they are regenerable from the repo.
- The pip packages (python-docx, openpyxl, python-pptx)
  do NOT survive a VM reset — reinstall them if the
  generator fails with ModuleNotFoundError.

## 8. Tomorrow's target

- **Next feature in the queue: Hardening (#12).**
  Byte-signature upload validation, auth rate limiting,
  error reporting/monitoring, backup/restore procedures,
  privacy disclosures, and a full licence audit. The plan
  will break it into its sub-items (it is the release gate,
  so it is bigger than one day's single feature — the plan
  decides the order).
