# Day 26 plan — Compatibility test corpus (audit queue item 11)

Date: 2026-11-19. Owner instruction (21:08 PKT): "okay now
resume which feature you left and move to the next feature
with proper follow the loop.md to implement the feature".
The feature left was Day 25 sharing — closed first (the
migration is applied; the sharing harness re-ran 23/23 on
2026-11-19). This is audit queue item 11
(`docs/project-brief/FEATURE_AUDIT.md` §16 + §10):
a compatibility test corpus.

## 1. Research

### What a compatibility corpus is

In office software, a compatibility corpus is a fixed set of
representative documents that exercise the formats and the
features, run through the app's operations, and compared
before/after. It makes the format claims testable instead of
ad-hoc. The audit (§10) says the current state is: round-trip
proven live at the API level for DOCX, XLSX and PPTX only
(Day 10, 41/41); every other format is unproven; the e2e
fixtures are ad-hoc (a 3-page PDF, a styled PDF, a form PDF,
a CID PDF, a scanned PDF, a DOCX, a CSV). The named gaps are:
no mixed-font / table / image / header / footer /
section-break / footnote / chart / pivot / slide-master /
animation / password-protected corpus, and no page-count
comparison before/after round-trip. The corpus closes those
gaps. It can grow alongside the other features — v1
establishes the corpus + the runner + the core files.

### How the files are built

The project already has the pattern (Day 15/16): a Python
generator script is the source of truth and the generated
files are committed. The libraries available here:
- **python-docx 1.1.0** — DOCX: paragraphs, mixed fonts,
  tables, headers/footers, section breaks. Footnotes have
  NO high-level API — they need raw XML
  (`w:footnoteReference` + a `footnotes.xml` part).
- **openpyxl 3.1.2** — XLSX: multiple sheets, formulas,
  styled cells, charts (`openpyxl.chart`). Pivot tables
  have NO creation API in openpyxl — a pivot is a known
  gap for v1 (recorded, not faked).
- **python-pptx 1.0.2** (installed this day via pip
  `--break-system-packages`; pip packages do NOT survive a
  VM reset) — PPTX: slides, tables, charts, images.
  Animations have NO high-level API — they are `p:timing`
  XML; a simple entrance animation can be added as raw XML,
  or the animation is a known gap for v1.
- **PIL 10.2.0** — PNG/JPG images with text (for OCR and
  images-to-PDF).
- **LibreOffice 24.2.7.2** (in the base image) — converts
  the rich sources to the legacy formats (DOC, XLS, PPT)
  and the OpenDocument formats (ODT, ODS, ODP), and to PDF.
  This is how one rich source covers 5 formats.
- **pdf-lib** (in the project) — PDFs built in Node; qpdf
  (11.9.0, reinstalled after the reset) makes the
  password-protected PDF.
- **Corrupt files** are made by truncating a real file (or
  writing random bytes with the extension) — they test the
  refusal paths, not the happy path.

### What the runner checks (and what it skips)

The runner is a Node harness (`scripts/corpus-test.mjs`),
in the pattern of the e2e harnesses: it signs in test users
and drives the live app over HTTP. Per file it runs the
checks the manifest names:
- **upload** — the file uploads and appears in the library.
- **pdf-tools** — merge/split/rotate/compress keep the
  page count and produce a valid PDF (local, no docserver).
- **ocr** — OCR reads the expected text (scanned PDF +
  images; needs the OCR worker running).
- **security** — the protected PDF is refused by the
  pdf-lib paths and opens with the password via qpdf.
- **corrupt** — a corrupt file is refused with a clear
  error, not a crash.
- **images-to-pdf** — PNG/JPG become a valid PDF.
- **pdf-export** and **round-trip** (open in the editor,
  save, re-open) — these need the ONLYOFFICE docserver,
  which is still down (its .deb download returns 403).
  The runner SKIPS them with a clear "docserver down"
  note when the docserver is not reachable (the Day 14
  harness pattern: a `DOCSERVER_LIVE` flag at the top).
  Nothing is claimed as proven when it was skipped.
- **page-count** — the page count is compared before and
  after an operation (PDF tools, and the LibreOffice PDF
  conversion for office files). This is the audit's
  "page-count comparison before/after round-trip".

### Where it lives

- `corpus/` at the project root: the files + `manifest.json`.
  These are test data, NOT read by the app at runtime, so
  they do not live in `src/lib/` (unlike the blank templates,
  which the app reads). The files are committed to the local
  git repo so the corpus survives VM resets. (They are
  binaries, so they will NOT go through the GitHub snapshot
  push — the same 13-binary limit as the templates; the
  generator script IS pushed, so they are regenerable.)
- `scripts/generate-corpus.py` — the generator (the source
  of truth; it writes `corpus/manifest.json` so the manifest
  can never drift from the files).
- `src/lib/corpus.ts` — the pure module: the manifest types
  and validation (type guards), which checks apply to a
  file, and result formatting. Unit-tested.
- `scripts/corpus-test.mjs` — the runner.
- No UI page in v1 (the corpus is a developer/testing tool,
  like the other harnesses). A corpus page in the app is
  future work.

### Honest limits (v1)

- **No pivot table** in the XLSX (openpyxl cannot create
  one) and **no animation** in the PPTX (python-pptx has no
  animation API) — both are recorded as gaps, not faked.
  A pivot/animation can be added later by hand-editing the
  XML or via LibreOffice UNO.
- **Round-trip and PDF export are skipped** until the
  docserver is back — the runner says so plainly.
- The "huge file" edge case is a moderately large PDF
  (30 pages), not a 50 MB file — a near-limit file would
  make every run slow.
- The corpus is English-only in v1 (the OCR languages are
  covered by the Day 13 fixtures).

## 2. Tasks (small, ordered, each with its test)

1. **Pure module** — `src/lib/corpus.ts` (manifest types,
   `parseCorpusManifest`, `checksForFile`,
   `formatCorpusResult`) + `src/lib/corpus.test.ts`.
   Test: `npm test` (the new tests pass).
2. **Generator, part 1** — `scripts/generate-corpus.py`:
   the rich DOCX (mixed fonts, table, image, header,
   footer, section break, footnote), the rich XLSX
   (sheets, formulas, chart, styled cells), the rich PPTX
   (slides, table, chart, image), the plain TXT + CSV,
   the PNG + JPG (text images). Test: run it; the files
   open in LibreOffice / pdf-lib and contain the expected
   content.
3. **Generator, part 2** — derive the legacy + OpenDocument
   formats via LibreOffice (DOC, XLS, PPT, ODT, ODS, ODP);
   build the PDFs (rich PDF via LibreOffice from the DOCX,
   scanned PDF + large PDF via pdf-lib/PIL); make the
   password-protected PDF (qpdf) and the corrupt files;
   write `corpus/manifest.json`. Test: every file in the
   manifest exists, opens in its reader, and the manifest
   validates with the pure module.
4. **Runner, part 1** — `scripts/corpus-test.mjs`: read the
   manifest; upload each file; run the non-docserver checks
   (upload, pdf-tools, ocr, security, corrupt,
   images-to-pdf, page-count). Test: run it; every
   non-docserver check passes or fails honestly.
5. **Runner, part 2** — the docserver checks (pdf-export,
   round-trip) with a `DOCSERVER_LIVE` flag; skipped with
   a clear note while the docserver is down. Test: run it;
   the docserver checks report "skipped (docserver down)".
6. **Full test** — `npm test` (unit) + the runner end to
   end; fix failures. Test: unit count recorded; runner
   summary recorded.
7. **Docs + commit + handoff + reply** — update the
   feature matrix, known limitations, changelog, the audit
   (§16 item 11 → Done) and the loop queue (item 12 next);
   commit on `day-26-compatibility-corpus`; write
   `docs/handoffs/day-26.md`; tell the owner.

## 3. Files to create / change

- NEW `src/lib/corpus.ts`, `src/lib/corpus.test.ts`
- NEW `scripts/generate-corpus.py`
- NEW `corpus/` (the files + `manifest.json`)
- NEW `scripts/corpus-test.mjs`
- UPDATE `docs/feature-matrix.csv`, `docs/known-limitations.md`,
  `CHANGELOG.md`, `docs/project-brief/FEATURE_AUDIT.md`,
  `docs/project-brief/FEATURE_LOOP.md`, `~/MEMORY.md`
- NEW `docs/handoffs/day-26.md` (+ this plan file)
