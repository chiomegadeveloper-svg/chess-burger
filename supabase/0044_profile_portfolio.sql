begin;

create table if not exists public.cb_profile_portfolio (
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  slot smallint not null check (slot between 0 and 7),
  image_url text not null check (length(image_url) between 10 and 2048 and image_url like 'https://%'),
  title text not null check (length(trim(title)) between 1 and 100),
  article text not null check (length(trim(article)) between 1 and 5000),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

alter table public.cb_profile_portfolio enable row level security;
grant select, insert, update, delete on public.cb_profile_portfolio to authenticated;

drop policy if exists cb_portfolio_read on public.cb_profile_portfolio;
create policy cb_portfolio_read on public.cb_profile_portfolio
  for select to authenticated using (true);
drop policy if exists cb_portfolio_insert on public.cb_profile_portfolio;
create policy cb_portfolio_insert on public.cb_profile_portfolio
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists cb_portfolio_update on public.cb_profile_portfolio;
create policy cb_portfolio_update on public.cb_profile_portfolio
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists cb_portfolio_delete on public.cb_profile_portfolio;
create policy cb_portfolio_delete on public.cb_profile_portfolio
  for delete to authenticated using (user_id = (select auth.uid()));

commit;
