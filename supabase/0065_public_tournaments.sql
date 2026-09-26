-- Run after 0056. Public listing reveals only owner-published session summaries.
begin;

create or replace function public.cb_public_tournaments() returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id', session.id, 'title', session.title,
   'host_name', left(coalesce(session.state->>'hostName', ''), 60),
   'status', session.state->>'status',
   'rounds', session.state->'rounds',
   'player_count', jsonb_array_length(session.state->'players'),
   'round_count', jsonb_array_length(session.state->'history')
 ) order by session.updated_at desc), '[]'::jsonb)
 from (
   select t.* from public.cb_tournaments t
   join public.cb_profiles p on p.user_id = t.host_id and p.role = 'owner'
   where (select auth.uid()) is not null
     and t.state->>'status' in ('registration', 'playing', 'completed')
     and jsonb_typeof(t.state->'players') = 'array'
     and jsonb_typeof(t.state->'history') = 'array'
   order by t.updated_at desc limit 100
 ) session;
$$;

create or replace function public.cb_join_public_tournament(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare tournament_code text;
begin
 if (select auth.uid()) is null then raise exception 'Sign in to join'; end if;
 select t.code into tournament_code from public.cb_tournaments t
 join public.cb_profiles p on p.user_id = t.host_id and p.role = 'owner'
 where t.id = p_id and t.state->>'status' = 'registration';
 if tournament_code is null then raise exception 'Registration is closed or tournament unavailable'; end if;
 perform public.cb_join_tournament(p_id, tournament_code);
end $$;

revoke all on function public.cb_public_tournaments(), public.cb_join_public_tournament(uuid) from public, anon, authenticated;
grant execute on function public.cb_public_tournaments(), public.cb_join_public_tournament(uuid) to authenticated;

commit;
