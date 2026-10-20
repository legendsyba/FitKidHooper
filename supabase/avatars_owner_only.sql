-- avatars_owner_only.sql — lock the profile-photo bucket to each kid's own folder.
--
-- avatars.sql shipped an MVP where the `public` role (anyone holding the anon key, which is
-- in every page load) could insert, update and delete ANY object in fkh-avatars, and list
-- the whole bucket. So anyone could replace a child's profile photo with any image their
-- friends would then see, delete it, or enumerate every athlete's photo folder.
--
-- Uploads come from signed-in athletes only, at `<auth.uid()>/avatar.jpg`
-- (avatarCloud.syncAvatarToCloud uses getEffectiveAthleteId() = the session user id).
-- Guests keep their photo on-device. So:
--   * insert / update / delete: authenticated, own folder only
--   * select (needed for upsert and for listing): authenticated, own folder only
--   * public read of a known photo URL keeps working — the bucket stays public, and public
--     buckets serve /object/public/... without consulting these policies.
--
-- Idempotent. Run with: supabase db query --linked -f supabase/avatars_owner_only.sql

drop policy if exists "fkh_avatars_public_read" on storage.objects;
drop policy if exists "fkh_avatars_anon_insert" on storage.objects;
drop policy if exists "fkh_avatars_anon_update" on storage.objects;
drop policy if exists "fkh_avatars_anon_delete" on storage.objects;

drop policy if exists "fkh_avatars_owner_select" on storage.objects;
create policy "fkh_avatars_owner_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'fkh-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fkh_avatars_owner_insert" on storage.objects;
create policy "fkh_avatars_owner_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'fkh-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fkh_avatars_owner_update" on storage.objects;
create policy "fkh_avatars_owner_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'fkh-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'fkh-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fkh_avatars_owner_delete" on storage.objects;
create policy "fkh_avatars_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'fkh-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
