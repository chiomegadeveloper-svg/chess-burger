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

commit;
