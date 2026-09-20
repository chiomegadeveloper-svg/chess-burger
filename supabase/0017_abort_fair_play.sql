-- Abort fair-play tracking: every third abort starts a two-minute cooldown.
-- Safe to run more than once after v11-vercel-api-foundation.sql.
begin;

create table if not exists public.cb_abort_events (
  match_id uuid primary key references public.cb_matches(id) on delete cascade,
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.cb_fair_play (
  user_id uuid primary key references public.cb_profiles(user_id) on delete cascade,
  total_aborts integer not null default 0,
  cooldown_until timestamptz,
  cooldown_notified_at timestamptz,
  clean_match_streak integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.cb_abort_events enable row level security;
alter table public.cb_fair_play enable row level security;
revoke all on public.cb_abort_events from anon,authenticated;
revoke all on public.cb_fair_play from anon,authenticated;

notify pgrst,'reload schema';
commit;
