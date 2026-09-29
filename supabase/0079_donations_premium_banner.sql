-- QRPh donations are manually verified by an owner. Apply after 0074.
begin;

-- This is an entitlement, not a CBG rental. Inactive prevents it from being
-- purchased with Gold; the owned item can still be equipped from the Bag.
insert into public.cb_shop_products(id,kind,name,tier,price_gold,active)
values('premium-supporter','feed_banner','Premium User','metallic',1,false)
on conflict(id) do update set name=excluded.name,tier=excluded.tier,active=false;

-- The supporter entitlement must be granted even when a player's Bag is full.
-- It is displayed in the Bag but does not consume a purchasable slot.
create or replace function public.cb_bag_slots_used(p_user_id uuid) returns integer
language sql stable security definer set search_path=public as $$
 select
  (case when coalesce((select quantity from public.cb_arena_tickets where user_id=p_user_id),0)>0 then 1 else 0 end)
  +(select count(*)::integer from public.cb_user_items where user_id=p_user_id and product_id<>'premium-supporter' and expires_at>now())
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
  v_needs_slot:=new.product_id<>'premium-supporter' and new.expires_at>now() and (tg_op='INSERT' or old.expires_at<=now());
 end if;
 if v_needs_slot then
  select bag_slots into v_slots from public.cb_profiles where user_id=v_user_id;
  if public.cb_bag_slots_used(v_user_id)>=coalesce(v_slots,10) then
   raise exception 'Your Bag is full. Buy 10 more slots in the Shop.';
  end if;
 end if;
 return new;
end $$;

create table if not exists public.cb_donations (
  id uuid primary key,
  donor_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  amount_php numeric(10,2) not null check(amount_php between 1 and 1000000),
  agreement_accepted_at timestamptz not null,
  agreement_version text not null,
  reference_last6 char(6) check(reference_last6 is null or reference_last6 ~ '^[0-9]{6}$'),
  status text not null default 'awaiting_payment' check(status in ('awaiting_payment','pending','approved','rejected')),
  expires_at timestamptz not null default now()+interval '3 hours',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.cb_profiles(user_id),
  reject_reason text
);
create index if not exists cb_donations_donor_idx on public.cb_donations(donor_id,created_at desc);
create index if not exists cb_donations_pending_idx on public.cb_donations(created_at) where status='pending';
create unique index if not exists cb_donations_pending_reference_idx on public.cb_donations(donor_id,reference_last6) where status='pending';
alter table public.cb_donations enable row level security;
revoke all on public.cb_donations from anon,authenticated;

create or replace function public.cb_reserve_donation(p_id uuid,p_donor_id uuid,p_amount_php numeric,p_agreed boolean)
returns public.cb_donations language plpgsql security definer set search_path=public as $$
declare result public.cb_donations%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
  if p_agreed is distinct from true then raise exception 'Please accept the donation agreement.'; end if;
  if p_amount_php is null or p_amount_php<1 or p_amount_php>1000000 or p_amount_php<>round(p_amount_php,2) then
    raise exception 'Choose an amount between PHP 1 and PHP 1,000,000.';
  end if;
  if (select count(*) from public.cb_donations where donor_id=p_donor_id and status='awaiting_payment' and expires_at>now())>=3 then
    raise exception 'Finish or cancel an existing donation checkout first.';
  end if;
  insert into public.cb_donations(id,donor_id,amount_php,agreement_accepted_at,agreement_version)
  values(p_id,p_donor_id,p_amount_php,now(),'donation-support-v1')
  returning * into result;
  return result;
end $$;

create or replace function public.cb_submit_donation(p_id uuid,p_donor_id uuid,p_reference text)
returns public.cb_donations language plpgsql security definer set search_path=public as $$
declare result public.cb_donations%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
  if p_reference !~ '^[0-9]{6}$' then raise exception 'Enter the last 6 digits of your payment reference.'; end if;
  update public.cb_donations set reference_last6=p_reference,status='pending'
  where id=p_id and donor_id=p_donor_id and status='awaiting_payment' and expires_at>now()
  returning * into result;
  if not found then raise exception 'Donation checkout expired. Choose an amount again.'; end if;
  return result;
end $$;

create or replace function public.cb_review_donation(p_owner_id uuid,p_donation_id uuid,p_approve boolean,p_reason text default null)
returns public.cb_donations language plpgsql security definer set search_path=public as $$
declare item public.cb_donations%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
  if not exists(select 1 from public.cb_profiles where user_id=p_owner_id and role='owner') then raise exception 'Owner access required'; end if;
  select * into item from public.cb_donations where id=p_donation_id for update;
  if not found or item.status<>'pending' then raise exception 'Donation has already been reviewed or does not exist'; end if;
  if p_approve then
    insert into public.cb_user_items(user_id,product_id,purchased_at,expires_at)
    values(item.donor_id,'premium-supporter',now(),'9999-12-31 23:59:59+00'::timestamptz)
    on conflict(user_id,product_id) do update set expires_at=excluded.expires_at;
    update public.cb_profiles set active_feed_banner='premium-supporter' where user_id=item.donor_id;
    if not found then raise exception 'Donor profile no longer exists'; end if;
  end if;
  update public.cb_donations set status=case when p_approve then 'approved' else 'rejected' end,
    reviewed_at=now(),reviewed_by=p_owner_id,reject_reason=case when p_approve then null else left(nullif(trim(p_reason),''),250) end
  where id=p_donation_id returning * into item;
  return item;
end $$;

revoke all on function public.cb_reserve_donation(uuid,uuid,numeric,boolean) from public,anon,authenticated;
revoke all on function public.cb_submit_donation(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.cb_review_donation(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.cb_reserve_donation(uuid,uuid,numeric,boolean) to service_role;
grant execute on function public.cb_submit_donation(uuid,uuid,text) to service_role;
grant execute on function public.cb_review_donation(uuid,uuid,boolean,text) to service_role;
commit;
