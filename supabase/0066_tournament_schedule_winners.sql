-- Run after 0065. Keep tournament state private; expose only session summaries and podium records.
begin;

create table if not exists public.cb_tournament_winners (
 tournament_id uuid not null references public.cb_tournaments(id) on delete cascade,
 rank integer not null check(rank between 1 and 3),
 user_id uuid not null references public.cb_profiles(user_id),
 title text not null,
 finished_at timestamptz not null,
 cbg_gain integer not null default 0,
 cbr_gain integer not null default 0,
 gold_gain integer not null default 0,
 primary key(tournament_id,rank),
 unique(tournament_id,user_id)
);
create index if not exists cb_tournament_winners_week on public.cb_tournament_winners(finished_at desc) where rank=1;
alter table public.cb_tournament_winners enable row level security;
revoke all on public.cb_tournament_winners from public,anon,authenticated;

create or replace function public.cb_public_tournaments() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id', t.id, 'title', t.title,
   'host_name', left(coalesce(t.state->>'hostName',''),60),
   'status', t.state->>'status', 'starts_at', t.state->>'startsAt',
   'rounds', t.state->'rounds', 'player_count', greatest(jsonb_array_length(t.state->'players'),
     (select count(*) from public.cb_tournament_entries e where e.tournament_id=t.id)),
   'round_count', jsonb_array_length(t.state->'history'),
   'players', coalesce((select jsonb_agg(jsonb_build_object('id',p->'id','name',p->'name'))
     from jsonb_array_elements(t.state->'players') p),'[]'::jsonb),
   'registrations', coalesce((select jsonb_agg(e.display_name order by e.created_at)
     from public.cb_tournament_entries e where e.tournament_id=t.id
     and not exists(select 1 from jsonb_array_elements(t.state->'players') p
       where p->>'userId'=e.user_id::text)),'[]'::jsonb),
   'pairings', coalesce(t.state->'history'->-1,'[]'::jsonb)
 ) order by t.updated_at desc),'[]'::jsonb)
 from (select t.* from public.cb_tournaments t
   join public.cb_profiles host on host.user_id=t.host_id and host.role='owner'
   where (select auth.uid()) is not null and t.state->>'status' in ('registration','playing','completed')
     and jsonb_typeof(t.state->'players')='array' and jsonb_typeof(t.state->'history')='array'
   order by t.updated_at desc limit 100) t;
$$;

create or replace function public.cb_tournament_winner_boards() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'weekly', coalesce((select jsonb_agg(row_to_json(recent) order by recent.finished_at desc)
    from (select p.username,w.title,w.finished_at,w.cbg_gain,w.cbr_gain,w.rank
      from public.cb_tournament_winners w join public.cb_profiles p on p.user_id=w.user_id
      where w.rank=1 and w.finished_at>=date_trunc('week',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila'
      order by w.finished_at desc limit 10) recent),'[]'::jsonb),
  'featured', coalesce((select jsonb_agg(row_to_json(best) order by best.wins desc,best.cbg_gain desc)
    from (select p.username,latest.title,latest.finished_at,sum(w.cbg_gain)::integer as cbg_gain,
      sum(w.cbr_gain)::integer as cbr_gain,count(*)::integer as wins,1 as rank
      from public.cb_tournament_winners w join public.cb_profiles p on p.user_id=w.user_id
      join lateral (select title,finished_at from public.cb_tournament_winners x
        where x.user_id=w.user_id and x.rank=1 order by finished_at desc limit 1) latest on true
      where w.rank=1 group by w.user_id,p.username,latest.title,latest.finished_at
      order by wins desc,cbg_gain desc,latest.finished_at desc limit 3) best),'[]'::jsonb)
 ) where (select auth.uid()) is not null;
$$;

revoke all on function public.cb_public_tournaments(),public.cb_tournament_winner_boards() from public,anon,authenticated;
grant execute on function public.cb_public_tournaments(),public.cb_tournament_winner_boards() to authenticated;

create or replace function public.cb_award_tournament_gold(p_host_id uuid,p_tournament_id uuid,p_winners jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare event public.cb_tournaments%rowtype; item jsonb; place integer; prize integer; rating integer;
  player_id uuid; awarded_at timestamptz; did_insert integer; guild_id uuid; ledger_inserted text;
begin
 select * into event from public.cb_tournaments where id=p_tournament_id for update;
 if not found or event.host_id<>p_host_id or event.state->>'status'<>'completed' then
   raise exception 'Publish a completed tournament as its host before awarding prizes'; end if;
 if not exists(select 1 from public.cb_profiles where user_id=p_host_id and role='owner') then
   raise exception 'Owner access is required'; end if;
 if jsonb_typeof(p_winners)<>'array' or jsonb_array_length(p_winners)<>3 or
    jsonb_array_length(event.state->'players')<3 then raise exception 'Three podium players are required'; end if;
 awarded_at:=coalesce((event.state->>'finishedAt')::timestamptz,now());
 for place in 1..3 loop
  item:=p_winners->(place-1);
  if item->>'rank' is distinct from place::text or coalesce(item->>'user_id','') !~ '^[0-9a-fA-F-]{36}$'
    or coalesce(item->>'amount','') !~ '^[0-9]{1,5}$' then raise exception 'Invalid podium'; end if;
  player_id:=(item->>'user_id')::uuid; prize:=(item->>'amount')::integer;
  rating:=coalesce((event.state->'cbrRewards'->>(case place when 1 then 'champion' when 2 then 'second' else 'third' end))::integer,0);
  if prize<0 or prize>10000 or rating<0 or rating>1000 or prize is distinct from
    coalesce((event.state->'goldRewards'->>(case place when 1 then 'champion' when 2 then 'second' else 'third' end))::integer,0)
    or not exists(select 1 from jsonb_array_elements(event.state->'players') p where p->>'userId'=player_id::text)
    then raise exception 'Prize or player does not match the published event'; end if;
  select m.guild_id into guild_id from public.cb_guild_members m where m.user_id=player_id;
  insert into public.cb_tournament_winners(tournament_id,rank,user_id,title,finished_at,cbg_gain,cbr_gain,gold_gain)
    values(p_tournament_id,place,player_id,event.title,awarded_at,case when guild_id is null then 0 else prize end,rating,prize)
    on conflict(tournament_id,rank) do nothing returning 1 into did_insert;
  if did_insert is null then continue; end if;
  if prize>0 then
   insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
    values('tournament-gold:'||p_tournament_id::text||':'||place,player_id,prize,'tournament_reward',p_tournament_id)
    on conflict(id) do nothing returning id into ledger_inserted;
   if ledger_inserted is not null then
     update public.cb_profiles set gold_points=gold_points+prize where user_id=player_id;
   end if;
   ledger_inserted:=null;
  end if;
  if rating>0 then
   insert into public.cb_cbr_ledger(id,user_id,delta,kind,reference_id)
    values('tournament-cbr:'||p_tournament_id::text||':'||place,player_id,rating,'tournament_reward',p_tournament_id)
    on conflict(id) do nothing returning id into ledger_inserted;
   if ledger_inserted is not null then
     update public.cb_profiles set cbr=cbr+rating where user_id=player_id;
   end if;
   ledger_inserted:=null;
  end if;
  insert into public.cb_feed(user_id,kind,display_name,content,cbr_delta,gold_delta)
   select player_id,'new_reward',display_name,
    'placed '||(case place when 1 then 'Champion' when 2 then '2nd' else '3rd' end)||' in '||left(event.title,100)||'.',rating,prize
   from public.cb_profiles where user_id=player_id;
  did_insert:=null;
 end loop;
end $$;
revoke all on function public.cb_award_tournament_gold(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cb_award_tournament_gold(uuid,uuid,jsonb) to service_role;

commit;
