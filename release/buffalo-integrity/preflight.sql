-- Read-only capture; never export signed_bytes, credentials or whole user tables.
BEGIN READ ONLY;
SELECT version(), current_setting('transaction_read_only') AS read_only;
DO $$ DECLARE inventory jsonb; BEGIN
 IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
 EXECUTE 'SELECT jsonb_agg(x ORDER BY migration_name) FROM (SELECT migration_name,finished_at FROM public._prisma_migrations) x' INTO inventory;
 RAISE NOTICE 'owning_migrations=%',coalesce(inventory,'[]');
 ELSE RAISE NOTICE 'owning_migrations=absent'; END IF;
END $$;
SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname;
SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('Pedigree','Reward','Microchip') ORDER BY table_name,grantee,privilege_type;
SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','buffalo_integrity') AND c.relkind='r' ORDER BY n.nspname,c.relname;
DO $$ DECLARE inventory jsonb; BEGIN
 IF to_regclass('buffalo_integrity.operation') IS NOT NULL AND to_regclass('buffalo_integrity.step') IS NOT NULL THEN
 EXECUTE 'SELECT jsonb_agg(x ORDER BY state) FROM (SELECT o.state,count(*) AS operations,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM buffalo_integrity.step s WHERE s.operation_id=o.id AND s.signed_bytes IS NOT NULL)) AS signed_operations FROM buffalo_integrity.operation o GROUP BY o.state) x' INTO inventory;
 RAISE NOTICE 'integrity_pending_inventory=%',coalesce(inventory,'[]');
 ELSE RAISE NOTICE 'integrity_ledger=absent; run owning migrations before pending-job inventory'; END IF;
END $$;
SELECT rolname,rolsuper,rolinherit,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator','supabase_storage_admin','buffalo_integrity_writer');
SELECT granted.rolname AS granted_role,member.rolname AS member FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles member ON member.oid=m.member WHERE member.rolname IN ('anon','authenticated','buffalo_integrity_writer','authenticator','supabase_storage_admin');
ROLLBACK;
