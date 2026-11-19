# Day 27 handoff — Hardening (audit queue item 12)

Date: 2026-11-19. Owner instruction (21:42 PKT): "okay go
head implement the next feature properly by using
feature loop.md i run the query". "i run the query" =
he ran the Day 21 `words` migration — verified applied,
and the Day 21 harness re-ran to a full close (see §2
below). This is audit queue item 12
(`docs/project-brief/FEATURE_AUDIT.md` §16 + §13):
Hardening — the release gate.

## 1. What was researched

### The six open items (audit §13)

| # | Item | Status before Day 27 | What Day 27 did |
|---|---|---|---|
| 1 | Byte-signature upload validation | Open — extension + declared MIME only | Built (Task 1) |
| 2 | Auth rate limiting | Partial — the tool routes are 10/min; auth routes were not | Added to sign-in/sign-up (Task 2) |
| 3 | Error reporting / operational monitoring | Not started | `/api/health` + structured logging (Task 3) |
| 4 | Backup / restore procedures | Not started | A metadata backup script + a procedure doc (Task 4) |
| 5 | Privacy disclosures | Not started | A `/privacy` page (Task 5) |
| 6 | Full licence audit | Partial — ONLYOFFICE + Tesseract noted | `docs/LICENSES.md` (Task 6) |

### Task 1 — Byte-signature upload validation

- **Where it goes.** `uploadDocument` in
  `src/features/library/actions.ts` — it calls
  `validateUpload(file)` (extension + declared MIME +
  size) in `src/lib/storage.ts`, then uploads to Storage.
  The byte check runs in the same place, after
  `validateUpload` passes and before the Storage upload.
  The file is a `File` (a Blob) — the bytes come from
  `await file.arrayBuffer()`.
- **Magic bytes (verified against the corpus files).**
  PDF `%PDF` (`25 50 44 46`); PNG `89 50 4E 47 0D 0A 1A 0A`;
  JPEG `FF D8 FF`; ZIP-based `PK\x03\x04` (`50 4B 03 04`);
  legacy OLE `D0 CF 11 E0 A1 B1 1A E1`.
- **The ZIP inner marker.** All six ZIP-based formats
  share the `PK\x03\x04` magic, so the check also needs
  a format-specific marker — otherwise a DOCX renamed to
  .xlsx would pass. OOXML carries `word/`, `xl/` or `ppt/`
  entries in the ZIP central directory (at the END of the
  file; each entry starts with `PK\x01\x02`, the file name
  length is a little-endian uint16 at offset 28 and the
  name starts at offset 46). ODF stores an uncompressed
  `mimetype` entry FIRST (the ODF spec requires it), whose
  content names the type (`application/vnd.oasis.opendocument.text`
  / `.spreadsheet` / `.presentation`) — so it is in the
  first 1 KB. Verified: the corpus DOCX has `word/`, the
  XLSX has `xl/`, the PPTX has `ppt/`, and the ODT/ODS/ODP
  each have a `mimetype` entry with the right content.
- **TXT / CSV.** No magic. Valid UTF-8 and no NUL bytes —
  a binary file renamed to .txt is refused.
- **Limits (recorded, not faked).** The OLE check does
  not distinguish DOC from XLS from PPT (they share the
  magic). The ZIP check does not verify the ZIP is
  well-formed beyond the magic + the marker. A truncated
  PDF still passes the magic check (the failure comes
  later, when the PDF is parsed). No malware scan (that
  needs an external scanner).

### Task 2 — Auth rate limiting

- **Where it goes.** The auth server actions in
  `src/features/auth/actions.ts` (`signIn`, `signUp`).
  The limiter is the existing `FixedWindowRateLimiter`
  (`src/lib/export.ts`, the in-memory pattern).
- **The limit: 10 attempts per 15 minutes per email**
  (lowercased + trimmed, so `User@Example.com` and
  `user@example.com` share one counter). Generous enough
  that a legitimate user mistyping never hits it; tight
  enough to stop a brute-force run. A blocked attempt
  never reaches Supabase Auth. A successful sign-in
  clears the counter (a new `reset(key)` method on the
  limiter class) so a user who eventually remembers
  their password is not locked out by their own
  mistypes. The message ("Too many attempts. Try again
  in a few minutes.") does not say whether the email
  exists.
- **Honest note.** Supabase Auth also rate-limits
  server-side. The app-level limiter is defense-in-depth
  for the app's form. It is per-process in-memory (like
  every other limiter in the app).

### Task 3 — Error reporting / operational monitoring

- **What v1 is.** A `/api/health` route reporting the
  health of the app's dependencies in one JSON object:
  `app` (always ok), `database` (a select on workspaces
  via the service role), `storage` (a list on the
  `documents` bucket), `docserver` (a GET on the
  ONLYOFFICE URL — expected `down` while it is not
  installed; reported, not an error). Each check has a
  `status` (`ok` / `down` / `error`) and a `latencyMs`.
  The overall status is `ok` when everything is up,
  `degraded` when only the docserver is down, and `down`
  (HTTP 503) when the database or storage is down. The
  route is public (a health endpoint is meant to be
  probed) but returns no user data and no secrets — only
  statuses and latencies. It was added to
  `PUBLIC_API_PREFIXES` in `src/lib/supabase/proxy.ts`
  (it redirected to login before that).
- **Structured logging.** `src/lib/log.ts`: `logError`
  / `logLine` write one JSON line per error (timestamp,
  scope, message, context) and REDACT any field whose
  name looks like a secret (`password`, `token`,
  `secret`, `api_key`, `service_role`, `authorization`,
  `cookie`…) before it is written. The auth actions and
  the library actions use it instead of bare
  `console.error` (only the call sites touched by Day 27
  changed — a full sweep is a follow-up).
- **What v1 is NOT.** No external error tracker (Sentry
  etc. — that needs an account and a DSN, a deployment
  decision for the owner). The health endpoint is the
  monitoring hook.

### Task 4 — Backup / restore procedures

- **What v1 is.** `scripts/backup-metadata.mjs` exports
  the 11 app tables via the Supabase REST API (the admin
  client, paginated at 1,000 rows) to a timestamped JSON
  file in `workspace/backups/` (outside the repo — it
  contains user data, so it is never committed).
  `docs/BACKUP_RESTORE.md` explains how to run it, what
  it covers, and how to restore (re-insert the rows in
  dependency order, then re-upload the Storage objects to
  the same paths). Proven: it exported 38 rows across 11
  tables.
- **Honest note.** Direct Postgres (`pg_dump`) does NOT
  work from this VM (the runtime egress policy intercepts
  the TLS handshake). The REST-API export is the honest
  backup for this environment. The Supabase project's own
  backups (dashboard) are the primary backup; this script
  is the app-level safety net. The backup is metadata
  only — the document FILES live in Storage and need the
  Storage export.

### Task 5 — Privacy disclosures

- **What v1 is.** A `/privacy` page (public, no sign-in):
  what is stored (account, workspace, documents,
  versions, OCR results, shares, preferences), where
  (Supabase, ap-southeast-1), which services process
  documents (ONLYOFFICE for editing/conversion; Tesseract
  runs locally for OCR — the image never leaves the
  server; nothing is sent to an AI service), how long
  (until the user deletes it), and how to delete it. A
  link goes on the Settings page. The page says plainly
  that it is a disclosure, not a legal review.
- **What v1 is NOT.** Not a legal review (the owner
  should have a lawyer read it before a public release).

### Task 6 — Full licence audit

- **What v1 is.** `docs/LICENSES.md`, generated by
  `scripts/license-audit.mjs` (re-run it when dependencies
  change — it reads each installed package's own
  `package.json` in `node_modules`). All 33 npm packages
  are MIT/Apache/BSD/ISC — no copyleft in the npm deps.
  The system tools and engines are listed by hand:
  ONLYOFFICE Docs Community (AGPLv3), Tesseract
  (Apache 2.0), Leptonica (BSD), qpdf (Apache 2.0),
  LibreOffice (MPL-2.0, corpus only), Ghostscript
  (AGPLv3), poppler/pdftoppm (GPLv2+), zip/unzip (BSD).
  The doc flags ONLYOFFICE, Ghostscript and poppler for
  a commercial release.
- **Honest note.** An inventory, not a legal opinion.

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
     lower, so their baseline y is lower). Sorting all
     runs by y first put every word on the higher
     baseline before every word on the lower one — the
     text came out "The brown fox over the quick Jumps
     lazy dog." (scrambled). **Fix: the line groups by
     baseline tolerance (the line's y is a running
     average) and then sorts by x WITHIN the line.**
     A new unit test reproduces the two-baseline case.
     (The actual OCR boxes: "The" top=662 h=154,
     "quick" top=662 h=192 — the heights differ, so
     the baselines differ by 9.12 points.)
  2. **Harness: OCR text spacing/case.** PDF.js inserts
     extra spaces from the word gaps and Tesseract
     misreads case ("Jumps"). The harness now compares
     whitespace- and case-insensitively.
  3. **Harness: the OCR page check.** The "Make
     searchable" button renders client-side only after
     the job loads, so it is NOT in the SSR HTML. The
     check now verifies the page loads (200) and shows
     the document title; the button is proven by the
     make-searchable route.
- **After the fixes the harness re-ran 21/21. Day 21 is
  fully closed.** The app was rebuilt + restarted with
  the fix. The fix is committed on the `day-27-hardening`
  branch (it was made while closing Day 21, before Day 27
  started).

## 3. Code and data changes

- `src/lib/file-signatures.ts` (new, pure) + `src/lib/file-signatures.test.ts`
  (new, 16 tests, using the corpus files as fixtures).
- `src/features/library/actions.ts` (the upload action calls
  `validateFileSignature` before any Storage write) +
  `src/lib/storage.ts` (the comment updated — the byte check
  is no longer "a Day 12 hardening item").
- `src/lib/auth-rate-limit.ts` (new) + `src/lib/auth-rate-limit.test.ts`
  (new, 5 tests) + `src/lib/export.ts` (a `reset(key)` method
  on `FixedWindowRateLimiter`) + `src/features/auth/actions.ts`
  (the limiter wired into `signIn` + `signUp`).
- `src/lib/log.ts` (new) + `src/lib/log.test.ts` (new, 8 tests)
  + `src/app/api/health/route.ts` (new) +
  `src/lib/supabase/proxy.ts` (`/api/health` added to
  `PUBLIC_API_PREFIXES`) + `logError` wired into the auth
  actions and the library actions.
- `scripts/backup-metadata.mjs` (new) + `docs/BACKUP_RESTORE.md`
  (new). A backup file was written to `workspace/backups/`
  (38 rows across 11 tables) — it is NOT committed (user data).
- `src/app/privacy/page.tsx` (new) + a link on the Settings page.
- `scripts/license-audit.mjs` (new) + `docs/LICENSES.md` (new,
  generated).
- `scripts/e2e-hardening-test.mjs` (new, the Day 27 harness).
- `scripts/rebuild-fixtures.py` (the scanned.pdf builder added
  — a Day 21 close-out change).
- `src/lib/pdf-searchable.ts` (the extract-text line-grouping
  fix) + `src/lib/pdf-searchable.test.ts` (the two-baseline
  test) + `scripts/e2e-searchable-test.mjs` (the harness
  fixes) — Day 21 close-out changes.
- Docs: `docs/handoffs/day-27-plan.md`,
  `docs/feature-matrix.csv` (FORMA-036),
  `docs/known-limitations.md` (the hardening limits +
  the extract-text fix),
  `CHANGELOG.md` (Day 27 entry + the Day 21 21/21 close),
  `docs/project-brief/FEATURE_AUDIT.md` (§13 + §16 item 12
  → Done), `docs/project-brief/FEATURE_LOOP.md` (queue:
  item 12 Done, item 13 UX gaps Next), `~/MEMORY.md`
  (Day 21 close + Day 27 entry).

## 4. Tests

- **Unit: 369/369 (31 test files passed, 1 skipped, 9
  tests skipped — the pre-existing skips).** 31 new:
  file-signatures 16, auth-rate-limit 5, log 8,
  pdf-searchable 1 (the two-baseline test), export 1
  (the `reset` method is covered by the auth-rate-limit
  tests). **Note:** the first full run showed a `tsc`
  error in the health route — the Supabase query builder
  is thenable, not a Promise, so the generic `timed`
  helper did not typecheck. Fixed by timing the database
  and storage checks inline with `Date.now()`.
- **Live e2e (Day 27): 11/11** (`scripts/e2e-hardening-test.mjs`).
  A PNG renamed to .pdf is refused (and no document row
  is written); a real PDF uploads and appears in the
  library; 10 bad sign-ins then the 11th is refused with
  the rate-limit message; `/api/health` returns 200 with
  database/storage `ok` and docserver `down`; `/privacy`
  returns 200 with the disclosure; a backup file exists
  with the tables. The first run was 10/11 — the sign-in
  form extraction used "Sign in" as the marker, but that
  text first appears in the `<title>` (before the form),
  so no action fields were found. **Fix: use the email
  input (`name="email"`, inside the form) as the marker.**
- **Live e2e (Day 21, re-run): 21/21** (`scripts/e2e-searchable-test.mjs`)
  after the extract-text fix and the harness fixes.
- **The backup script** was run by hand: 38 rows across
  11 tables, written to `workspace/backups/`.
- **The licence audit** was run by hand: 33 npm packages,
  all MIT/Apache/BSD/ISC.
- **Typecheck, lint, build: pass.** Prettier applied to
  the Day 27 files.

## 5. Deployment verification

- App rebuilt and restarted on :3000 (the Day 27 build);
  `/api/supabase-status` returns 200, `/api/health`
  returns `degraded` (database ok, storage ok, docserver
  down — expected), `/privacy` returns 200.
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.

## 6. Security/licensing checks

- No new engine licence to clear. The licence audit is
  the Day 27 deliverable for this: all 33 npm packages
  are permissive (MIT/Apache/BSD/ISC); the copyleft items
  are ONLYOFFICE (AGPLv3 — the owner's Day 1 decision
  stands), Ghostscript (AGPLv3) and poppler (GPLv2+).
- No secrets in code. The backup file contains user data
  and is NOT committed. The health endpoint returns no
  user data and no secrets. The structured log redacts
  secret fields.
- The byte-signature check closes the upload spoofing gap
  (a renamed file can no longer reach Storage or the
  PDF tools). The auth limiter closes the brute-force gap
  on the app's own form.

## 6b. Verification notes and fixes made during Day 27

- **The `zipCentralFileNames` scan was O(n²).** It called
  `tail.slice(i)` at every byte position (a copy each
  time), so a 64 KB tail took seconds and the corpus test
  timed out at 5,000 ms. **Fix: compare the four magic
  bytes in place, no slicing per position.** The suite
  went from a timeout to 5 seconds.
- **A truncated PDF still passes the magic check.** The
  first 200 bytes of a real PDF start with `%PDF`, so
  `validateFileSignature(corrupt.pdf, "pdf")` returns ok.
  That is correct for a magic check — truncation is caught
  later, when the PDF is parsed. The test was corrected to
  use bytes that never were a PDF.
- **`detectFileType` returns "txt" for control bytes.**
  `[0x01, 0x02, 0x03]` is valid UTF-8 (control characters),
  so it is text. The "unknown format" test now uses
  `[0xFF, 0xFE, 0x00]` (invalid UTF-8).
- **The health route redirected to login at first.**
  The proxy protects all `/api/` routes except the ones
  in `PUBLIC_API_PREFIXES` — `/api/health` was not in it.
  **Fix: add it.** (The `/privacy` page needed no proxy
  change — it is not under a protected prefix.)
- **The sign-in form extraction used the wrong marker.**
  "Sign in" first appears in the `<title>`, before the
  form. **Fix: use the email input as the marker.**

## 7. Known defects and limitations

- The byte-signature check does not distinguish DOC from
  XLS from PPT (they share the OLE magic) and does not
  verify a ZIP is well-formed beyond the magic + the
  inner marker; a truncated PDF still passes the magic
  check. No malware scan.
- The auth limiter is per-process in-memory (like every
  other limiter); Supabase Auth also rate-limits.
- No external error tracker (Sentry) — the health
  endpoint is the monitoring hook and the JSON log is
  what it feeds on.
- The backup is metadata-only via REST (no `pg_dump`
  from this VM); the document FILES need the Storage
  export.
- The privacy page is not a legal review and the licence
  audit is an inventory, not a legal opinion.
- Only the call sites touched by Day 27 use `logError` —
  a full sweep of every `console.error` is a follow-up.

## 8. Tomorrow's target

- **Next (and last) feature in the queue: UX gaps (#13).**
  The dead sidebar controls (Templates/Shared/Plan — the
  Templates and Shared pages are now real, so this is
  mostly the Plan page), drag-and-drop upload, responsive
  layout, document tabs. The plan will break it into its
  sub-items (the Plan page stays skipped — no plan UI).
  After that, the audit queue is empty except the items
  already marked skipped (AI, cloud, billing) and the
  follow-ups (remaining templates, custom-template save,
  stamps/watermarks, insert-pages-from-an-image, the
  Day 25 comments/notes half).
