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

create table if not exists public.cb_player_regions (
  user_id uuid primary key references public.cb_profiles(user_id) on delete cascade,
  barangay text not null,
  locality text not null,
  country_code text not null default 'PH',
  updated_at timestamptz not null default now()
);
create index if not exists cb_player_regions_barangay_idx on public.cb_player_regions(barangay, updated_at desc);
create index if not exists cb_player_regions_locality_idx on public.cb_player_regions(locality, updated_at desc);
alter table public.cb_player_regions enable row level security;
revoke all on public.cb_player_regions from anon, authenticated;

create table if not exists public.cb_territories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m integer not null default 2000 check (radius_m = 2000),
  gold_cost integer not null default 48 check (gold_cost = 48),
  claimed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique(user_id, claimed_on)
);
create index if not exists cb_territories_location_idx on public.cb_territories(lat, lng);
alter table public.cb_territories enable row level security;
revoke all on public.cb_territories from anon, authenticated;

create or replace function public.cb_claim_territory(p_user_id uuid, p_lat double precision, p_lng double precision)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  territory_id uuid;
  player_gold integer;
begin
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'The GPS reading is invalid.';
  end if;

  select gold_points into player_gold
  from public.cb_profiles
  where user_id = p_user_id
  for update;

  if player_gold is null then raise exception 'Player profile was not found.'; end if;
  if player_gold < 48 then raise exception 'You need 48 Gold to invade a territory.'; end if;
  if exists(select 1 from public.cb_territories where user_id = p_user_id and claimed_on = current_date) then
    raise exception 'You already invaded a territory today.';
  end if;
  if exists(
    select 1 from public.cb_territories t
    where 6371000 * 2 * asin(sqrt(least(1,
      power(sin(radians(t.lat - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(t.lat)) * power(sin(radians(t.lng - p_lng) / 2), 2)
    ))) < 4000
  ) then
    raise exception 'This 2 km territory overlaps an occupied territory.';
  end if;

  insert into public.cb_territories(user_id, lat, lng)
  values (p_user_id, p_lat, p_lng)
  returning id into territory_id;

  update public.cb_profiles
  set gold_points = gold_points - 48
  where user_id = p_user_id;

  return territory_id;
end;
$function$;
revoke all on function public.cb_claim_territory(uuid,double precision,double precision) from public, anon, authenticated;
grant execute on function public.cb_claim_territory(uuid,double precision,double precision) to service_role;

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
