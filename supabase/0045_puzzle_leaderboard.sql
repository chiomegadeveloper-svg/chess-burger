begin;

create or replace function public.cb_puzzle_leaders(p_day date)
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
  with all_time as (
    select pp.user_id,pp.solved_total,pp.puzzle_rating
    from public.cb_puzzle_profiles pp
    order by pp.solved_total desc,pp.puzzle_rating desc,pp.updated_at asc
    limit 1
  ), today_counts as (
    select claims.user_id,count(*)::integer as today_solved
    from public.cb_daily_puzzle_claims claims
    where claims.puzzle_day=p_day
    group by claims.user_id
    order by today_solved desc,claims.user_id
    limit 1
  ), rating as (
    select pp.user_id,pp.solved_total,pp.puzzle_rating
    from public.cb_puzzle_profiles pp
    order by pp.puzzle_rating desc,pp.solved_total desc,pp.updated_at asc
    limit 1
  )
  select jsonb_build_object(
    'all_time',(select jsonb_build_object('user_id',a.user_id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'value',a.solved_total,'puzzle_rating',a.puzzle_rating) from all_time a join public.cb_profiles p on p.user_id=a.user_id),
    'today',(select jsonb_build_object('user_id',t.user_id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'value',t.today_solved,'puzzle_rating',coalesce(pp.puzzle_rating,1000)) from today_counts t join public.cb_profiles p on p.user_id=t.user_id left join public.cb_puzzle_profiles pp on pp.user_id=t.user_id),
    'rating',(select jsonb_build_object('user_id',r.user_id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'value',r.puzzle_rating,'solved_total',r.solved_total) from rating r join public.cb_profiles p on p.user_id=r.user_id)
  );
$$;

revoke all on function public.cb_puzzle_leaders(date) from public,anon,authenticated;
grant execute on function public.cb_puzzle_leaders(date) to service_role;

commit;
