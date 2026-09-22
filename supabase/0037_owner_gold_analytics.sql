-- Owner-only CBG/Gold economy analytics for the Chess Burger CMS.
begin;
create or replace function public.cb_owner_gold_analytics() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
 if not exists(select 1 from public.cb_profiles where user_id=auth.uid() and role='owner') then raise exception 'Owner only.';end if;
 select jsonb_build_object(
  'summary',jsonb_build_object('total_gold',coalesce((select sum(gold_points) from public.cb_profiles),0),'players',coalesce((select count(*) from public.cb_profiles),0),'holders',coalesce((select count(*) from public.cb_profiles where gold_points>0),0),'average_gold',coalesce((select round(avg(gold_points)) from public.cb_profiles),0),'issued_30d',coalesce((select sum(delta) from public.cb_gold_ledger where delta>0 and created_at>=now()-interval '30 days'),0),'spent_30d',coalesce((select -sum(delta) from public.cb_gold_ledger where delta<0 and created_at>=now()-interval '30 days'),0),'gifted_30d',coalesce((select sum(amount) from public.cb_gold_gifts where created_at>=now()-interval '30 days'),0)),
  'top_players',coalesce((select jsonb_agg(to_jsonb(p)) from (select username,display_name,gold_points from public.cb_profiles order by gold_points desc,username limit 20)p),'[]'::jsonb),
  'flows',coalesce((select jsonb_agg(to_jsonb(f)) from (select kind,count(*)::integer transactions,coalesce(sum(delta)filter(where delta>0),0)::integer issued,coalesce(-sum(delta)filter(where delta<0),0)::integer spent from public.cb_gold_ledger where created_at>=now()-interval '30 days' group by kind order by sum(abs(delta)) desc limit 20)f),'[]'::jsonb),
  'recent',coalesce((select jsonb_agg(to_jsonb(r)) from (select l.id,l.kind,l.delta,l.created_at,p.username,p.display_name from public.cb_gold_ledger l join public.cb_profiles p on p.user_id=l.user_id order by l.created_at desc limit 30)r),'[]'::jsonb)
 ) into v_result;
 return v_result;
end $$;
revoke all on function public.cb_owner_gold_analytics() from public,anon,authenticated;
grant execute on function public.cb_owner_gold_analytics() to authenticated;
commit;
