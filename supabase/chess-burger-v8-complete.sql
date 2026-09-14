-- Chess Burger v8: full schema, upgrade and designated Owners. Run this entire file.

-- Chess Burger Supabase schema. Safe for a new project and repeatable during setup.
begin;

create table if not exists public.cb_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
 display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
 bio text not null default '' check (char_length(bio)<=240),
 avatar_url text not null default '' check (avatar_url='' or avatar_url like 'https://%'),
 card_photo_url text not null default '',
 country_code text not null default 'PH' check (country_code ~ '^[A-Z]{2}$'),
 featured_photos text[] not null default '{}',
 featured_badges text[] not null default '{}',
 cbr integer not null default 88 check (cbr>=0),
 gold_points integer not null default 0 check (gold_points>=0),
 role text not null default 'player' check(role in ('player','admin','owner')),
 win_streak integer not null default 0 check (win_streak>=0),
 wins integer not null default 0 check (wins>=0),
 losses integer not null default 0 check (losses>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (cardinality(featured_photos)<=4)
);
alter table public.cb_profiles add column if not exists featured_photos text[] not null default '{}';
alter table public.cb_profiles add column if not exists card_photo_url text not null default '';
alter table public.cb_profiles add column if not exists gold_points integer not null default 0;
alter table public.cb_profiles add column if not exists role text not null default 'player';
alter table public.cb_profiles add column if not exists country_code text not null default 'PH';
alter table public.cb_profiles add column if not exists featured_badges text[] not null default '{}';
alter table public.cb_profiles add column if not exists cbr integer not null default 88;
alter table public.cb_profiles add column if not exists win_streak integer not null default 0;
alter table public.cb_profiles add column if not exists wins integer not null default 0;
alter table public.cb_profiles add column if not exists losses integer not null default 0;

create table if not exists public.cb_feed (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
 kind text not null check (kind in ('profile_created','profile_updated','win','first_blood','new_reward','top10')),
 display_name text not null,
 content text not null default '',
 cbr_delta integer not null default 0,
 gold_delta integer not null default 0,
 heart_count integer not null default 0 check (heart_count>=0),
 event_date date not null default ((timezone('UTC',now()))::date),
 created_at timestamptz not null default now()
);
alter table public.cb_feed add column if not exists content text not null default '';
alter table public.cb_feed add column if not exists cbr_delta integer not null default 0;
alter table public.cb_feed add column if not exists gold_delta integer not null default 0;
alter table public.cb_feed add column if not exists heart_count integer not null default 0;
alter table public.cb_feed add column if not exists event_date date not null default ((timezone('UTC',now()))::date);
alter table public.cb_feed add column if not exists image_url text not null default '';
alter table public.cb_feed add column if not exists expires_at timestamptz;
alter table public.cb_feed drop constraint if exists cb_feed_kind_check;
alter table public.cb_feed add constraint cb_feed_kind_check check (kind in ('profile_created','profile_updated','win','first_blood','new_reward','top10','announcement'));

create table if not exists public.cb_admin_logs(id uuid primary key default gen_random_uuid(),actor_user_id uuid references auth.users(id),action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
alter table public.cb_admin_logs enable row level security;
revoke all on public.cb_admin_logs from anon,authenticated;
grant select on public.cb_admin_logs to authenticated;
create index if not exists cb_feed_created_at_idx on public.cb_feed(created_at desc);
create index if not exists cb_feed_popular_idx on public.cb_feed(heart_count desc,created_at desc);
create unique index if not exists cb_feed_daily_first_blood_idx on public.cb_feed(user_id,event_date) where kind='first_blood';

create table if not exists public.cb_feed_reactions (
 feed_id uuid not null references public.cb_feed(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(feed_id,user_id)
);
create index if not exists cb_feed_reactions_user_idx on public.cb_feed_reactions(user_id);

alter table public.cb_profiles enable row level security;
alter table public.cb_feed enable row level security;
alter table public.cb_feed_reactions enable row level security;
revoke all on public.cb_profiles,public.cb_feed,public.cb_feed_reactions from anon,authenticated;
grant select on public.cb_profiles,public.cb_feed,public.cb_feed_reactions to anon,authenticated;
grant insert(user_id,username,display_name,bio,avatar_url,country_code,featured_photos,featured_badges,cbr,win_streak,wins,losses) on public.cb_profiles to authenticated;
grant update(user_id,username,display_name,bio,avatar_url,country_code,featured_photos,featured_badges,cbr,win_streak,wins,losses) on public.cb_profiles to authenticated;
grant insert(feed_id,user_id) on public.cb_feed_reactions to authenticated;
grant delete on public.cb_feed_reactions to authenticated;
grant insert(user_id,kind,display_name,content,image_url,expires_at) on public.cb_feed to authenticated;

drop policy if exists cb_public_profiles on public.cb_profiles;
create policy cb_public_profiles on public.cb_profiles for select to anon,authenticated using(true);
drop policy if exists cb_insert_own_profile on public.cb_profiles;
create policy cb_insert_own_profile on public.cb_profiles for insert to authenticated with check((select auth.uid())=user_id);
drop policy if exists cb_update_own_profile on public.cb_profiles;
create policy cb_update_own_profile on public.cb_profiles for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists cb_staff_announcements on public.cb_feed;
create policy cb_staff_announcements on public.cb_feed for insert to authenticated with check((select role from public.cb_profiles where user_id=(select auth.uid())) in ('owner','admin') and kind='announcement' and user_id=(select auth.uid()));
drop policy if exists cb_staff_logs on public.cb_admin_logs;
create policy cb_staff_logs on public.cb_admin_logs for select to authenticated using((select role from public.cb_profiles where user_id=(select auth.uid())) in ('owner','admin'));
drop policy if exists cb_public_feed on public.cb_feed;
create policy cb_public_feed on public.cb_feed for select to anon,authenticated using(true);
drop policy if exists cb_public_reactions on public.cb_feed_reactions;
create policy cb_public_reactions on public.cb_feed_reactions for select to anon,authenticated using(true);
drop policy if exists cb_insert_own_reaction on public.cb_feed_reactions;
create policy cb_insert_own_reaction on public.cb_feed_reactions for insert to authenticated with check((select auth.uid())=user_id);
drop policy if exists cb_delete_own_reaction on public.cb_feed_reactions;
create policy cb_delete_own_reaction on public.cb_feed_reactions for delete to authenticated using((select auth.uid())=user_id);

create or replace function public.cb_profile_timestamp() returns trigger
language plpgsql security definer set search_path='' as $$
begin new.updated_at=now();return new;end;
$$;

create or replace function public.cb_publish_profile_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.cb_feed(user_id,kind,display_name,content) values(new.user_id,'profile_created',new.display_name,'joined Chess Burger.');
 elsif (new.username,new.display_name,new.bio,new.avatar_url,new.country_code,new.featured_photos,new.featured_badges) is distinct from (old.username,old.display_name,old.bio,old.avatar_url,old.country_code,old.featured_photos,old.featured_badges) then
  insert into public.cb_feed(user_id,kind,display_name,content) values(new.user_id,'profile_updated',new.display_name,'updated their player profile.');
 end if;
 return new;
end;
$$;

create or replace function public.cb_recount_hearts() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid:=coalesce(new.feed_id,old.feed_id);
begin
 update public.cb_feed set heart_count=(select count(*) from public.cb_feed_reactions where feed_id=target) where id=target;
 return coalesce(new,old);
end;
$$;

create or replace function public.cb_prune_feed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from public.cb_feed where id in (
  select id from public.cb_feed order by created_at desc,id desc offset 50
 );
 return new;
end;
$$;

create or replace function public.cb_publish_first_blood(p_content text default 'earned their first win of the day.') returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());new_id uuid;player_name text;
begin
 if uid is null then raise exception 'Authentication required';end if;
 select display_name into player_name from public.cb_profiles where user_id=uid;
 if player_name is null then raise exception 'Complete your player profile first';end if;
 insert into public.cb_feed(user_id,kind,display_name,content)
 values(uid,'first_blood',player_name,left(coalesce(nullif(btrim(p_content),''),'earned their first win of the day.'),180))
 on conflict (user_id,event_date) where kind='first_blood' do nothing returning id into new_id;
 return new_id;
end;
$$;

create or replace function public.cb_prune_expired_announcements() returns void language plpgsql security definer set search_path='' as $$begin delete from public.cb_feed where kind='announcement' and expires_at<=now();end;$$;
create or replace function public.cb_grant_gold(p_username text,p_amount integer) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());actor_role text;
begin select role into actor_role from public.cb_profiles where user_id=uid;if actor_role<>'owner' then raise exception 'Owner only';end if;if p_amount<1 or p_amount>10000 then raise exception 'Invalid amount';end if;update public.cb_profiles set gold_points=gold_points+p_amount where username=p_username;if not found then raise exception 'Player not found';end if;insert into public.cb_admin_logs(actor_user_id,action,details) values(uid,'grant_gold',jsonb_build_object('username',p_username,'amount',p_amount));end;$$;
create or replace function public.cb_set_card_photo(p_username text,p_url text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());actor_role text;begin select role into actor_role from public.cb_profiles where user_id=uid;if actor_role not in ('owner','admin') then raise exception 'Staff only';end if;update public.cb_profiles set card_photo_url=p_url where username=p_username;if not found then raise exception 'Player not found';end if;insert into public.cb_admin_logs(actor_user_id,action,details) values(uid,'set_card_photo',jsonb_build_object('username',p_username));end;$$;

revoke all on function public.cb_profile_timestamp() from public,anon,authenticated;
revoke all on function public.cb_publish_profile_event() from public,anon,authenticated;
revoke all on function public.cb_recount_hearts() from public,anon,authenticated;
revoke all on function public.cb_prune_feed() from public,anon,authenticated;
revoke all on function public.cb_publish_first_blood(text) from public,anon;
grant execute on function public.cb_publish_first_blood(text) to authenticated;
grant execute on function public.cb_prune_expired_announcements() to anon,authenticated;
grant execute on function public.cb_grant_gold(text,integer) to authenticated;
grant execute on function public.cb_set_card_photo(text,text) to authenticated;

drop trigger if exists cb_profile_timestamp on public.cb_profiles;
create trigger cb_profile_timestamp before insert or update on public.cb_profiles for each row execute function public.cb_profile_timestamp();
drop trigger if exists cb_profile_feed on public.cb_profiles;
create trigger cb_profile_feed after insert or update on public.cb_profiles for each row execute function public.cb_publish_profile_event();
drop trigger if exists cb_reaction_count on public.cb_feed_reactions;
create trigger cb_reaction_count after insert or delete on public.cb_feed_reactions for each row execute function public.cb_recount_hearts();
drop trigger if exists cb_feed_max_50 on public.cb_feed;
create trigger cb_feed_max_50 after insert on public.cb_feed for each statement execute function public.cb_prune_feed();

do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cb_feed') then
  alter publication supabase_realtime add table public.cb_feed;
 end if;
end$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cb-profile-media','cb-profile-media',true,2000000,array['image/webp'])
on conflict(id) do update set public=true,file_size_limit=2000000,allowed_mime_types=array['image/webp'];
drop policy if exists cb_public_profile_media on storage.objects;
create policy cb_public_profile_media on storage.objects for select to public using(bucket_id='cb-profile-media');
drop policy if exists cb_upload_own_profile_media on storage.objects;
create policy cb_upload_own_profile_media on storage.objects for insert to authenticated with check(bucket_id='cb-profile-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists cb_update_own_profile_media on storage.objects;
create policy cb_update_own_profile_media on storage.objects for update to authenticated using(bucket_id='cb-profile-media' and owner_id=(select auth.uid()::text));
drop policy if exists cb_delete_own_profile_media on storage.objects;
create policy cb_delete_own_profile_media on storage.objects for delete to authenticated using(bucket_id='cb-profile-media' and owner_id=(select auth.uid()::text));

commit;


-- Run AFTER chess-burger.sql. Repeatable; never rerun the older schema afterward.
begin;
-- Profile editors must not send role/card/gold columns. Only staff RPCs write those.
create or replace function public.cb_grant_gold(p_username text,p_amount integer) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
 if uid is null or not exists(select 1 from public.cb_profiles where user_id=uid and role='owner') then raise exception 'Owner only';end if;
 if p_amount is null or p_amount<1 or p_amount>10000 then raise exception 'Amount must be 1 to 10000';end if;
 update public.cb_profiles set gold_points=gold_points+p_amount where username=lower(ltrim(p_username,'@'));
 if not found then raise exception 'Player not found';end if;
 insert into public.cb_admin_logs(actor_user_id,action,details) values(uid,'grant_gold',jsonb_build_object('username',p_username,'amount',p_amount));
end;$$;
create or replace function public.cb_set_card_photo(p_username text,p_url text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
 if uid is null or not exists(select 1 from public.cb_profiles where user_id=uid and role in ('owner','admin')) then raise exception 'Staff only';end if;
 if p_url is null or (p_url<>'' and p_url not like 'https://%') or char_length(p_url)>2048 then raise exception 'Use an HTTPS photo URL';end if;
 update public.cb_profiles set card_photo_url=p_url where username=lower(ltrim(p_username,'@'));
 if not found then raise exception 'Player not found';end if;
 insert into public.cb_admin_logs(actor_user_id,action,details) values(uid,'set_card_photo',jsonb_build_object('username',p_username));
end;$$;
create or replace function public.cb_set_role(p_username text,p_role text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());
begin
 if uid is null or not exists(select 1 from public.cb_profiles where user_id=uid and role='owner') then raise exception 'Owner only';end if;
 if p_role is null or p_role not in ('player','admin') then raise exception 'Role must be player or admin';end if;
 update public.cb_profiles set role=p_role where username=lower(ltrim(p_username,'@')) and role<>'owner';
 if not found then raise exception 'Player not found or owner role is protected';end if;
 insert into public.cb_admin_logs(actor_user_id,action,details) values(uid,'set_role',jsonb_build_object('username',p_username,'role',p_role));
end;$$;
revoke all on function public.cb_grant_gold(text,integer),public.cb_set_card_photo(text,text),public.cb_set_role(text,text) from public,anon,authenticated;
grant execute on function public.cb_grant_gold(text,integer),public.cb_set_card_photo(text,text),public.cb_set_role(text,text) to authenticated;
-- Announcements disappear at their deadline, even between scheduled cleanup runs.
drop policy if exists cb_public_feed on public.cb_feed;
create policy cb_public_feed on public.cb_feed for select to anon,authenticated using(kind<>'announcement' or (expires_at is not null and expires_at>now()));
grant update(content,image_url,expires_at) on public.cb_feed to authenticated;
grant delete on public.cb_feed to authenticated;
drop policy if exists cb_staff_edit_announcements on public.cb_feed;
create policy cb_staff_edit_announcements on public.cb_feed for update to authenticated using(kind='announcement' and exists(select 1 from public.cb_profiles where user_id=(select auth.uid()) and role in ('owner','admin'))) with check(kind='announcement' and expires_at>now());
drop policy if exists cb_staff_delete_announcements on public.cb_feed;
create policy cb_staff_delete_announcements on public.cb_feed for delete to authenticated using(kind='announcement' and exists(select 1 from public.cb_profiles where user_id=(select auth.uid()) and role in ('owner','admin')));
create or replace function public.cb_validate_announcement() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind='announcement' then
  if char_length(new.content)>500 or char_length(new.image_url)>2048 then raise exception 'Announcement is too long';end if;
  if new.expires_at is null or new.expires_at<=now() then raise exception 'Choose a future deadline';end if;
  if btrim(new.content)='' and new.image_url='' then raise exception 'Add text or image';end if;
  if new.image_url<>'' and new.image_url not like 'https://%' then raise exception 'Use an HTTPS image URL';end if;
 end if;return new;
end;$$;
drop trigger if exists cb_validate_announcement on public.cb_feed;
create trigger cb_validate_announcement before insert or update of content,image_url,expires_at on public.cb_feed for each row execute function public.cb_validate_announcement();
create or replace function public.cb_audit_announcement() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data public.cb_feed;
begin
 if tg_op='DELETE' then row_data:=old;else row_data:=new;end if;
 if row_data.kind='announcement' then insert into public.cb_admin_logs(actor_user_id,action,details) values((select auth.uid()),'announcement_'||lower(tg_op),jsonb_build_object('id',row_data.id,'expires_at',row_data.expires_at));end if;
 return coalesce(new,old);
end;$$;
drop trigger if exists cb_audit_announcement on public.cb_feed;
create trigger cb_audit_announcement after insert or update of content,image_url,expires_at or delete on public.cb_feed for each row execute function public.cb_audit_announcement();
-- Keep announcements until their own deadline, regardless of normal feed volume.
create or replace function public.cb_prune_feed() returns trigger language plpgsql security definer set search_path='' as $$begin
 delete from public.cb_feed where id in(select id from public.cb_feed where kind<>'announcement' order by created_at desc,id desc offset 50);return new;
end;$$;
revoke all on function public.cb_validate_announcement(),public.cb_audit_announcement(),public.cb_prune_expired_announcements() from public,anon,authenticated;
-- Staff-owned tournament snapshots, with optimistic revisions to prevent lost updates.
create table if not exists public.cb_tournaments(
 id uuid primary key,code text not null unique check(code ~ '^[A-Z0-9]{8}$'),host_id uuid not null references public.cb_profiles(user_id),title text not null check(char_length(title) between 1 and 100),state jsonb not null,revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.cb_tournament_entries(
 tournament_id uuid not null references public.cb_tournaments(id) on delete cascade,user_id uuid not null references public.cb_profiles(user_id) on delete cascade,display_name text not null,created_at timestamptz not null default now(),primary key(tournament_id,user_id)
);
alter table public.cb_tournaments enable row level security;
alter table public.cb_tournament_entries enable row level security;
revoke all on public.cb_tournaments,public.cb_tournament_entries from anon,authenticated;
grant select on public.cb_tournaments,public.cb_tournament_entries to authenticated;
drop policy if exists cb_read_tournaments on public.cb_tournaments;
create policy cb_read_tournaments on public.cb_tournaments for select to authenticated using(host_id=(select auth.uid()) or exists(select 1 from public.cb_tournament_entries e where e.tournament_id=id and e.user_id=(select auth.uid())));
-- Avoid a recursive RLS relationship by checking the host in a definer helper.
create or replace function public.cb_hosts_tournament(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.cb_tournaments where id=p_id and host_id=(select auth.uid()));$$;
revoke all on function public.cb_hosts_tournament(uuid) from public,anon,authenticated;
grant execute on function public.cb_hosts_tournament(uuid) to authenticated;
drop policy if exists cb_read_entries on public.cb_tournament_entries;
create policy cb_read_entries on public.cb_tournament_entries for select to authenticated using(user_id=(select auth.uid()) or public.cb_hosts_tournament(tournament_id));
create or replace function public.cb_save_tournament(p_id uuid,p_code text,p_title text,p_state jsonb,p_revision integer) returns integer language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());current_row public.cb_tournaments;next_revision integer;
begin
 if uid is null or not exists(select 1 from public.cb_profiles where user_id=uid and role in ('owner','admin')) then raise exception 'Owner or GM only';end if;
 if p_id is null or p_code is null or p_code !~ '^[A-Z0-9]{8}$' or p_title is null or char_length(btrim(p_title)) not between 1 and 100 or p_state is null or octet_length(p_state::text)>500000 then raise exception 'Invalid tournament';end if;
 if (p_state->>'id') is distinct from p_id::text or (p_state->>'hostId') is distinct from uid::text or (p_state->>'code') is distinct from p_code or (p_state->>'title') is distinct from p_title then raise exception 'Tournament identity mismatch';end if;
 if jsonb_typeof(p_state->'players') is distinct from 'array' or jsonb_typeof(p_state->'history') is distinct from 'array' then raise exception 'Invalid roster';end if;
 if jsonb_array_length(p_state->'players')>100 or (p_state->>'rounds')::integer not between 1 and 23 or coalesce(p_state->>'status','') not in ('registration','playing','completed') then raise exception 'Invalid tournament settings';end if;
 select * into current_row from public.cb_tournaments where id=p_id for update;
 if found then
  if current_row.host_id<>uid then raise exception 'Only this tournament host can change it';end if;
  if p_revision is distinct from current_row.revision then raise exception 'A newer version exists online. Export your local backup before loading it.';end if;
  next_revision:=current_row.revision+1;
  update public.cb_tournaments set title=p_title,state=p_state,revision=next_revision,updated_at=now() where id=p_id;
 else
  if p_revision is distinct from 0 then raise exception 'Tournament no longer exists';end if;
  next_revision:=1;insert into public.cb_tournaments(id,code,host_id,title,state) values(p_id,p_code,uid,p_title,p_state);
 end if;
 insert into public.cb_admin_logs(actor_user_id,action,details) values(uid,'save_tournament',jsonb_build_object('id',p_id,'title',p_title,'revision',next_revision,'round',jsonb_array_length(p_state->'history')));
 return next_revision;
end;$$;
create or replace function public.cb_join_tournament(p_id uuid,p_code text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());player_name text;event public.cb_tournaments;
begin
 if uid is null then raise exception 'Sign in to join online';end if;
 select display_name into player_name from public.cb_profiles where user_id=uid;
 if player_name is null then raise exception 'Save your profile first';end if;
 select * into event from public.cb_tournaments where id=p_id and code=p_code for update;
 if not found or coalesce(event.state->>'status','')<>'registration' then raise exception 'Tournament not found or registration closed';end if;
 if (select count(*) from public.cb_tournament_entries where tournament_id=p_id)>=100 and not exists(select 1 from public.cb_tournament_entries where tournament_id=p_id and user_id=uid) then raise exception 'Tournament is full';end if;
 insert into public.cb_tournament_entries(tournament_id,user_id,display_name) values(p_id,uid,player_name) on conflict(tournament_id,user_id) do nothing;
end;$$;
revoke all on function public.cb_save_tournament(uuid,text,text,jsonb,integer),public.cb_join_tournament(uuid,text) from public,anon,authenticated;
grant execute on function public.cb_save_tournament(uuid,text,text,jsonb,integer),public.cb_join_tournament(uuid,text) to authenticated;
commit;


-- Designated Chess Burger Owners, explicitly supplied by the project owner.
-- Run as postgres in the Supabase SQL editor AFTER the v8 schema.
-- Keep Supabase Auth email confirmation ENABLED before either account registers.
-- This does not create auth accounts, choose passwords, or send invitation emails.
begin;
create table if not exists public.cb_designated_owners(email text primary key check(email=lower(email)));
alter table public.cb_designated_owners enable row level security;
revoke all on public.cb_designated_owners from public,anon,authenticated;
insert into public.cb_designated_owners(email) values
 ('alota.bobbie.2026@gmail.com')
on conflict(email) do nothing;

create or replace function public.cb_apply_designated_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from auth.users u join public.cb_designated_owners d on d.email=lower(u.email) where u.id=new.user_id and u.email_confirmed_at is not null) then
  if tg_op='INSERT' or old.role is distinct from 'owner' then
   insert into public.cb_admin_logs(actor_user_id,action,details) values(new.user_id,'designated_owner_activated',jsonb_build_object('method','verified email allowlist'));
  end if;
  new.role:='owner';
 end if;
 return new;
end;$$;
revoke all on function public.cb_apply_designated_owner() from public,anon,authenticated;
drop trigger if exists cb_apply_designated_owner on public.cb_profiles;
create trigger cb_apply_designated_owner before insert or update on public.cb_profiles for each row execute function public.cb_apply_designated_owner();

create or replace function public.cb_activate_verified_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null and exists(select 1 from public.cb_designated_owners where email=lower(new.email)) then
  update public.cb_profiles set role='owner' where user_id=new.id and role<>'owner';
 end if;
 return new;
end;$$;
revoke all on function public.cb_activate_verified_owner() from public,anon,authenticated;
drop trigger if exists cb_activate_verified_owner on auth.users;
create trigger cb_activate_verified_owner after update of email,email_confirmed_at on auth.users for each row execute function public.cb_activate_verified_owner();

-- Promote existing confirmed accounts that already have player profiles.
update public.cb_profiles p set role='owner'
from auth.users u join public.cb_designated_owners d on d.email=lower(u.email)
where p.user_id=u.id and u.email_confirmed_at is not null and p.role<>'owner';
commit;

-- Reports pending registrations without fabricating or creating accounts.
select d.email,
 case when u.id is null then 'Awaiting registration'
      when u.email_confirmed_at is null then 'Awaiting email confirmation'
      when p.user_id is null then 'Awaiting saved player profile'
      else p.role end as owner_status
from public.cb_designated_owners d
left join auth.users u on lower(u.email)=d.email
left join public.cb_profiles p on p.user_id=u.id
order by d.email;
