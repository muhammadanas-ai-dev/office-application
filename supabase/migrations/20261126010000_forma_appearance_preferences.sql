-- Forma Office — appearance, language & accessibility (F32).
--
-- Seven per-user preferences on the profiles table (its RLS
-- already lets the user update their own row):
--   theme         — 'light' | 'dark' | 'system'
--   locale        — 'en-GB' | 'en-US' | 'ur-PK'
--   date_format   — 'dmy' | 'mdy' | 'ymd'
--   number_format — 'comma-dot' | 'dot-comma' | 'space-comma'
--   reduce_motion / larger_text / high_contrast — booleans
--
-- Run this in the Supabase Dashboard SQL Editor. It only adds
-- columns with defaults — existing profiles get the defaults
-- and no existing data changes. (profiles.locale already
-- exists from the base schema with default 'en'; it is
-- normalised to 'en-GB' below.)
alter table public.profiles
  add column if not exists theme text not null default 'system'
    check (theme in ('light', 'dark', 'system')),
  add column if not exists date_format text not null default 'dmy'
    check (date_format in ('dmy', 'mdy', 'ymd')),
  add column if not exists number_format text not null default 'comma-dot'
    check (number_format in ('comma-dot', 'dot-comma', 'space-comma')),
  add column if not exists reduce_motion boolean not null default false,
  add column if not exists larger_text boolean not null default false,
  add column if not exists high_contrast boolean not null default false;

update public.profiles set locale = 'en-GB' where locale = 'en';
alter table public.profiles alter column locale set default 'en-GB';
alter table public.profiles
  drop constraint if exists profiles_locale_check;
alter table public.profiles
  add constraint profiles_locale_check
  check (locale in ('en-GB', 'en-US', 'ur-PK'));

comment on column public.profiles.theme is
  'Appearance theme: light, dark or system (F32).';
comment on column public.profiles.locale is
  'Preferred language/locale for dates (F32).';
comment on column public.profiles.date_format is
  'Date order: dmy, mdy or ymd (F32).';
comment on column public.profiles.number_format is
  'Number style: comma-dot (1,234.56), dot-comma (1.234,56) or space-comma (F32).';
comment on column public.profiles.reduce_motion is
  'Accessibility: reduce animation and transitions (F32).';
comment on column public.profiles.larger_text is
  'Accessibility: larger base text size (F32).';
comment on column public.profiles.high_contrast is
  'Accessibility: stronger text and border contrast (F32).';
