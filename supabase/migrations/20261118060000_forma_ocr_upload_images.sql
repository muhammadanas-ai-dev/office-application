-- Forma — OCR image uploads (Day 13, follow-up).
--
-- The OCR feature reads scanned images (PNG/JPEG), so the
-- `documents` bucket must accept them. The app's own upload
-- validation (src/lib/storage.ts ALLOWED_UPLOAD_TYPES) gained
-- png/jpg/jpeg at the same time, and the file picker builds its
-- `accept` list from that map, so the UI follows automatically.
--
-- NOTE: this change was applied live on 2026-11-18 through the
-- Supabase Storage API (updateBucket) so the OCR live e2e could
-- run the same day; this file records it for reproducibility.
-- Running it again is safe — it just sets the same list.

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
  'application/vnd.oasis.opendocument.presentation',
  'image/png',
  'image/jpeg'
]
where id = 'documents';
