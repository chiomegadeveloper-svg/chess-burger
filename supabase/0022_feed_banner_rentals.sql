begin;

alter table public.cb_user_items
  add column if not exists expires_at timestamptz;

-- Every lifetime purchase that existed before this migration receives a new
-- seven-day rental. This update is intentionally limited to null expiries so
-- rerunning the migration never resets or extends an existing rental.
update public.cb_user_items
set expires_at = now() + interval '7 days'
where expires_at is null;

alter table public.cb_user_items
  alter column expires_at set default (now() + interval '7 days'),
  alter column expires_at set not null;

create index if not exists cb_user_items_active_rental_idx
  on public.cb_user_items(user_id, expires_at desc);

create or replace function public.cb_buy_feed_banner_timed(
  p_user_id uuid,
  p_product_id text,
  p_days integer,
  p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_tier text;
  v_price integer;
  v_gold integer;
  v_expiry timestamptz;
begin
  if p_days not in (3,5,7) then raise exception 'Choose 3, 5, or 7 days'; end if;

  select tier into v_tier
  from public.cb_shop_products
  where id=p_product_id and kind='feed_banner' and active=true;
  if v_tier is null then raise exception 'Banner is not available'; end if;

  v_price := case
    when v_tier='metallic' and p_days=3 then 24
    when v_tier='metallic' and p_days=5 then 36
    when v_tier='metallic' and p_days=7 then 48
    when p_days=3 then 12
    when p_days=5 then 18
    else 24
  end;

  select gold_points into v_gold from public.cb_profiles where user_id=p_user_id for update;
  if v_gold is null then raise exception 'Player profile not found'; end if;
  if v_gold < v_price then raise exception 'Not enough Gold'; end if;

  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
  values('shop-banner-rental:'||p_request_id::text,p_user_id,-v_price,'shop_rental',p_request_id)
  on conflict (id) do nothing;
  if not found then
    select expires_at into v_expiry from public.cb_user_items where user_id=p_user_id and product_id=p_product_id;
    return jsonb_build_object('owned',true,'charged',false,'gold',v_gold,'active',(select active_feed_banner from public.cb_profiles where user_id=p_user_id),'expires_at',v_expiry);
  end if;

  update public.cb_profiles
  set gold_points=gold_points-v_price,active_feed_banner=p_product_id
  where user_id=p_user_id returning gold_points into v_gold;

  insert into public.cb_user_items(user_id,product_id,purchased_at,expires_at)
  values(p_user_id,p_product_id,now(),now()+make_interval(days=>p_days))
  on conflict (user_id,product_id) do update
  set purchased_at=now(),
      expires_at=greatest(now(),cb_user_items.expires_at)+make_interval(days=>p_days)
  returning expires_at into v_expiry;

  return jsonb_build_object('owned',true,'charged',true,'gold',v_gold,'active',p_product_id,'expires_at',v_expiry,'days',p_days,'price',v_price);
end $$;

create or replace function public.cb_activate_feed_banner(p_user_id uuid,p_product_id text)
returns text language plpgsql security definer set search_path=public as $$
begin
  if not exists(
    select 1 from public.cb_user_items
    where user_id=p_user_id and product_id=p_product_id and expires_at>now()
  ) then raise exception 'Banner rental expired or not owned'; end if;
  update public.cb_profiles set active_feed_banner=p_product_id where user_id=p_user_id;
  return p_product_id;
end $$;

revoke all on function public.cb_buy_feed_banner_timed(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.cb_buy_feed_banner_timed(uuid,text,integer,uuid) to service_role;

commit;
