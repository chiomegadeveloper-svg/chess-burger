-- Older production projects can lack seen_at on one or more presence tables.
-- The epoch default keeps historical rows offline until their next heartbeat.
alter table public.cb_presence
  add column if not exists seen_at timestamptz not null default to_timestamp(0);
alter table public.cb_live_presence
  add column if not exists seen_at timestamptz not null default to_timestamp(0);
alter table public.cb_match_queue
  add column if not exists seen_at timestamptz not null default to_timestamp(0);

-- Apply after the existing Chess Burger migrations to support bounded live queries.
create index if not exists cb_presence_live_lat_lng_idx
  on public.cb_presence(latitude,longitude,seen_at desc)
  where gps_enabled = true;

-- Ratings belong to cb_profiles; cb_live_presence need only store last activity.
create index if not exists cb_live_presence_recent_idx
  on public.cb_live_presence(seen_at desc,user_id);

create index if not exists cb_matches_active_white_lookup_idx
  on public.cb_matches(white_id) where status = 'active';

create index if not exists cb_matches_active_black_lookup_idx
  on public.cb_matches(black_id) where status = 'active';

create index if not exists cb_match_queue_open_control_seen_idx
  on public.cb_match_queue(control,seen_at)
  where match_id is null;
