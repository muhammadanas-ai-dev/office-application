# Library and Storage — Day 4

## Model

Four tables (migration
`supabase/migrations/20261117020000_forma_documents_library.sql`):

| Table               | Purpose                                                                                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `folders`           | Nested folders (`parent_id` NULL = workspace root). Soft delete via `deleted_at`. One name per parent (unique index with `coalesce(parent_id, zero-uuid)`).                                                                      |
| `documents`         | Metadata only — **file bytes never live in Postgres**. `file_path` is NULL for a blank document (its first file is written by the Day 5 editor on first save). `version` always points at the latest row in `document_versions`. |
| `document_versions` | One immutable row per saved file. New saves insert a row; nothing updates one.                                                                                                                                                   |
| `document_stars`    | Per-user starring (a star is a user-level preference, so it cannot live on the document row).                                                                                                                                    |

Day 3 cleanup in the same migration: `workspaces.is_personal` plus a
partial unique index `(owner_id) WHERE is_personal` — one personal
workspace per owner. The backfill marks each owner's earliest
workspace personal, and `ensureProfileAndWorkspace` now inserts with
`is_personal: true` and re-looks up on a unique-violation (the
two-concurrent-first-sign-ins race). **Apply order matters:** the Day
4 migration references the Day 3 tables, so apply Day 3 first, then
Day 4. Provisioning inserts `is_personal` too, so a first sign-up
before Day 4 is applied would fail — apply both migrations before
the first real sign-up.

## RLS

Every row is visible only to members of its workspace
(`app_private.is_workspace_member`). Creating, renaming, moving and
soft-deleting need role editor or above; hard (permanent) delete
needs owner or admin. SELECT policies have no `deleted_at` filter —
the app filters, and the Trash page must be able to select deleted
rows. Version rows are insertable by editors (a new save) and never
updated. Stars are manageable only by the starring user, and only on
documents in workspaces they belong to.

## Storage

Bucket `documents` — **private**, created live via the Storage API
during Day 4 (50 MB per-file limit, allowed MIME types DOCX, DOC,
PDF, TXT, ODT). Object path layout:

```
<workspace_id>/<document_id>/v<n>/<filename>
```

The storage.objects RLS policies read the workspace from the first
path segment with `storage.foldername(name)[1]`. A path that does not
start with a valid workspace uuid fails the cast and the policy
denies — fail-closed by design. All four policies (SELECT, INSERT,
UPDATE, DELETE) exist because Storage upsert needs INSERT + SELECT +
UPDATE (Supabase checklist). The bucket itself was created by API;
the policies ship in the Day 4 migration, so uploads work only
after the migration is applied.

## Upload validation

Server-side, in the upload action (`src/features/library/actions.ts`
via `src/lib/storage.ts`): extension allow-list, declared-MIME
match (an empty browser MIME type is trusted to the extension; a
mismatched non-empty type is rejected), non-empty file, ≤ 50 MB.
The browser `accept` attribute is only a hint. A byte-signature
(magic-number) check is NOT done — recorded as a Day 12 hardening
item. The server-action body limit is raised to 50 MB in
`next.config.ts` (`experimental.serverActions.bodySizeLimit`); the
default is 1 MB and would reject every real upload.

## Download

`GET /api/documents/[id]/download` fetches the document row through
the signed-in user's client (RLS decides access), then mints a
1-hour signed Storage URL and redirects to it. The route is
proxy-protected like the other workspace routes, so signed-out
requests are redirected to sign-in before the handler runs.

## Library UI

- `/files` — folder tree (left), breadcrumb, search (GET `?q=`),
  sort by name / last modified / size, create folder, create blank
  document, upload. Document rows show size, version, last
  modified, star, download (when a file exists), and Manage
  (rename / move / duplicate / move to Trash). "Open — Day 5" is a
  disabled button: the editor does not exist yet.
- `/home` — workspace name, document/folder counts, recent
  documents. `/recent` — newest first. `/starred` — the user's
  starred documents. `/trash` — soft-deleted folders and documents
  with Restore and Delete forever (permanent delete needs
  owner/admin and removes the stored files too).
- The shell header search is now a real GET form to `/files`, and
  the Create button links to `/files`.

## Verification

- Local RLS verification (`bash scripts/verify-rls-local.sh`):
  17/17 checks pass on local Postgres 16 (T1–T10 Day 3, T11–T17
  Day 4: cross-workspace library invisibility, cross-workspace
  insert denial, editor can create folders/versions, outsider
  cannot, storage objects readable only by members, anon denied,
  stars member-only, is_personal backfill + one-personal rule).
  The harness mocks the `storage` schema (objects table +
  `foldername`) so the storage policies are exercised locally.
- Live RLS test (`npm run test:live`, gated on `FORMA_LIVE_DB=1`)
  extended with document + file cases: B cannot see or insert
  into A's workspace, B cannot download A's file, A can download
  their own. **Not run yet** — needs both migrations applied.
- Unit/component tests: 8 files, 41 tests, all passing (storage
  validation, library schemas, folder tree + breadcrumb).
- Build passes; local smoke test: `/` 200, auth pages 200,
  workspace routes 307 to sign-in, download route 307 while
  signed out. Client-bundle scan: the only `sb_secret_` match is
  the literal prefix inside supabase-js's own key-type check — no
  secret value is in the bundle.

## Known gaps

- No editor: "Open" is disabled until Day 5; blank documents have
  no file until first save.
- No byte-signature validation on uploads (Day 12 hardening).
- Folder tree is a simple nested list (no drag-and-drop, no
  pagination); large libraries will need virtualised lists later.
- Soft-delete of a folder restores its ancestors too, so a restore
  never leaves a folder hidden under a deleted parent.
- The library pages show a setup-pending state (not a crash) when
  the migrations have not been applied.
