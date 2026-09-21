-- Arena match control and universal Bag gifting (4 Gold per transaction).
begin;

alter table public.cb_arena_settings
  add column if not exists match_control text not null default '5+0';
alter table public.cb_arena_settings drop constraint if exists cb_arena_settings_match_control_check;
alter table public.cb_arena_settings add constraint cb_arena_settings_match_control_check
  check(match_control in('1+0','1+1','2+1','3+0','3+2','5+0','10+0','10+5','15+10'));
alter table public.cb_arena_sessions
  add column if not exists match_control text not null default '5+0';

create table if not exists public.cb_inventory_items(
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  item_kind text not null,
  item_id text not null,
  quantity integer not null default 1 check(quantity>=0),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(user_id,item_kind,item_id)
);
create table if not exists public.cb_item_gifts(
  request_id uuid primary key,
  sender_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  recipient_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  item_kind text not null,
  item_id text not null,
  quantity integer not null check(quantity>0),
  fee_gold integer not null default 4,
  created_at timestamptz not null default now()
);
alter table public.cb_inventory_items enable row level security;
alter table public.cb_item_gifts enable row level security;
revoke all on public.cb_inventory_items,public.cb_item_gifts from anon,authenticated;

create or replace function public.cb_gift_bag_item(
  p_sender_id uuid,p_username text,p_item_kind text,p_item_id text,p_quantity integer,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_recipient uuid;v_gold integer;v_ticket_count integer;v_expiry timestamptz;v_inserted uuid;v_remaining integer;
begin
 if p_quantity<1 then raise exception 'Choose a valid gift quantity.';end if;
 select user_id into v_recipient from public.cb_profiles where lower(username)=lower(trim(both '@' from p_username));
 if v_recipient is null then raise exception 'Player username not found.';end if;
 if v_recipient=p_sender_id then raise exception 'You cannot gift an item to yourself.';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(p_sender_id::text,v_recipient::text)||greatest(p_sender_id::text,v_recipient::text),0));
 select gold_points into v_gold from public.cb_profiles where user_id=p_sender_id for update;
 insert into public.cb_item_gifts(request_id,sender_id,recipient_id,item_kind,item_id,quantity)
 values(p_request_id,p_sender_id,v_recipient,p_item_kind,p_item_id,p_quantity)
 on conflict(request_id) do nothing returning request_id into v_inserted;
 if v_inserted is null then return jsonb_build_object('gifted',false,'gold',v_gold);end if;
 if v_gold<4 then raise exception 'You need 4 Gold to send this gift.';end if;

 if p_item_kind='arena_ticket' then
  if p_item_id<>'arena-ticket' then raise exception 'Invalid Arena Ticket.';end if;
  select quantity into v_ticket_count from public.cb_arena_tickets where user_id=p_sender_id for update;
  if coalesce(v_ticket_count,0)<p_quantity then raise exception 'Not enough Arena Tickets in your Bag.';end if;
  update public.cb_arena_tickets set quantity=quantity-p_quantity,updated_at=now() where user_id=p_sender_id returning quantity into v_remaining;
  insert into public.cb_arena_tickets(user_id,quantity) values(v_recipient,p_quantity)
  on conflict(user_id) do update set quantity=cb_arena_tickets.quantity+excluded.quantity,updated_at=now();
 elsif p_item_kind='feed_banner' then
  if p_quantity<>1 then raise exception 'Feed Banners are gifted one at a time.';end if;
  select expires_at into v_expiry from public.cb_user_items where user_id=p_sender_id and product_id=p_item_id and expires_at>now() for update;
  if v_expiry is null then raise exception 'This Feed Banner is expired or not in your Bag.';end if;
  delete from public.cb_user_items where user_id=p_sender_id and product_id=p_item_id;
  update public.cb_profiles set active_feed_banner=null where user_id=p_sender_id and active_feed_banner=p_item_id;
  insert into public.cb_user_items(user_id,product_id,purchased_at,expires_at) values(v_recipient,p_item_id,now(),v_expiry)
  on conflict(user_id,product_id) do update set purchased_at=now(),expires_at=greatest(cb_user_items.expires_at,excluded.expires_at);
  v_remaining:=0;
 else
  update public.cb_inventory_items set quantity=quantity-p_quantity,updated_at=now()
  where user_id=p_sender_id and item_kind=p_item_kind and item_id=p_item_id and quantity>=p_quantity returning quantity into v_remaining;
  if v_remaining is null then raise exception 'This item is not available in your Bag.';end if;
  insert into public.cb_inventory_items(user_id,item_kind,item_id,quantity) values(v_recipient,p_item_kind,p_item_id,p_quantity)
  on conflict(user_id,item_kind,item_id) do update set quantity=cb_inventory_items.quantity+excluded.quantity,updated_at=now();
 end if;

 update public.cb_profiles set gold_points=gold_points-4 where user_id=p_sender_id returning gold_points into v_gold;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
 values('bag-gift:'||p_request_id::text,p_sender_id,-4,'bag_gift_fee',p_request_id) on conflict(id) do nothing;
 return jsonb_build_object('gifted',true,'gold',v_gold,'recipient_id',v_recipient,'remaining',coalesce(v_remaining,0),'fee',4);
exception when others then
 delete from public.cb_item_gifts where request_id=p_request_id and sender_id=p_sender_id;
 raise;
end $$;

revoke all on function public.cb_gift_bag_item(uuid,text,text,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.cb_gift_bag_item(uuid,text,text,text,integer,uuid) to service_role;
commit;
