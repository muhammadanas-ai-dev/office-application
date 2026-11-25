-- Forma Office — local reviewer notes (Day 34).
--
-- A reviewer note is a private note on a document, stored in
-- Forma only: it is never written into the document's file and
-- never shown on a share link. Notes belong to the user who
-- wrote them (RLS owner-only) — "local" means single-user, in
-- Forma (audit §10.1 is the single-user sharing item;
-- multi-user co-editing stays skipped).
--
-- Run this in the Supabase Dashboard SQL Editor.
create table if not exists public.document_notes (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.document_notes is
  'Local reviewer notes on a document (Day 34). Stored in Forma only — never written into the file, never shown on share links.';
comment on column public.document_notes.body is
  'The note text (plain text, at most 2000 chars — enforced by the app).';
comment on column public.document_notes.resolved is
  'True when the owner marked the note resolved.';

-- Indexes: list a document's notes newest first (the panel).
create index if not exists document_notes_document_idx
  on public.document_notes (document_id, created_at desc);

alter table public.document_notes enable row level security;

-- Owner-only: a user can read only their own notes.
-- NOTE: the helpers take ONE argument (the workspace id) — they
-- read auth.uid() internally. Calling them with (workspace_id,
-- auth.uid()) fails with 42883 "function does not exist".
drop policy if exists "document_notes select own" on public.document_notes;
create policy "document_notes select own" on public.document_notes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select app_private.is_workspace_member(workspace_id))
  );

-- A user can add a note to a document in their workspace, as
-- themselves.
drop policy if exists "document_notes insert own" on public.document_notes;
create policy "document_notes insert own" on public.document_notes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select app_private.is_workspace_member(workspace_id))
  );

-- A user can update (resolve / reopen / edit) only their own
-- notes.
drop policy if exists "document_notes update own" on public.document_notes;
create policy "document_notes update own" on public.document_notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A user can delete only their own notes.
drop policy if exists "document_notes delete own" on public.document_notes;
create policy "document_notes delete own" on public.document_notes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Grants: the authenticated role needs table access (a new table
-- MUST include the GRANTS section, or the authenticated role gets
-- "permission denied for table").
grant select, insert, update, delete on public.document_notes to authenticated;
revoke all on public.document_notes from anon;
