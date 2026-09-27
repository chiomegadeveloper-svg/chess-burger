-- Apply after 0051. Record one rated miss per user, puzzle, and Philippines day.
begin;

create table if not exists public.cb_daily_puzzle_misses(
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  puzzle_day date not null,
  puzzle_id text not null check(length(puzzle_id) between 3 and 60),
  created_at timestamptz not null default now(),
  primary key(user_id,puzzle_day,puzzle_id)
);
alter table public.cb_daily_puzzle_misses enable row level security;
revoke all on public.cb_daily_puzzle_misses from public,anon,authenticated;
create index if not exists cb_daily_puzzle_misses_day_idx on public.cb_daily_puzzle_misses(puzzle_day,user_id);

create or replace function public.cb_record_puzzle_miss(p_user_id uuid,p_day date,p_puzzle_id text,p_puzzle_rating integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rating integer;v_deduction integer:=0;v_inserted text;v_streak integer;
begin
  insert into public.cb_puzzle_profiles(user_id) values(p_user_id) on conflict do nothing;
  select puzzle_rating into v_rating from public.cb_puzzle_profiles where user_id=p_user_id for update;
  if exists(select 1 from public.cb_daily_puzzle_claims where user_id=p_user_id and puzzle_day=p_day and puzzle_id=p_puzzle_id) then
    return jsonb_build_object('awarded',false,'rating_delta',0,'puzzle_rating',v_rating,'already_solved',true,'missed',false);
  end if;
  insert into public.cb_daily_puzzle_misses(user_id,puzzle_day,puzzle_id)
    values(p_user_id,p_day,p_puzzle_id) on conflict do nothing returning puzzle_id into v_inserted;
  if v_inserted is not null then
    v_deduction:=least(v_rating-100,greatest(2,least(12,round(12/(1+power(10,(p_puzzle_rating-v_rating)::numeric/400))))));
    update public.cb_puzzle_profiles set puzzle_rating=puzzle_rating-v_deduction,correct_streak=0,updated_at=now()
      where user_id=p_user_id returning puzzle_rating,correct_streak into v_rating,v_streak;
  else
    select correct_streak into v_streak from public.cb_puzzle_profiles where user_id=p_user_id;
  end if;
  return jsonb_build_object('awarded',v_inserted is not null,'rating_delta',-v_deduction,'puzzle_rating',v_rating,'correct_streak',v_streak,'missed',true);
end $$;
revoke all on function public.cb_record_puzzle_miss(uuid,date,text,integer) from public,anon,authenticated;
grant execute on function public.cb_record_puzzle_miss(uuid,date,text,integer) to service_role;

create or replace function public.cb_claim_daily_puzzle(p_user_id uuid,p_day date,p_puzzle_id text,p_is_final boolean,p_puzzle_rating integer,p_gold_reward integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_inserted text;v_bonus boolean:=false;v_delta integer:=0;v_gold integer;v_count integer;v_rating integer;v_rating_delta integer:=0;v_solved integer;v_streak integer;v_best integer;v_missed boolean:=false;
begin
  insert into public.cb_puzzle_profiles(user_id) values(p_user_id) on conflict do nothing;
  select puzzle_rating into v_rating from public.cb_puzzle_profiles where user_id=p_user_id for update;
  select exists(select 1 from public.cb_daily_puzzle_misses where user_id=p_user_id and puzzle_day=p_day and puzzle_id=p_puzzle_id) into v_missed;
  insert into public.cb_daily_puzzle_claims(user_id,puzzle_day,puzzle_id) values(p_user_id,p_day,p_puzzle_id)
  on conflict do nothing returning puzzle_id into v_inserted;
  if v_inserted is not null then
    v_delta:=greatest(1,least(3,p_gold_reward));
    insert into public.cb_gold_ledger(id,user_id,delta,kind) values('daily-puzzle:'||p_day::text||':'||p_user_id::text||':'||p_puzzle_id,p_user_id,v_delta,'daily_puzzle') on conflict do nothing;
    select count(*) into v_count from public.cb_daily_puzzle_claims where user_id=p_user_id and puzzle_day=p_day and puzzle_id like 'daily-%';
    if p_is_final and v_count=500 then
      insert into public.cb_gold_ledger(id,user_id,delta,kind) values('daily-puzzle-bonus:'||p_day::text||':'||p_user_id::text,p_user_id,5,'daily_puzzle_bonus') on conflict do nothing returning true into v_bonus;
      if coalesce(v_bonus,false) then v_delta:=v_delta+5;end if;
    end if;
    if not v_missed then
      v_rating_delta:=least(4000-v_rating,greatest(4,round(24*(1-(1/(1+power(10,(p_puzzle_rating-v_rating)::numeric/400)))))));
    end if;
    update public.cb_puzzle_profiles set puzzle_rating=least(4000,puzzle_rating+v_rating_delta),solved_total=solved_total+1,correct_streak=case when v_missed then correct_streak when last_solved_day is null or last_solved_day>=p_day-1 then correct_streak+1 else 1 end,best_streak=case when v_missed then best_streak else greatest(best_streak,case when last_solved_day is null or last_solved_day>=p_day-1 then correct_streak+1 else 1 end) end,last_solved_day=case when v_missed then last_solved_day else p_day end,updated_at=now() where user_id=p_user_id returning puzzle_rating,solved_total,correct_streak,best_streak into v_rating,v_solved,v_streak,v_best;
    update public.cb_profiles set gold_points=gold_points+v_delta where user_id=p_user_id returning gold_points into v_gold;
  else
    select gold_points into v_gold from public.cb_profiles where user_id=p_user_id;
    select puzzle_rating,solved_total,correct_streak,best_streak into v_rating,v_solved,v_streak,v_best from public.cb_puzzle_profiles where user_id=p_user_id;
  end if;
  return jsonb_build_object('awarded',v_inserted is not null,'gold_delta',v_delta,'gold',v_gold,'bonus_claimed',coalesce(v_bonus,false),'puzzle_rating',v_rating,'rating_delta',v_rating_delta,'missed',v_missed,'solved_total',v_solved,'correct_streak',v_streak,'best_streak',v_best);
end $$;
revoke all on function public.cb_claim_daily_puzzle(uuid,date,text,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.cb_claim_daily_puzzle(uuid,date,text,boolean,integer,integer) to service_role;

commit;
