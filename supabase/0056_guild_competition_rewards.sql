-- Apply after 0055. Future Arena wins and tournament prizes fund guild chests.
begin;

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
