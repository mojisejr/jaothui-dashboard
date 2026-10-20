-- Read-only catalog capture 2026-10-19: exact eight legacy policies, retained for review/isolated replay.
-- Never run this after cutover to restore anonymous protected writes.
CREATE POLICY "Give anon users access to JPG images in folder 2487m_0" ON storage.objects AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((bucket_id = 'test'::text));
CREATE POLICY "avatar-ctrl 1idotob_0" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'slipstorage'::text));
CREATE POLICY "avatar-ctrl 1idotob_1" ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((bucket_id = 'slipstorage'::text));
CREATE POLICY "avatar-ctrl 1idotob_2" ON storage.objects AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((bucket_id = 'slipstorage'::text));
CREATE POLICY "avatar-ctrl 1idotob_3" ON storage.objects AS PERMISSIVE FOR DELETE TO PUBLIC USING ((bucket_id = 'slipstorage'::text));
CREATE POLICY "slip 1idotob_0" ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((bucket_id = 'slipstorage'::text));
CREATE POLICY "test_policy 2487m_0" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'test'::text));
CREATE POLICY "test_policy 2487m_1" ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((bucket_id = 'test'::text));
