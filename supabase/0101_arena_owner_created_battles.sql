-- Owner-created dated battles replace the repeating daily timetable.
-- Run after 0098. This includes 0100's registration/check-in functions.
begin;
alter table public.cb_arena_settings add column if not exists losses_to_eliminate integer not null default 3 check(losses_to_eliminate between 1 and 10);
alter table public.cb_arena_settings add column if not exists upcoming_weekly_limit integer not null default 4 check(upcoming_weekly_limit between 1 and 12);
alter table public.cb_arena_sessions add column if not exists owner_scheduled boolean not null default false;
alter table public.cb_arena_sessions add column if not exists title text not null default 'Arena Chess Battle';
alter table public.cb_arena_sessions add column if not exists loss_limit integer not null default 3 check(loss_limit between 1 and 10);
-- Preserve live battles and already-paid reservations; unused automatic sessions stay hidden.
update public.cb_arena_sessions s set owner_scheduled=true
 where s.ends_at>now() and (s.starts_at<=now() or exists(select 1 from public.cb_arena_entries e where e.session_id=s.id));
create index if not exists cb_arena_sessions_published_idx on public.cb_arena_sessions(starts_at) where owner_scheduled;
alter table public.cb_arena_entries drop constraint if exists cb_arena_entries_status_check;
alter table public.cb_arena_entries add constraint cb_arena_entries_status_check
 check(status in('registered','waiting','playing','eliminated','champion'));

-- Session row lock serializes registration and live entry. Repeat requests never charge twice.
create or replace function public.cb_register_grand_arena(p_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.cb_arena_sessions%rowtype;e public.cb_arena_entries%rowtype;v_tickets integer;v_value integer;
begin
 select * into s from public.cb_arena_sessions where id=p_session_id for update;
 if s.id is null or not s.owner_scheduled or now()>=s.starts_at then raise exception 'Advance registration is closed. Enter the open Arena instead.';end if;
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
declare m public.cb_matches%rowtype;winner_id uuid;loser_id uuid;v_streak integer;v_bonus numeric(10,1);v_losses integer;v_limit integer;
begin
 select * into m from public.cb_matches where id=p_match_id for update;
 if m.id is null or m.play_mode<>'arena' or m.status<>'finished' or m.rating_applied then return jsonb_build_object('settled',false);end if;
 select loss_limit into v_limit from public.cb_arena_sessions where id=m.arena_session_id;v_limit:=coalesce(v_limit,3);
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
 update public.cb_arena_entries set losses=losses+1,arena_win_streak=0,status=case when losses+1>=v_limit then 'eliminated' else 'waiting' end,current_match_id=null,seen_at=now(),eliminated_at=case when losses+1>=v_limit then now() else null end where session_id=m.arena_session_id and user_id=loser_id returning losses into v_losses;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('arena-win:'||m.id::text,winner_id,8,'arena_win',m.id) on conflict(id) do nothing;
 update public.cb_matches set rating_applied=true where id=m.id;
 return jsonb_build_object('settled',true,'winner_id',winner_id,'loser_id',loser_id,'cbr_delta',4,'points_delta',1+v_bonus,'losses',v_losses,'gold_delta',8);
end $$;

create or replace function public.cb_resolve_arena_cancelled_match(p_match_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m public.cb_matches%rowtype;loser_id uuid;survivor_id uuid;v_limit integer;
begin select * into m from public.cb_matches where id=p_match_id for update;if m.id is null or m.play_mode<>'arena' or m.status<>'cancelled' or m.rating_applied then return;end if;select loss_limit into v_limit from public.cb_arena_sessions where id=m.arena_session_id;v_limit:=coalesce(v_limit,3);loser_id:=nullif(m.game_meta#>>'{last,by}','')::uuid;if loser_id is null or loser_id not in(m.white_id,m.black_id) then loser_id:=m.host_id;end if;survivor_id:=case when loser_id=m.white_id then m.black_id else m.white_id end;update public.cb_arena_entries set losses=losses+1,arena_win_streak=0,status=case when losses+1>=v_limit then 'eliminated' else 'waiting' end,current_match_id=null,seen_at=now(),eliminated_at=case when losses+1>=v_limit then now() else null end where session_id=m.arena_session_id and user_id=loser_id;update public.cb_arena_entries set status='waiting',current_match_id=null,seen_at=now() where session_id=m.arena_session_id and user_id=survivor_id;update public.cb_matches set rating_applied=true where id=m.id;end $$;

revoke all on function public.cb_register_grand_arena(uuid,uuid),public.cb_enter_grand_arena(uuid,uuid),public.cb_settle_arena_match(uuid),public.cb_resolve_arena_cancelled_match(uuid) from public,anon,authenticated;
grant execute on function public.cb_register_grand_arena(uuid,uuid),public.cb_enter_grand_arena(uuid,uuid),public.cb_settle_arena_match(uuid),public.cb_resolve_arena_cancelled_match(uuid) to service_role;

create or replace function public.cb_save_arena_controls(p_owner_id uuid,p_loss_limit integer,p_weekly_limit integer,p_prize_mode text,p_fixed_prize integer,p_match_control text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.cb_arena_settings%rowtype;
begin
 perform pg_advisory_xact_lock(hashtext('cb_arena_owner_schedule'));
 if not exists(select 1 from public.cb_profiles where user_id=p_owner_id and role='owner') then raise exception 'Owner access is required.';end if;
 if p_loss_limit is null or p_loss_limit not between 1 and 10 or p_weekly_limit is null or p_weekly_limit not between 1 and 12 then raise exception 'Choose 1–10 losses and 1–12 weekly battles.';end if;
 if p_prize_mode is null or p_prize_mode not in('fixed','auto') or p_fixed_prize is null or p_fixed_prize not between 0 and 1000000 or p_match_control is null or p_match_control not in('1+0','1+1','2+1','3+0','3+2','5+0','10+0','10+5','15+10') then raise exception 'Choose valid Arena controls.';end if;
 if exists(select 1 from public.cb_arena_sessions where owner_scheduled and starts_at>=date_trunc('week',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' group by date_trunc('week',starts_at at time zone 'Asia/Manila') having count(*)>p_weekly_limit) then raise exception 'This limit is below the number of published battles in a week.';end if;
 update public.cb_arena_settings set losses_to_eliminate=p_loss_limit,upcoming_weekly_limit=p_weekly_limit,prize_mode=p_prize_mode,fixed_prize_gold=p_fixed_prize,match_control=p_match_control,updated_by=p_owner_id,updated_at=now() where id=true returning * into saved;
 if not found then raise exception 'Arena settings are missing.';end if;
 return to_jsonb(saved);
end $$;

create or replace function public.cb_save_arena_session(p_owner_id uuid,p_session_id uuid,p_title text,p_starts_at timestamptz,p_ends_at timestamptz,p_loss_limit integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.cb_arena_sessions%rowtype;cfg public.cb_arena_settings%rowtype;v_date date;v_slot integer;v_week timestamp;
begin
 perform pg_advisory_xact_lock(hashtext('cb_arena_owner_schedule'));
 if not exists(select 1 from public.cb_profiles where user_id=p_owner_id and role='owner') then raise exception 'Owner access is required.';end if;
 if p_starts_at is null or p_ends_at is null or p_starts_at<=now() or p_ends_at-p_starts_at<interval '30 minutes' or p_ends_at-p_starts_at>interval '24 hours' then raise exception 'Choose a future battle lasting 30 minutes to 24 hours.';end if;
 if p_title is null or length(trim(p_title)) not between 1 and 80 or p_loss_limit is null or p_loss_limit not between 1 and 10 then raise exception 'Choose a title and 1–10 losses.';end if;
 if p_session_id is not null then
  select * into s from public.cb_arena_sessions where id=p_session_id for update;
  if s.id is null or not s.owner_scheduled or s.starts_at<=now() then raise exception 'Only future owner-created battles can be edited.';end if;
 end if;
 select * into cfg from public.cb_arena_settings where id=true;
 if not found then raise exception 'Arena settings are missing.';end if;
 if exists(select 1 from public.cb_arena_sessions where owner_scheduled and id is distinct from p_session_id and starts_at<p_ends_at and ends_at>p_starts_at) then raise exception 'Arena battles cannot overlap.';end if;
 v_date:=(p_starts_at at time zone 'Asia/Manila')::date;
 v_week:=date_trunc('week',p_starts_at at time zone 'Asia/Manila');
 if (select count(*) from public.cb_arena_sessions where owner_scheduled and id is distinct from p_session_id and date_trunc('week',starts_at at time zone 'Asia/Manila')=v_week)>=cfg.upcoming_weekly_limit then raise exception 'This week has reached the battle limit. Edit the weekly limit in Arena controls.';end if;
 select candidate into v_slot from generate_series(1,12) candidate where not exists(select 1 from public.cb_arena_sessions where session_date=v_date and slot=candidate and id is distinct from p_session_id) order by candidate limit 1;
 if v_slot is null then raise exception 'No session slot is available on this date.';end if;
 if p_session_id is null then
  insert into public.cb_arena_sessions(session_date,slot,starts_at,ends_at,title,loss_limit,owner_scheduled,prize_mode,prize_gold,match_control)
  values(v_date,v_slot,p_starts_at,p_ends_at,trim(p_title),p_loss_limit,true,cfg.prize_mode,case when cfg.prize_mode='fixed' then cfg.fixed_prize_gold else 0 end,cfg.match_control) returning * into s;
 else
  update public.cb_arena_sessions set session_date=v_date,slot=v_slot,starts_at=p_starts_at,ends_at=p_ends_at,title=trim(p_title),loss_limit=p_loss_limit where id=p_session_id returning * into s;
 end if;
 return to_jsonb(s);
end $$;
revoke all on function public.cb_save_arena_controls(uuid,integer,integer,text,integer,text),public.cb_save_arena_session(uuid,uuid,text,timestamptz,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.cb_save_arena_controls(uuid,integer,integer,text,integer,text),public.cb_save_arena_session(uuid,uuid,text,timestamptz,timestamptz,integer) to service_role;
commit;
