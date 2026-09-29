-- Three verified CPU wins per level, followed by a level-specific cooldown.
-- Older CPU results had no level column, so each level starts at zero wins.
begin;

create table if not exists public.cb_cpu_level_limits (
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  level smallint not null check (level between 1 and 10),
  wins smallint not null default 0 check (wins between 0 and 3),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, level)
);
alter table public.cb_cpu_level_limits enable row level security;
revoke all on public.cb_cpu_level_limits from public, anon, authenticated;
grant select, insert, update on public.cb_cpu_level_limits to service_role;

alter table public.cb_cpu_results add column if not exists cpu_level smallint
  check (cpu_level between 1 and 10);

create or replace function public.cb_claim_cpu_reward(
  p_user_id uuid, p_game_id uuid, p_cbr integer, p_gold integer,
  p_mode text, p_level integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_inserted text;
  v_cbr integer;
  v_gold integer;
  v_wins integer;
  v_locked_until timestamptz;
  v_now timestamptz;
  v_cooldown interval;
begin
  if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
  if p_level not between 1 and 10 then raise exception 'Choose a CPU level from 1 to 10'; end if;
  if not ((p_mode='Bullet' and ((p_cbr=2 and p_gold=2) or (p_cbr=-3 and p_gold=0)))
    or (p_mode='Blitz' and ((p_cbr=3 and p_gold=3) or (p_cbr=-4 and p_gold=0)))
    or (p_mode='Rapid' and ((p_cbr=5 and p_gold=5) or (p_cbr=-6 and p_gold=0)))) then
    raise exception 'Invalid CPU result for this time control';
  end if;

  insert into public.cb_cpu_level_limits(user_id,level) values(p_user_id,p_level)
  on conflict(user_id,level) do nothing;
  select wins,locked_until into v_wins,v_locked_until
  from public.cb_cpu_level_limits where user_id=p_user_id and level=p_level for update;
  v_now := clock_timestamp();
  select cbr,gold_points into v_cbr,v_gold from public.cb_profiles where user_id=p_user_id;
  if not found then raise exception 'Player profile not found'; end if;

  -- Replays return their original no-op result, even after the level locks.
  if exists(select 1 from public.cb_gold_ledger where id='cpu-result:'||p_game_id::text) then
    return jsonb_build_object('awarded',false,'cbr',v_cbr,'gold',v_gold,
      'cbr_delta',0,'gold_delta',0,'wins',v_wins,'locked_until',v_locked_until);
  end if;
  if v_locked_until>v_now then
    raise exception 'CPU level % is locked until %',p_level,to_char(v_locked_until at time zone 'Asia/Manila','Mon DD, YYYY HH12:MI AM') using errcode='P0001';
  end if;
  if v_locked_until is not null then v_wins:=0;v_locked_until:=null;end if;

  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
  values('cpu-result:'||p_game_id::text,p_user_id,p_gold,'cpu_result',p_game_id)
  on conflict(id) do nothing returning id into v_inserted;
  if v_inserted is null then
    return jsonb_build_object('awarded',false,'cbr',v_cbr,'gold',v_gold,
      'cbr_delta',0,'gold_delta',0,'wins',v_wins,'locked_until',v_locked_until);
  end if;

  update public.cb_profiles set cbr=greatest(0,cbr+p_cbr),gold_points=gold_points+p_gold
  where user_id=p_user_id returning cbr,gold_points into v_cbr,v_gold;
  insert into public.cb_cpu_results(game_id,user_id,mode,outcome,cbr_delta,gold_delta,cpu_level)
  values(p_game_id,p_user_id,p_mode,case when p_cbr>0 then 'win' else 'loss' end,p_cbr,p_gold,p_level);
  if p_cbr>0 then
    v_wins:=v_wins+1;
    if v_wins=3 then
      v_cooldown:=(array[48,48,42,40,36,34,32,24,18,12])[p_level]*interval '1 hour';
      v_locked_until:=v_now+v_cooldown;
    end if;
  end if;
  update public.cb_cpu_level_limits set wins=v_wins,locked_until=v_locked_until,updated_at=v_now
  where user_id=p_user_id and level=p_level;
  return jsonb_build_object('awarded',true,'cbr',v_cbr,'gold',v_gold,
    'cbr_delta',p_cbr,'gold_delta',p_gold,'wins',v_wins,'locked_until',v_locked_until);
end $$;

revoke all on function public.cb_claim_cpu_reward(uuid,uuid,integer,integer,text,integer)
  from public,anon,authenticated;
grant execute on function public.cb_claim_cpu_reward(uuid,uuid,integer,integer,text,integer)
  to service_role;
-- Old signatures do not know the level and must not bypass the new limit.
revoke execute on function public.cb_claim_cpu_reward(uuid,uuid,integer,integer,text)
  from service_role;
revoke execute on function public.cb_claim_cpu_reward(uuid,uuid,integer,integer)
  from service_role;

commit;
