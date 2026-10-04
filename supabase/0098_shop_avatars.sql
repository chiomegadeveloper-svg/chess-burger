-- Permanent Chess Burger portrait purchases. Run after 0097.
begin;
alter table public.cb_profiles add column if not exists active_shop_avatar text;
alter table public.cb_profiles add column if not exists shop_avatar_original_url text;

create or replace function public.cb_buy_shop_avatar(p_user_id uuid,p_avatar_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_index integer;v_price integer;v_gold integer;v_inserted text;
begin
 if p_avatar_id !~ '^avatar-(0[1-9]|[1-3][0-9]|40)$' then raise exception 'Choose a valid Chess Burger avatar.';end if;
 v_index:=substring(p_avatar_id from 8)::integer;
 v_price:=2+((v_index-1)%7);
 select gold_points into v_gold from public.cb_profiles where user_id=p_user_id for update;
 if v_gold is null then raise exception 'Player profile not found.';end if;
 if exists(select 1 from public.cb_inventory_items where user_id=p_user_id and item_kind='shop_avatar' and item_id=p_avatar_id and quantity>0) then
  return jsonb_build_object('purchased',false,'owned',true,'gold',v_gold);
 end if;
 if exists(select 1 from public.cb_gold_ledger where id='shop-avatar:'||p_request_id::text) then
  return jsonb_build_object('purchased',false,'gold',v_gold);
 end if;
 if v_gold<v_price then raise exception 'Not enough CBG for this avatar.';end if;
 insert into public.cb_inventory_items(user_id,item_kind,item_id,quantity,metadata)
 values(p_user_id,'shop_avatar',p_avatar_id,1,jsonb_build_object('name','Chess Burger Avatar '||v_index,'permanent',true));
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
 values('shop-avatar:'||p_request_id::text,p_user_id,-v_price,'shop_purchase',p_request_id)
 on conflict(id) do nothing returning id into v_inserted;
 if v_inserted is null then raise exception 'Purchase request already processed.';end if;
 update public.cb_profiles set gold_points=gold_points-v_price where user_id=p_user_id returning gold_points into v_gold;
 return jsonb_build_object('purchased',true,'avatar_id',p_avatar_id,'gold',v_gold);
end $$;

create or replace function public.cb_equip_shop_avatar(p_user_id uuid,p_avatar_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_profile public.cb_profiles%rowtype;v_url text;
begin
 select * into v_profile from public.cb_profiles where user_id=p_user_id for update;
 if not found then raise exception 'Player profile not found.';end if;
 if p_avatar_id is null then
  if v_profile.active_shop_avatar is not null then
   update public.cb_profiles set avatar_url=coalesce(shop_avatar_original_url,''),active_shop_avatar=null,shop_avatar_original_url=null where user_id=p_user_id;
  end if;
  return jsonb_build_object('active',null,'avatar_url',coalesce(v_profile.shop_avatar_original_url,v_profile.avatar_url));
 end if;
 if p_avatar_id !~ '^avatar-(0[1-9]|[1-3][0-9]|40)$' then raise exception 'Choose a valid Chess Burger avatar.';end if;
 if not exists(select 1 from public.cb_inventory_items where user_id=p_user_id and item_kind='shop_avatar' and item_id=p_avatar_id and quantity>0) then
  raise exception 'Buy this avatar before equipping it.';
 end if;
 v_url:='/shop-avatars/'||p_avatar_id||'.webp';
 update public.cb_profiles set avatar_url=v_url,
  shop_avatar_original_url=case when active_shop_avatar is null then avatar_url else shop_avatar_original_url end,
  active_shop_avatar=p_avatar_id where user_id=p_user_id;
 return jsonb_build_object('active',p_avatar_id,'avatar_url',v_url);
end $$;

revoke all on function public.cb_buy_shop_avatar(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.cb_equip_shop_avatar(uuid,text) from public,anon,authenticated;
grant execute on function public.cb_buy_shop_avatar(uuid,text,uuid) to service_role;
grant execute on function public.cb_equip_shop_avatar(uuid,text) to service_role;
commit;
