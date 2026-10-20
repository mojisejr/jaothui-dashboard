-- Apply only in the explicitly approved release window, after capture + preflight + compatible code/drain.
-- Target: JAOTHUI core Supabase only. Never apply to the event Supabase project.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname='buffalo_integrity') THEN RAISE EXCEPTION 'Apply the owning additive journal migration first'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='buffalo_integrity_writer') THEN
    CREATE ROLE buffalo_integrity_writer NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='buffalo_integrity_writer' AND (rolsuper OR rolbypassrls OR rolinherit OR rolcanlogin))
     OR EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='buffalo_integrity_writer') THEN
    RAISE EXCEPTION 'Storage writer must have no login, bypass or inherited roles';
  END IF;
END $$;
GRANT buffalo_integrity_writer TO authenticator;
GRANT USAGE ON SCHEMA storage TO buffalo_integrity_writer;
GRANT SELECT ON storage.buckets TO buffalo_integrity_writer;
GRANT SELECT, INSERT, UPDATE ON storage.objects TO buffalo_integrity_writer;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON storage.objects FROM buffalo_integrity_writer;
-- Existing permissive policies remain recorded and cannot override these AND restrictions.
CREATE POLICY buffalo_integrity_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
WITH CHECK (NOT (bucket_id IN ('slipstorage','test') AND split_part(ltrim(name,'/'),'/',1) IN ('operations','buffalo','json')) OR current_user='buffalo_integrity_writer');
CREATE POLICY buffalo_integrity_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
USING (NOT (bucket_id IN ('slipstorage','test') AND split_part(ltrim(name,'/'),'/',1) IN ('operations','buffalo','json')) OR current_user='buffalo_integrity_writer')
WITH CHECK (NOT (bucket_id IN ('slipstorage','test') AND split_part(ltrim(name,'/'),'/',1) IN ('operations','buffalo','json')) OR current_user='buffalo_integrity_writer');
CREATE POLICY buffalo_integrity_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
USING (NOT (bucket_id IN ('slipstorage','test') AND split_part(ltrim(name,'/'),'/',1) IN ('operations','buffalo','json')));
-- The dedicated token does not inherit anon/authenticated/service_role, even indirectly.
-- A restrictive writer policy also defeats the legacy whole-bucket PUBLIC permissive policies.
CREATE POLICY buffalo_integrity_writer_scope ON storage.objects AS RESTRICTIVE FOR ALL TO buffalo_integrity_writer
USING (bucket_id='slipstorage' AND name ~ '^(operations/[0-9a-f]{64}/[0-9a-f-]{36}/[a-zA-Z0-9._-]+|buffalo/[1-9][0-9]*\.jpg|json/[1-9][0-9]*\.json)$')
WITH CHECK (bucket_id='slipstorage' AND name ~ '^(operations/[0-9a-f]{64}/[0-9a-f-]{36}/[a-zA-Z0-9._-]+|buffalo/[1-9][0-9]*\.jpg|json/[1-9][0-9]*\.json)$');
CREATE POLICY buffalo_integrity_writer_access ON storage.objects AS PERMISSIVE FOR ALL TO buffalo_integrity_writer USING (true) WITH CHECK (true);
CREATE POLICY buffalo_integrity_writer_alias_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO buffalo_integrity_writer
USING (bucket_id='slipstorage' AND split_part(name,'/',1) IN ('buffalo','json'))
WITH CHECK (bucket_id='slipstorage' AND split_part(name,'/',1) IN ('buffalo','json'));
-- Preserve public table reads and direct server Prisma access; stop legacy Data API mutation bypasses.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public."Pedigree",public."Reward",public."Microchip" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public."Pedigree",public."Reward",public."Microchip" TO anon, authenticated;
ALTER TABLE public."Pedigree" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Reward" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Microchip" ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['Pedigree','Reward','Microchip'] LOOP
    EXECUTE format('CREATE POLICY buffalo_integrity_public_read ON public.%I FOR SELECT TO anon,authenticated USING (true)',t);
    EXECUTE format('CREATE POLICY buffalo_integrity_no_insert ON public.%I AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK (false)',t);
    EXECUTE format('CREATE POLICY buffalo_integrity_no_update ON public.%I AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING (false) WITH CHECK (false)',t);
    EXECUTE format('CREATE POLICY buffalo_integrity_no_delete ON public.%I AS RESTRICTIVE FOR DELETE TO anon,authenticated USING (false)',t);
  END LOOP;
END $$;
REVOKE ALL ON SCHEMA buffalo_integrity FROM PUBLIC,anon,authenticated,buffalo_integrity_writer;
REVOKE ALL ON ALL TABLES IN SCHEMA buffalo_integrity FROM PUBLIC,anon,authenticated,buffalo_integrity_writer;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA buffalo_integrity FROM PUBLIC,anon,authenticated,buffalo_integrity_writer;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buffalo_integrity FROM PUBLIC,anon,authenticated,buffalo_integrity_writer;
NOTIFY pgrst, 'reload schema';
COMMIT;
