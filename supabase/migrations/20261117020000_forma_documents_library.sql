-- Forma Office — Day 4: document library, folders, versions, stars.
--
-- Depends on 20261117010000_forma_auth_workspace.sql (profiles,
-- workspaces, workspace_members, app_private helpers). Apply the
-- migrations in filename order in the Supabase dashboard SQL Editor.
--
-- Model:
-- * folders: nested by parent_id (NULL = workspace root). Soft
--   delete via deleted_at; the Trash page lists deleted rows.
-- * documents: metadata only — file bytes live in the private
--   `documents` Storage bucket, never in Postgres. file_path is NULL
--   for a blank document created in the app (its first file is
--   written by the Day 5 editor on first save).
-- * document_versions: one immutable row per saved file. The
--   documents row always points at the latest version.
-- * document_stars: per-user starring (a star is a user-level
--   preference, so it cannot live on the document row).
-- * workspaces.is_personal: Day 3 dedupe cleanup — one personal
--   workspace per owner, enforced by a partial unique index. The
--   backfill marks each owner's earliest workspace personal.
--
-- RLS: every row is visible only to members of its workspace
-- (app_private.is_workspace_member). Creating, renaming, moving and
-- soft-deleting need role editor or above; hard (permanent) delete
-- needs owner or admin. SELECT has no deleted_at filter — the app
-- filters; the Trash page must be able to select deleted rows.
--
-- Storage policies on storage.objects (bucket `documents`): the
-- object path always starts with the workspace id
-- (<workspace_id>/<document_id>/v<n>/<filename>), so the policy
-- reads the workspace from the first path segment with
-- storage.foldername(name)[1]. A path that does not start with a
-- valid workspace uuid fails the cast and the policy denies —
-- fail-closed by design. Upsert needs INSERT + SELECT + UPDATE
-- policies (Supabase checklist).

-- Trigram search on document titles.
create extension if not exists pg_trgm;

-- ------------------------------------------------------------------
-- Day 3 cleanup: one personal workspace per owner
-- ------------------------------------------------------------------
alter table public.workspaces
  add column if not exists is_personal boolean not null default false;

-- Backfill: each owner's earliest workspace becomes their personal one.
update public.workspaces w
  set is_personal = true
  where w.id in (
    select distinct on (owner_id) id
    from public.workspaces
    order by owner_id, created_at asc
  );

create unique index if not exists workspaces_one_personal_per_owner
  on public.workspaces (owner_id)
  where is_personal;

-- ------------------------------------------------------------------
-- folders
-- ------------------------------------------------------------------
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id)
    on delete cascade,
  parent_id uuid references public.folders (id)
    on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists folders_workspace_parent_idx
  on public.folders (workspace_id, parent_id);
create index if not exists folders_workspace_deleted_idx
  on public.folders (workspace_id)
  where deleted_at is not null;
-- One folder name per parent (NULL parent = workspace root).
create unique index if not exists folders_unique_name_idx
  on public.folders (
    workspace_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    name
  )
  where deleted_at is null;

drop trigger if exists folders_set_updated_at on public.folders;
create trigger folders_set_updated_at
  before update on public.folders
  for each row execute function app_private.set_updated_at();

-- ------------------------------------------------------------------
-- documents
-- ------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id)
    on delete cascade,
  folder_id uuid references public.folders (id)
    on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  file_path text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  version integer not null default 1 check (version >= 1),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists documents_workspace_folder_idx
  on public.documents (workspace_id, folder_id);
create index if not exists documents_workspace_updated_idx
  on public.documents (workspace_id, updated_at desc);
create index if not exists documents_workspace_deleted_idx
  on public.documents (workspace_id)
  where deleted_at is not null;
create index if not exists documents_title_trgm_idx
  on public.documents using gin (title gin_trgm_ops);

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function app_private.set_updated_at();

-- ------------------------------------------------------------------
-- document_versions (immutable)
-- ------------------------------------------------------------------
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id)
    on delete cascade,
  workspace_id uuid not null references public.workspaces (id)
    on delete cascade,
  version_number integer not null check (version_number >= 1),
  file_path text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create index if not exists document_versions_document_idx
  on public.document_versions (document_id, version_number desc);

-- ------------------------------------------------------------------
-- document_stars (per-user)
-- ------------------------------------------------------------------
create table if not exists public.document_stars (
  document_id uuid not null references public.documents (id)
    on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

create index if not exists document_stars_user_idx
  on public.document_stars (user_id);

-- ------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------
alter table public.folders enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_stars enable row level security;

-- folders
drop policy if exists "folders select member" on public.folders;
create policy "folders select member" on public.folders
  for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)));

drop policy if exists "folders insert editor" on public.folders;
create policy "folders insert editor" on public.folders
  for insert to authenticated
  with check (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin', 'editor')
  );

drop policy if exists "folders update editor" on public.folders;
create policy "folders update editor" on public.folders
  for update to authenticated
  using (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin', 'editor')
  )
  with check (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin', 'editor')
  );

drop policy if exists "folders delete owner admin" on public.folders;
create policy "folders delete owner admin" on public.folders
  for delete to authenticated
  using (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin')
  );

-- documents
drop policy if exists "documents select member" on public.documents;
create policy "documents select member" on public.documents
  for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)));

drop policy if exists "documents insert editor" on public.documents;
create policy "documents insert editor" on public.documents
  for insert to authenticated
  with check (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin', 'editor')
  );

drop policy if exists "documents update editor" on public.documents;
create policy "documents update editor" on public.documents
  for update to authenticated
  using (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin', 'editor')
  )
  with check (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin', 'editor')
  );

drop policy if exists "documents delete owner admin" on public.documents;
create policy "documents delete owner admin" on public.documents
  for delete to authenticated
  using (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin')
  );

-- document_versions: readable by workspace members, insertable by
-- editors (a new save), never updated, deletable only by owner/admin.
drop policy if exists "versions select member" on public.document_versions;
create policy "versions select member" on public.document_versions
  for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)));

drop policy if exists "versions insert editor" on public.document_versions;
create policy "versions insert editor" on public.document_versions
  for insert to authenticated
  with check (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin', 'editor')
    -- the version must belong to a document in the same workspace
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.workspace_id = workspace_id
    )
  );

drop policy if exists "versions delete owner admin" on public.document_versions;
create policy "versions delete owner admin" on public.document_versions
  for delete to authenticated
  using (
    (select app_private.is_workspace_member(workspace_id))
    and (select app_private.workspace_role(workspace_id))
      in ('owner', 'admin')
  );

-- document_stars: a user manages only their own stars, and only on
-- documents in workspaces they belong to.
drop policy if exists "stars select own" on public.document_stars;
create policy "stars select own" on public.document_stars
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.documents d
      where d.id = document_id
        and (select app_private.is_workspace_member(d.workspace_id))
    )
  );

drop policy if exists "stars insert own" on public.document_stars;
create policy "stars insert own" on public.document_stars
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.documents d
      where d.id = document_id
        and (select app_private.is_workspace_member(d.workspace_id))
    )
  );

drop policy if exists "stars delete own" on public.document_stars;
create policy "stars delete own" on public.document_stars
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------------------------------------------
-- Grants (least privilege: app roles only)
-- ------------------------------------------------------------------
grant select, insert, update, delete
  on public.folders, public.documents,
     public.document_versions, public.document_stars
  to authenticated;
revoke all
  on public.folders, public.documents,
     public.document_versions, public.document_stars
  from anon;

-- ------------------------------------------------------------------
-- Storage policies for the private `documents` bucket.
-- Path layout: <workspace_id>/<document_id>/v<n>/<filename>
-- ------------------------------------------------------------------
drop policy if exists "documents objects select member" on storage.objects;
create policy "documents objects select member" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (select app_private.is_workspace_member(
      (storage.foldername(name))[1]::uuid
    ))
  );

drop policy if exists "documents objects insert member" on storage.objects;
create policy "documents objects insert member" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (select app_private.is_workspace_member(
      (storage.foldername(name))[1]::uuid
    ))
  );

drop policy if exists "documents objects update member" on storage.objects;
create policy "documents objects update member" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (select app_private.is_workspace_member(
      (storage.foldername(name))[1]::uuid
    ))
  )
  with check (
    bucket_id = 'documents'
    and (select app_private.is_workspace_member(
      (storage.foldername(name))[1]::uuid
    ))
  );

drop policy if exists "documents objects delete member" on storage.objects;
create policy "documents objects delete member" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (select app_private.is_workspace_member(
      (storage.foldername(name))[1]::uuid
    ))
  );
