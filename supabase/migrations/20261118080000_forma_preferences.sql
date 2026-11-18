-- Forma Office — user preferences (Day 24).
--
-- Three per-user preferences on the profiles table (1:1 with
-- the user, and its RLS already lets the user update their own
-- row):
--   ocr_language        — the OCR page's default language
--                         ('eng' | 'urd' | 'ara')
--   image_export_format — the library "Export images" link's
--                         default format ('png' | 'jpg')
--   image_export_dpi    — the library "Export images" link's
--                         default DPI (72 | 150 | 300)
--
-- Run this in the Supabase Dashboard SQL Editor. It only adds
-- three columns with defaults — it does not change any existing
-- data, and existing profiles get the defaults.
alter table public.profiles
  add column if not exists ocr_language text not null default 'eng'
    check (ocr_language in ('eng', 'urd', 'ara')),
  add column if not exists image_export_format text not null default 'png'
    check (image_export_format in ('png', 'jpg')),
  add column if not exists image_export_dpi integer not null default 150
    check (image_export_dpi in (72, 150, 300));

comment on column public.profiles.ocr_language is
  'The OCR page''s default language (Day 24 preferences).';
comment on column public.profiles.image_export_format is
  'The library "Export images" link''s default format (Day 24 preferences).';
comment on column public.profiles.image_export_dpi is
  'The library "Export images" link''s default DPI (Day 24 preferences).';
