-- Owner-managed daily Arena schedule; one winner per Manila day and ISO week.
begin;

alter table public.cb_arena_settings add column if not exists session_slots jsonb;
update public.cb_arena_settings
set session_slots=jsonb_build_array(
  jsonb_build_object('start',to_char(slot1_start,'HH24:MI'),'end',to_char(slot1_end,'HH24:MI')),
  jsonb_build_object('start',to_char(slot2_start,'HH24:MI'),'end',to_char(slot2_end,'HH24:MI')))
where session_slots is null;
alter table public.cb_arena_settings alter column session_slots set default '[{"start":"19:00","end":"21:00"},{"start":"22:00","end":"00:00"}]'::jsonb;
alter table public.cb_arena_settings alter column session_slots set not null;
alter table public.cb_arena_settings add constraint cb_arena_settings_session_slots_check
  check(jsonb_typeof(session_slots)='array' and jsonb_array_length(session_slots) between 1 and 12);

alter table public.cb_arena_sessions drop constraint if exists cb_arena_sessions_slot_check;
alter table public.cb_arena_sessions add constraint cb_arena_sessions_slot_check check(slot between 1 and 12);

-- Existing per-session champions were already paid. Begin daily prizes tomorrow
-- to avoid paying those sessions a second time during the transition.
create table if not exists public.cb_arena_award_start (
  id boolean primary key default true check(id),
  starts_on date not null
);
insert into public.cb_arena_award_start(id,starts_on)
values(true,(now() at time zone 'Asia/Manila')::date+1)
on conflict(id) do nothing;

create table if not exists public.cb_arena_awards (
  period text not null check(period in('daily','weekly')),
  period_start date not null,
  user_id uuid references public.cb_profiles(user_id) on delete set null,
  opponents_defeated integer not null default 0,
  arena_cbr_gain integer not null default 0,
  wins integer not null default 0,
  gold_paid integer not null default 0,
  awarded_at timestamptz not null default now(),
  primary key(period,period_start)
);
create index if not exists cb_arena_awards_recent_idx on public.cb_arena_awards(period,period_start desc);
alter table public.cb_arena_award_start enable row level security;
alter table public.cb_arena_awards enable row level security;
revoke all on public.cb_arena_award_start,public.cb_arena_awards from anon,authenticated;

create or replace function public.cb_finalize_arena_sessions()
returns integer language plpgsql security definer set search_path=public as $$
declare
  s record;
  d record;
  w record;
  champ record;
  processed integer:=0;
  prize integer;
  local_today date:=(now() at time zone 'Asia/Manila')::date;
  cutover date;
  ledger_id text;
begin
  -- A single finalizer handles concurrent Arena visits and the daily cron.
  perform pg_advisory_xact_lock(hashtext('cb_arena_period_awards'));
  select starts_on into cutover from public.cb_arena_award_start where id=true;

  for s in select * from public.cb_arena_sessions
    where ends_at<=now() and champion_rewarded_at is null for update skip locked loop
    if exists(select 1 from public.cb_matches
      where arena_session_id=s.id and (status='active' or (status='finished' and rating_applied=false))) then continue;end if;
    prize:=greatest(0,case when s.prize_mode='auto' then floor(s.ticket_gold_total*0.10)::integer else s.prize_gold end);
    -- Preserve entries and matches for whole-day/whole-week rankings.
    update public.cb_arena_sessions set champion_rewarded_at=now(),prize_gold=prize where id=s.id;
    processed:=processed+1;
  end loop;

  for d in select distinct session_date as period_start from public.cb_arena_sessions
    where session_date>=cutover and session_date<local_today order by period_start loop
    if exists(select 1 from public.cb_arena_awards where period='daily' and period_start=d.period_start)
       or exists(select 1 from public.cb_arena_sessions
         where session_date=d.period_start and (champion_rewarded_at is null or ends_at>now())) then continue;end if;

    select user_id,opponents_defeated,arena_cbr_gain,wins into champ from (
      select winner_id as user_id,count(distinct loser_id)::integer as opponents_defeated,
             (count(*)*4)::integer as arena_cbr_gain,count(*)::integer as wins,min(created_at) as first_win
      from (
        select case when m.result='white' then m.white_id else m.black_id end as winner_id,
               case when m.result='white' then m.black_id else m.white_id end as loser_id,m.created_at
        from public.cb_matches m join public.cb_arena_sessions ss on ss.id=m.arena_session_id
        where ss.session_date=d.period_start and m.play_mode='arena'
          and m.status='finished' and m.rating_applied=true and m.result in('white','black')
      ) wins_by_match group by winner_id
    ) scores order by opponents_defeated desc,arena_cbr_gain desc,wins desc,first_win asc,user_id asc limit 1;
    select coalesce(sum(prize_gold),0)::integer into prize from public.cb_arena_sessions where session_date=d.period_start;
    insert into public.cb_arena_awards(period,period_start,user_id,opponents_defeated,arena_cbr_gain,wins,gold_paid)
      values('daily',d.period_start,champ.user_id,coalesce(champ.opponents_defeated,0),coalesce(champ.arena_cbr_gain,0),coalesce(champ.wins,0),case when champ.user_id is null then 0 else prize end);
    if champ.user_id is not null then
      if prize>0 then
        ledger_id:='arena-day:'||d.period_start::text;
        insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
          select ledger_id,champ.user_id,prize,'arena_champion',id from public.cb_arena_sessions
          where session_date=d.period_start order by slot limit 1;
        update public.cb_profiles set gold_points=gold_points+prize where user_id=champ.user_id;
      end if;
      insert into public.cb_feed(user_id,kind,display_name,content,cbr_delta,gold_delta)
        select champ.user_id,'new_reward',display_name,'became Grand Arena Champion of the Day.',0,prize
        from public.cb_profiles where user_id=champ.user_id;
    end if;
    processed:=processed+1;
  end loop;

  for w in select distinct date_trunc('week',session_date::timestamp)::date as period_start
    from public.cb_arena_sessions where session_date>=cutover
      and session_date<date_trunc('week',local_today::timestamp)::date order by period_start loop
    if exists(select 1 from public.cb_arena_awards where period='weekly' and period_start=w.period_start)
       or exists(select 1 from public.cb_arena_sessions ss where ss.session_date>=greatest(w.period_start,cutover)
          and ss.session_date<w.period_start+7 and ss.champion_rewarded_at is null) then continue;end if;
    select user_id,opponents_defeated,arena_cbr_gain,wins into champ from (
      select winner_id as user_id,count(distinct loser_id)::integer as opponents_defeated,
             (count(*)*4)::integer as arena_cbr_gain,count(*)::integer as wins,min(created_at) as first_win
      from (
        select case when m.result='white' then m.white_id else m.black_id end as winner_id,
               case when m.result='white' then m.black_id else m.white_id end as loser_id,m.created_at
        from public.cb_matches m join public.cb_arena_sessions ss on ss.id=m.arena_session_id
        where ss.session_date>=greatest(w.period_start,cutover) and ss.session_date<w.period_start+7
          and m.play_mode='arena' and m.status='finished' and m.rating_applied=true and m.result in('white','black')
      ) wins_by_match group by winner_id
    ) scores order by opponents_defeated desc,arena_cbr_gain desc,wins desc,first_win asc,user_id asc limit 1;
    insert into public.cb_arena_awards(period,period_start,user_id,opponents_defeated,arena_cbr_gain,wins,gold_paid)
      values('weekly',w.period_start,champ.user_id,coalesce(champ.opponents_defeated,0),coalesce(champ.arena_cbr_gain,0),coalesce(champ.wins,0),0);
    if champ.user_id is not null then
      insert into public.cb_feed(user_id,kind,display_name,content,cbr_delta,gold_delta)
        select champ.user_id,'new_reward',display_name,'became Grand Arena Champion of the Week.',0,0
        from public.cb_profiles where user_id=champ.user_id;
    end if;
    processed:=processed+1;
  end loop;
  return processed;
end $$;

revoke all on function public.cb_finalize_arena_sessions() from public,anon,authenticated;
grant execute on function public.cb_finalize_arena_sessions() to service_role;
commit;
