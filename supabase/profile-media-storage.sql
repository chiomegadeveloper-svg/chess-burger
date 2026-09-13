-- Chess Burger profile photos: run once in Supabase SQL Editor.
-- Safe to run again. Users may only write inside their own auth UID folder.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cb-profile-media','cb-profile-media',true,2000000,array['image/webp'])
on conflict(id) do update set
 public=true,
 file_size_limit=2000000,
 allowed_mime_types=array['image/webp'];

drop policy if exists cb_public_profile_media on storage.objects;
create policy cb_public_profile_media
on storage.objects for select
to public
using(bucket_id='cb-profile-media');

drop policy if exists cb_upload_own_profile_media on storage.objects;
create policy cb_upload_own_profile_media
on storage.objects for insert
to authenticated
with check(
 bucket_id='cb-profile-media'
 and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists cb_update_own_profile_media on storage.objects;
create policy cb_update_own_profile_media
on storage.objects for update
to authenticated
using(
 bucket_id='cb-profile-media'
 and owner_id=(select auth.uid())::text
)
with check(
 bucket_id='cb-profile-media'
 and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists cb_delete_own_profile_media on storage.objects;
create policy cb_delete_own_profile_media
on storage.objects for delete
to authenticated
using(
 bucket_id='cb-profile-media'
 and owner_id=(select auth.uid())::text
);
