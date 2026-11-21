# Day 31 plan — Save a custom template

Owner instruction (2026-11-21 20:25 PKT): "okay go head
implement the next feature properly by using feature
loop.md". The next feature is the first item of the
follow-up list (Day 30 handoff §7): "save a custom
template" — turn one of your own documents into a template
you can reuse. The audit §3.12 / §8 records it as "User-
created reusable templates stored locally — Not started".

## 1. Research (done)

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
- **The migration pattern is the Day 25 shares migration**
  (`supabase/migrations/20261118090000_forma_shares.sql`):
  a table + comments + indexes + RLS (select/insert/update/
  delete by workspace membership, via the one-argument
  `app_private.is_workspace_member(workspace_id)` helper).
  The owner applies migrations in the Supabase Dashboard SQL
  Editor from a file in `~/workspace/your_files/`.
- **The gallery page is a static server component** (no data
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
  Storage, not from disk) — a second form component, or the
  same form with the action passed in.

## 2. The feature (scope)

| Piece | Behaviour |
|---|---|
| Save | From a document's actions menu: a name (defaults to the document title) + an optional description. The document's current file is COPIED to the template path (a snapshot — editing the document later never changes the template), and a `user_templates` row is created. Refused when the document has no file (a title-only document cannot be a template) or the name is empty. |
| List | The Templates gallery gains a "My templates" section above the built-in templates: each custom template shows a file-type icon (the Day 29 `FileTypeIcon`), its name, description, file type, and the date it was saved. |
| Apply | "Use this template" on a custom template creates a new document in the library (version 1) by copying the template file in Storage — no download/upload round-trip. The template itself is never changed. |
| Delete | The owner (or a workspace editor) can delete a custom template: the row and its Storage file are both removed. |
| Rename | (Stretch, same pattern as renameDocument.) A custom template's name + description can be edited. |

**Honest limits to record:** a custom template has no
thumbnail and no content preview (LibreOffice is not
available in the app runtime, so no first-page render can be
made at save time) — it shows the file-type icon instead.
The template is a snapshot of the document's file at save
time; later edits to the source document do not update it.
Deleting the source document does not delete the template
(the template holds its own copy).

## 3. Small tasks (in order)

1. **Migration.** `supabase/migrations/20261121010000_forma_user_templates.sql`
   + a copy in `~/workspace/your_files/forma-user-templates-migration.sql`
   for the owner to run: a `user_templates` table (id, workspace_id,
   source_document_id nullable with `on delete set null`, name,
   description nullable, file_path, mime_type, size_bytes, created_by,
   created_at), comments, an index on (workspace_id, created_at desc),
   RLS (select/insert/delete by workspace membership; update by
   workspace membership for the rename). Test: the SQL parses and
   the table exists after the owner applies it (verified live).
2. **Storage path helper.** `buildTemplateStoragePath(workspaceId,
   templateId, fileName)` in `src/lib/storage.ts` (+ a unit test).
   Test: the path is `<ws>/templates/<id>/<sanitised name>`.
3. **Save action.** `saveAsTemplate` in
   `src/features/library/actions.ts` (+ a Zod schema in
   `schemas.ts`): the document exists in the workspace, the user
   has the editor role, the document has a file; copy the file to
   the template path; insert the row; roll back the copy if the
   insert fails. Test: the unit test for the schema; the live e2e.
4. **List + apply + delete actions.** `listMyTemplates` (a server
   query, in `src/lib/user-templates.server.ts` or the library
   queries), `applyUserTemplate` (copy the template file to a new
   document path + insert the document + version-1 row, roll back
   on failure), `deleteUserTemplate` (delete the row + the Storage
   file), `renameUserTemplate` (stretch). Test: the live e2e.
5. **The "Save as template" form.** A form in `DocumentActions`
   (`library-forms.tsx`): a name input (defaulting to the document
   title) + an optional description + a "Save as template" button,
   wired to `saveAsTemplate` with `useActionState`. Test: the live
   e2e (the form is present on the library page).
6. **The gallery "My templates" section.** The templates page
   becomes async, fetches the user's custom templates, and renders
   a "My templates" section (file-type icon + name + description +
   type + saved date + an Apply form + a Delete form) above the
   built-in templates. Test: the live e2e.
7. **Unit tests.** The storage-path helper, the save/apply/delete
   schemas, and a registry-style test that the custom-template
   types are consistent. Test: the suite passes.
8. **Live e2e.** A Day 31 harness (`scripts/e2e-user-templates-test.mjs`,
   the Day 16/30 pattern): save a document as a template (the row
   exists, the Storage file is a copy, editing the source document
   does not change the template), apply it (a new document with the
   right MIME type + version 1), delete it (the row and the file are
   gone), a document with no file is refused, cross-user isolation
   (user B does not see A's templates), signed-out 307.
   Test: the harness passes.
9. **Docs + commit + handoff + reply.** Feature matrix (FORMA-039),
   known-limitations, CHANGELOG, the audit §3.12 + §8 rows → Done,
   the loop queue (add a Day 31 row), MEMORY.md, the migration file
   for the owner (attached to the reply), the handoff, the commit on
   `day-31-user-templates`, the GitHub snapshot push, the reply.

## 4. What the owner must do

- **Apply the migration** in the Supabase Dashboard SQL Editor
  (the file is attached to the delivery reply). Until it is
  applied, the save/list/apply/delete actions fail with the
  honest "the templates table is not set up yet" error (the
  `LibraryNotReady` pattern) — the feature must not be
  presented as working before the migration is applied.
