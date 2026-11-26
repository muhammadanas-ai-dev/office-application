-- Forma Office — bucket image formats (F34).
--
-- The documents Storage bucket has an allowed-MIME-types
-- list that mirrors the app's upload types. WEBP and TIFF
-- uploads are refused by Storage until the two image types
-- are on that list. This update adds them (idempotent —
-- safe to run more than once).
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m)
  from unnest(allowed_mime_types || array['image/webp', 'image/tiff']) as m
)
where id = 'documents';
