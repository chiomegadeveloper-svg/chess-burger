-- Run after 0098. Existing completed runs and awards remain unchanged.
begin;
alter table public.cb_arena_entries drop constraint if exists cb_arena_entries_status_check;
alter table public.cb_arena_entries add constraint cb_arena_entries_status_check
 check(status in('registered','waiting','playing','eliminated','champion'));

-- Session row lock serializes registration and live entry. Repeat requests never charge twice.
create or replace function public.cb_register_grand_arena(p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.cb_arena_sessions%rowtype;e public.cb_arena_entries%rowtype;v_tickets integer;v_value integer;
begin
 select * into s from public.cb_arena_sessions where id=p_session_id for update;
 if s.id is null or now()>=s.starts_at then raise exception 'Advance registration is closed. Enter the open Arena instead.';end if;
 select * into e from public.cb_arena_entries where session_id=s.id and user_id=p_user_id;
 if e.id is not null then return jsonb_build_object('entry_id',e.id,'charged',false);end if;
 select quantity into v_tickets from public.cb_arena_tickets where user_id=p_user_id for update;
 if coalesce(v_tickets,0)<1 then raise exception 'You need an Arena Ticket to register.';end if;
 select ticket_value_gold into v_value from public.cb_arena_settings where id=true;v_value:=coalesce(v_value,28);
 update public.cb_arena_tickets set quantity=quantity-1,updated_at=now() where user_id=p_user_id returning quantity into v_tickets;
 insert into public.cb_arena_entries(session_id,user_id,status,ticket_gold_value)
 values(s.id,p_user_id,'registered',v_value) returning * into e;
 update public.cb_arena_sessions set ticket_gold_total=ticket_gold_total+v_value where id=s.id;
 return jsonb_build_object('entry_id',e.id,'tickets',v_tickets,'charged',true);
end $$;

create or replace function public.cb_enter_grand_arena(p_user_id uuid,p_session_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.cb_arena_sessions%rowtype;e public.cb_arena_entries%rowtype;v_tickets integer;v_ticket_value integer;
begin
 select * into s from public.cb_arena_sessions where id=p_session_id for update;if s.id is null or now()<s.starts_at or now()>=s.ends_at-interval '10 minutes' then raise exception 'Arena entry is closed for this session.';end if;
 select ticket_value_gold into v_ticket_value from public.cb_arena_settings where id=true;v_ticket_value:=coalesce(v_ticket_value,28);
 select * into e from public.cb_arena_entries where session_id=s.id and user_id=p_user_id;
 if e.id is not null and e.status in('waiting','playing','champion') then return jsonb_build_object('entry_id',e.id,'tickets',(select coalesce(quantity,0) from public.cb_arena_tickets where user_id=p_user_id),'charged',false);end if;
 if e.id is not null and e.status='registered' then
  update public.cb_arena_entries set status='waiting',seen_at=now() where id=e.id;
  return jsonb_build_object('entry_id',e.id,'tickets',(select coalesce(quantity,0) from public.cb_arena_tickets where user_id=p_user_id),'charged',false);
 end if;
 select quantity into v_tickets from public.cb_arena_tickets where user_id=p_user_id for update;if coalesce(v_tickets,0)<1 then raise exception 'You need an Arena Ticket to enter.';end if;
 update public.cb_arena_tickets set quantity=quantity-1,updated_at=now() where user_id=p_user_id returning quantity into v_tickets;
 if e.id is null then insert into public.cb_arena_entries(session_id,user_id,status,seen_at,ticket_gold_value) values(s.id,p_user_id,'waiting',now(),v_ticket_value) returning * into e;
 else update public.cb_arena_entries set status='waiting',wins=0,losses=0,arena_points=0,arena_win_streak=0,arena_cbr_gain=0,arena_gold_gain=0,current_match_id=null,ticket_gold_value=v_ticket_value,joined_at=now(),seen_at=now(),eliminated_at=null where id=e.id returning * into e;end if;
 update public.cb_arena_sessions set ticket_gold_total=ticket_gold_total+v_ticket_value where id=s.id;
 return jsonb_build_object('entry_id',e.id,'tickets',v_tickets,'charged',true);
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
 update public.cb_arena_entries set losses=losses+1,arena_win_streak=0,status=case when losses+1>=3 then 'eliminated' else 'waiting' end,current_match_id=null,seen_at=now(),eliminated_at=case when losses+1>=3 then now() else null end where session_id=m.arena_session_id and user_id=loser_id returning losses into v_losses;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('arena-win:'||m.id::text,winner_id,8,'arena_win',m.id) on conflict(id) do nothing;
 update public.cb_matches set rating_applied=true where id=m.id;
 return jsonb_build_object('settled',true,'winner_id',winner_id,'loser_id',loser_id,'cbr_delta',4,'points_delta',1+v_bonus,'losses',v_losses,'gold_delta',8);
end $$;

create or replace function public.cb_resolve_arena_cancelled_match(p_match_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m public.cb_matches%rowtype;loser_id uuid;survivor_id uuid;
begin select * into m from public.cb_matches where id=p_match_id for update;if m.id is null or m.play_mode<>'arena' or m.status<>'cancelled' or m.rating_applied then return;end if;loser_id:=nullif(m.game_meta#>>'{last,by}','')::uuid;if loser_id is null or loser_id not in(m.white_id,m.black_id) then loser_id:=m.host_id;end if;survivor_id:=case when loser_id=m.white_id then m.black_id else m.white_id end;update public.cb_arena_entries set losses=losses+1,arena_win_streak=0,status=case when losses+1>=3 then 'eliminated' else 'waiting' end,current_match_id=null,seen_at=now(),eliminated_at=case when losses+1>=3 then now() else null end where session_id=m.arena_session_id and user_id=loser_id;update public.cb_arena_entries set status='waiting',current_match_id=null,seen_at=now() where session_id=m.arena_session_id and user_id=survivor_id;update public.cb_matches set rating_applied=true where id=m.id;end $$;

revoke all on function public.cb_register_grand_arena(uuid,uuid),public.cb_enter_grand_arena(uuid,uuid),public.cb_settle_arena_match(uuid),public.cb_resolve_arena_cancelled_match(uuid) from public,anon,authenticated;
grant execute on function public.cb_register_grand_arena(uuid,uuid),public.cb_enter_grand_arena(uuid,uuid),public.cb_settle_arena_match(uuid),public.cb_resolve_arena_cancelled_match(uuid) to service_role;
commit;
