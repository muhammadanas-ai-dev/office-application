-- Forma Office — Day 3: identity, workspaces and membership (RLS)
--
-- Applies to the Supabase project (ref pwncfcvnwudbvwcumado) via the
-- Dashboard SQL Editor, because direct Postgres (port 5432) is blocked
-- from this machine by the runtime network policy. See
-- docs/architecture/schema-and-rls.md for the rationale and for how to
-- apply this file.
--
-- Design notes (rules followed: supabase skill security checklist,
-- supabase-postgres-best-practices security-rls-basics,
-- security-rls-performance, security-privileges,
-- schema-foreign-key-indexes):
--
-- * RLS is enabled on every table in the exposed `public` schema.
-- * Policies use `TO authenticated` plus an ownership predicate
--   (never `auth.role()` and never bare `TO authenticated`).
-- * `auth.uid()` is wrapped in `(select ...)` so it is evaluated once.
-- * UPDATE policies carry both USING and WITH CHECK.
-- * Membership checks live in SECURITY DEFINER helpers in the
--   non-exposed `app_private` schema, because the policies on
--   `workspaces` and `workspace_members` reference each other and
--   would otherwise recurse. Each helper checks `auth.uid()` inside
--   its own body and fixes `search_path`.
--   EXECUTE is revoked ONLY from `anon`: RLS policies evaluate the
--   helpers as the querying user, so revoking EXECUTE from
--   `authenticated` (or from PUBLIC, which includes it) breaks the
--   policies outright — verified by local test T2 on Postgres 16.
--   The real protection is the non-exposed schema: the Data API
--   cannot reach functions in `app_private` at all.
-- * RLS is NOT forced (`force row level security` is deliberately
--   absent): the server-side admin client (service_role) is the
--   legitimate provisioning path for profiles/workspaces/members,
--   and forcing RLS would block it. All user access goes through RLS.
-- * No `handle_new_user` trigger: provisioning happens in the
--   sign-up/sign-in server actions via the admin client, so no
--   SECURITY DEFINER trigger is needed on `auth.users`.
-- * `user_metadata` is never used for authorization (it is
--   user-editable). Roles live only in `workspace_members`.

begin;

-- ------------------------------------------------------------------
-- Private helper schema (never exposed to the Data API)
-- ------------------------------------------------------------------
create schema if not exists app_private;

-- ------------------------------------------------------------------
-- profiles: one row per auth user, id = auth.users.id
-- ------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 100),
  avatar_path text,
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- workspaces: a personal workspace is created for every user at
-- sign-up; team workspaces are invited into on Day 10.
-- ------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid not null references auth.users (id) on delete cascade,
  plan_key text not null default 'free'
    check (plan_key in ('free', 'pro', 'team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspaces_owner_id_idx
  on public.workspaces (owner_id);

-- ------------------------------------------------------------------
-- workspace_members: the only source of roles. One row per
-- (workspace, user); a user with no row has no access at all.
-- ------------------------------------------------------------------
create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor'
    check (role in ('owner', 'admin', 'editor', 'commenter', 'viewer')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'removed')),
  joined_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

-- The unique (workspace_id, user_id) index serves the membership
-- lookups; this second index serves "all workspaces for this user".
create index if not exists workspace_members_user_id_idx
  on public.workspace_members (user_id, workspace_id);

-- ------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER, private schema, fixed path)
-- ------------------------------------------------------------------
create or replace function app_private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

create or replace function app_private.workspace_role(p_workspace_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = (select auth.uid())
    and status = 'active'
  limit 1;
$$;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app_private.set_updated_at();

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function app_private.set_updated_at();

-- Helpers are RLS internals in a non-exposed schema (not reachable
-- via the Data API). EXECUTE stays granted to `authenticated`:
-- policies call these helpers as the querying user, and revoking it
-- breaks every workspace/member policy (local test T2). The schema
-- itself needs USAGE for `authenticated` too — without it the same
-- policies fail with "permission denied for schema app_private"
-- (local test T9). Only `anon` is revoked — it has no session, so
-- auth.uid() is NULL for it.
grant usage on schema app_private to authenticated;
revoke execute on function app_private.is_workspace_member(uuid)
  from anon;
revoke execute on function app_private.workspace_role(uuid)
  from anon;

-- ------------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- profiles: a user reads and edits only their own row. No INSERT /
-- DELETE policy: rows are created and removed by the server-side
-- admin client (sign-up provisioning, auth user deletion cascade).
drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- workspaces: readable by members, created by its owner, changed or
-- deleted only by its owner.
drop policy if exists "workspaces select member" on public.workspaces;
create policy "workspaces select member" on public.workspaces
  for select to authenticated
  using ((select app_private.is_workspace_member(id)));

drop policy if exists "workspaces insert owner" on public.workspaces;
create policy "workspaces insert owner" on public.workspaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "workspaces update owner" on public.workspaces;
create policy "workspaces update owner" on public.workspaces
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "workspaces delete owner" on public.workspaces;
create policy "workspaces delete owner" on public.workspaces
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- workspace_members: readable by members; managed only by the
-- workspace owner or an admin. The owner row can never be deleted
-- by the owner themself (prevents locking a workspace with no owner;
-- owner transfer is a Day 10 feature).
drop policy if exists "members select member" on public.workspace_members;
create policy "members select member" on public.workspace_members
  for select to authenticated
  using ((select app_private.is_workspace_member(workspace_id)));

drop policy if exists "members insert by owner admin" on public.workspace_members;
create policy "members insert by owner admin" on public.workspace_members
  for insert to authenticated
  with check (
    (select app_private.workspace_role(workspace_id)) in ('owner', 'admin')
  );

drop policy if exists "members update by owner admin" on public.workspace_members;
create policy "members update by owner admin" on public.workspace_members
  for update to authenticated
  using (
    (select app_private.workspace_role(workspace_id)) in ('owner', 'admin')
  )
  with check (
    (select app_private.workspace_role(workspace_id)) in ('owner', 'admin')
  );

drop policy if exists "members delete by owner admin" on public.workspace_members;
create policy "members delete by owner admin" on public.workspace_members
  for delete to authenticated
  using (
    (select app_private.workspace_role(workspace_id)) in ('owner', 'admin')
    and not (user_id = (select auth.uid()) and role = 'owner')
  );

-- ------------------------------------------------------------------
-- Least-privilege grants (Data API exposure + RLS is the row gate)
-- ------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.profiles, public.workspaces, public.workspace_members
  to authenticated;
revoke all
  on public.profiles, public.workspaces, public.workspace_members
  from anon;

commit;
