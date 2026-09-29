-- Apply after 0079. A single approved donation must exceed PHP 888 for Premium.
begin;

create table if not exists public.cb_owner_premium_grants (
  user_id uuid primary key references public.cb_profiles(user_id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table public.cb_owner_premium_grants enable row level security;
revoke all on public.cb_owner_premium_grants from anon, authenticated;

create or replace function public.cb_grant_owner_premium() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.role='owner' then
    insert into public.cb_owner_premium_grants(user_id) values(new.user_id) on conflict do nothing;
    insert into public.cb_user_items(user_id,product_id,purchased_at,expires_at)
      values(new.user_id,'premium-supporter',now(),'9999-12-31 23:59:59+00'::timestamptz)
      on conflict(user_id,product_id) do update set expires_at=excluded.expires_at;
  end if;
  return new;
end $$;
drop trigger if exists cb_grant_owner_premium_trigger on public.cb_profiles;
create trigger cb_grant_owner_premium_trigger after insert or update of role on public.cb_profiles
  for each row when (new.role='owner') execute function public.cb_grant_owner_premium();

insert into public.cb_owner_premium_grants(user_id)
  select user_id from public.cb_profiles where role='owner' on conflict do nothing;
insert into public.cb_user_items(user_id,product_id,purchased_at,expires_at)
  select user_id,'premium-supporter',now(),'9999-12-31 23:59:59+00'::timestamptz
  from public.cb_owner_premium_grants
  on conflict(user_id,product_id) do update set expires_at=excluded.expires_at;

-- Undo rewards previously granted for donations at or below the new threshold.
-- Preserve an owner's permanent entitlement and every verified qualifying donor.
update public.cb_profiles p set active_feed_banner=null
  where p.active_feed_banner='premium-supporter'
    and not exists(select 1 from public.cb_owner_premium_grants g where g.user_id=p.user_id)
    and not exists(select 1 from public.cb_donations d where d.donor_id=p.user_id and d.status='approved' and d.amount_php>888);
delete from public.cb_user_items i where i.product_id='premium-supporter'
  and not exists(select 1 from public.cb_owner_premium_grants g where g.user_id=i.user_id)
  and not exists(select 1 from public.cb_donations d where d.donor_id=i.user_id and d.status='approved' and d.amount_php>888);

create index if not exists cb_donations_approved_supporter_idx
  on public.cb_donations(donor_id,amount_php) where status='approved';

create or replace function public.cb_supporter_tiers(p_user_ids uuid[])
returns table(user_id uuid,tier text) language plpgsql stable security definer set search_path=public as $$
begin
  if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
  return query
    with approved as (
      select d.donor_id, bool_or(d.amount_php>888) as qualifies
      from public.cb_donations d where d.status='approved' and d.donor_id=any(p_user_ids)
      group by d.donor_id
    )
    select ids.id,
      case when g.user_id is not null or coalesce(a.qualifies,false) then 'premium' else 'app_donor' end
    from (select distinct unnest(p_user_ids) as id) ids
    left join approved a on a.donor_id=ids.id
    left join public.cb_owner_premium_grants g on g.user_id=ids.id
    where a.donor_id is not null or g.user_id is not null;
end $$;
revoke all on function public.cb_supporter_tiers(uuid[]) from public,anon,authenticated;
grant execute on function public.cb_supporter_tiers(uuid[]) to service_role;

create or replace function public.cb_review_donation(p_owner_id uuid,p_donation_id uuid,p_approve boolean,p_reason text default null)
returns public.cb_donations language plpgsql security definer set search_path=public as $$
declare item public.cb_donations%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
  if not exists(select 1 from public.cb_profiles where user_id=p_owner_id and role='owner') then raise exception 'Owner access required'; end if;
  select * into item from public.cb_donations where id=p_donation_id for update;
  if not found or item.status<>'pending' then raise exception 'Donation has already been reviewed or does not exist'; end if;
  if p_approve and item.amount_php>888 then
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
revoke all on function public.cb_review_donation(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.cb_review_donation(uuid,uuid,boolean,text) to service_role;
commit;
