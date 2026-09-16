-- Chess Burger v11: Vercel API foundation.
-- Safe to run after chess-burger-v8-complete.sql. It creates new tables only.

begin;

create table if not exists public.cb_app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.cb_matches (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.cb_profiles(user_id) on delete restrict,
  white_id uuid not null references public.cb_profiles(user_id) on delete restrict,
  black_id uuid references public.cb_profiles(user_id) on delete restrict,
  invite_to uuid references public.cb_profiles(user_id) on delete set null,
  code text unique,
  control text not null,
  status text not null default 'waiting' check (status in ('waiting','active','finished','cancelled')),
  pgn text not null default '',
  white_ms integer not null,
  black_ms integer not null,
  last_tick timestamptz not null default now(),
  version integer not null default 0,
  result text check (result in ('white','black','draw')),
  white_cbr integer not null default 88,
  black_cbr integer not null default 88,
  rating_applied boolean not null default false,
  reactions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cb_matches_active_players on public.cb_matches(status,white_id,black_id);
create index if not exists cb_matches_invites on public.cb_matches(invite_to,status,created_at desc);

create table if not exists public.cb_match_queue (
  user_id uuid primary key references public.cb_profiles(user_id) on delete cascade,
  control text not null,
  match_id uuid references public.cb_matches(id) on delete set null,
  seen_at timestamptz not null default now()
);

create table if not exists public.cb_presence (
  user_id uuid primary key references public.cb_profiles(user_id) on delete cascade,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  gps_enabled boolean not null default false,
  seen_at timestamptz not null default now()
);

create table if not exists public.cb_social_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  target_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  kind text not null check(kind in ('friend','follow','block')),
  status text not null default 'pending' check(status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  unique(user_id,target_id,kind),
  check(user_id<>target_id)
);

create table if not exists public.cb_cbr_ledger (
  id text primary key,
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  delta integer not null,
  kind text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.cb_gold_ledger (
  id text primary key,
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  delta integer not null,
  kind text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

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

create table if not exists public.cb_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.cb_profiles(user_id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.cb_app_settings enable row level security;
alter table public.cb_matches enable row level security;
alter table public.cb_match_queue enable row level security;
alter table public.cb_presence enable row level security;
alter table public.cb_social_links enable row level security;
alter table public.cb_cbr_ledger enable row level security;
alter table public.cb_gold_ledger enable row level security;
alter table public.cb_abort_events enable row level security;
alter table public.cb_fair_play enable row level security;
alter table public.cb_audit_logs enable row level security;

commit;