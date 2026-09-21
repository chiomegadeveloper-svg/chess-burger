-- Owner-controlled Arena schedule, prizes, points and double elimination.
begin;

create table if not exists public.cb_arena_settings(
  id boolean primary key default true check(id),
  timezone text not null default 'Asia/Manila',
  slot1_start time not null default '19:00', slot1_end time not null default '21:00',
  slot2_start time not null default '22:00', slot2_end time not null default '00:00',
  entry_closes_minutes integer not null default 10 check(entry_closes_minutes between 0 and 60),
  prize_mode text not null default 'fixed' check(prize_mode in('fixed','auto')),
  fixed_prize_gold integer not null default 48 check(fixed_prize_gold between 0 and 1000000),
  auto_prize_percent numeric(5,2) not null default 10 check(auto_prize_percent between 0 and 100),
  ticket_value_gold integer not null default 28 check(ticket_value_gold>0),
  max_pair_gap numeric(10,1) not null default 2 check(max_pair_gap>=0),
  fallback_wait_seconds integer not null default 180 check(fallback_wait_seconds between 0 and 3600),
  updated_by uuid references public.cb_profiles(user_id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.cb_arena_settings(id) values(true) on conflict(id) do nothing;
alter table public.cb_arena_settings enable row level security;
revoke all on public.cb_arena_settings from anon,authenticated;

alter table public.cb_arena_sessions add column if not exists prize_mode text not null default 'fixed';
alter table public.cb_arena_sessions add column if not exists prize_gold integer not null default 48;
alter table public.cb_arena_sessions add column if not exists ticket_gold_total integer not null default 0;
alter table public.cb_arena_entries add column if not exists arena_points numeric(10,1) not null default 0;
alter table public.cb_arena_entries add column if not exists losses integer not null default 0;
alter table public.cb_arena_entries add column if not exists arena_win_streak integer not null default 0;
alter table public.cb_arena_entries add column if not exists ticket_gold_value integer not null default 28;
create index if not exists cb_arena_entries_points_queue_idx on public.cb_arena_entries(session_id,status,arena_points,seen_at) where status='waiting';

create or replace function public.cb_enter_grand_arena(p_user_id uuid,p_session_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.cb_arena_sessions%rowtype;e public.cb_arena_entries%rowtype;v_tickets integer;v_ticket_value integer;
begin
 select * into s from public.cb_arena_sessions where id=p_session_id for update;if s.id is null or now()<s.starts_at or now()>=s.ends_at-interval '10 minutes' then raise exception 'Arena entry is closed for this session.';end if;
 select ticket_value_gold into v_ticket_value from public.cb_arena_settings where id=true;v_ticket_value:=coalesce(v_ticket_value,28);
 select * into e from public.cb_arena_entries where session_id=s.id and user_id=p_user_id;
 if e.id is not null and e.status in('waiting','playing','champion') then return jsonb_build_object('entry_id',e.id,'tickets',(select coalesce(quantity,0) from public.cb_arena_tickets where user_id=p_user_id),'charged',false);end if;
 select quantity into v_tickets from public.cb_arena_tickets where user_id=p_user_id for update;if coalesce(v_tickets,0)<1 then raise exception 'You need an Arena Ticket to enter.';end if;
 update public.cb_arena_tickets set quantity=quantity-1,updated_at=now() where user_id=p_user_id returning quantity into v_tickets;
 if e.id is null then insert into public.cb_arena_entries(session_id,user_id,status,seen_at,ticket_gold_value) values(s.id,p_user_id,'waiting',now(),v_ticket_value) returning * into e;
 else update public.cb_arena_entries set status='waiting',wins=0,losses=0,arena_points=0,arena_win_streak=0,arena_cbr_gain=0,arena_gold_gain=0,current_match_id=null,ticket_gold_value=v_ticket_value,joined_at=now(),seen_at=now(),eliminated_at=null where id=e.id returning * into e;end if;
 update public.cb_arena_sessions set ticket_gold_total=ticket_gold_total+v_ticket_value where id=s.id;
 return jsonb_build_object('entry_id',e.id,'tickets',v_tickets,'charged',true);
end $$;

create or replace function public.cb_settle_arena_match(p_match_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.cb_matches%rowtype;winner_id uuid;loser_id uuid;v_streak integer;v_bonus numeric(10,1);v_losses integer;
begin
 select * into m from public.cb_matches where id=p_match_id for update;if m.id is null or m.play_mode<>'arena' or m.status<>'finished' or m.rating_applied then return jsonb_build_object('settled',false);end if;
 if m.result='draw' then update public.cb_arena_entries set status='waiting',arena_points=arena_points+0.5,arena_win_streak=0,current_match_id=null,seen_at=now() where session_id=m.arena_session_id and user_id in(m.white_id,m.black_id);update public.cb_matches set rating_applied=true where id=m.id;return jsonb_build_object('settled',true,'draw',true,'points_delta',0.5);end if;
 winner_id:=case when m.result='white' then m.white_id else m.black_id end;loser_id:=case when m.result='white' then m.black_id else m.white_id end;
 perform 1 from public.cb_profiles where user_id in(winner_id,loser_id) order by user_id for update;
 select arena_win_streak+1 into v_streak from public.cb_arena_entries where session_id=m.arena_session_id and user_id=winner_id for update;v_bonus:=case when v_streak>=3 then 2 else 0 end;
 update public.cb_profiles set cbr=cbr+4,gold_points=gold_points+8,wins=wins+1,win_streak=win_streak+1 where user_id=winner_id;update public.cb_profiles set losses=losses+1,win_streak=0 where user_id=loser_id;
 update public.cb_arena_entries set status='waiting',wins=wins+1,arena_points=arena_points+1+v_bonus,arena_win_streak=case when v_streak>=3 then 0 else v_streak end,arena_cbr_gain=arena_cbr_gain+4,arena_gold_gain=arena_gold_gain+8,current_match_id=null,seen_at=now() where session_id=m.arena_session_id and user_id=winner_id;
 update public.cb_arena_entries set losses=losses+1,arena_win_streak=0,status=case when losses+1>=2 then 'eliminated' else 'waiting' end,current_match_id=null,seen_at=now(),eliminated_at=case when losses+1>=2 then now() else null end where session_id=m.arena_session_id and user_id=loser_id returning losses into v_losses;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('arena-win:'||m.id::text,winner_id,8,'arena_win',m.id) on conflict(id) do nothing;
 insert into public.cb_feed(user_id,kind,display_name,content,cbr_delta,gold_delta) select winner_id,'win',display_name,'won a Grand Arena match.',4,8 from public.cb_profiles where user_id=winner_id;
 update public.cb_matches set rating_applied=true where id=m.id;return jsonb_build_object('settled',true,'winner_id',winner_id,'loser_id',loser_id,'cbr_delta',4,'points_delta',1+v_bonus,'losses',v_losses,'gold_delta',8);
end $$;

create or replace function public.cb_resolve_arena_cancelled_match(p_match_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m public.cb_matches%rowtype;loser_id uuid;survivor_id uuid;
begin select * into m from public.cb_matches where id=p_match_id for update;if m.id is null or m.play_mode<>'arena' or m.status<>'cancelled' or m.rating_applied then return;end if;loser_id:=nullif(m.game_meta#>>'{last,by}','')::uuid;if loser_id is null or loser_id not in(m.white_id,m.black_id) then loser_id:=m.host_id;end if;survivor_id:=case when loser_id=m.white_id then m.black_id else m.white_id end;update public.cb_arena_entries set losses=losses+1,arena_win_streak=0,status=case when losses+1>=2 then 'eliminated' else 'waiting' end,current_match_id=null,seen_at=now(),eliminated_at=case when losses+1>=2 then now() else null end where session_id=m.arena_session_id and user_id=loser_id;update public.cb_arena_entries set status='waiting',current_match_id=null,seen_at=now() where session_id=m.arena_session_id and user_id=survivor_id;update public.cb_matches set rating_applied=true where id=m.id;end $$;

create or replace function public.cb_finalize_arena_sessions() returns integer language plpgsql security definer set search_path=public as $$
declare s record;champ record;processed integer:=0;v_prize integer;
begin for s in select * from public.cb_arena_sessions where ends_at<=now() and champion_rewarded_at is null for update skip locked loop
 v_prize:=case when s.prize_mode='auto' then floor(s.ticket_gold_total*0.10)::integer else s.prize_gold end;
 select e.user_id,e.arena_points,e.wins into champ from public.cb_arena_entries e where e.session_id=s.id and e.status in('waiting','playing') and e.arena_points>0 order by e.arena_points desc,e.wins desc,e.joined_at asc limit 1;
 if champ.user_id is not null then update public.cb_profiles set gold_points=gold_points+v_prize where user_id=champ.user_id;update public.cb_arena_entries set status='champion',arena_gold_gain=arena_gold_gain+v_prize where session_id=s.id and user_id=champ.user_id;insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('arena-champion:'||s.id::text,champ.user_id,v_prize,'arena_champion',s.id) on conflict(id) do nothing;insert into public.cb_feed(user_id,kind,display_name,content,cbr_delta,gold_delta) select champ.user_id,'new_reward',display_name,'became Grand Arena Daily Champion.',0,v_prize from public.cb_profiles where user_id=champ.user_id;update public.cb_arena_sessions set champion_id=champ.user_id,champion_rewarded_at=now(),prize_gold=v_prize where id=s.id;else update public.cb_arena_sessions set champion_rewarded_at=now(),prize_gold=v_prize where id=s.id;end if;processed:=processed+1;end loop;return processed;end $$;

revoke all on function public.cb_enter_grand_arena(uuid,uuid),public.cb_settle_arena_match(uuid),public.cb_resolve_arena_cancelled_match(uuid),public.cb_finalize_arena_sessions() from public,anon,authenticated;
grant execute on function public.cb_enter_grand_arena(uuid,uuid),public.cb_settle_arena_match(uuid),public.cb_resolve_arena_cancelled_match(uuid),public.cb_finalize_arena_sessions() to service_role;
commit;
