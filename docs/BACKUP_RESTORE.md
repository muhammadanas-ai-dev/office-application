# Backup and restore — Forma Office

How to back up and restore the app's data. Written Day 27
(hardening). The app is not deployed yet, so this is the
procedure for the live Supabase project the local app uses.

## What lives where

| Data | Where | Backed up by |
|---|---|---|
| Accounts, workspaces, folders, documents, versions, stars, editor sessions, OCR jobs/results, shares | Supabase Postgres (the `public` schema) | The Supabase project's own backups (dashboard) + the metadata script below |
| The document FILES (the actual DOCX/PDF/PNG bytes) | Supabase Storage, bucket `documents` | The Supabase project's Storage (dashboard) — NOT the metadata script |

## The metadata backup (app-level safety net)

Run from the project root:

```bash
node scripts/backup-metadata.mjs
```

It reads `.env.local`, exports the 11 app tables via the
Supabase REST API, and writes a timestamped JSON file to
`workspace/backups/forma-backup-<timestamp>.json` (outside the
repo — it contains user data, so it is never committed).

The file is metadata only. It does NOT contain the document
files. A restore from this file alone gives back the library
(folders, documents, versions, shares) but the files
themselves must come from Storage.

**Why REST, not `pg_dump`:** direct Postgres does not connect
from this VM (the runtime egress policy intercepts the TLS
handshake — the same reason migrations are applied via the
dashboard). The REST-API export is the honest backup for this
environment.

## The primary backup (Supabase)

The Supabase project's own backups are the primary backup:

- **Database:** Supabase Dashboard → Database → Backups.
  (Automatic daily backups are a paid-plan feature; on the
  free plan, take a manual backup from the dashboard before
  any risky change.)
- **Storage:** Supabase Dashboard → Storage → `documents`
  bucket. There is no one-click bucket export — download the
  objects (or use the Storage API) before a risky change.

## Restore (metadata)

1. Restore the database first (from the Supabase backup, or
   re-apply the migrations in `supabase/migrations/` to a
   fresh project and then re-insert the rows).
2. Re-insert the rows from the backup JSON, in dependency
   order (parents before children):
   `profiles` → `workspaces` → `workspace_members` →
   `folders` → `documents` → `document_versions` →
   `document_stars` → `editor_sessions` → `ocr_jobs` →
   `document_ocr_results` → `document_shares`.
   Use the Supabase Dashboard SQL Editor or the REST API.
   (The rows carry their original UUIDs, so foreign keys
   resolve as long as the order is kept.)
3. Restore the Storage objects (re-upload the files to the
   same paths — `<workspace_id>/<document_id>/v<n>/<filename>`
   — so the `file_path` values in the restored rows point at
   real objects).
4. Verify: sign in, open the library, download a document,
   and check `/api/health` returns `ok` (or `degraded` while
   the document server is down).

## How often

- Before any migration, any bulk delete, or any change to the
  Storage bucket: run the metadata script.
- Otherwise: weekly (the data changes slowly while the app is
  local-only; daily once it is deployed).
