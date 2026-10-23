-- First set application MODE=drain; reconcile every signed/pending operation, then MODE=off.
-- Roll back ONLY to a server-mediated coordinator-compatible app. Keep these protections and journals.
-- This optional credential revocation is safe only after the pending-job/drain gate is closed.
BEGIN;
SET LOCAL lock_timeout='3s';
ALTER POLICY buffalo_integrity_writer_scope ON storage.objects USING (false) WITH CHECK (false);
REVOKE SELECT, INSERT, UPDATE ON storage.objects FROM buffalo_integrity_writer;
REVOKE buffalo_integrity_writer FROM authenticator;
-- Intentionally no DROP/DELETE, no policy removal, no anonymous-write restoration, no chain compensation.
NOTIFY pgrst,'reload schema';
COMMIT;
