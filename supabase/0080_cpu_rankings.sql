-- CPU Top 10 boards. Apply after 0026_cpu_match_rewards.sql in Supabase.
begin;

create table if not exists public.cb_cpu_results (
  game_id uuid primary key,
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  mode text not null check(mode in ('Bullet','Blitz','Rapid')),
  outcome text not null check(outcome in ('win','loss')),
  cbr_delta integer not null,
  gold_delta integer not null,
  played_at timestamptz not null default now()
);
create index if not exists cb_cpu_results_user_time_idx on public.cb_cpu_results(user_id,played_at desc);
alter table public.cb_cpu_results enable row level security;
revoke all on public.cb_cpu_results from anon,authenticated;

-- Four indexed summaries per victory: Manila day, Manila week, lifetime,
-- and lifetime time control. Reads never scan the complete game history.
create table if not exists public.cb_cpu_player_stats (
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  period_key text not null check(period_key in ('day','week','all_time')),
  period_start date not null,
  mode_key text not null check(mode_key in ('all','Bullet','Blitz','Rapid')),
  wins integer not null default 0 check(wins>=0),
  cbr_gain integer not null default 0,
  primary key(user_id,period_key,period_start,mode_key)
);
create index if not exists cb_cpu_player_stats_top_idx on public.cb_cpu_player_stats(period_key,period_start,mode_key,wins desc,cbr_gain desc,user_id);
alter table public.cb_cpu_player_stats enable row level security;
revoke all on public.cb_cpu_player_stats from anon,authenticated;

create or replace function public.cb_count_cpu_win() returns trigger
language plpgsql security definer set search_path=public as $$
declare local_day date; local_week date;
begin
  if new.outcome<>'win' then return new; end if;
  local_day:=(new.played_at at time zone 'Asia/Manila')::date;
  local_week:=date_trunc('week',new.played_at at time zone 'Asia/Manila')::date;
  insert into public.cb_cpu_player_stats(user_id,period_key,period_start,mode_key,wins,cbr_gain)
  values
    (new.user_id,'day',local_day,'all',1,new.cbr_delta),
    (new.user_id,'week',local_week,'all',1,new.cbr_delta),
    (new.user_id,'all_time','2000-01-01','all',1,new.cbr_delta),
    (new.user_id,'all_time','2000-01-01',new.mode,1,new.cbr_delta)
  on conflict(user_id,period_key,period_start,mode_key) do update
    set wins=cb_cpu_player_stats.wins+1,cbr_gain=cb_cpu_player_stats.cbr_gain+excluded.cbr_gain;
  return new;
end $$;
drop trigger if exists cb_cpu_results_count_win on public.cb_cpu_results;
create trigger cb_cpu_results_count_win after insert on public.cb_cpu_results
for each row execute function public.cb_count_cpu_win();

-- Historical positive CPU Gold rewards identify wins and their mode exactly.
-- Old zero-Gold losses have no recorded mode, and do not affect win boards.
insert into public.cb_cpu_results(game_id,user_id,mode,outcome,cbr_delta,gold_delta,played_at)
select reference_id,user_id,
  case delta when 2 then 'Bullet' when 3 then 'Blitz' else 'Rapid' end,
  'win',delta,delta,created_at
from public.cb_gold_ledger
where kind='cpu_result' and delta in (2,3,5) and reference_id is not null
on conflict(game_id) do nothing;

create or replace function public.cb_claim_cpu_reward(p_user_id uuid,p_game_id uuid,p_cbr integer,p_gold integer,p_mode text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_inserted text;v_cbr integer;v_gold integer;
begin
  if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
  if not ((p_mode='Bullet' and ((p_cbr=2 and p_gold=2) or (p_cbr=-3 and p_gold=0)))
    or (p_mode='Blitz' and ((p_cbr=3 and p_gold=3) or (p_cbr=-4 and p_gold=0)))
    or (p_mode='Rapid' and ((p_cbr=5 and p_gold=5) or (p_cbr=-6 and p_gold=0)))) then
    raise exception 'Invalid CPU result for this time control';
  end if;
  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
  values('cpu-result:'||p_game_id::text,p_user_id,p_gold,'cpu_result',p_game_id)
  on conflict(id) do nothing returning id into v_inserted;
  if v_inserted is not null then
    update public.cb_profiles set cbr=greatest(0,cbr+p_cbr),gold_points=gold_points+p_gold
    where user_id=p_user_id returning cbr,gold_points into v_cbr,v_gold;
    if not found then raise exception 'Player profile not found'; end if;
    insert into public.cb_cpu_results(game_id,user_id,mode,outcome,cbr_delta,gold_delta)
    values(p_game_id,p_user_id,p_mode,case when p_cbr>0 then 'win' else 'loss' end,p_cbr,p_gold);
  else
    select cbr,gold_points into v_cbr,v_gold from public.cb_profiles where user_id=p_user_id;
  end if;
  return jsonb_build_object('awarded',v_inserted is not null,'cbr',v_cbr,'gold',v_gold,
    'cbr_delta',case when v_inserted is not null then p_cbr else 0 end,
    'gold_delta',case when v_inserted is not null then p_gold else 0 end);
end $$;

-- Preserve compatibility with existing deployed clients during rollout.
create or replace function public.cb_claim_cpu_reward(p_user_id uuid,p_game_id uuid,p_cbr integer,p_gold integer)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  return public.cb_claim_cpu_reward(p_user_id,p_game_id,p_cbr,p_gold,
    case when p_cbr in (2,-3) then 'Bullet' when p_cbr in (3,-4) then 'Blitz' else 'Rapid' end);
end $$;
revoke all on function public.cb_claim_cpu_reward(uuid,uuid,integer,integer,text) from public,anon,authenticated;
revoke all on function public.cb_claim_cpu_reward(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.cb_claim_cpu_reward(uuid,uuid,integer,integer,text) to service_role;
grant execute on function public.cb_claim_cpu_reward(uuid,uuid,integer,integer) to service_role;

create or replace function public.cb_cpu_leaders() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare local_day date; local_week date; output jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
  local_day:=(now() at time zone 'Asia/Manila')::date;
  local_week:=date_trunc('week',now() at time zone 'Asia/Manila')::date;
  with categories(category,period_key,period_start,mode_key) as (
    values ('today','day',local_day,'all'),('week','week',local_week,'all'),
      ('all_time','all_time','2000-01-01'::date,'all'),
      ('rapid','all_time','2000-01-01'::date,'Rapid'),
      ('blitz','all_time','2000-01-01'::date,'Blitz'),
      ('bullet','all_time','2000-01-01'::date,'Bullet')
  )
  select jsonb_object_agg(category,leaders) into output from (
    select c.category,coalesce((
      select jsonb_agg(jsonb_build_object('user_id',ranked.user_id,'username',ranked.username,
        'display_name',ranked.display_name,'avatar_url',ranked.avatar_url,'wins',ranked.wins,
        'cbr_gain',ranked.cbr_gain) order by ranked.wins desc,ranked.cbr_gain desc,ranked.user_id)
      from (
        select s.user_id,p.username,p.display_name,p.avatar_url,s.wins,s.cbr_gain
        from public.cb_cpu_player_stats s join public.cb_profiles p on p.user_id=s.user_id
        where s.period_key=c.period_key and s.period_start=c.period_start and s.mode_key=c.mode_key and s.wins>0
        order by s.wins desc,s.cbr_gain desc,s.user_id limit 10
      ) ranked
    ),'[]'::jsonb) as leaders from categories c
  ) grouped;
  return output;
end $$;
revoke all on function public.cb_cpu_leaders() from public,anon,authenticated;
grant execute on function public.cb_cpu_leaders() to service_role;
commit;
