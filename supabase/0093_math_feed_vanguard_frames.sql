-- Dark Vanguard rentals and Chess Math community activity. Apply after 0092.
begin;
create or replace function public.cb_rent_avatar_frame(p_user_id uuid,p_frame_id text,p_days integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_price integer; v_gold integer; v_item_id text; v_name text; v_expiry timestamptz; v_inserted text;
begin
 if p_frame_id !~ '^((basic|premium)-(10|[1-9])|vanguard-(20|1[0-9]|[1-9]))$' or p_days not in (7,21,30) then
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
 v_name:=case when p_frame_id like 'vanguard-%' then (array['Obsidian Horns','Ember Swords','Amethyst Dragon','Frostbone Crown','Emerald Wolf','Molten Shield','Raven Talons','Bloodhorn','Cyan Gothic','Emerald Serpent','Crimson Knight','Magenta Bat','Amber Axes','Sapphire Thorns','Ruby Dragon','Violet Gauntlets','Emerald Spears','Shattered Crown','Warlord Horns','Royal Vanguard'])[split_part(p_frame_id,'-',2)::integer] else case p_frame_id
  when 'basic-1' then 'Pawn Crest' when 'basic-2' then 'Twin Knights' when 'basic-3' then 'Bishop Jewel'
  when 'basic-4' then 'Castle Guard' when 'basic-5' then 'Queen Tiara' when 'basic-6' then 'King Crown'
  when 'basic-7' then 'Checkered Crown' when 'basic-8' then 'Pawn Laurels' when 'basic-9' then 'Chess Clock'
  when 'basic-10' then 'Knight Gambit' when 'premium-1' then 'Royal Checkmate' when 'premium-2' then 'Diamond Queen'
  when 'premium-3' then 'Storm Knights' when 'premium-4' then 'Violet Bishop' when 'premium-5' then 'Obsidian Castle'
  when 'premium-6' then 'Celestial Gambit' when 'premium-7' then 'Platinum Checkmate'
  when 'premium-8' then 'Emerald Grandmaster' when 'premium-9' then 'Ruby Royalty'
  else 'Golden Champion' end end;
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

do $$
declare v_check text;
begin
 select pg_get_constraintdef(c.oid) into v_check from pg_constraint c
 where c.conrelid='public.cb_feed'::regclass and c.conname='cb_feed_kind_check';
 if v_check is null then raise exception 'cb_feed_kind_check is missing; apply the existing feed migrations first.'; end if;
 execute 'alter table public.cb_feed drop constraint cb_feed_kind_check';
 execute 'alter table public.cb_feed add constraint cb_feed_kind_check ' || replace(v_check,'CHECK (','CHECK (kind = ''chess_math'' OR ');
end $$;
commit;
