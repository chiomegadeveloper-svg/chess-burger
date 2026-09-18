-- Chess Burger: Vercel + Supabase online challenge and match backend.
-- Run this once in Supabase SQL Editor before switching the Vercel API route.

begin;

alter table public.cb_feed add column if not exists challenge_match_id uuid;
alter table public.cb_feed drop constraint if exists cb_feed_kind_check;
alter table public.cb_feed add constraint cb_feed_kind_check check (kind in (
  'profile_created','profile_updated','win','first_blood','new_reward','top10','announcement','challenge','fair_play'
));
create unique index if not exists cb_feed_challenge_match_idx on public.cb_feed(challenge_match_id) where challenge_match_id is not null;

create table if not exists public.cb_matches (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  white_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  black_id uuid references public.cb_profiles(user_id) on delete set null,
  invite_to uuid references public.cb_profiles(user_id) on delete set null,
  code text not null unique check(code ~ '^[A-Z0-9]{8}$'),
  control text not null check(control in ('1+0','1+1','2+1','3+0','3+2','5+0','10+0','10+5','15+10')),
  status text not null default 'waiting' check(status in ('waiting','active','finished','cancelled')),
  pgn text not null default '',
  white_ms integer not null,
  black_ms integer not null,
  last_tick bigint not null,
  version integer not null default 0,
  result text check(result in ('white','black','draw')),
  white_cbr integer not null,
  black_cbr integer not null default 88,
  rating_applied integer not null default 0,
  reactions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cb_matches_participants_idx on public.cb_matches(white_id,black_id,status);
create index if not exists cb_matches_waiting_idx on public.cb_matches(status,created_at desc);

alter table public.cb_matches enable row level security;
revoke all on public.cb_matches from anon,authenticated;

create or replace function public.cb_prune_feed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.cb_feed
  where id in (
    select id from public.cb_feed
    where kind not in ('announcement','challenge')
    order by created_at desc,id desc offset 50
  );
  return new;
end;
$$;

commit;
