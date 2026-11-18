-- Local-test harness only. NEVER run against the Supabase project:
-- it mocks the auth schema that Supabase provides natively.
--
-- Creates the roles (anon, authenticated, service_role) and a minimal
-- auth.users table plus an auth.uid() stub that reads the session
-- setting app.current_user_id. Run BEFORE the migration under test.

-- Roles live at cluster level, so guard against re-runs.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select current_setting('app.current_user_id', true)::uuid;
$$;

-- Minimal mock of Supabase Storage, so the Day 4 migration's
-- storage.objects policies can be applied and tested locally.
-- Only the columns and helpers the policies use are mocked.
create schema if not exists storage;

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  metadata jsonb
);

alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
revoke all on storage.objects from anon;

-- foldername(path) -> folder segments, e.g. 'a/b/file.txt' -> {a,b}
create or replace function storage.foldername(name text)
  returns text[] stable language sql as $$
    select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1) - 1]
  $$;
