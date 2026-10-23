-- Reviewed recovery ONLY after cutover policies are present, compatible app is drained,
-- old credential has been replaced and all pending journals have been inventoried.
-- This restores the scoped writer; it never restores anonymous write privileges.
BEGIN;
SET LOCAL lock_timeout='3s';
ALTER POLICY buffalo_integrity_writer_scope ON storage.objects
USING (bucket_id='slipstorage' AND name ~ '^(operations/[0-9a-f]{64}/[0-9a-f-]{36}/[a-zA-Z0-9._-]+|buffalo/[1-9][0-9]*\.jpg|json/[1-9][0-9]*\.json)$')
WITH CHECK (bucket_id='slipstorage' AND name ~ '^(operations/[0-9a-f]{64}/[0-9a-f-]{36}/[a-zA-Z0-9._-]+|buffalo/[1-9][0-9]*\.jpg|json/[1-9][0-9]*\.json)$');
GRANT SELECT, INSERT, UPDATE ON storage.objects TO buffalo_integrity_writer;
GRANT buffalo_integrity_writer TO authenticator;
NOTIFY pgrst,'reload schema';
COMMIT;
