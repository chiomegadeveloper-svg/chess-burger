-- Upgrade the existing puzzle leaderboard RPC from one winner to ten per category.
-- Apply after 0045_puzzle_leaderboard.sql in the Supabase SQL Editor.
create or replace function public.cb_puzzle_leaders(p_day date)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with today_counts as (
    select user_id, count(*)::integer as today_solved
    from public.cb_daily_puzzle_claims
    where puzzle_day = p_day
    group by user_id
    order by today_solved desc, user_id
    limit 10
  ), today_ranked as (
    select row_number() over (order by t.today_solved desc, t.user_id) as position,
      t.user_id, t.today_solved as value, coalesce(pp.puzzle_rating, 1000) as puzzle_rating
    from today_counts t
    left join public.cb_puzzle_profiles pp on pp.user_id = t.user_id
  ), all_time_ranked as (
    select row_number() over (order by pp.solved_total desc, pp.puzzle_rating desc, pp.updated_at asc, pp.user_id) as position,
      pp.user_id, pp.solved_total as value, pp.puzzle_rating
    from public.cb_puzzle_profiles pp
    where pp.solved_total > 0
    order by pp.solved_total desc, pp.puzzle_rating desc, pp.updated_at asc, pp.user_id
    limit 10
  ), rating_ranked as (
    select row_number() over (order by pp.puzzle_rating desc, pp.solved_total desc, pp.updated_at asc, pp.user_id) as position,
      pp.user_id, pp.puzzle_rating as value, pp.solved_total
    from public.cb_puzzle_profiles pp
    order by pp.puzzle_rating desc, pp.solved_total desc, pp.updated_at asc, pp.user_id
    limit 10
  )
  select jsonb_build_object(
    'today', coalesce((select jsonb_agg(jsonb_build_object('user_id', t.user_id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'value', t.value, 'puzzle_rating', t.puzzle_rating) order by t.position)
      from today_ranked t join public.cb_profiles p on p.user_id = t.user_id), '[]'::jsonb),
    'all_time', coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'value', a.value, 'puzzle_rating', a.puzzle_rating) order by a.position)
      from all_time_ranked a join public.cb_profiles p on p.user_id = a.user_id), '[]'::jsonb),
    'rating', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'value', r.value, 'solved_total', r.solved_total) order by r.position)
      from rating_ranked r join public.cb_profiles p on p.user_id = r.user_id), '[]'::jsonb)
  );
$$;

revoke all on function public.cb_puzzle_leaders(date) from public, anon, authenticated;
grant execute on function public.cb_puzzle_leaders(date) to service_role;
