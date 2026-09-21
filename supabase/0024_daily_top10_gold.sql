-- Daily Top 10 Gold rewards and community feed announcements.
-- The schedule is 12:05 AM Asia/Manila (4:05 PM UTC).

begin;

create table if not exists public.cb_daily_rank_rewards (
  reward_date date not null,
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  rank integer not null check (rank between 1 and 10),
  gold_awarded integer not null check (gold_awarded in (5,8,9,10)),
  created_at timestamptz not null default now(),
  primary key (reward_date, user_id),
  unique (reward_date, rank)
);

alter table public.cb_daily_rank_rewards enable row level security;
revoke all on public.cb_daily_rank_rewards from anon, authenticated;

create or replace function public.cb_award_daily_top10_gold()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := (now() at time zone 'Asia/Manila')::date;
  v_player record;
  v_gold integer;
  v_count integer := 0;
begin
  -- Prevent two scheduler/manual runs from processing the same day together.
  perform pg_advisory_xact_lock(hashtext('cb_daily_top10_gold:' || v_date::text));

  for v_player in
    select
      p.user_id,
      p.display_name,
      row_number() over (
        order by p.cbr desc, p.wins desc, p.user_id asc
      )::integer as rank
    from public.cb_profiles p
    order by p.cbr desc, p.wins desc, p.user_id asc
    limit 10
  loop
    v_gold := case
      when v_player.rank = 1 then 10
      when v_player.rank = 2 then 9
      when v_player.rank = 3 then 8
      else 5
    end;

    insert into public.cb_daily_rank_rewards (
      reward_date,
      user_id,
      rank,
      gold_awarded
    )
    values (
      v_date,
      v_player.user_id,
      v_player.rank,
      v_gold
    )
    on conflict do nothing;

    if found then
      update public.cb_profiles
      set gold_points = gold_points + v_gold
      where user_id = v_player.user_id;

      insert into public.cb_feed (
        user_id,
        kind,
        display_name,
        content,
        gold_delta,
        event_date
      )
      values (
        v_player.user_id,
        'top10',
        v_player.display_name,
        'earned ' || v_gold || ' Gold for placing #' || v_player.rank || ' in today''s Top 10.',
        v_gold,
        v_date
      );

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.cb_award_daily_top10_gold() from public, anon, authenticated;

commit;

-- Supabase Cron runs in UTC. 16:05 UTC is 00:05 in the Philippines.
create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'chess-burger-daily-top10-gold'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'chess-burger-daily-top10-gold',
  '5 16 * * *',
  'select public.cb_award_daily_top10_gold();'
);

-- Award today's winners immediately. The ledger makes this safe to rerun.
select public.cb_award_daily_top10_gold();
