-- Apply after 0050. Daily completion bonus now fires after 500 unique solves.
begin;
create or replace function public.cb_claim_daily_puzzle(p_user_id uuid,p_day date,p_puzzle_id text,p_is_final boolean,p_puzzle_rating integer,p_gold_reward integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_inserted text;v_bonus boolean:=false;v_delta integer:=0;v_gold integer;v_count integer;v_rating integer;v_rating_delta integer:=0;v_solved integer;v_streak integer;v_best integer;
begin
  insert into public.cb_puzzle_profiles(user_id) values(p_user_id) on conflict do nothing;
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
    select puzzle_rating into v_rating from public.cb_puzzle_profiles where user_id=p_user_id for update;
    v_rating_delta:=greatest(4,round(24*(1-(1/(1+power(10,(p_puzzle_rating-v_rating)::numeric/400))))));
    update public.cb_puzzle_profiles set puzzle_rating=least(4000,puzzle_rating+v_rating_delta),solved_total=solved_total+1,correct_streak=case when last_solved_day is null or last_solved_day>=p_day-1 then correct_streak+1 else 1 end,best_streak=greatest(best_streak,case when last_solved_day is null or last_solved_day>=p_day-1 then correct_streak+1 else 1 end),last_solved_day=p_day,updated_at=now() where user_id=p_user_id returning puzzle_rating,solved_total,correct_streak,best_streak into v_rating,v_solved,v_streak,v_best;
    update public.cb_profiles set gold_points=gold_points+v_delta where user_id=p_user_id returning gold_points into v_gold;
  else
    select gold_points into v_gold from public.cb_profiles where user_id=p_user_id;
    select puzzle_rating,solved_total,correct_streak,best_streak into v_rating,v_solved,v_streak,v_best from public.cb_puzzle_profiles where user_id=p_user_id;
  end if;
  return jsonb_build_object('awarded',v_inserted is not null,'gold_delta',v_delta,'gold',v_gold,'bonus_claimed',coalesce(v_bonus,false),'puzzle_rating',v_rating,'rating_delta',v_rating_delta,'solved_total',v_solved,'correct_streak',v_streak,'best_streak',v_best);
end $$;
revoke all on function public.cb_claim_daily_puzzle(uuid,date,text,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.cb_claim_daily_puzzle(uuid,date,text,boolean,integer,integer) to service_role;

commit;
