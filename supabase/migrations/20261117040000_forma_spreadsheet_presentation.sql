-- Forma Office — Phase A (WPS level): spreadsheets + presentations.
--
-- No new tables: the editor extension is code-only (documentType
-- cell/slide in src/lib/editor.ts, format-agnostic save callback).
-- The one schema change is the `documents` Storage bucket's allowed
-- MIME types, extended from the Day 4 set (docx/doc/pdf/txt/odt)
-- to the full Phase A set. The bucket was created live via the
-- Storage API on Day 4 and its MIME list was updated live the same
-- way on Day 6; this migration records that state so a fresh
-- project matches it.
update storage.buckets
set allowed_mime_types = array[
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/pdf',
  'text/plain',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.presentation'
]
where id = 'documents';
