-- Run after 0058. Each rental is a separately giftable Bag item with its original expiry.
begin;

alter table public.cb_profiles add column if not exists active_avatar_frame_item text;

create or replace function public.cb_bag_slots_used(p_user_id uuid) returns integer
language sql stable security definer set search_path=public as $$
 select
  (case when coalesce((select quantity from public.cb_arena_tickets where user_id=p_user_id),0)>0 then 1 else 0 end)
  +(select count(*)::integer from public.cb_user_items where user_id=p_user_id and expires_at>now())
  +(select count(*)::integer from public.cb_inventory_items
    where user_id=p_user_id and quantity>0
    and (item_kind<>'avatar_frame' or (metadata->>'expires_at')::timestamptz>now()))
$$;

create or replace function public.cb_rent_avatar_frame(p_user_id uuid,p_frame_id text,p_days integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_price integer; v_gold integer; v_item_id text; v_name text; v_expiry timestamptz; v_inserted text;
begin
 if p_frame_id !~ '^(basic|premium)-(10|[1-9])$' or p_days not in (7,21,30) then
  raise exception 'Choose a valid avatar frame and rental period.';
 end if;
 v_price:=case p_days when 7 then 58 when 21 then 108 else 158 end;
 v_item_id:='af-'||p_frame_id||'-'||replace(p_request_id::text,'-','');
 select gold_points into v_gold from public.cb_profiles where user_id=p_user_id for update;
 if v_gold is null then raise exception 'Player profile not found.';end if;
 if exists(select 1 from public.cb_gold_ledger where id='avatar-frame-rental:'||p_request_id::text) then
  return jsonb_build_object('awarded',false,'item_id',v_item_id,'gold',v_gold);
 end if;
 if v_gold<v_price then raise exception 'Not enough Gold for this avatar frame.';end if;
 v_name:=case p_frame_id
  when 'basic-1' then 'Pawn Crest' when 'basic-2' then 'Twin Knights' when 'basic-3' then 'Bishop Jewel'
  when 'basic-4' then 'Castle Guard' when 'basic-5' then 'Queen Tiara' when 'basic-6' then 'King Crown'
  when 'basic-7' then 'Checkered Crown' when 'basic-8' then 'Pawn Laurels' when 'basic-9' then 'Chess Clock'
  when 'basic-10' then 'Knight Gambit' when 'premium-1' then 'Royal Checkmate' when 'premium-2' then 'Diamond Queen'
  when 'premium-3' then 'Storm Knights' when 'premium-4' then 'Violet Bishop' when 'premium-5' then 'Obsidian Castle'
  when 'premium-6' then 'Celestial Gambit' when 'premium-7' then 'Platinum Checkmate'
  when 'premium-8' then 'Emerald Grandmaster' when 'premium-9' then 'Ruby Royalty'
  else 'Golden Champion' end;
 v_expiry:=now()+make_interval(days=>p_days);
 insert into public.cb_inventory_items(user_id,item_kind,item_id,quantity,metadata)
 values(p_user_id,'avatar_frame',v_item_id,1,jsonb_build_object('frame_id',p_frame_id,'name',v_name,'expires_at',v_expiry));
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
 values('avatar-frame-rental:'||p_request_id::text,p_user_id,-v_price,'shop_rental',p_request_id)
 on conflict(id) do nothing returning id into v_inserted;
 if v_inserted is null then raise exception 'Rental request already processed.';end if;
 update public.cb_profiles set gold_points=gold_points-v_price where user_id=p_user_id returning gold_points into v_gold;
 return jsonb_build_object('awarded',true,'item_id',v_item_id,'expires_at',v_expiry,'gold',v_gold);
end $$;

revoke all on function public.cb_rent_avatar_frame(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.cb_rent_avatar_frame(uuid,text,integer,uuid) to service_role;
commit;
