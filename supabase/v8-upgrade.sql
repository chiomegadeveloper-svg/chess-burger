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
