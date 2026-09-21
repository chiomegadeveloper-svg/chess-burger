-- Reliable, idempotent Grand Arena champion payout and one champion feed card.
begin;

-- Per-match Arena win cards created noisy duplicate-looking feed entries.
delete from public.cb_feed
where kind='win' and content='won a Grand Arena match.';

-- Repair a previously declared champion only when no payout ledger exists.
do $$
declare s record;v_prize integer;
begin
 for s in
  select session.* from public.cb_arena_sessions session
  where session.champion_id is not null
   and not exists(select 1 from public.cb_gold_ledger ledger where ledger.id='arena-champion:'||session.id::text)
  for update
 loop
  v_prize:=greatest(0,coalesce(s.prize_gold,0));
  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
  values('arena-champion:'||s.id::text,s.champion_id,v_prize,'arena_champion',s.id)
  on conflict(id) do nothing;
  if found then
   update public.cb_profiles set gold_points=gold_points+v_prize where user_id=s.champion_id;
   insert into public.cb_feed(user_id,kind,display_name,content,cbr_delta,gold_delta)
   select s.champion_id,'new_reward',display_name,'won Grand Arena Session '||s.slot||' and claimed the Champion Pot.',0,v_prize
   from public.cb_profiles where user_id=s.champion_id;
  end if;
 end loop;
end $$;

create or replace function public.cb_settle_arena_match(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.cb_matches%rowtype;winner_id uuid;loser_id uuid;v_streak integer;v_bonus numeric(10,1);v_losses integer;
begin
 select * into m from public.cb_matches where id=p_match_id for update;
 if m.id is null or m.play_mode<>'arena' or m.status<>'finished' or m.rating_applied then return jsonb_build_object('settled',false);end if;
 if m.result='draw' then
  update public.cb_arena_entries set status='waiting',arena_points=arena_points+0.5,arena_win_streak=0,current_match_id=null,seen_at=now() where session_id=m.arena_session_id and user_id in(m.white_id,m.black_id);
  update public.cb_matches set rating_applied=true where id=m.id;
  return jsonb_build_object('settled',true,'draw',true,'points_delta',0.5);
 end if;
 winner_id:=case when m.result='white' then m.white_id else m.black_id end;
 loser_id:=case when m.result='white' then m.black_id else m.white_id end;
 perform 1 from public.cb_profiles where user_id in(winner_id,loser_id) order by user_id for update;
 select arena_win_streak+1 into v_streak from public.cb_arena_entries where session_id=m.arena_session_id and user_id=winner_id for update;
 v_bonus:=case when v_streak>=3 then 2 else 0 end;
 update public.cb_profiles set cbr=cbr+4,gold_points=gold_points+8,wins=wins+1,win_streak=win_streak+1 where user_id=winner_id;
 update public.cb_profiles set losses=losses+1,win_streak=0 where user_id=loser_id;
 update public.cb_arena_entries set status='waiting',wins=wins+1,arena_points=arena_points+1+v_bonus,arena_win_streak=case when v_streak>=3 then 0 else v_streak end,arena_cbr_gain=arena_cbr_gain+4,arena_gold_gain=arena_gold_gain+8,current_match_id=null,seen_at=now() where session_id=m.arena_session_id and user_id=winner_id;
 update public.cb_arena_entries set losses=losses+1,arena_win_streak=0,status=case when losses+1>=2 then 'eliminated' else 'waiting' end,current_match_id=null,seen_at=now(),eliminated_at=case when losses+1>=2 then now() else null end where session_id=m.arena_session_id and user_id=loser_id returning losses into v_losses;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('arena-win:'||m.id::text,winner_id,8,'arena_win',m.id) on conflict(id) do nothing;
 update public.cb_matches set rating_applied=true where id=m.id;
 return jsonb_build_object('settled',true,'winner_id',winner_id,'loser_id',loser_id,'cbr_delta',4,'points_delta',1+v_bonus,'losses',v_losses,'gold_delta',8);
end $$;

create or replace function public.cb_finalize_arena_sessions()
returns integer language plpgsql security definer set search_path=public as $$
declare s record;champ record;processed integer:=0;v_prize integer;v_ledger_id text;
begin
 for s in select * from public.cb_arena_sessions where ends_at<=now() and champion_rewarded_at is null for update skip locked loop
  -- Do not close a session while a finished Arena match still needs settlement.
  if exists(select 1 from public.cb_matches where arena_session_id=s.id and status='finished' and rating_applied=false) then continue;end if;
  v_prize:=greatest(0,case when s.prize_mode='auto' then floor(s.ticket_gold_total*0.10)::integer else s.prize_gold end);
  select e.user_id,e.arena_points,e.wins into champ
  from public.cb_arena_entries e
  where e.session_id=s.id and e.status in('waiting','playing') and e.arena_points>0
  order by e.arena_points desc,e.wins desc,e.joined_at asc limit 1;
  if champ.user_id is null then
   -- Leave an empty or unsettled session retryable instead of permanently finalizing without a winner.
   if exists(select 1 from public.cb_arena_entries where session_id=s.id) then continue;end if;
   update public.cb_arena_sessions set champion_rewarded_at=now(),prize_gold=v_prize where id=s.id;
  else
   insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
   values('arena-champion:'||s.id::text,champ.user_id,v_prize,'arena_champion',s.id)
   on conflict(id) do nothing returning id into v_ledger_id;
   if v_ledger_id is not null then
    update public.cb_profiles set gold_points=gold_points+v_prize where user_id=champ.user_id;
   end if;
   insert into public.cb_feed(user_id,kind,display_name,content,cbr_delta,gold_delta)
   select champ.user_id,'new_reward',display_name,'won Grand Arena Session '||s.slot||' and claimed the Champion Pot.',0,v_prize
   from public.cb_profiles where user_id=champ.user_id;
   update public.cb_arena_sessions set champion_id=champ.user_id,champion_rewarded_at=now(),prize_gold=v_prize where id=s.id;
   -- Completed sessions keep their champion in session history; live standings start clean.
   delete from public.cb_arena_entries where session_id=s.id;
  end if;
  processed:=processed+1;
 end loop;
 return processed;
end $$;

revoke all on function public.cb_settle_arena_match(uuid),public.cb_finalize_arena_sessions() from public,anon,authenticated;
grant execute on function public.cb_settle_arena_match(uuid),public.cb_finalize_arena_sessions() to service_role;
commit;
