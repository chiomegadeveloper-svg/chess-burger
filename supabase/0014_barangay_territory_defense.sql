-- Chess Burger barangay territory defense.
-- Safe to run after 0013_current_players_gps_stats.sql and v11-vercel-api-foundation.sql.
-- Existing circular claims are preserved as legacy records; new claims use an
-- OpenStreetMap barangay polygon and the defense/challenge rules below.

begin;

alter table public.cb_profiles alter column gold_points set default 88;

alter table public.cb_territories add column if not exists barangay_key text;
alter table public.cb_territories add column if not exists barangay text;
alter table public.cb_territories add column if not exists locality text;
alter table public.cb_territories add column if not exists boundary jsonb;
alter table public.cb_territories add column if not exists centroid_lat double precision;
alter table public.cb_territories add column if not exists centroid_lng double precision;
alter table public.cb_territories add column if not exists defense_points integer not null default 10;
alter table public.cb_territories add column if not exists captured_at timestamptz not null default now();
alter table public.cb_territories add column if not exists updated_at timestamptz not null default now();
-- Ownership can move between players, so the legacy (owner, claim date)
-- uniqueness rule must not block a legitimate capture.
alter table public.cb_territories drop constraint if exists cb_territories_user_id_claimed_on_key;

update public.cb_territories
set barangay_key = coalesce(barangay_key, 'legacy:' || id::text),
    centroid_lat = coalesce(centroid_lat, lat),
    centroid_lng = coalesce(centroid_lng, lng),
    defense_points = greatest(1, coalesce(defense_points, 10))
where barangay_key is null
   or centroid_lat is null
   or centroid_lng is null
   or defense_points < 1;

-- Preserve the newest legacy claim for each owner's last known barangay. The
-- API attaches the actual polygon the next time someone opens that map.
with regional_claims as (
  select t.id,r.barangay,r.locality,
    row_number() over (
      partition by lower(r.locality),lower(r.barangay)
      order by t.created_at desc,t.id
    ) as claim_rank
  from public.cb_territories t
  join public.cb_player_regions r on r.user_id=t.user_id
  where t.boundary is null
)
update public.cb_territories t
set barangay=rc.barangay,
    locality=rc.locality,
    barangay_key=left(
      trim(both '-' from regexp_replace(lower(rc.locality),'[^a-z0-9]+','-','g'))
      || ':' ||
      trim(both '-' from regexp_replace(lower(rc.barangay),'[^a-z0-9]+','-','g')),
      190
    ),
    updated_at=now()
from regional_claims rc
where t.id=rc.id and rc.claim_rank=1;

create unique index if not exists cb_territories_barangay_key_idx
  on public.cb_territories(barangay_key)
  where barangay_key is not null and boundary is not null;
create index if not exists cb_territories_owner_idx on public.cb_territories(user_id);

alter table public.cb_matches add column if not exists match_kind text not null default 'standard';
alter table public.cb_matches add column if not exists territory_id uuid references public.cb_territories(id) on delete set null;
alter table public.cb_matches add column if not exists invasion_challenger_id uuid references public.cb_profiles(user_id) on delete set null;
alter table public.cb_matches add column if not exists invasion_fee_paid boolean not null default false;
create index if not exists cb_matches_territory_status_idx on public.cb_matches(territory_id,status,created_at desc);

create table if not exists public.cb_invasion_results (
  match_id uuid primary key references public.cb_matches(id) on delete cascade,
  territory_id uuid not null references public.cb_territories(id) on delete cascade,
  previous_owner_id uuid not null references public.cb_profiles(user_id) on delete restrict,
  challenger_id uuid not null references public.cb_profiles(user_id) on delete restrict,
  winner_id uuid references public.cb_profiles(user_id) on delete set null,
  outcome text not null check(outcome in ('owner_defended','defense_reduced','territory_captured','draw')),
  defense_before integer not null,
  defense_after integer not null,
  created_at timestamptz not null default now()
);
alter table public.cb_invasion_results enable row level security;
revoke all on public.cb_invasion_results from anon, authenticated;

create or replace function public.cb_claim_barangay_territory(
  p_user_id uuid,
  p_barangay_key text,
  p_barangay text,
  p_locality text,
  p_boundary jsonb,
  p_centroid_lat double precision,
  p_centroid_lng double precision
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  territory_id uuid;
  player_gold integer;
begin
  if p_barangay_key is null or char_length(trim(p_barangay_key)) < 3 then
    raise exception 'The barangay could not be identified.';
  end if;
  if p_boundary is null
     or jsonb_typeof(p_boundary) <> 'object'
     or p_boundary->>'type' not in ('Polygon','MultiPolygon') then
    raise exception 'A valid barangay boundary is required.';
  end if;
  if p_centroid_lat not between -90 and 90 or p_centroid_lng not between -180 and 180 then
    raise exception 'The territory center is invalid.';
  end if;

  perform 1 from public.cb_territories
  where barangay_key = p_barangay_key and boundary is not null
  for update;
  if found then raise exception 'This barangay already has a KING. Challenge the owner to invade it.'; end if;

  select gold_points into player_gold
  from public.cb_profiles
  where user_id = p_user_id
  for update;

  if player_gold is null then raise exception 'Player profile was not found.'; end if;
  if player_gold < 48 then raise exception 'You need 48 Gold to claim a free barangay.'; end if;
  if exists(
    select 1 from public.cb_territories
    where user_id = p_user_id and claimed_on = current_date
  ) then
    raise exception 'You already claimed a free territory today.';
  end if;

  insert into public.cb_territories(
    user_id,lat,lng,radius_m,gold_cost,claimed_on,
    barangay_key,barangay,locality,boundary,centroid_lat,centroid_lng,
    defense_points,captured_at,updated_at
  ) values (
    p_user_id,p_centroid_lat,p_centroid_lng,2000,48,current_date,
    p_barangay_key,left(p_barangay,96),left(p_locality,96),p_boundary,
    p_centroid_lat,p_centroid_lng,10,now(),now()
  ) returning id into territory_id;

  update public.cb_profiles
  set gold_points = gold_points - 48
  where user_id = p_user_id;

  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
  values ('territory-claim:' || territory_id::text,p_user_id,-48,'territory_claim',territory_id)
  on conflict(id) do nothing;

  return territory_id;
end;
$function$;

create or replace function public.cb_accept_invasion(p_match_id uuid,p_owner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  invasion public.cb_matches%rowtype;
  owner_id uuid;
  challenger_gold integer;
begin
  select * into invasion from public.cb_matches where id = p_match_id for update;
  if invasion.id is null
     or invasion.match_kind <> 'invasion'
     or invasion.status <> 'waiting'
     or invasion.invite_to <> p_owner_id
     or invasion.invasion_challenger_id is null
     or invasion.territory_id is null then
    raise exception 'This territory challenge is no longer available.';
  end if;
  if invasion.created_at <= now() - interval '2 minutes' then
    raise exception 'This territory challenge has expired.';
  end if;

  select user_id into owner_id
  from public.cb_territories
  where id = invasion.territory_id
  for update;
  if owner_id is null or owner_id <> p_owner_id then
    raise exception 'The territory owner has changed.';
  end if;

  select gold_points into challenger_gold
  from public.cb_profiles
  where user_id = invasion.invasion_challenger_id
  for update;
  if challenger_gold is null then raise exception 'The challenger profile was not found.'; end if;
  if challenger_gold < 18 then raise exception 'The challenger no longer has the required 18 Gold.'; end if;

  update public.cb_profiles
  set gold_points = gold_points - 18
  where user_id = invasion.invasion_challenger_id;

  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
  values (
    'territory-challenge:' || p_match_id::text,
    invasion.invasion_challenger_id,-18,'territory_challenge',p_match_id
  ) on conflict(id) do nothing;

  update public.cb_matches
  set black_id = p_owner_id,
      black_cbr = coalesce((select cbr from public.cb_profiles where user_id=p_owner_id),88),
      status = 'active',
      invasion_fee_paid = true,
      version = version + 1,
      last_tick = now()
  where id = p_match_id;

  return p_match_id;
end;
$function$;

create or replace function public.cb_settle_territory_invasion(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  invasion public.cb_matches%rowtype;
  territory public.cb_territories%rowtype;
  winner_id uuid;
  outcome text;
  defense_after integer;
  new_owner uuid;
begin
  select * into invasion from public.cb_matches where id=p_match_id for update;
  if invasion.id is null
     or invasion.match_kind <> 'invasion'
     or invasion.status <> 'finished'
     or invasion.territory_id is null
     or invasion.invasion_challenger_id is null
     or not invasion.invasion_fee_paid then
    return null;
  end if;

  select * into territory from public.cb_territories where id=invasion.territory_id for update;
  if territory.id is null then return null; end if;

  if invasion.result = 'white' then winner_id := invasion.white_id;
  elsif invasion.result = 'black' then winner_id := invasion.black_id;
  else winner_id := null;
  end if;

  if exists(select 1 from public.cb_invasion_results where match_id=p_match_id) then
    return (
      select jsonb_build_object(
        'outcome',r.outcome,'defense_before',r.defense_before,
        'defense_after',r.defense_after,'winner_id',r.winner_id,
        'owner_id',t.user_id
      ) from public.cb_invasion_results r
        join public.cb_territories t on t.id=r.territory_id
      where r.match_id=p_match_id
    );
  end if;

  new_owner := territory.user_id;
  if winner_id is null then
    outcome := 'draw';
    defense_after := territory.defense_points;
  elsif winner_id = territory.user_id then
    outcome := 'owner_defended';
    defense_after := territory.defense_points + 1;
  elsif winner_id = invasion.invasion_challenger_id then
    if territory.defense_points <= 1 then
      outcome := 'territory_captured';
      defense_after := 10;
      new_owner := invasion.invasion_challenger_id;
    else
      outcome := 'defense_reduced';
      defense_after := territory.defense_points - 1;
    end if;
  else
    return null;
  end if;

  update public.cb_territories
  set user_id=new_owner,
      defense_points=defense_after,
      captured_at=case when outcome='territory_captured' then now() else captured_at end,
      updated_at=now()
  where id=territory.id;

  insert into public.cb_invasion_results(
    match_id,territory_id,previous_owner_id,challenger_id,winner_id,
    outcome,defense_before,defense_after
  ) values (
    p_match_id,territory.id,territory.user_id,invasion.invasion_challenger_id,
    winner_id,outcome,territory.defense_points,defense_after
  );

  return jsonb_build_object(
    'outcome',outcome,'defense_before',territory.defense_points,
    'defense_after',defense_after,'winner_id',winner_id,'owner_id',new_owner
  );
end;
$function$;

revoke all on function public.cb_claim_barangay_territory(uuid,text,text,text,jsonb,double precision,double precision) from public,anon,authenticated;
revoke all on function public.cb_accept_invasion(uuid,uuid) from public,anon,authenticated;
revoke all on function public.cb_settle_territory_invasion(uuid) from public,anon,authenticated;
grant execute on function public.cb_claim_barangay_territory(uuid,text,text,text,jsonb,double precision,double precision) to service_role;
grant execute on function public.cb_accept_invasion(uuid,uuid) to service_role;
grant execute on function public.cb_settle_territory_invasion(uuid) to service_role;

commit;
