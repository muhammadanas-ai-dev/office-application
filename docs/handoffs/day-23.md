# Day 23 handoff — Versions UI

Date: 2026-11-18. Owner instruction (17:27 PKT): "okay go head
implement this properly by using feature loop.md" — build audit
queue item 8 (`docs/project-brief/FEATURE_AUDIT.md` §16):
Versions UI.

## 1. What was researched

- **The versions already exist.** Every edit creates a new
  immutable version: the `document_versions` table (`id,
  document_id, workspace_id, version_number, file_path,
  mime_type, size_bytes, created_by, created_at`, unique
  `(document_id, version_number)`, never updated) from the Day
  4 migration. RLS: workspace members can SELECT; owner/admin/
  editor can INSERT; no UPDATE policy (immutable); DELETE only
  owner/admin. The versions page reads through the user's
  client (RLS) — **no new table, no migration.**
- **How a new version is saved.** `saveNewVersion` (in
  `src/lib/pdf-edit.server.ts`) is the pattern: upload the
  bytes to a new Storage path (`buildStoragePath(workspace_id,
  document_id, newVersion, title)`), insert a
  `document_versions` row, and update the `documents` row
  (version, file_path, size_bytes, mime_type) with an
  optimistic-concurrency check (`.eq("version",
  document.version)` — if the document changed while the
  action ran, it fails with a clear message). **It hardcodes
  `mime_type: "application/pdf"`** (it is a PDF-edit helper),
  so restore does NOT reuse it — restore needs the version's
  actual mime type (a DOCX version restored as a PDF would
  corrupt the document row).
- **Restore = a new version from the old file.** Restoring
  version N downloads version N's bytes from Storage and saves
  them as version current+1 (the same `saveNewVersion`
  pattern, but with the version's mime type). It never
  overwrites and never deletes: the old versions stay, and the
  restore itself is a new version in the list. Restoring the
  current version is refused (400 — it is already current).
- **Download a version.** The existing download route (`GET
  /api/documents/[id]/download`, Day 4) serves the CURRENT
  version only. A version needs its own route: `GET /api/
  documents/[id]/versions/[version]/download` — it loads the
  version row (RLS), then mints a signed Storage URL for that
  version's file (the Day 4 pattern, 1 hour) and redirects the
  browser to it.

## 2. Completed functionality

- **The pure module** (`src/lib/versions.ts`):
  `formatVersionSize(sizeBytes)` (a human size — "12 KB",
  "1.2 MB", "0 bytes", "Unknown size" for null/invalid),
  `getVersionLabel(versionNumber, isCurrent)` ("Version 3" /
  "Version 3 · current"), `isRestorable(versionNumber,
  currentVersion)` (false for the current version),
  `getVersionFileName(title, versionNumber)` (the download
  name, e.g. "Report v2.pdf").
- **The server module** (`src/lib/versions.server.ts`):
  `fetchDocumentVersions(userClient, documentId)` (the
  versions, newest first, RLS) and `restoreVersion(userClient,
  documentId, versionNumber, userId)` (loads the document +
  the version row, downloads the version's bytes from Storage
  via the admin client, saves them as a new version — the
  `saveNewVersion` pattern with the version's mime type — and
  returns the new version number).
- **The routes**: `GET /api/documents/[id]/versions/[version]/
  download` (the signed-URL redirect, the Day 4 pattern) and
  `POST /api/documents/[id]/versions/[version]/restore`
  (returns `{ok, version}` — the new version number).
- **The UI**: the page `/documents/[id]/versions` (server: the
  document + versions via the user client; the client: the
  list, Download links, Restore buttons with a confirm — it
  says the restore becomes the current version as a new
  version and the others stay) + a library "Versions" link
  (`versionsHref` prop in DocumentActions, shown for every
  document with a file).

## 3. Code and data changes

- `src/lib/versions.ts` (new, pure) +
  `src/lib/versions.test.ts` (new, 6 tests) +
  `src/lib/versions.server.ts` (new, server-only).
- `src/app/api/documents/[id]/versions/[version]/download/
  route.ts` (new) + `src/app/api/documents/[id]/versions/
  [version]/restore/route.ts` (new).
- `src/app/(workspace)/documents/[id]/versions/page.tsx`
  (new) + `src/components/versions/versions-client.tsx`
  (new) + `src/components/library/library-forms.tsx` +
  `library-list.tsx` (the "Versions" link, `versionsHref`
  prop).
- `scripts/e2e-versions-test.mjs` (new, focused harness).
  `scripts/prove-versions.mjs` was temporary and deleted.
- Docs: `docs/handoffs/day-23-plan.md`,
  `docs/feature-matrix.csv` (FORMA-032),
  `docs/known-limitations.md` (the versions limits),
  `CHANGELOG.md` (Day 23 entry),
  `docs/project-brief/FEATURE_AUDIT.md` (§16 item 8 → Done),
  `docs/project-brief/FEATURE_LOOP.md` (queue: item 8 Done,
  Settings/preferences next), `~/MEMORY.md` (Day 23 entry).
- **No migration** (the versions table already exists).

## 4. Tests

- **Proof of concept (task 1): all checks pass**
  (`scripts/prove-versions.mjs`, deleted after use). As a real
  user: upload a PDF, edit it twice via the pdf-edit route
  (versions 1, 2, 3), read the versions through the user
  client (3 rows, newest first), download version 1's bytes
  (they match the original upload), re-upload them as version
  4 (the restore pattern — a new Storage path, a new versions
  row, the documents row now version 4 with version 1's
  bytes), and version 1 is unchanged after the restore.
- **Unit: 308/308 (25 files passed, 1 skipped, 9 tests skipped
  — the pre-existing skips).** 6 new: the size formatting
  (bytes, KB, MB, a null/invalid size), the labels, the
  restorable check, the file names.
- **Live e2e: 20/20 (`scripts/e2e-versions-test.mjs`).** As a
  real signed-in user A: the PDF uploads (version 1); two
  edits via the pdf-edit route (versions 2 and 3); the
  versions page loads (200) and lists version 3 as current
  plus versions 2 and 1, with a Download link and a Restore
  button; download version 1 (200 via the signed URL, the
  bytes match the original upload); restore version 1 (200,
  a new version 4, the document now version 4, version 4's
  bytes match version 1's, versions 1–3 unchanged — 4 rows);
  restoring the current version is refused (400); restoring
  a missing version is 404; a missing version download is
  404; user B sees "Document not found" on the page (no
  versions listed) and gets 404 on both routes; signed-out
  gets 307 on the page and the restore.
- **Typecheck, lint, build: pass.** Prettier applied to the
  Day 23 files.

## 5. Deployment verification

- App rebuilt and restarted on :3000 (new build, both routes
  + the versions page + the library link included);
  `/api/supabase-status` returns 200. **A VM reset happened
  mid-Day-23** (the e2e harness run was interrupted): the app
  was down, /tmp (all fixtures) was wiped, qpdf was wiped,
  and the OCR worker was gone. Recovery: the app was restarted
  on :3000, `/tmp/e2e/pdf1.pdf` was rebuilt (pdf-lib, in the
  project dir — Node resolves packages relative to the script,
  not the cwd), and the OCR worker was restarted. **qpdf was
  NOT reinstalled yet** — the Day 20 PDF security feature is
  currently unavailable (its routes return a clear 503) until
  `sudo apt-get install qpdf` runs again.
- **NOT PERFORMED:** no Vercel/Git remote access — no Preview
  deployment, as every day.

## 6. Security/licensing checks

- No new engine licence to clear: the versions table + pdf-lib
  + the existing Storage, already in the project. No WPS
  feature, branding or font is used.
- No secrets in code. The versions are read through the user's
  client (RLS); the restore downloads via the admin client
  (the private bucket) and writes a new version (the
  `saveNewVersion` pattern).

## 6b. Verification notes and fixes made during Day 23

- **The proof script edited the wrong page.** The first run
  edited page 1 twice (the second edit searched page 1 for
  "PDF One page 2", which is on page 2 → 400). Fixed by
  editing page 1 then page 2. (A proof bug, not a product bug.)
- **TypeScript: `@/lib/upload` does not exist.**
  `MAX_UPLOAD_BYTES` lives in `@/lib/storage` (the pdf-edit
  server module imports it from there). Fixed the import.
- **The harness's isolation check was wrong.** It expected
  user B to get a 404 HTTP status on the versions page, but
  the page renders an EmptyState (200) for a document the
  user cannot access (the same as the convert page). Fixed
  by checking the content ("Document not found", no "Version
  3") instead of the status. (A harness bug, not a product
  bug.)
- **A VM reset interrupted the e2e run.** The harness run was
  cut off mid-flight (the service restarted). Recovery: the
  app was restarted, the fixture was rebuilt, the OCR worker
  was restarted, and the harness was re-run to a full 20/20.
  The interrupted run's test users are stale in Supabase
  (the harness deletes them in `finally`, but the reset cut
  it off before `finally` ran) — clean them up in the
  dashboard when convenient.

## 7. Known defects and limitations

- **No version deletion in the UI** (the versions are
  immutable — the RLS allows owner/admin delete, but the UI
  does not offer it; deleting history is a separate
  decision).
- **No version comparison / diff** (that is a separate
  feature).
- **The editor callback's `changesurl` / history is not
  consumed** (the callback already saves a new version on
  status 2; consuming the history entries is the related open
  item).
- **The editor browser round-trip is still unproven** (the
  docserver is down). The versions page loads (200); a human
  clicking Restore is the missing proof, same as for every
  other editor feature.

## 8. Tomorrow's target

- **Next feature in the queue: Settings / preferences (#9).**
  A settings page for the user's preferences (the workspace
  settings that exist today are scattered: the Plan page, the
  auth profile). The scope needs a decision: which settings
  belong here (display name, timezone, default document
  format, the OCR default language) and which stay where they
  are. The profiles table already has `display_name`; a new
  `user_preferences` table (or columns on profiles) is the
  likely shape — the plan will decide.
