-- Prevent repeat claims and make owner kingdom renames authoritative.
-- Safe to run more than once. Existing territories are preserved.
begin;

alter table public.cb_territories
  add column if not exists kingdom_name text;

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

  -- Serialize claims for this player, then make a duplicate request idempotent.
  select gold_points into player_gold
  from public.cb_profiles
  where user_id = p_user_id
  for update;

  if player_gold is null then raise exception 'Player profile was not found.'; end if;

  select id into territory_id
  from public.cb_territories
  where user_id = p_user_id
  limit 1;
  if territory_id is not null then return territory_id; end if;

  if player_gold < 48 then raise exception 'You need 48 Gold to invade a territory.'; end if;
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

notify pgrst, 'reload schema';
commit;
