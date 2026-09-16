-- Chess Burger map activity. Run once in the same Supabase project as cb_profiles.
-- Presence contains no coordinates and expires after 60 seconds without a heartbeat.
create table if not exists public.cb_live_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  gps_enabled boolean not null default false,
  cbr integer not null default 88 check (cbr >= 0),
  match_id text null check (match_id is null or char_length(match_id) between 1 and 100)
);
alter table public.cb_live_presence add column if not exists cbr integer not null default 88;
create index if not exists cb_live_presence_seen_at_idx on public.cb_live_presence (seen_at);
alter table public.cb_live_presence enable row level security;
revoke all on public.cb_live_presence from anon, authenticated;
grant select, insert, update on public.cb_live_presence to authenticated;

drop policy if exists cb_live_presence_select_self on public.cb_live_presence;
create policy cb_live_presence_select_self on public.cb_live_presence
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists cb_live_presence_insert_self on public.cb_live_presence;
create policy cb_live_presence_insert_self on public.cb_live_presence
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists cb_live_presence_update_self on public.cb_live_presence;
create policy cb_live_presence_update_self on public.cb_live_presence
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.cb_map_stats()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with live as (
    select p.user_id, p.gps_enabled, p.match_id, p.cbr
    from public.cb_live_presence p
    join public.cb_profiles c on c.user_id = p.user_id
    where p.seen_at >= now() - interval '60 seconds'
  ), highest as (
    select l.user_id, c.display_name, l.cbr
    from live l join public.cb_profiles c on c.user_id = l.user_id
    order by l.cbr desc, l.user_id
    limit 1
  )
  select jsonb_build_object(
    'online_users', (select count(*) from live),
    'registered_users', (select count(*) from public.cb_profiles),
    'active_matches', (select count(distinct match_id) from live where match_id is not null),
    'gps_online', (select count(*) from live where gps_enabled),
    'highest_online', (select to_jsonb(h) from highest h),
    'updated_at', now()
  );
$$;
revoke all on function public.cb_map_stats() from public, anon;
grant execute on function public.cb_map_stats() to authenticated;
