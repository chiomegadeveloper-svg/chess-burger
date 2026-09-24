begin;

alter table public.cb_shop_products drop constraint if exists cb_shop_products_tier_check;
alter table public.cb_shop_products add constraint cb_shop_products_tier_check check (tier in ('pastel','metallic','cute','warrior','animated','robot'));

insert into public.cb_shop_products(id,kind,name,tier,price_gold) values
  ('animated-1','feed_banner','Dancing Pawn','animated',1488),
  ('animated-2','feed_banner','Winking Queen','animated',1532),
  ('animated-3','feed_banner','Bouncy Knight','animated',1577),
  ('animated-4','feed_banner','Confetti Rook','animated',1622),
  ('animated-5','feed_banner','Sparkle Bishop','animated',1666),
  ('animated-6','feed_banner','Happy Castle','animated',1711),
  ('animated-7','feed_banner','Party King','animated',1755),
  ('animated-8','feed_banner','Dreamy Check','animated',1800),
  ('animated-9','feed_banner','Rainbow Pawn','animated',1844),
  ('animated-10','feed_banner','Twinkle Knight','animated',1888),
  ('cute-1','feed_banner','Bubblegum Pawn','cute',488),
  ('cute-2','feed_banner','Heart Queen','cute',528),
  ('cute-3','feed_banner','Strawberry Check','cute',568),
  ('cute-4','feed_banner','Pastel Castle','cute',608),
  ('cute-5','feed_banner','Cherry Knight','cute',648),
  ('cute-6','feed_banner','Candy Bishop','cute',688),
  ('cute-7','feed_banner','Starry Rook','cute',728),
  ('cute-8','feed_banner','Ribbon Royalty','cute',768),
  ('cute-9','feed_banner','Peach Pawn','cute',828),
  ('cute-10','feed_banner','Moonlit Queen','cute',888),
  ('robot-1','feed_banner','Neon Robo Pawn','robot',388),
  ('robot-2','feed_banner','Cyber Queen','robot',444),
  ('robot-3','feed_banner','Circuit Knight','robot',499),
  ('robot-4','feed_banner','Holo Rook','robot',555),
  ('robot-5','feed_banner','Pixel Bishop','robot',610),
  ('robot-6','feed_banner','Quantum King','robot',666),
  ('robot-7','feed_banner','Chrome Castle','robot',721),
  ('robot-8','feed_banner','Astro Bot Pawn','robot',777),
  ('robot-9','feed_banner','Laser Queen','robot',832),
  ('robot-10','feed_banner','Mecha Mate','robot',888),
  ('warrior-1','feed_banner','Obsidian Knight','warrior',688),
  ('warrior-2','feed_banner','Storm Rook','warrior',722),
  ('warrior-3','feed_banner','Volt Bishop','warrior',755),
  ('warrior-4','feed_banner','Crimson Queen','warrior',788),
  ('warrior-5','feed_banner','Titan Pawn','warrior',822),
  ('warrior-6','feed_banner','Iron Castle','warrior',855),
  ('warrior-7','feed_banner','Thunder King','warrior',888),
  ('warrior-8','feed_banner','Phantom Check','warrior',922),
  ('warrior-9','feed_banner','Steel Vanguard','warrior',955),
  ('warrior-10','feed_banner','Solar Blade','warrior',988)
on conflict (id) do update set name=excluded.name,tier=excluded.tier,price_gold=excluded.price_gold,active=true;


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
  v_period interval;
begin
  select tier,price_gold into v_tier,v_price
  from public.cb_shop_products
  where id=p_product_id and kind='feed_banner' and active=true;
  if v_tier is null or v_price is null then raise exception 'Banner is not available'; end if;

  if v_tier in ('cute','warrior','animated','robot') then
    if p_days <> 30 then raise exception 'Graphic banners last one month'; end if;
    v_period := interval '1 month';
  else
    if p_days not in (3,5,7) then raise exception 'Choose 3, 5, or 7 days'; end if;
    v_period := make_interval(days=>p_days);
  end if;

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
  if v_extending and v_tier in ('pastel','metallic') then v_price := round(v_price * 0.70); end if;

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
  values(p_user_id,p_product_id,now(),now()+v_period)
  on conflict (user_id,product_id) do update
  set purchased_at=now(),
      expires_at=greatest(now(),cb_user_items.expires_at)+v_period
  returning expires_at into v_expiry;

  return jsonb_build_object('owned',true,'charged',true,'gold',v_gold,'active',p_product_id,'expires_at',v_expiry,'days',p_days,'price',v_price,'extended',v_extending,'discount_percent',case when v_extending and v_tier in ('pastel','metallic') then 30 else 0 end);
end $$;

revoke all on function public.cb_buy_feed_banner_timed(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.cb_buy_feed_banner_timed(uuid,text,integer,uuid) to service_role;

commit;
