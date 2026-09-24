-- Apply after 0055. Future Arena wins and tournament prizes fund guild chests.
begin;

-- Older production databases may not have run the legacy v8 tournament setup.
create table if not exists public.cb_tournaments (
 id uuid primary key,
 code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
 host_id uuid not null references public.cb_profiles(user_id),
 title text not null check (char_length(title) between 1 and 100),
 state jsonb not null,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.cb_tournament_entries (
 tournament_id uuid not null references public.cb_tournaments(id) on delete cascade,
 user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
 display_name text not null,
 created_at timestamptz not null default now(),
 primary key(tournament_id,user_id)
);
alter table public.cb_tournaments enable row level security;
alter table public.cb_tournament_entries enable row level security;
revoke all on public.cb_tournaments,public.cb_tournament_entries from anon,authenticated;
grant select on public.cb_tournaments,public.cb_tournament_entries to authenticated;
drop policy if exists cb_read_tournaments on public.cb_tournaments;
create policy cb_read_tournaments on public.cb_tournaments for select to authenticated
 using (host_id=(select auth.uid()) or exists (
  select 1 from public.cb_tournament_entries e where e.tournament_id=id and e.user_id=(select auth.uid())
 ));
create or replace function public.cb_hosts_tournament(p_id uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cb_tournaments where id=p_id and host_id=(select auth.uid()));
$$;
revoke all on function public.cb_hosts_tournament(uuid) from public,anon,authenticated;
grant execute on function public.cb_hosts_tournament(uuid) to authenticated;
drop policy if exists cb_read_entries on public.cb_tournament_entries;
create policy cb_read_entries on public.cb_tournament_entries for select to authenticated
 using (user_id=(select auth.uid()) or public.cb_hosts_tournament(tournament_id));

create or replace function public.cb_save_tournament(p_id uuid,p_code text,p_title text,p_state jsonb,p_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); current_row public.cb_tournaments; next_revision integer;
begin
 if uid is null or not exists(select 1 from public.cb_profiles where user_id=uid and role in ('owner','admin')) then raise exception 'Owner or GM only'; end if;
 if p_id is null or p_code is null or p_code !~ '^[A-Z0-9]{8}$' or p_title is null or char_length(btrim(p_title)) not between 1 and 100 or p_state is null or octet_length(p_state::text)>500000 then raise exception 'Invalid tournament'; end if;
 if (p_state->>'id') is distinct from p_id::text or (p_state->>'hostId') is distinct from uid::text or (p_state->>'code') is distinct from p_code or (p_state->>'title') is distinct from p_title then raise exception 'Tournament identity mismatch'; end if;
 if jsonb_typeof(p_state->'players') is distinct from 'array' or jsonb_typeof(p_state->'history') is distinct from 'array' then raise exception 'Invalid roster'; end if;
 if jsonb_array_length(p_state->'players')>100 or (p_state->>'rounds')::integer not between 1 and 23 or coalesce(p_state->>'status','') not in ('registration','playing','completed') then raise exception 'Invalid tournament settings'; end if;
 select * into current_row from public.cb_tournaments where id=p_id for update;
 if found then
  if current_row.host_id<>uid then raise exception 'Only this tournament host can change it'; end if;
  if p_revision is distinct from current_row.revision then raise exception 'A newer version exists online. Export your local backup before loading it.'; end if;
  next_revision:=current_row.revision+1;
  update public.cb_tournaments set title=p_title,state=p_state,revision=next_revision,updated_at=now() where id=p_id;
 else
  if p_revision is distinct from 0 then raise exception 'Tournament no longer exists'; end if;
  next_revision:=1;
  insert into public.cb_tournaments(id,code,host_id,title,state) values(p_id,p_code,uid,p_title,p_state);
 end if;
 return next_revision;
end $$;
create or replace function public.cb_join_tournament(p_id uuid,p_code text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); player_name text; event public.cb_tournaments;
begin
 if uid is null then raise exception 'Sign in to join online'; end if;
 select display_name into player_name from public.cb_profiles where user_id=uid;
 if player_name is null then raise exception 'Save your profile first'; end if;
 select * into event from public.cb_tournaments where id=p_id and code=p_code for update;
 if not found or coalesce(event.state->>'status','')<>'registration' then raise exception 'Tournament not found or registration closed'; end if;
 if (select count(*) from public.cb_tournament_entries where tournament_id=p_id)>=100 and not exists(select 1 from public.cb_tournament_entries where tournament_id=p_id and user_id=uid) then raise exception 'Tournament is full'; end if;
 insert into public.cb_tournament_entries(tournament_id,user_id,display_name) values(p_id,uid,player_name) on conflict(tournament_id,user_id) do nothing;
end $$;
revoke all on function public.cb_save_tournament(uuid,text,text,jsonb,integer),public.cb_join_tournament(uuid,text) from public,anon,authenticated;
grant execute on function public.cb_save_tournament(uuid,text,text,jsonb,integer),public.cb_join_tournament(uuid,text) to authenticated;

create or replace function public.cb_guild_capture_win() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_guild uuid; v_result uuid;
begin
 if new.delta<=0 or new.kind not in ('arena_win','arena_champion','tournament_reward') then return new; end if;
 if new.kind='arena_win' then
  select case when m.result='white' then m.white_id when m.result='black' then m.black_id end
  into v_result from public.cb_matches m
  where m.id=new.reference_id and m.status='finished' and m.play_mode='arena';
  if v_result is distinct from new.user_id then return new; end if;
 end if;
 if new.kind='arena_champion' and not exists(
  select 1 from public.cb_arena_sessions s where s.id=new.reference_id and s.champion_id=new.user_id
 ) then return new; end if;
 select guild_id into v_guild from public.cb_guild_members where user_id=new.user_id;
 if v_guild is null then return new; end if;
 insert into public.cb_guild_chest_ledger(id,guild_id,user_id,amount,kind,reference_id)
 values('guild-win:'||new.id,v_guild,new.user_id,new.delta,'win',new.reference_id)
 on conflict(id) do nothing;
 if found then update public.cb_guilds set chest_cbg=chest_cbg+new.delta where id=v_guild; end if;
 return new;
end $$;

-- A completed, published tournament may award its configured podium once.
create or replace function public.cb_award_tournament_gold(p_host_id uuid,p_tournament_id uuid,p_winners jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare tournament public.cb_tournaments%rowtype; reward jsonb; rank_no integer;
 amount integer; winner uuid; ledger_id text; inserted_id text; seen uuid[] := '{}';
begin
 select * into tournament from public.cb_tournaments where id=p_tournament_id for update;
 if not found or tournament.host_id<>p_host_id or tournament.state->>'status'<>'completed' then
  raise exception 'Publish a completed tournament as its host before awarding Gold';
 end if;
 if not exists(select 1 from public.cb_profiles where user_id=p_host_id and role in ('owner','admin')) then
  raise exception 'Owner or GM access is required';
 end if;
 if jsonb_typeof(p_winners)<>'array' or jsonb_array_length(p_winners)<>3 then
  raise exception 'Champion through third place are required';
 end if;
 for rank_no in 1..3 loop
  reward:=p_winners->(rank_no-1);
  if reward is null or reward->>'rank' is distinct from rank_no::text or
     coalesce(reward->>'user_id','') !~ '^[0-9a-fA-F-]{36}$' or
     coalesce(reward->>'amount','') !~ '^[0-9]{1,5}$' then
   raise exception 'Invalid tournament podium';
  end if;
  winner:=(reward->>'user_id')::uuid;
  amount:=(reward->>'amount')::integer;
  if winner=any(seen) or amount<0 or amount>10000 or
     amount is distinct from coalesce((tournament.state->'goldRewards'->>
      (case rank_no when 1 then 'champion' when 2 then 'second' else 'third' end))::integer,0) or
     not exists(select 1 from jsonb_array_elements(tournament.state->'players') player
      where player->>'userId'=winner::text) then
   raise exception 'Podium players or rewards do not match the published tournament';
  end if;
  seen:=array_append(seen,winner);
  if amount=0 then continue; end if;
  ledger_id:='tournament-gold:'||p_tournament_id::text||':'||rank_no;
  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
  values(ledger_id,winner,amount,'tournament_reward',p_tournament_id)
  on conflict(id) do nothing returning id into inserted_id;
  if inserted_id is not null then
   update public.cb_profiles set gold_points=gold_points+amount where user_id=winner;
  end if;
 end loop;
end $$;

revoke all on function public.cb_award_tournament_gold(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cb_award_tournament_gold(uuid,uuid,jsonb) to service_role;
commit;
