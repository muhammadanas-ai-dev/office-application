# Day 23 plan — Versions UI

Owner instruction (2026-11-18 17:27 PKT): "okay go head
implement this properly by using feature loop.md" — build audit
queue item 8 (`docs/project-brief/FEATURE_AUDIT.md` §16):
Versions UI.

## 1. Research

- **The versions already exist.** Every edit creates a new
  immutable version: the `document_versions` table (`id,
  document_id, workspace_id, version_number, file_path,
  mime_type, size_bytes, created_by, created_at`, unique
  `(document_id, version_number)`, never updated) from the Day
  4 migration. RLS: workspace members can SELECT; owner/admin/
  editor can INSERT; no UPDATE policy (immutable); DELETE only
  owner/admin. The versions page reads through the user's
  client (RLS) — no new table, no migration.
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
  version row (RLS), then serves that version's file from
  Storage as a download (the same signed-URL pattern as the
  Day 4 route, or a direct stream — follow the Day 4 route).
- **The UI.** A page `/documents/[id]/versions` (server: the
  document + its versions via the user client, RLS, newest
  first; the client: the list). Each row shows the version
  number, when it was saved, its size, and whether it is the
  current version; a "Download" link and (except for the
  current version) a "Restore" button. The restore button
  confirms (a plain confirm — restoring is a new version, so
  it is safe, but the user should know it becomes the current
  version). A "Versions" link is added to the library
  (DocumentActions) next to the other PDF links.

## 2. Small tasks (in order)

1. **Verify the mechanism (proof of concept).** The script
   `scripts/prove-versions.mjs` (in the project dir — keep it
   until the commit, then delete): as a real user, upload a
   PDF, edit it twice via the pdf-edit route (so it has
   versions 1, 2, 3), read the versions through the user
   client (3 rows, newest first), download version 1's bytes
   from Storage (they match the original upload), and
   re-upload them as version 4 (the restore pattern — a new
   Storage path, a new versions row, the documents row now
   version 4 with version 1's bytes). Verify version 1's bytes
   are unchanged after the restore.
   *Test: the script prints PASS for every check.*
2. **Pure module + unit tests.** `src/lib/versions.ts`:
   `formatVersionSize(sizeBytes)` (a human size — "12 KB",
   "1.2 MB"), `getVersionLabel(versionNumber, isCurrent)`
   ("Version 3" / "Version 3 · current"), `isRestorable
   (versionNumber, currentVersion)` (false for the current
   version), `getVersionFileName(title, versionNumber)` (the
   download name, e.g. "Report v2.pdf"). Tests in
   `src/lib/versions.test.ts`: the size formatting (bytes, KB,
   MB, a null size), the labels, the restorable check, the file
   names.
   *Test: the new unit tests pass.*
3. **Server module + routes.** `src/lib/versions.server.ts`
   (`import "server-only"`): `fetchDocumentVersions
   (userClient, documentId)` (the versions, newest first,
   RLS), `restoreVersion(userClient, documentId,
   versionNumber)` (loads the document + the version row,
   downloads the version's bytes from Storage via the admin
   client, saves them as a new version — the `saveNewVersion`
   pattern with the version's mime type — and returns the new
   version number). Routes: `GET /api/documents/[id]/
   versions/[version]/download` and `POST /api/documents/[id]/
   versions/[version]/restore`.
   *Test: the routes are covered by the live e2e.*
4. **UI.** The page `/documents/[id]/versions` (server: the
   document + versions via the user client; the client: the
   list, Download links, Restore buttons with a confirm) +
   the library "Versions" link (`versionsHref` prop in
   DocumentActions, shown for every document with a file).
   *Test: the page loads (checked in the live e2e).*
5. **Live e2e harness.** `scripts/e2e-versions-test.mjs`
   (focused, the Day 13–22 pattern): as user A, upload a PDF,
   edit it twice via the pdf-edit route (versions 1, 2, 3);
   the versions page loads (200) and lists 3 versions (newest
   first, version 3 marked current); download version 1 (200,
   the bytes match the original upload); restore version 1
   (200, a new version 4, the documents row now version 4,
   version 4's bytes match version 1's, versions 1–3
   unchanged); restoring the current version is refused
   (400); restoring a missing version is 404; user B gets 404
   on the page and both routes; signed-out gets 307.
   *Test: the harness passes end to end.*
6. **Checks + docs + commit.** Typecheck, lint, Prettier,
   build, restart the app. Update `WPS_LEVEL_PLAN.md` (the
   versions row → Done), `feature-matrix.csv` (FORMA-032),
   `known-limitations.md` (the versions limits),
   `CHANGELOG.md` (Day 23 entry), `FEATURE_AUDIT.md` (§6.6 +
   §16 item 8 → Done), `docs/handoffs/day-23.md`. Commit on
   branch `day-23-versions-ui`. Update `~/MEMORY.md`. Reply
   to the owner.

## 3. What is NOT in this feature

- No version deletion (the versions are immutable — the RLS
  allows owner/admin delete, but the UI does not offer it;
  deleting history is a separate decision).
- No version comparison / diff (that is a separate feature).
- No editor history consumption (the callback's `changesurl` /
  history is the related open item — the callback already
  saves a new version on status 2; consuming the history
  entries is not part of this UI).
- No change to the editor, the upload flow, or the other PDF
  tools. No WPS feature, branding or font is used; the
  implementation is Forma's own on the existing versions
  table.
