-- Forma Office — shareable links (Day 25, single-user sharing).
--
-- A share link lets anyone with the link download a document —
-- no account, no sign-in. The link is /s/<token> where <token>
-- is a random 32-hex-char string. The database stores only the
-- SHA-256 HASH of the token (never the token itself), so a
-- database leak does not expose the links. A share can be
-- revoked (revoked_at) and can expire (expires_at, null = never).
--
-- Run this in the Supabase Dashboard SQL Editor.
create table if not exists public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

comment on table public.document_shares is
  'Shareable links for a document (Day 25 single-user sharing). The token itself is never stored — only its SHA-256 hash.';
comment on column public.document_shares.token_hash is
  'SHA-256 hex of the share token. The token is returned once, at creation.';
comment on column public.document_shares.expires_at is
  'When the link stops working. Null means it never expires.';
comment on column public.document_shares.revoked_at is
  'When the owner revoked the link. Null means it is still active.';

-- Indexes: look up a share by its token hash (the public page),
-- and list a document's shares (the manage UI).
create index if not exists document_shares_token_hash_idx
  on public.document_shares (token_hash);
create index if not exists document_shares_document_idx
  on public.document_shares (document_id, created_at desc);

alter table public.document_shares enable row level security;

-- Workspace members can read a document's shares (to manage them).
-- NOTE: the helpers take ONE argument (the workspace id) — they
-- read auth.uid() internally. Calling them with (workspace_id,
-- auth.uid()) fails with 42883 "function does not exist".
drop policy if exists "document_shares select members" on public.document_shares;
create policy "document_shares select members" on public.document_shares
  for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)));

-- Workspace members can create a share for a document in their workspace.
drop policy if exists "document_shares insert members" on public.document_shares;
create policy "document_shares insert members" on public.document_shares
  for insert to authenticated
  with check ((select app_private.is_workspace_member(workspace_id)));

-- The owner/admin/editor can revoke a share (set revoked_at).
-- There is no update policy for the token or the document — only
-- the revoked_at is ever changed, and the route only sets that.
drop policy if exists "document_shares update members" on public.document_shares;
create policy "document_shares update members" on public.document_shares
  for update to authenticated
  using ((select app_private.is_workspace_member(workspace_id)))
  with check ((select app_private.is_workspace_member(workspace_id)));

-- The owner/admin can delete a share row.
drop policy if exists "document_shares delete owner admin" on public.document_shares;
create policy "document_shares delete owner admin" on public.document_shares
  for delete to authenticated
  using (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin')
  );

-- Grants: the authenticated role needs table access (a new table
-- MUST include the GRANTS section, or the authenticated role gets
-- "permission denied for table").
grant select, insert, update, delete on public.document_shares to authenticated;
revoke all on public.document_shares from anon;
