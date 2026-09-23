-- Run in the Supabase SQL Editor. Safe to repeat.
-- Restore the narrowly scoped announcement permissions and photo storage.
begin;

grant usage on schema public to authenticated;
grant select on public.cb_feed to authenticated;
grant insert(user_id,kind,display_name,content,image_url,expires_at) on public.cb_feed to authenticated;
grant update(content,image_url,expires_at) on public.cb_feed to authenticated;
grant delete on public.cb_feed to authenticated;

drop policy if exists cb_staff_announcements on public.cb_feed;
create policy cb_staff_announcements on public.cb_feed for insert to authenticated
with check (kind='announcement' and user_id=(select auth.uid())
  and exists(select 1 from public.cb_profiles where user_id=(select auth.uid()) and role in ('owner','admin')));
drop policy if exists cb_staff_edit_announcements on public.cb_feed;
create policy cb_staff_edit_announcements on public.cb_feed for update to authenticated
using (kind='announcement' and exists(select 1 from public.cb_profiles where user_id=(select auth.uid()) and role in ('owner','admin')))
with check (kind='announcement' and expires_at>now());
drop policy if exists cb_staff_delete_announcements on public.cb_feed;
create policy cb_staff_delete_announcements on public.cb_feed for delete to authenticated
using (kind='announcement' and exists(select 1 from public.cb_profiles where user_id=(select auth.uid()) and role in ('owner','admin')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cb-profile-media','cb-profile-media',true,2000000,array['image/webp'])
on conflict(id) do update set public=true,file_size_limit=2000000,allowed_mime_types=array['image/webp'];

drop policy if exists cb_public_profile_media on storage.objects;
create policy cb_public_profile_media on storage.objects for select to public
using(bucket_id='cb-profile-media');
drop policy if exists cb_upload_own_profile_media on storage.objects;
create policy cb_upload_own_profile_media on storage.objects for insert to authenticated
with check(bucket_id='cb-profile-media' and (storage.foldername(name))[1]=(select auth.uid())::text);

commit;
