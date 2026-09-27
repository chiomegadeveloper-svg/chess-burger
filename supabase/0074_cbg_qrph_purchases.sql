-- Manual QRPh orders. Apply this migration before enabling the CBG editor.
begin;

create table if not exists public.cb_cbg_packages (
  slot smallint primary key check (slot between 1 and 10),
  cbg_amount integer not null check (cbg_amount between 1 and 1000000),
  price_php numeric(10,2) not null check (price_php > 0),
  active boolean not null default true,
  promo_percent smallint not null default 0 check (promo_percent between 0 and 99),
  promo_first_n integer not null default 0 check (promo_first_n between 0 and 100000),
  promo_start_at timestamptz,
  updated_at timestamptz not null default now(),
  check (promo_percent = 0 or (promo_first_n > 0 and promo_start_at is not null))
);

create table if not exists public.cb_cbg_orders (
  id uuid primary key,
  buyer_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  package_slot smallint references public.cb_cbg_packages(slot) on delete set null,
  cbg_amount integer not null check (cbg_amount > 0),
  amount_php numeric(10,2) not null check (amount_php > 0),
  promo_percent smallint not null default 0,
  reference_last6 char(6) check (reference_last6 is null or reference_last6 ~ '^[0-9]{6}$'),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','pending','approved','rejected')),
  expires_at timestamptz not null default now()+interval '3 hours',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.cb_profiles(user_id),
  reject_reason text
);
create index if not exists cb_cbg_orders_buyer_idx on public.cb_cbg_orders(buyer_id,created_at desc);
create index if not exists cb_cbg_orders_pending_idx on public.cb_cbg_orders(created_at) where status='pending';
create index if not exists cb_cbg_orders_promo_idx on public.cb_cbg_orders(package_slot,promo_percent,status);
create unique index if not exists cb_cbg_orders_buyer_reference_idx on public.cb_cbg_orders(buyer_id,reference_last6) where status='pending';

alter table public.cb_cbg_packages enable row level security;
alter table public.cb_cbg_orders enable row level security;
revoke all on public.cb_cbg_packages,public.cb_cbg_orders from anon,authenticated;

create or replace function public.cb_reserve_cbg_order(p_id uuid,p_buyer_id uuid,p_slot smallint)
returns public.cb_cbg_orders language plpgsql security definer set search_path=public as $$
declare pack public.cb_cbg_packages%rowtype; result public.cb_cbg_orders%rowtype; eligible boolean; rate smallint:=0;
begin
  if auth.role() <> 'service_role' then raise exception 'Server access required'; end if;
  if (select count(*) from public.cb_cbg_orders where buyer_id=p_buyer_id and status='awaiting_payment' and expires_at>now())>=3 then raise exception 'Finish or wait for one of your existing payment reservations.'; end if;
  select * into pack from public.cb_cbg_packages where slot=p_slot and active for update;
  if not found then raise exception 'This CBG pack is no longer available.'; end if;
  eligible:=pack.promo_percent>0 and now()>=pack.promo_start_at and
    (select count(*) from public.cb_cbg_orders where package_slot=p_slot and promo_percent>0 and created_at>=pack.promo_start_at and (status in ('pending','approved') or (status='awaiting_payment' and expires_at>now())))<pack.promo_first_n;
  if eligible then rate:=pack.promo_percent; end if;
  insert into public.cb_cbg_orders(id,buyer_id,package_slot,cbg_amount,amount_php,promo_percent)
  values(p_id,p_buyer_id,p_slot,pack.cbg_amount,round(pack.price_php*(100-rate)/100,2),rate)
  returning * into result;
  return result;
end $$;

create or replace function public.cb_submit_cbg_order(p_id uuid,p_buyer_id uuid,p_reference text)
returns public.cb_cbg_orders language plpgsql security definer set search_path=public as $$
declare result public.cb_cbg_orders%rowtype;
begin
 if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
 if p_reference !~ '^[0-9]{6}$' then raise exception 'Enter the last 6 digits of your payment reference.'; end if;
 update public.cb_cbg_orders set reference_last6=p_reference,status='pending'
 where id=p_id and buyer_id=p_buyer_id and status='awaiting_payment' and expires_at>now()
 returning * into result;
 if not found then raise exception 'Payment reservation expired. Please choose a pack again.'; end if;
 return result;
end $$;

create or replace function public.cb_review_cbg_order(p_owner_id uuid,p_order_id uuid,p_approve boolean,p_reason text default null)
returns public.cb_cbg_orders language plpgsql security definer set search_path=public as $$
declare item public.cb_cbg_orders%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Server access required'; end if;
  if not exists(select 1 from public.cb_profiles where user_id=p_owner_id and role='owner') then raise exception 'Owner access required'; end if;
  select * into item from public.cb_cbg_orders where id=p_order_id for update;
  if not found or item.status<>'pending' then raise exception 'Order has already been reviewed or does not exist'; end if;
  update public.cb_cbg_orders set status=case when p_approve then 'approved' else 'rejected' end,
    reviewed_at=now(),reviewed_by=p_owner_id,reject_reason=case when p_approve then null else left(nullif(trim(p_reason),''),250) end
    where id=p_order_id returning * into item;
  if p_approve then
    update public.cb_profiles set gold_points=gold_points+item.cbg_amount where user_id=item.buyer_id;
    if not found then raise exception 'Buyer profile no longer exists'; end if;
    insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
    values('cbg-purchase:'||item.id::text,item.buyer_id,item.cbg_amount,'cbg_purchase',item.id);
  end if;
  return item;
end $$;

revoke all on function public.cb_reserve_cbg_order(uuid,uuid,smallint) from public,anon,authenticated;
revoke all on function public.cb_submit_cbg_order(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.cb_review_cbg_order(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.cb_reserve_cbg_order(uuid,uuid,smallint) to service_role;
grant execute on function public.cb_submit_cbg_order(uuid,uuid,text) to service_role;
grant execute on function public.cb_review_cbg_order(uuid,uuid,boolean,text) to service_role;
commit;
