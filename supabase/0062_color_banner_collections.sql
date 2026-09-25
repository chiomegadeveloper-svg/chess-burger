-- Apply after 0057. Keep existing graphic rentals until they expire, but stop new sales.
begin;

alter table public.cb_shop_products drop constraint if exists cb_shop_products_tier_check;
alter table public.cb_shop_products add constraint cb_shop_products_tier_check
  check (tier in ('pastel','metallic','neon','cute','warrior','animated','robot'));

update public.cb_shop_products set active=false
where kind='feed_banner' and tier in ('cute','warrior','animated','robot');

insert into public.cb_shop_products(id,kind,name,tier,price_gold) values
  ('pastel-rosewater','feed_banner','Rosewater','pastel',150),
  ('pastel-apricot','feed_banner','Apricot','pastel',152),
  ('pastel-buttercream','feed_banner','Buttercream','pastel',154),
  ('pastel-pistachio','feed_banner','Pistachio','pastel',156),
  ('pastel-seafoam','feed_banner','Seafoam','pastel',158),
  ('pastel-powder-blue','feed_banner','Powder Blue','pastel',160),
  ('pastel-periwinkle','feed_banner','Periwinkle','pastel',162),
  ('pastel-lavender-fog','feed_banner','Lavender Fog','pastel',164),
  ('pastel-orchid-mist','feed_banner','Orchid Mist','pastel',166),
  ('pastel-watermelon','feed_banner','Watermelon','pastel',168),
  ('pastel-pearl','feed_banner','Pearl','pastel',170),
  ('pastel-sand','feed_banner','Sand','pastel',172),
  ('pastel-chamomile','feed_banner','Chamomile','pastel',174),
  ('pastel-cloud','feed_banner','Cloud','pastel',176),
  ('pastel-cocoa-rose','feed_banner','Cocoa Rose','pastel',178),
  ('metal-platinum','feed_banner','Platinum','metallic',272),
  ('metal-titanium','feed_banner','Titanium','metallic',276),
  ('metal-copper','feed_banner','Copper','metallic',280),
  ('metal-champagne','feed_banner','Champagne','metallic',284),
  ('metal-steel-blue','feed_banner','Steel Blue','metallic',288),
  ('metal-sapphire','feed_banner','Sapphire','metallic',292),
  ('metal-jade','feed_banner','Jade','metallic',296),
  ('metal-onyx','feed_banner','Onyx','metallic',300),
  ('metal-pewter','feed_banner','Pewter','metallic',304),
  ('metal-brass','feed_banner','Brass','metallic',308),
  ('metal-cobalt','feed_banner','Cobalt','metallic',312),
  ('metal-garnet','feed_banner','Garnet','metallic',316),
  ('metal-opal','feed_banner','Opal','metallic',320),
  ('metal-graphite','feed_banner','Graphite','metallic',324),
  ('metal-iridescent','feed_banner','Iridescent','metallic',328),
  ('neon-laser-pink','feed_banner','Laser Pink','neon',184),
  ('neon-electric-coral','feed_banner','Electric Coral','neon',186),
  ('neon-voltage-orange','feed_banner','Voltage Orange','neon',188),
  ('neon-plasma-yellow','feed_banner','Plasma Yellow','neon',190),
  ('neon-acid-lime','feed_banner','Acid Lime','neon',192),
  ('neon-ion-green','feed_banner','Ion Green','neon',194),
  ('neon-neon-mint','feed_banner','Neon Mint','neon',196),
  ('neon-aqua-pulse','feed_banner','Aqua Pulse','neon',198),
  ('neon-electric-cyan','feed_banner','Electric Cyan','neon',200),
  ('neon-azure-beam','feed_banner','Azure Beam','neon',202),
  ('neon-cobalt-glow','feed_banner','Cobalt Glow','neon',204),
  ('neon-ultraviolet','feed_banner','Ultraviolet','neon',206),
  ('neon-hyper-violet','feed_banner','Hyper Violet','neon',208),
  ('neon-hot-magenta','feed_banner','Hot Magenta','neon',210),
  ('neon-neon-ruby','feed_banner','Neon Ruby','neon',212)
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

  if v_tier not in ('pastel','metallic','neon') then raise exception 'Banner is no longer for sale'; end if;
  if p_days not in (3,5,7) then raise exception 'Choose 3, 5, or 7 days'; end if;
  v_period := make_interval(days=>p_days);

  v_price := v_price + case
    when v_tier='metallic' and p_days=5 then 60
    when v_tier='metallic' and p_days=7 then 120
    when v_tier='neon' and p_days=5 then 40
    when v_tier='neon' and p_days=7 then 80
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
  values(p_user_id,p_product_id,now(),now()+v_period)
  on conflict (user_id,product_id) do update
  set purchased_at=now(),
      expires_at=greatest(now(),cb_user_items.expires_at)+v_period
  returning expires_at into v_expiry;

  return jsonb_build_object('owned',true,'charged',true,'gold',v_gold,'active',p_product_id,'expires_at',v_expiry,'days',p_days,'price',v_price,'extended',v_extending,'discount_percent',case when v_extending then 30 else 0 end);
end $$;

revoke all on function public.cb_buy_feed_banner_timed(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.cb_buy_feed_banner_timed(uuid,text,integer,uuid) to service_role;

commit;
