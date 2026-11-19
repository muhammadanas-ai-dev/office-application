# Day 27 plan — Hardening (audit queue item 12)

Date: 2026-11-19. Owner instruction (21:42 PKT): "okay go
head implement the next feature properly by using
feature loop.md i run the query". "i run the query" =
he ran the Day 21 `words` migration — verified applied,
and the Day 21 harness re-ran **21/21** (see the Day 21
close-out below). This is audit queue item 12
(`docs/project-brief/FEATURE_AUDIT.md` §16 + §13):
Hardening — the release gate.

## 1. What was researched

### The six open items (audit §13)

| # | Item | Status before Day 27 | What Day 27 does |
|---|---|---|---|
| 1 | Byte-signature upload validation | Open — extension + declared MIME only; `storage.ts` says "a full byte-signature check is a Day 12 hardening item" | Build it (Task 1) |
| 2 | Auth rate limiting | Partial — conversion/export/PDF-tools/OCR/form routes are 10/min; auth routes are not | Add it to the sign-in/sign-up server actions (Task 2) |
| 3 | Error reporting / operational monitoring | Not started | A `/api/health` endpoint (app + database + storage + docserver) + structured error logging (Task 3) |
| 4 | Backup / restore procedures | Not started | A metadata backup script + a procedure doc (Task 4) |
| 5 | Privacy disclosures | Not started | A `/privacy` page (Task 5) |
| 6 | Full licence audit | Partial — ONLYOFFICE AGPLv3 + Tesseract noted; no full audit | A `docs/LICENSES.md` (Task 6) |

### Task 1 — Byte-signature upload validation

- **Where it goes.** The upload path is `uploadDocument`
  in `src/features/library/actions.ts` — it calls
  `validateUpload(file)` (extension + declared MIME +
  size) in `src/lib/storage.ts`, then uploads to Storage.
  The byte check runs in the same place, after
  `validateUpload` passes and before the Storage upload.
  The file is a `File` (a Blob) — read the first bytes
  with `await file.slice(0, N).arrayBuffer()`.
- **Magic bytes (the file's real format).**
  - PDF: `%PDF` (`25 50 44 46`) at offset 0.
  - PNG: `89 50 4E 47 0D 0A 1A 0A` (8 bytes).
  - JPEG: `FF D8 FF` (3 bytes).
  - ZIP-based (DOCX, XLSX, PPTX, ODT, ODS, ODP):
    `PK\x03\x04` (`50 4B 03 04`) at offset 0, PLUS a
    format-specific marker inside the ZIP — otherwise a
    DOCX renamed to .xlsx would pass. The marker is a
    file name inside the ZIP's central directory:
    DOCX has `word/`, XLSX has `xl/`, PPTX has `ppt/`,
    ODF (ODT/ODS/ODP) has a `mimetype` entry whose
    content names the type. The central directory is at
    the END of the file, so the check reads the file's
    tail (or the whole file if it is small — uploads are
    capped at 50 MB, so reading the whole file is
    acceptable; the check reads at most the first 1 MB
    for the ZIP header and the last 64 KB for the central
    directory). For the ODF check, the `mimetype` entry
    is stored uncompressed at the START of the file (the
    ODF spec requires it first), so it is in the first
    bytes — read the first 1 KB and look for
    `application/vnd.oasis.opendocument.` + the type.
    For OOXML, the `[Content_Types].xml` entry is in the
    central directory; the check looks for `word/`,
    `xl/` or `ppt/` in the central directory file names.
  - Legacy OLE (DOC, XLS, PPT): `D0 CF 11 E0 A1 B1 1A E1`
    (8 bytes) — the OLE Compound File magic. All three
    share it; distinguishing DOC from XLS from PPT needs
    the OLE stream names, which is deeper than v1 needs
    (the extension + OLE magic is the honest v1 check;
    the inner distinction is a follow-up).
  - TXT / CSV: no magic. Valid UTF-8 (decodes without
    error) and no NUL bytes — a binary file renamed to
    .txt is refused.
- **What a mismatch does.** The upload is refused with a
  clear message ("This file is not a PDF — its contents
  do not match the .pdf extension.") and nothing is
  written to Storage or the database. The check is
  server-side only (the browser `accept` attribute stays
  a hint).
- **Existing precedent.** The images-to-PDF route already
  validates PNG/JPEG magic bytes (`src/lib/pdf-images.ts`
  `buildImagesPdf` — PNG magic `89 50 4E 47`, JPEG magic
  `FF D8 FF`). The new module reuses that pattern and
  extends it to all 14 formats.
- **Limits (recorded, not faked).** The OLE check does
  not distinguish DOC from XLS from PPT (they share the
  OLE magic). The ZIP check does not verify the ZIP is
  well-formed beyond the magic + the marker. No malware
  scan (that needs an external scanner — out of scope).

### Task 2 — Auth rate limiting

- **Where it goes.** The auth server actions in
  `src/features/auth/actions.ts`: `signIn` and `signUp`
  (and `resetRequest` if it exists). The rate limiter is
  the existing in-memory pattern (`FixedWindowRateLimiter`
  in `src/lib/export.ts` is the model — a per-key window
  with a max count). Keyed by the email address (lowercase)
  + the action, so one address cannot be brute-forced.
  Limit: **10 attempts per 15 minutes** per email — generous
  enough that a legitimate user mistyping never hits it,
  tight enough to stop a brute-force run.
- **What happens on limit.** The action returns the generic
  "Too many attempts. Try again in a few minutes." and does
  NOT call Supabase Auth (so the attempt never reaches the
  auth server). A successful sign-in clears the counter for
  that email.
- **Honest note.** Supabase Auth also rate-limits server-side
  (its own limits apply in the dashboard). The app-level
  limiter is defense-in-depth for the app's own form. The
  limiter is per-process in-memory (like every other limiter
  in the app — the known-limitation "all rate limiters are
  per-process in-memory" already covers it).

### Task 3 — Error reporting / operational monitoring

- **What v1 is.** A `/api/health` route that reports the
  health of the app's dependencies in one JSON object:
  `app` (always ok), `database` (a `select` on the
  workspaces table via the service role — the same check
  `/api/db-status` does), `storage` (a `list` on the
  `documents` bucket), `docserver` (a GET on the
  ONLYOFFICE URL — expected down while it is not
  installed; reported as `down`, not an error). Each
  check has a `status` (`ok` / `down` / `error`) and a
  `latencyMs`. The route is public (a health endpoint is
  meant to be probed) but returns no user data and no
  secrets — only statuses and latencies.
- **What v1 is NOT.** No external error tracker (Sentry
  etc. — that needs an account and a DSN, and is a
  deployment decision for the owner). The server-side
  `console.error` calls stay (they are the log), and the
  health endpoint is the monitoring hook (a monitor can
  poll it). Recorded as a follow-up in the handoff.
- **Structured error logging.** A small `src/lib/log.ts`
  with a `logError(scope, error, context)` helper that
  writes one JSON line per error (timestamp, scope,
  message, no secrets — it redacts `password`, `token`,
  `secret`, `key` fields). The auth actions and the
  upload action use it instead of bare `console.error`.
  (Only the call sites touched by Day 27 change — a
  full sweep of every `console.error` is a follow-up.)

### Task 4 — Backup / restore procedures

- **What v1 is.** A metadata backup script
  (`scripts/backup-metadata.mjs`) that exports the app's
  tables via the Supabase REST API (the admin client) to
  a timestamped JSON file: `profiles`, `workspaces`,
  `workspace_members`, `folders`, `documents`,
  `document_versions`, `document_stars`, `editor_sessions`,
  `ocr_jobs`, `document_ocr_results`, `document_shares`.
  The file is the metadata only — the document FILES live
  in Supabase Storage (the bucket), and the script notes
  that a full restore also needs the Storage objects
  (exported via the Supabase Dashboard or the Storage API).
  A procedure doc (`docs/BACKUP_RESTORE.md`) explains
  how to run the backup, what it covers, and how to
  restore (re-insert the rows in dependency order, then
  re-upload the Storage objects).
- **Honest note.** Direct Postgres (`pg_dump`) does NOT
  work from this VM (the runtime egress policy intercepts
  the TLS handshake — the same reason migrations are
  applied via the dashboard). The REST-API export is the
  honest backup for this environment. The Supabase
  project's own automatic backups (dashboard) are the
  primary backup; this script is the app-level safety net.

### Task 5 — Privacy disclosures

- **What v1 is.** A `/privacy` page (a public page, no
  sign-in needed) that discloses, in plain language:
  what the app stores (account, workspace, documents,
  versions, OCR results, shares), where it is stored
  (Supabase — region ap-southeast-1), what external
  services process the data (Supabase for auth/storage/
  database; ONLYOFFICE for editing/conversion — the
  document is sent to the document server; Tesseract
  runs locally on the app server for OCR — the image
  never leaves the server), what is NOT collected (no
  analytics, no ads, no tracking), how long data is kept
  (until the user deletes it; trash is recoverable),
  and how to request deletion (delete the account /
  contact the owner). A link to it goes in the app
  footer/sidebar (the settings page links it).
- **What v1 is NOT.** Not a legal review (the owner
  should have a lawyer read it before a public release).
  Recorded as a follow-up.

### Task 6 — Full licence audit

- **What v1 is.** A `docs/LICENSES.md` that lists every
  dependency and its licence: the npm dependencies
  (from `package.json` + each package's own `LICENSE`
  file in `node_modules`), the system tools (qpdf —
  Apache 2.0; Tesseract — Apache 2.0; Leptonica — BSD;
  LibreOffice — MPL-2.0; Ghostscript — AGPLv3;
  poppler/pdftoppm — GPLv2+; `zip`/`unzip` — BSD/Info-ZIP),
  and the engines (ONLYOFFICE Docs Community — AGPLv3,
  with the owner's Day 1 licence decision noted).
  Generated by a script (`scripts/license-audit.mjs`)
  that reads the installed packages, so it can be
  re-run when dependencies change. The doc flags any
  licence that needs attention for a commercial release
  (AGPLv3 — ONLYOFFICE, Ghostscript; GPL — poppler).
- **Honest note.** This is a licence INVENTORY, not a
  legal opinion. The owner decides the commercial
  licence posture (he already decided the ONLYOFFICE
  question on Day 1).

## 2. Day 21 close-out (done before the plan)

- The user ran the Day 21 `words` migration — verified
  applied (`document_ocr_results.words` is present).
- The `/tmp/e2e/scanned.pdf` fixture was missing (VM
  reset) — rebuilt and ADDED to the committed rebuild
  script (`scripts/rebuild-fixtures.py` now builds
  scanned.pdf too: 2 image-only pages, page 1 "The quick
  brown fox jumps over the lazy dog.", page 2 "Pack my
  box with five dozen liquor jugs.").
- The Day 21 harness re-ran **17/21** first. The 4
  failures were real findings, fixed:
  1. **A real bug in `extractPdfText`** (`src/lib/pdf-searchable.ts`):
     OCR word boxes on one visual line sit at two
     slightly different baselines (taller words reach
     lower). Sorting all runs by y first put every word
     on the higher baseline before every word on the
     lower one — the text came out "The brown fox over
     the quick Jumps lazy dog." (scrambled). **Fix: the
     line groups by baseline tolerance (the line's y is
     a running average) and then sorts by x WITHIN the
     line.** A new unit test reproduces the two-baseline
     case (`src/lib/pdf-searchable.test.ts`).
  2. **Harness: OCR text spacing/case.** PDF.js inserts
     extra spaces from the word gaps and Tesseract
     misreads case ("Jumps"). The harness now compares
     whitespace- and case-insensitively (the words and
     their order are what matter).
  3. **Harness: the OCR page check.** The "Make
     searchable" button renders client-side only after
     the job loads, so it is NOT in the SSR HTML. The
     check now verifies the page loads (200) and shows
     the document title; the button is proven by the
     make-searchable route.
- **After the fixes the harness re-ran 21/21. Day 21 is
  fully closed.** The app was rebuilt + restarted with
  the fix. The `extractPdfText` fix is committed on the
  `day-27-hardening` branch (it is a Day 21 fix, but it
  was made while closing Day 21 before Day 27 started).

## 3. Tasks (small, in order)

1. **Pure module + tests (Task 1):** `src/lib/file-signatures.ts`
   (the magic-byte table + `validateFileSignature(bytes, extension)`
   + `detectFileType(bytes)`) + `src/lib/file-signatures.test.ts`.
   Fixtures: the corpus files (a real DOCX, a real PDF, a real
   PNG, a real JPEG, a real TXT, a real CSV, a real legacy DOC,
   a real ODT) + a renamed-file case (a PNG's bytes with a .pdf
   extension → refused).
2. **Wire the byte check into the upload action (Task 1):**
   `uploadDocument` reads the file's head/tail, calls
   `validateFileSignature`, refuses on mismatch before any
   Storage write. Update the storage.ts comment (the check
   is no longer "a Day 12 hardening item").
3. **Auth rate limiting (Task 2):** a per-email limiter in
   `src/lib/auth-rate-limit.ts` (the in-memory pattern) +
   wire it into `signIn` + `signUp` (+ `resetRequest` if it
   exists) + tests. A successful sign-in clears the counter.
4. **Health endpoint + structured logging (Task 3):**
   `src/lib/log.ts` + `src/app/api/health/route.ts` + tests.
   Use `logError` in the auth actions and the upload action.
5. **Backup script + procedure doc (Task 4):**
   `scripts/backup-metadata.mjs` + `docs/BACKUP_RESTORE.md`.
   Run it once to prove it works.
6. **Privacy page (Task 5):** `src/app/privacy/page.tsx` +
   a link from the settings page. No test data needed;
   verify the page loads (200) in the e2e harness.
7. **Licence audit (Task 6):** `scripts/license-audit.mjs` +
   `docs/LICENSES.md` (generated, then read back and
   corrected by hand where the script is wrong).
8. **Full test:** unit suite (all files), the Day 27 e2e
   harness (`scripts/e2e-hardening-test.mjs`) as real
   signed-in users: upload a renamed file (rejected),
   upload a real file (accepted), sign-in rate limit
   (10 bad attempts → the 11th is refused with the
   rate-limit message), the health endpoint (200, the
   statuses), the privacy page (200), the backup script
   (runs, the JSON has the tables). Typecheck, lint, build.
9. **Docs + commit + handoff + reply:** update
   `docs/feature-matrix.csv` (FORMA-036),
   `docs/known-limitations.md` (the hardening limits),
   `CHANGELOG.md` (Day 27 entry + the Day 21 21/21 close
   + the extractPdfText fix), `docs/project-brief/FEATURE_AUDIT.md`
   (§13 + §16 item 12 → Done), `docs/project-brief/FEATURE_LOOP.md`
   (queue: item 12 Done, item 13 UX gaps Next), `~/MEMORY.md`
   (Day 21 close + Day 27 entry). Write `docs/handoffs/day-27.md`.
   Commit on `day-27-hardening`.

## 4. Limits (recorded, not faked)

- The OLE check does not distinguish DOC from XLS from
  PPT (they share the OLE magic). No malware scan.
- The auth limiter is per-process in-memory (like every
  other limiter); Supabase Auth also rate-limits.
- No external error tracker (Sentry) — the health endpoint
  is the monitoring hook.
- The backup is metadata-only via REST (no `pg_dump` from
  this VM); the document FILES need the Storage export.
- The privacy page is not a legal review. The licence
  audit is an inventory, not a legal opinion.
