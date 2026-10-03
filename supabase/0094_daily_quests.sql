-- Apply in Supabase SQL editor before enabling Daily Quest in production.
begin;
create table if not exists public.cb_daily_quest_settings (
  id boolean primary key default true check (id),
  reward_kind text not null default 'cbg' check (reward_kind in ('cbg','arena_ticket','cbr')),
  reward_amount integer not null default 10 check (reward_amount between 1 and 10000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.cb_profiles(user_id) on delete set null
);
insert into public.cb_daily_quest_settings(id) values(true) on conflict do nothing;
create table if not exists public.cb_daily_quests (
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  quest_day date not null,
  targets jsonb not null,
  reward_kind text not null check (reward_kind in ('cbg','arena_ticket','cbr')),
  reward_amount integer not null check (reward_amount between 1 and 10000),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(user_id,quest_day)
);
alter table public.cb_daily_quest_settings enable row level security;
alter table public.cb_daily_quests enable row level security;
revoke all on public.cb_daily_quest_settings,public.cb_daily_quests from public,anon,authenticated;
grant select,insert,update on public.cb_daily_quest_settings,public.cb_daily_quests to service_role;
create index if not exists cb_quest_online_day on public.cb_matches(white_id,last_tick) where status='finished';
create index if not exists cb_quest_online_black_day on public.cb_matches(black_id,last_tick) where status='finished';
create index if not exists cb_quest_quiz_day on public.cb_chess_math_attack(user_id,finished_at) where finished_at is not null;

create or replace function public.cb_daily_quest_progress(p_user_id uuid,p_day date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_start timestamptz; v_end timestamptz; v_puzzles integer; v_cpu integer; v_quiz integer; v_online integer; v_arena integer;
begin
  if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
  v_start := p_day::timestamp at time zone 'Asia/Manila';
  v_end := (p_day+1)::timestamp at time zone 'Asia/Manila';
  select count(*) into v_puzzles from public.cb_daily_puzzle_claims where user_id=p_user_id and puzzle_day=p_day;
  select count(*) into v_cpu from public.cb_cpu_results where user_id=p_user_id and played_at>=v_start and played_at<v_end;
  select count(*) into v_quiz from public.cb_chess_math_attack where user_id=p_user_id and finished_at>=v_start and finished_at<v_end;
  select count(*) filter(where coalesce(play_mode,'normal')<>'arena'),count(*) filter(where play_mode='arena') into v_online,v_arena
    from public.cb_matches where status='finished' and last_tick>=v_start and last_tick<v_end
      and (white_id=p_user_id or black_id=p_user_id);
  return jsonb_build_object('puzzles',v_puzzles,'online',v_online,'cpu',v_cpu,'quiz',v_quiz,'arena',v_arena);
end $$;
revoke all on function public.cb_daily_quest_progress(uuid,date) from public,anon,authenticated;
grant execute on function public.cb_daily_quest_progress(uuid,date) to service_role;

create or replace function public.cb_claim_daily_quest(p_user_id uuid,p_day date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_quest public.cb_daily_quests%rowtype; v_progress jsonb; v_key text;
begin
  if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
  if p_day<>(now() at time zone 'Asia/Manila')::date then raise exception 'This quest has expired'; end if;
  select * into v_quest from public.cb_daily_quests where user_id=p_user_id and quest_day=p_day for update;
  if not found then raise exception 'Open Daily Quest to receive your tasks first'; end if;
  if v_quest.claimed_at is not null then return jsonb_build_object('claimed',false,'already_claimed',true); end if;
  v_progress:=public.cb_daily_quest_progress(p_user_id,p_day);
  for v_key in select jsonb_object_keys(v_quest.targets) loop
    if v_key<>'arena' and coalesce((v_progress->>v_key)::integer,0)<(v_quest.targets->>v_key)::integer then
      raise exception 'Finish every required Daily Quest task first';
    end if;
  end loop;
  update public.cb_daily_quests set claimed_at=now() where user_id=p_user_id and quest_day=p_day;
  if v_quest.reward_kind='cbg' then
    update public.cb_profiles set gold_points=gold_points+v_quest.reward_amount where user_id=p_user_id;
    insert into public.cb_gold_ledger(id,user_id,delta,kind) values('daily-quest:'||p_day||':'||p_user_id,p_user_id,v_quest.reward_amount,'daily_quest');
  elsif v_quest.reward_kind='cbr' then
    update public.cb_profiles set cbr=cbr+v_quest.reward_amount where user_id=p_user_id;
    insert into public.cb_cbr_ledger(id,user_id,delta,kind) values('daily-quest:'||p_day||':'||p_user_id,p_user_id,v_quest.reward_amount,'daily_quest');
  else
    insert into public.cb_arena_tickets(user_id,quantity) values(p_user_id,v_quest.reward_amount)
      on conflict(user_id) do update set quantity=cb_arena_tickets.quantity+excluded.quantity,updated_at=now();
  end if;
  return jsonb_build_object('claimed',true,'kind',v_quest.reward_kind,'amount',v_quest.reward_amount);
end $$;
revoke all on function public.cb_claim_daily_quest(uuid,date) from public,anon,authenticated;
grant execute on function public.cb_claim_daily_quest(uuid,date) to service_role;
commit;
