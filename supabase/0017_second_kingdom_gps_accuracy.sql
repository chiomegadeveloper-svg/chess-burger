-- Allow a fresh network-assisted GPS fix for additional kingdom claims.
-- Desktop browsers commonly report 100-250 m accuracy even when stationary.
begin;

create or replace function public.cb_claim_territory_v2(
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision,
  p_kingdom_name text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare
  territory_id uuid;
  territory_owner uuid;
  player_gold integer;
  slot_limit integer;
  owned_count integer;
begin
  if p_lat not between -90 and 90 or p_lng not between -180 and 180
     or p_accuracy is null or p_accuracy<0 or p_accuracy>250 then
    raise exception 'Enable GPS and wait for accuracy within 250 m.';
  end if;
  if char_length(trim(coalesce(p_kingdom_name,''))) not between 3 and 40 then
    raise exception 'Kingdom name must be 3 to 40 characters.';
  end if;

  perform public.cb_refresh_territories(p_user_id,p_lat,p_lng);

  select gold_points,territory_slots into player_gold,slot_limit
  from public.cb_profiles where user_id=p_user_id for update;
  if player_gold is null then raise exception 'Player profile was not found.'; end if;
  select count(*) into owned_count from public.cb_territories where user_id=p_user_id;
  if owned_count>=coalesce(slot_limit,3) then raise exception 'All of your kingdom slots are occupied.'; end if;
  if player_gold<48 then raise exception 'You need 48 Gold to invade a territory.'; end if;

  select id,user_id into territory_id,territory_owner
  from public.cb_territories t
  where 6371000*2*asin(sqrt(least(1,
    power(sin(radians(t.lat-p_lat)/2),2)+
    cos(radians(p_lat))*cos(radians(t.lat))*power(sin(radians(t.lng-p_lng)/2),2)
  )))<=1000
  order by defense_points asc,id
  limit 1 for update;

  if territory_id is not null and territory_owner is not null then
    raise exception 'This kingdom still has a KING. Challenge the owner to invade it.';
  end if;

  if territory_id is null then
    if exists(
      select 1 from public.cb_territories t
      where 6371000*2*asin(sqrt(least(1,
        power(sin(radians(t.lat-p_lat)/2),2)+
        cos(radians(p_lat))*cos(radians(t.lat))*power(sin(radians(t.lng-p_lng)/2),2)
      )))<2000
    ) then
      raise exception 'This kingdom would touch another territory. Move farther away and try again.';
    end if;
    insert into public.cb_territories(
      user_id,lat,lng,radius_m,gold_cost,claimed_on,kingdom_name,
      defense_points,last_visited_at,defense_checked_at
    ) values (
      p_user_id,p_lat,p_lng,1000,48,current_date,
      left(trim(regexp_replace(p_kingdom_name,'\s+',' ','g')),40),
      10,now(),now()
    ) returning id into territory_id;
  else
    update public.cb_territories
    set user_id=p_user_id,
        kingdom_name=left(trim(regexp_replace(p_kingdom_name,'\s+',' ','g')),40),
        defense_points=10,claimed_on=current_date,last_visited_at=now(),defense_checked_at=now()
    where id=territory_id;
  end if;

  update public.cb_profiles set gold_points=gold_points-48 where user_id=p_user_id;
  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
  values ('territory-invade:'||gen_random_uuid()::text,p_user_id,-48,'territory_claim',territory_id)
  on conflict(id) do nothing;
  return territory_id;
end;
$function$;

revoke all on function public.cb_claim_territory_v2(uuid,double precision,double precision,double precision,text) from public,anon,authenticated;
grant execute on function public.cb_claim_territory_v2(uuid,double precision,double precision,double precision,text) to service_role;

notify pgrst,'reload schema';
commit;
