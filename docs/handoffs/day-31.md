# Day 31 handoff — Save a custom template

Owner instruction (2026-11-21 20:25 PKT): "okay go head
implement the next feature properly by using feature
loop.md". The next feature is the first item of the
follow-up list (Day 30 handoff §7): "save a custom
template" — turn one of your own documents into a template
you can reuse. The audit §3.12 / §8 recorded it as
"User-created reusable templates stored locally — Not
started".

## 1. Research

- **The pattern to copy is `duplicateDocument`** (library
  actions): it copies a document's file inside Storage with
  `supabase.storage.from(DOCUMENTS_BUCKET).copy(source, dest)`
  and inserts the new row, rolling back the Storage copy if
  the insert fails. "Save as template" is the same shape,
  except the destination is a template path and the row goes
  in a new `user_templates` table instead of `documents`.
- **Storage needs no new policy.** The `documents` bucket
  policies read the workspace from the first path segment
  (`storage.foldername(name)[1]`), so a template file at
  `<workspace_id>/templates/<template_id>/<filename>` is
  readable/writable/deletable by workspace members under the
  existing policies. A `buildTemplateStoragePath` helper
  (next to `buildStoragePath` in `src/lib/storage.ts`)
  builds that path.
- **The migration pattern is the Day 25 shares migration**:
  a table + comments + indexes + RLS (select/insert/update/
  delete by workspace membership, via the one-argument
  `app_private.is_workspace_member(workspace_id)` helper).
  The owner applies migrations in the Supabase Dashboard SQL
  Editor from a file in `~/workspace/your_files/`.
- **The gallery page was a static server component** (no data
  fetching). Listing the user's custom templates makes it
  async (the /shared page, Day 28, already does this: it
  fetches the user's own share links with the user client).
- **The "Save as template" entry point is `DocumentActions`**
  (the per-document actions row in `library-forms.tsx` —
  rename, move, delete, duplicate, star). A save form there
  follows the same server-action + `useActionState` pattern
  as the rename form.
- **The apply form is `ApplyTemplateForm`** (title input +
  "Use this template" button). A custom template needs the
  same form but a different action (the bytes come from
  Storage, not from disk) — a second form component
  (`ApplyUserTemplateForm`), plus `DeleteUserTemplateForm`
  and `RenameUserTemplateForm`.

## 2. What was built

- **Migration** `supabase/migrations/20261121010000_forma_user_templates.sql`
  (copy in `~/workspace/your_files/forma-user-templates-migration.sql`
  for the owner to run): a `user_templates` table (id,
  workspace_id, source_document_id nullable with `on delete
  set null`, name, description nullable, file_path, mime_type,
  size_bytes, created_by, created_at), comments, an index on
  (workspace_id, created_at desc), RLS (select/insert/update/
  delete by workspace membership), and the GRANTS section.
- **`buildTemplateStoragePath`** in `src/lib/storage.ts`:
  `<workspace_id>/templates/<template_id>/<sanitised name>`.
- **Four server actions** in `src/features/library/actions.ts`:
  `saveAsTemplate` (copies the document's file to the template
  path + inserts the row; rolls back the copy if the insert
  fails; refuses a document with no file), `applyUserTemplate`
  (copies the template file to a new document's version-1 path
  + inserts the document + version-1 row; rolls back on
  failure), `deleteUserTemplate` (deletes the row + the Storage
  file; never touches the source document), `renameUserTemplate`
  (name + description only). All require the editor role.
- **The "Save as template" form** in `DocumentActions`
  (a name input defaulting to the document title + an optional
  description + a button), shown only when the document has a
  file.
- **The "My templates" section** in the templates page (now
  async): each custom template shows a file-type icon, its name,
  description, file type and saved date, with an Apply form and
  a Manage details (rename + delete forms). If the migration
  is not applied, the section shows the honest setup note and
  the built-in gallery still renders.
- **Types**: the `user_templates` table added to
  `src/types/database.types.ts` (Row/Insert/Update).

## 3. Tests

- **Unit: 422 passed, 0 failed, 9 skipped** (8 new: the
  template Storage path (incl. a path-traversal case), the
  save/apply/delete/rename schemas). Typecheck + build pass.
- **Live e2e: PENDING the migration.** The harness
  (`scripts/e2e-user-templates-test.mjs`) is written and ready:
  it saves a document as a template (the row + a separate
  Storage copy), applies it (a new document with the right
  MIME type + version 1), renames it, deletes it (the row and
  the file are gone, the source document survives), checks
  cross-user isolation and signed-out 307. It currently fails
  at the first check — "Could not find the table
  'public.user_templates' in the schema cache" — because the
  migration is not applied. **Two harness bugs were fixed
  while writing it**: (1) a `head:true` count query gives a
  FALSE POSITIVE for table existence (PostgREST returns 404
  with an empty body, which the client does not surface as an
  error) — the check now uses a real `select().limit(1)`; (2)
  the files-page HTML fetched before the upload does not list
  the new document, so the page is re-fetched after the upload
  before looking for the save form.
- **The direct-Postgres route is still closed**: TCP 5432 is
  reachable but the TLS handshake is intercepted ("received
  invalid response to SSL negotiation"), and the `.env.local`
  has no DB password — so the migration cannot be applied
  from this VM. The owner applies it in the Dashboard SQL
  Editor, as for Days 21/25.

## 4. Honest limits

- A custom template has no thumbnail and no content preview
  (LibreOffice is not available in the app runtime, so no
  first-page render can be made at save time) — it shows the
  file-type icon instead.
- The template is a snapshot of the document's file at save
  time; later edits to the source document do not update it.
- Deleting the source document does not delete the template
  (the template holds its own copy; the source_document_id is
  set to null).

## 5. Docs + commit

- `docs/feature-matrix.csv` — FORMA-039.
- `CHANGELOG.md` — Day 31 entry.
- `docs/project-brief/FEATURE_AUDIT.md` — §3.12 row and §8
  updated (custom templates done, pending the migration).
- `docs/project-brief/FEATURE_LOOP.md` — queue item 15
  (Day 31) marked Done (live e2e pending).
- `docs/known-limitations.md` — the Templates limits entry
  updated for custom templates.
- `docs/handoffs/day-31-plan.md` + this handoff.
- Local branch `day-31-user-templates`; the GitHub snapshot
  push is the next step.
- The migration file for the owner:
  `~/workspace/your_files/forma-user-templates-migration.sql`.

## 6. What is still open

- **The owner must apply the Day 31 migration** (Supabase
  Dashboard → SQL Editor → run
  `forma-user-templates-migration.sql`), then tell me — I
  will run the live e2e harness immediately and report the
  result. Until then the feature is code-complete but not
  live-verified, and the gallery shows the setup note.
- **The Vercel deployment is still blocked** on the owner's
  re-authorization (403 on the `muhmmad-anas-projects` team
  scope) or a self-import from the Vercel dashboard.
- **The next feature** (the follow-up list, in order):
  stamps/watermarks, insert-pages-from-an-image, Day 25's
  "export with comments" + "local reviewer notes" half,
  deleting the /plan route, a live 390px render, the
  docserver reinstall.
