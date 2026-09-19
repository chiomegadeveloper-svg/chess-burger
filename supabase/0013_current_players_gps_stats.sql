-- Restore current-player GPS presence and live map statistics.
-- Safe to run more than once. It does not delete or reset profiles.
begin;

alter table public.cb_profiles add column if not exists ocbr integer not null default 88;

create table if not exists public.cb_gps_presence (
  user_id uuid primary key references public.cb_profiles(user_id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy double precision not null default 0 check (accuracy between 0 and 500),
  seen_at timestamptz not null default now()
);
create index if not exists cb_gps_presence_recent_idx on public.cb_gps_presence(seen_at desc);
alter table public.cb_gps_presence enable row level security;
revoke all on public.cb_gps_presence from anon, authenticated;

create or replace function public.cb_map_stats() returns jsonb
language sql stable security definer set search_path = public as $function$
  with recent as (
    select p.user_id, p.display_name, p.cbr
    from cb_gps_presence g join cb_profiles p using (user_id)
    where g.seen_at > now() - interval '45 seconds'
  )
  select jsonb_build_object(
    'online_users', (select count(*) from recent),
    'registered_users', (select count(*) from cb_profiles),
    'active_matches', (select count(*) from cb_matches where status = 'active'),
    'gps_online', (select count(*) from recent),
    'highest_online', (select to_jsonb(r) from recent r order by cbr desc, user_id limit 1),
    'updated_at', now()
  );
$function$;
grant execute on function public.cb_map_stats() to anon, authenticated;

commit;
