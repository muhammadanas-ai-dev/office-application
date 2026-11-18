-- Day 21 — searchable PDF after OCR: store the OCR word boxes
-- so "Make searchable" can place the invisible text over the
-- words in the scanned PDF.
--
-- Run this in the Supabase Dashboard SQL Editor (the project
-- already has the ocr_jobs + document_ocr_results tables from
-- the Day 13 migration). It only adds a column — it does not
-- change any existing data.
alter table public.document_ocr_results
  add column if not exists words jsonb;

-- The words are an array of
-- {text, confidence, left, top, width, height} per page
-- (left/top/width/height in image pixels at the 300 DPI render).
-- Nullable: OCR results from before this migration have no
-- words stored, and "Make searchable" tells the user to run OCR
-- again for those.
comment on column public.document_ocr_results.words is
  'The recognised words with their bounding boxes (image pixels at 300 DPI), for the searchable-PDF text layer.';
