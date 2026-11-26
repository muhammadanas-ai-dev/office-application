-- Forma Office — user fonts (F33).
--
-- Fonts a user uploads for use in Forma's own tools (today:
-- the PDF draw page's Add text). The font file lives in the
-- documents Storage bucket under fonts/<user id>/<font id>;
-- this table holds the catalogue row. RLS: a user sees and
-- changes only their own fonts.
--
-- Run this in the Supabase Dashboard SQL Editor.
create table if not exists public.user_fonts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  file_path text not null,
  format text not null check (format in ('ttf', 'otf')),
  size_bytes integer not null,
  is_favourite boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_fonts_user_idx
  on public.user_fonts (user_id, created_at desc);

alter table public.user_fonts enable row level security;

drop policy if exists user_fonts_select_own on public.user_fonts;
create policy user_fonts_select_own on public.user_fonts
  for select using (user_id = (select auth.uid()));

drop policy if exists user_fonts_insert_own on public.user_fonts;
create policy user_fonts_insert_own on public.user_fonts
  for insert with check (user_id = (select auth.uid()));

drop policy if exists user_fonts_update_own on public.user_fonts;
create policy user_fonts_update_own on public.user_fonts
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists user_fonts_delete_own on public.user_fonts;
create policy user_fonts_delete_own on public.user_fonts
  for delete using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.user_fonts to authenticated;
grant all on public.user_fonts to service_role;
