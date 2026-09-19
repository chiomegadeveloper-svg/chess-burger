-- Run before database maintenance. Safe to repeat.
begin;
create table if not exists public.cb_app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.cb_app_settings enable row level security;
revoke all on public.cb_app_settings from anon,authenticated;
insert into public.cb_app_settings(key,value,updated_at)
values ('maintenance',jsonb_build_object('enabled',true,'message','Chess Burger is under maintenance. Please check back soon.'),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
commit;

-- Reopen after verification:
-- update public.cb_app_settings
-- set value=jsonb_build_object('enabled',false,'message',''),updated_at=now()
-- where key='maintenance';
