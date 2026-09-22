-- Bag capacity upgrades and idempotent player-to-player Gold gifting.
begin;

alter table public.cb_profiles add column if not exists bag_slots integer not null default 10;
update public.cb_profiles set bag_slots=10 where bag_slots is null or bag_slots<10;
alter table public.cb_profiles drop constraint if exists cb_profiles_bag_slots_check;
alter table public.cb_profiles add constraint cb_profiles_bag_slots_check check(bag_slots between 10 and 10000);

create table if not exists public.cb_gold_gifts(
 request_id uuid primary key,
 sender_id uuid not null references public.cb_profiles(user_id) on delete cascade,
 recipient_id uuid not null references public.cb_profiles(user_id) on delete cascade,
 amount integer not null check(amount>0),
 created_at timestamptz not null default now()
);
alter table public.cb_gold_gifts enable row level security;
revoke all on public.cb_gold_gifts from anon,authenticated;

create or replace function public.cb_bag_slots_used(p_user_id uuid) returns integer
language sql stable security definer set search_path=public as $$
 select
  (case when coalesce((select quantity from public.cb_arena_tickets where user_id=p_user_id),0)>0 then 1 else 0 end)
  +(select count(*)::integer from public.cb_user_items where user_id=p_user_id and expires_at>now())
  +(select count(*)::integer from public.cb_inventory_items where user_id=p_user_id and quantity>0)
$$;

create or replace function public.cb_require_open_bag_slot() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_user_id uuid;v_slots integer;v_needs_slot boolean:=false;
begin
 v_user_id:=new.user_id;
 if tg_table_name='cb_arena_tickets' then
  v_needs_slot:=new.quantity>0 and (tg_op='INSERT' or coalesce(old.quantity,0)<=0);
 elsif tg_table_name='cb_inventory_items' then
  v_needs_slot:=new.quantity>0 and (tg_op='INSERT' or coalesce(old.quantity,0)<=0);
 elsif tg_table_name='cb_user_items' then
  v_needs_slot:=new.expires_at>now() and (tg_op='INSERT' or old.expires_at<=now());
 end if;
 if v_needs_slot then
  select bag_slots into v_slots from public.cb_profiles where user_id=v_user_id;
  if public.cb_bag_slots_used(v_user_id)>=coalesce(v_slots,10) then
   raise exception 'Your Bag is full. Buy 10 more slots in the Shop.';
  end if;
 end if;
 return new;
end $$;

drop trigger if exists cb_arena_tickets_bag_capacity on public.cb_arena_tickets;
create trigger cb_arena_tickets_bag_capacity before insert or update of quantity on public.cb_arena_tickets for each row execute function public.cb_require_open_bag_slot();
drop trigger if exists cb_inventory_items_bag_capacity on public.cb_inventory_items;
create trigger cb_inventory_items_bag_capacity before insert or update of quantity on public.cb_inventory_items for each row execute function public.cb_require_open_bag_slot();
drop trigger if exists cb_user_items_bag_capacity on public.cb_user_items;
create trigger cb_user_items_bag_capacity before insert or update of expires_at on public.cb_user_items for each row execute function public.cb_require_open_bag_slot();

create or replace function public.cb_buy_bag_slots(p_user_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_gold integer;v_slots integer;v_inserted text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select gold_points,bag_slots into v_gold,v_slots from public.cb_profiles where user_id=p_user_id for update;
 if v_gold is null then raise exception 'Player profile not found.';end if;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
 values('bag-slots:'||p_request_id::text,p_user_id,-48,'bag_slots',p_request_id)
 on conflict(id) do nothing returning id into v_inserted;
 if v_inserted is null then return jsonb_build_object('purchased',false,'gold',v_gold,'bag_slots',v_slots);end if;
 if v_gold<48 then raise exception 'You need 48 Gold to buy 10 Bag slots.';end if;
 update public.cb_profiles set gold_points=gold_points-48,bag_slots=bag_slots+10 where user_id=p_user_id returning gold_points,bag_slots into v_gold,v_slots;
 return jsonb_build_object('purchased',true,'gold',v_gold,'bag_slots',v_slots,'added_slots',10);
end $$;

create or replace function public.cb_gift_gold(p_sender_id uuid,p_username text,p_amount integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_recipient uuid;v_sender_gold integer;v_recipient_gold integer;v_inserted uuid;
begin
 if p_amount<1 then raise exception 'Enter a valid Gold amount.';end if;
 select user_id into v_recipient from public.cb_profiles where lower(username)=lower(trim(both '@' from p_username));
 if v_recipient is null then raise exception 'Player username not found.';end if;
 if v_recipient=p_sender_id then raise exception 'You cannot gift Gold to yourself.';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(p_sender_id::text,v_recipient::text)||greatest(p_sender_id::text,v_recipient::text),0));
 select gold_points into v_sender_gold from public.cb_profiles where user_id=p_sender_id for update;
 perform 1 from public.cb_profiles where user_id=v_recipient for update;
 insert into public.cb_gold_gifts(request_id,sender_id,recipient_id,amount)
 values(p_request_id,p_sender_id,v_recipient,p_amount)
 on conflict(request_id) do nothing returning request_id into v_inserted;
 if v_inserted is null then return jsonb_build_object('gifted',false,'gold',v_sender_gold);end if;
 if v_sender_gold<p_amount then raise exception 'You do not have enough Gold.';end if;
 update public.cb_profiles set gold_points=gold_points-p_amount where user_id=p_sender_id returning gold_points into v_sender_gold;
 update public.cb_profiles set gold_points=gold_points+p_amount where user_id=v_recipient returning gold_points into v_recipient_gold;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('gold-gift-out:'||p_request_id::text,p_sender_id,-p_amount,'gold_gift',p_request_id) on conflict(id) do nothing;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('gold-gift-in:'||p_request_id::text,v_recipient,p_amount,'gold_gift',p_request_id) on conflict(id) do nothing;
 return jsonb_build_object('gifted',true,'gold',v_sender_gold,'recipient_id',v_recipient,'recipient_gold',v_recipient_gold,'amount',p_amount);
end $$;

revoke all on function public.cb_bag_slots_used(uuid),public.cb_require_open_bag_slot(),public.cb_buy_bag_slots(uuid,uuid),public.cb_gift_gold(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.cb_bag_slots_used(uuid),public.cb_buy_bag_slots(uuid,uuid),public.cb_gift_gold(uuid,text,integer,uuid) to service_role;
commit;
