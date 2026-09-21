begin;

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
  v_extending boolean := false;
begin
  if p_days not in (3,5,7) then raise exception 'Choose 3, 5, or 7 days'; end if;

  select tier,price_gold into v_tier,v_price
  from public.cb_shop_products
  where id=p_product_id and kind='feed_banner' and active=true;
  if v_tier is null or v_price is null then raise exception 'Banner is not available'; end if;

  v_price := v_price + case
    when v_tier='metallic' and p_days=5 then 60
    when v_tier='metallic' and p_days=7 then 120
    when v_tier='pastel' and p_days=5 then 20
    when v_tier='pastel' and p_days=7 then 40
    else 0
  end;

  select exists(
    select 1 from public.cb_user_items
    where user_id=p_user_id and product_id=p_product_id and expires_at>now()
  ) into v_extending;
  if v_extending then v_price := round(v_price * 0.70); end if;

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

  return jsonb_build_object('owned',true,'charged',true,'gold',v_gold,'active',p_product_id,'expires_at',v_expiry,'days',p_days,'price',v_price,'extended',v_extending,'discount_percent',case when v_extending then 30 else 0 end);
end $$;

revoke all on function public.cb_buy_feed_banner_timed(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.cb_buy_feed_banner_timed(uuid,text,integer,uuid) to service_role;

commit;
