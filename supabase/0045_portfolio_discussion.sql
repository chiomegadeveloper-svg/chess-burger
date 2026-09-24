begin;

create table if not exists public.cb_portfolio_reactions (
  portfolio_user_id uuid not null,
  slot smallint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('heart', 'queen')),
  created_at timestamptz not null default now(),
  primary key (portfolio_user_id, slot, user_id, kind),
  foreign key (portfolio_user_id, slot) references public.cb_profile_portfolio(user_id, slot) on delete cascade
);

create table if not exists public.cb_portfolio_comments (
  id uuid primary key default gen_random_uuid(),
  portfolio_user_id uuid not null,
  slot smallint not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid,
  body text not null check (length(trim(body)) between 1 and 88),
  created_at timestamptz not null default now(),
  unique (id, portfolio_user_id, slot),
  foreign key (portfolio_user_id, slot) references public.cb_profile_portfolio(user_id, slot) on delete cascade,
  foreign key (parent_id, portfolio_user_id, slot) references public.cb_portfolio_comments(id, portfolio_user_id, slot) on delete cascade
);
create index if not exists cb_portfolio_comments_story on public.cb_portfolio_comments(portfolio_user_id, slot, created_at);

alter table public.cb_portfolio_reactions enable row level security;
alter table public.cb_portfolio_comments enable row level security;
grant select, insert, delete on public.cb_portfolio_reactions to authenticated;
grant select, insert, delete on public.cb_portfolio_comments to authenticated;

drop policy if exists cb_portfolio_reactions_read on public.cb_portfolio_reactions;
create policy cb_portfolio_reactions_read on public.cb_portfolio_reactions for select to authenticated using (true);
drop policy if exists cb_portfolio_reactions_add on public.cb_portfolio_reactions;
create policy cb_portfolio_reactions_add on public.cb_portfolio_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and portfolio_user_id <> (select auth.uid()));
drop policy if exists cb_portfolio_reactions_remove on public.cb_portfolio_reactions;
create policy cb_portfolio_reactions_remove on public.cb_portfolio_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists cb_portfolio_comments_read on public.cb_portfolio_comments;
create policy cb_portfolio_comments_read on public.cb_portfolio_comments for select to authenticated using (true);
drop policy if exists cb_portfolio_comments_add on public.cb_portfolio_comments;
create policy cb_portfolio_comments_add on public.cb_portfolio_comments for insert to authenticated
  with check (author_id = (select auth.uid()));
drop policy if exists cb_portfolio_comments_remove on public.cb_portfolio_comments;
create policy cb_portfolio_comments_remove on public.cb_portfolio_comments for delete to authenticated
  using (author_id = (select auth.uid()) or portfolio_user_id = (select auth.uid()));

commit;
