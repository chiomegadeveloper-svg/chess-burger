-- Apply after 0054. Only current guild members may request these aggregates.
begin;

create or replace function public.cb_guild_analytics(p_user_id uuid,p_guild_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if not exists(select 1 from public.cb_guild_members where guild_id=p_guild_id and user_id=p_user_id) then
  raise exception 'Only guild members can view analytics';
 end if;
 with active_members as (
  select user_id from public.cb_guild_members where guild_id=p_guild_id
 ), events as (
  select actor_id,kind,amount,created_at from public.cb_guild_activity
  where guild_id=p_guild_id and created_at>=now()-interval '30 days'
 ), earnings as (
  select actor_id,
   coalesce(sum(amount) filter(where kind='cbr'),0)::bigint as cbr,
   coalesce(sum(amount) filter(where kind='cbg'),0)::bigint as cbg,
   count(*) filter(where kind in ('join','request','vote','leader','entrance'))::integer as actions
  from events group by actor_id
 ), wins as (
  select user_id,count(distinct coalesce(reference_id::text,id))::integer as games,
   coalesce(sum(amount),0)::bigint as chest
  from public.cb_guild_chest_ledger
  where guild_id=p_guild_id and kind='win' and created_at>=now()-interval '30 days'
  group by user_id
 ), member_stats as (
  select m.user_id,coalesce(e.cbr,0) as cbr,coalesce(e.cbg,0) as cbg,
   coalesce(e.actions,0) as actions,coalesce(w.games,0) as wins,coalesce(w.chest,0) as chest
  from active_members m left join earnings e on e.actor_id=m.user_id
  left join wins w on w.user_id=m.user_id
 ), days as (
  select generate_series((current_date-6)::timestamp,current_date::timestamp,interval '1 day')::date as day
 ), daily as (
  select d.day,
   (select count(distinct coalesce(l.reference_id::text,l.id)) from public.cb_guild_chest_ledger l
    where l.guild_id=p_guild_id and l.kind='win' and l.created_at>=d.day and l.created_at<d.day+1) as wins,
   (select coalesce(sum(l.amount),0) from public.cb_guild_chest_ledger l
    where l.guild_id=p_guild_id and l.kind='win' and l.created_at>=d.day and l.created_at<d.day+1) as chest
  from days d
 )
 select jsonb_build_object(
  'period_days',30,
  'wins',(select count(distinct coalesce(reference_id::text,id)) from public.cb_guild_chest_ledger where guild_id=p_guild_id and kind='win' and created_at>=now()-interval '30 days'),
  'chest_earned',(select coalesce(sum(amount),0) from public.cb_guild_chest_ledger where guild_id=p_guild_id and kind='win' and created_at>=now()-interval '30 days'),
  'cbr_earned',(select coalesce(sum(amount),0) from events where kind='cbr'),
  'cbg_earned',(select coalesce(sum(amount),0) from events where kind='cbg'),
  'actions',(select count(*) from events where kind in ('join','leave','request','rejected','vote','leader','entrance')),
  'members',(select coalesce(jsonb_agg(to_jsonb(s) order by s.wins desc,s.cbr desc), '[]'::jsonb) from member_stats s),
  'daily',(select coalesce(jsonb_agg(to_jsonb(d) order by d.day),'[]'::jsonb) from daily d)
 ) into result;
 return result;
end $$;

revoke all on function public.cb_guild_analytics(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cb_guild_analytics(uuid,uuid) to service_role;
commit;
