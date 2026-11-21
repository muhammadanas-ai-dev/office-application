-- Forma Office — user-created templates (Day 31).
--
-- A custom template is a snapshot of one of the user's own
-- documents: the document's current file is COPIED to the
-- template path in the `documents` Storage bucket
-- (<workspace_id>/templates/<template_id>/<filename>), and a
-- row in this table records the name, description, file path,
-- MIME type and size. Editing the source document later never
-- changes the template (it holds its own copy), and deleting
-- the source document does not delete the template (the
-- source_document_id is set to null on delete).
--
-- The template file lives in the `documents` bucket, so the
-- existing Storage policies apply unchanged: the object path
-- starts with the workspace id, so workspace members can
-- read/write/delete it.
--
-- Run this in the Supabase Dashboard SQL Editor.
create table if not exists public.user_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_document_id uuid references public.documents (id) on delete set null,
  name text not null check (char_length(btrim(name)) > 0 and char_length(name) <= 200),
  description text check (description is null or char_length(description) <= 500),
  file_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.user_templates is
  'User-created templates (Day 31). A snapshot of a document''s file at save time; the template holds its own Storage copy.';
comment on column public.user_templates.source_document_id is
  'The document the template was saved from, for reference. Set to null when that document is deleted — the template survives.';
comment on column public.user_templates.file_path is
  'The template file in the documents bucket: <workspace_id>/templates/<template_id>/<filename>.';
comment on column public.user_templates.size_bytes is
  'The template file size in bytes.';

-- Index: list a workspace's templates, newest first.
create index if not exists user_templates_workspace_idx
  on public.user_templates (workspace_id, created_at desc);

alter table public.user_templates enable row level security;

-- Workspace members can read the workspace's templates (to list
-- them in the gallery).
-- NOTE: the helpers take ONE argument (the workspace id) — they
-- read auth.uid() internally. Calling them with (workspace_id,
-- auth.uid()) fails with 42883 "function does not exist".
drop policy if exists "user_templates select members" on public.user_templates;
create policy "user_templates select members" on public.user_templates
  for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)));

-- Workspace members can create a template in their workspace.
drop policy if exists "user_templates insert members" on public.user_templates;
create policy "user_templates insert members" on public.user_templates
  for insert to authenticated
  with check ((select app_private.is_workspace_member(workspace_id)));

-- Workspace members can rename a template (name + description).
drop policy if exists "user_templates update members" on public.user_templates;
create policy "user_templates update members" on public.user_templates
  for update to authenticated
  using ((select app_private.is_workspace_member(workspace_id)))
  with check ((select app_private.is_workspace_member(workspace_id)));

-- Workspace members can delete a template.
drop policy if exists "user_templates delete members" on public.user_templates;
create policy "user_templates delete members" on public.user_templates
  for delete to authenticated
  using ((select app_private.is_workspace_member(workspace_id)));

-- The GRANTS section (the same shape every Forma migration uses):
-- the table is usable by the authenticated role; the RLS policies
-- above decide who can do what.
grant select, insert, update, delete on public.user_templates to authenticated;
