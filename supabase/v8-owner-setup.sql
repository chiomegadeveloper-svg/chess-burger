-- Designated Chess Burger Owners, explicitly supplied by the project owner.
-- Run as postgres in the Supabase SQL editor AFTER the v8 schema.
-- Keep Supabase Auth email confirmation ENABLED before either account registers.
-- This does not create auth accounts, choose passwords, or send invitation emails.
begin;
create table if not exists public.cb_designated_owners(email text primary key check(email=lower(email)));
alter table public.cb_designated_owners enable row level security;
revoke all on public.cb_designated_owners from public,anon,authenticated;
insert into public.cb_designated_owners(email) values
 ('alota.bobbie.2026@gmail.com')
on conflict(email) do nothing;

create or replace function public.cb_apply_designated_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from auth.users u join public.cb_designated_owners d on d.email=lower(u.email) where u.id=new.user_id and u.email_confirmed_at is not null) then
  if tg_op='INSERT' or old.role is distinct from 'owner' then
   insert into public.cb_admin_logs(actor_user_id,action,details) values(new.user_id,'designated_owner_activated',jsonb_build_object('method','verified email allowlist'));
  end if;
  new.role:='owner';
 end if;
 return new;
end;$$;
revoke all on function public.cb_apply_designated_owner() from public,anon,authenticated;
drop trigger if exists cb_apply_designated_owner on public.cb_profiles;
create trigger cb_apply_designated_owner before insert or update on public.cb_profiles for each row execute function public.cb_apply_designated_owner();

create or replace function public.cb_activate_verified_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null and exists(select 1 from public.cb_designated_owners where email=lower(new.email)) then
  update public.cb_profiles set role='owner' where user_id=new.id and role<>'owner';
 end if;
 return new;
end;$$;
revoke all on function public.cb_activate_verified_owner() from public,anon,authenticated;
drop trigger if exists cb_activate_verified_owner on auth.users;
create trigger cb_activate_verified_owner after update of email,email_confirmed_at on auth.users for each row execute function public.cb_activate_verified_owner();

-- Promote existing confirmed accounts that already have player profiles.
update public.cb_profiles p set role='owner'
from auth.users u join public.cb_designated_owners d on d.email=lower(u.email)
where p.user_id=u.id and u.email_confirmed_at is not null and p.role<>'owner';
commit;

-- Reports pending registrations without fabricating or creating accounts.
select d.email,
 case when u.id is null then 'Awaiting registration'
      when u.email_confirmed_at is null then 'Awaiting email confirmation'
      when p.user_id is null then 'Awaiting saved player profile'
      else p.role end as owner_status
from public.cb_designated_owners d
left join auth.users u on lower(u.email)=d.email
left join public.cb_profiles p on p.user_id=u.id
order by d.email;
