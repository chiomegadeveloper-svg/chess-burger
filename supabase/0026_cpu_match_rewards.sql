begin;
create or replace function public.cb_claim_cpu_reward(p_user_id uuid,p_game_id uuid,p_cbr integer,p_gold integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_inserted text;v_cbr integer;v_gold integer;
begin
  if not ((p_cbr in (2,3,5) and p_gold=p_cbr) or (p_cbr in (-3,-4,-6) and p_gold=0)) then raise exception 'Invalid CPU reward';end if;
  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('cpu-result:'||p_game_id::text,p_user_id,p_gold,'cpu_result',p_game_id) on conflict(id) do nothing returning id into v_inserted;
  if v_inserted is not null then update public.cb_profiles set cbr=greatest(0,cbr+p_cbr),gold_points=gold_points+p_gold where user_id=p_user_id returning cbr,gold_points into v_cbr,v_gold;
  else select cbr,gold_points into v_cbr,v_gold from public.cb_profiles where user_id=p_user_id;end if;
  return jsonb_build_object('awarded',v_inserted is not null,'cbr',v_cbr,'gold',v_gold,'cbr_delta',case when v_inserted is not null then p_cbr else 0 end,'gold_delta',case when v_inserted is not null then p_gold else 0 end);
end $$;
revoke all on function public.cb_claim_cpu_reward(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.cb_claim_cpu_reward(uuid,uuid,integer,integer) to service_role;
commit;
