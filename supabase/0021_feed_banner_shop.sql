begin;

create table if not exists public.cb_shop_products (
  id text primary key,
  kind text not null check (kind in ('feed_banner')),
  name text not null,
  tier text not null check (tier in ('pastel','metallic')),
  price_gold integer not null check (price_gold > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cb_user_items (
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  product_id text not null references public.cb_shop_products(id) on delete cascade,
  purchased_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

alter table public.cb_profiles add column if not exists active_feed_banner text references public.cb_shop_products(id) on delete set null;

insert into public.cb_shop_products(id,kind,name,tier,price_gold) values
 ('pastel-blush','feed_banner','Blush','pastel',38),('pastel-peach','feed_banner','Peach','pastel',40),
 ('pastel-lemon','feed_banner','Lemon','pastel',42),('pastel-mint','feed_banner','Mint','pastel',44),
 ('pastel-sage','feed_banner','Sage','pastel',46),('pastel-sky','feed_banner','Sky','pastel',48),
 ('pastel-ice','feed_banner','Ice Blue','pastel',50),('pastel-lilac','feed_banner','Lilac','pastel',52),
 ('pastel-violet','feed_banner','Violet','pastel',55),('pastel-coral','feed_banner','Coral','pastel',58),
 ('metal-gold','feed_banner','Gold','metallic',68),('metal-rose','feed_banner','Rose Gold','metallic',69),
 ('metal-silver','feed_banner','Silver','metallic',70),('metal-gunmetal','feed_banner','Gunmetal','metallic',71),
 ('metal-bronze','feed_banner','Bronze','metallic',72),('metal-cyan','feed_banner','Cyan','metallic',73),
 ('metal-royal','feed_banner','Royal Blue','metallic',74),('metal-emerald','feed_banner','Emerald','metallic',75),
 ('metal-amethyst','feed_banner','Amethyst','metallic',76),('metal-ruby','feed_banner','Ruby','metallic',78)
on conflict (id) do update set name=excluded.name,tier=excluded.tier,price_gold=excluded.price_gold,active=true;

alter table public.cb_shop_products enable row level security;
alter table public.cb_user_items enable row level security;

create or replace function public.cb_buy_feed_banner(p_user_id uuid,p_product_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_price integer; v_gold integer; v_owned boolean;
begin
  select price_gold into v_price from public.cb_shop_products where id=p_product_id and kind='feed_banner' and active=true;
  if v_price is null then raise exception 'Banner is not available'; end if;
  select gold_points into v_gold from public.cb_profiles where user_id=p_user_id for update;
  if v_gold is null then raise exception 'Player profile not found'; end if;
  select exists(select 1 from public.cb_user_items where user_id=p_user_id and product_id=p_product_id) into v_owned;
  if v_owned then
    update public.cb_profiles set active_feed_banner=p_product_id where user_id=p_user_id;
    return jsonb_build_object('owned',true,'charged',false,'gold',v_gold,'active',p_product_id);
  end if;
  if v_gold < v_price then raise exception 'Not enough Gold'; end if;
  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
  values('shop-banner:'||p_request_id::text,p_user_id,-v_price,'shop_purchase',p_request_id)
  on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('owned',true,'charged',false,'gold',v_gold,'active',(select active_feed_banner from public.cb_profiles where user_id=p_user_id));
  end if;
  update public.cb_profiles set gold_points=gold_points-v_price,active_feed_banner=p_product_id where user_id=p_user_id returning gold_points into v_gold;
  insert into public.cb_user_items(user_id,product_id) values(p_user_id,p_product_id);
  return jsonb_build_object('owned',true,'charged',true,'gold',v_gold,'active',p_product_id);
end $$;

create or replace function public.cb_activate_feed_banner(p_user_id uuid,p_product_id text)
returns text language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.cb_user_items where user_id=p_user_id and product_id=p_product_id) then raise exception 'Banner is not owned'; end if;
  update public.cb_profiles set active_feed_banner=p_product_id where user_id=p_user_id;
  return p_product_id;
end $$;

revoke all on function public.cb_buy_feed_banner(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.cb_activate_feed_banner(uuid,text) from public,anon,authenticated;
grant execute on function public.cb_buy_feed_banner(uuid,text,uuid) to service_role;
grant execute on function public.cb_activate_feed_banner(uuid,text) to service_role;

commit;
