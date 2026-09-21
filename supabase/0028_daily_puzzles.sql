begin;
create table if not exists public.cb_daily_puzzle_claims(
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  puzzle_day date not null,
  puzzle_id text not null check(length(puzzle_id) between 3 and 60),
  created_at timestamptz not null default now(),
  primary key(user_id,puzzle_day,puzzle_id)
);
alter table public.cb_daily_puzzle_claims enable row level security;
revoke all on public.cb_daily_puzzle_claims from public,anon,authenticated;
create index if not exists cb_daily_puzzle_claims_day_idx on public.cb_daily_puzzle_claims(puzzle_day,user_id);

create or replace function public.cb_claim_daily_puzzle(p_user_id uuid,p_day date,p_puzzle_id text,p_is_final boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_inserted text;v_bonus boolean:=false;v_delta integer:=0;v_gold integer;v_count integer;
begin
  insert into public.cb_daily_puzzle_claims(user_id,puzzle_day,puzzle_id) values(p_user_id,p_day,p_puzzle_id)
  on conflict do nothing returning puzzle_id into v_inserted;
  if v_inserted is not null then
    v_delta:=2;
    insert into public.cb_gold_ledger(id,user_id,delta,kind) values('daily-puzzle:'||p_day::text||':'||p_user_id::text||':'||p_puzzle_id,p_user_id,2,'daily_puzzle') on conflict do nothing;
    select count(*) into v_count from public.cb_daily_puzzle_claims where user_id=p_user_id and puzzle_day=p_day;
    if p_is_final and mod(v_count,10)=0 then
      insert into public.cb_gold_ledger(id,user_id,delta,kind) values('daily-puzzle-bonus:'||p_day::text||':'||p_user_id::text||':'||p_puzzle_id,p_user_id,5,'daily_puzzle_bonus') on conflict do nothing returning true into v_bonus;
      if coalesce(v_bonus,false) then v_delta:=v_delta+5;end if;
    end if;
    update public.cb_profiles set gold_points=gold_points+v_delta where user_id=p_user_id returning gold_points into v_gold;
  else select gold_points into v_gold from public.cb_profiles where user_id=p_user_id;end if;
  return jsonb_build_object('awarded',v_inserted is not null,'gold_delta',v_delta,'gold',v_gold,'bonus_claimed',coalesce(v_bonus,false));
end $$;
revoke all on function public.cb_claim_daily_puzzle(uuid,date,text,boolean) from public,anon,authenticated;
grant execute on function public.cb_claim_daily_puzzle(uuid,date,text,boolean) to service_role;
commit;
