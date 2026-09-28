-- Apply after the existing Chess Burger migrations to support bounded live queries.
create index if not exists cb_presence_live_lat_lng_idx
  on public.cb_presence(latitude,longitude,seen_at desc)
  where gps_enabled = true;

create index if not exists cb_live_presence_recent_cbr_idx
  on public.cb_live_presence(cbr desc,seen_at desc);

create index if not exists cb_matches_active_white_lookup_idx
  on public.cb_matches(white_id) where status = 'active';

create index if not exists cb_matches_active_black_lookup_idx
  on public.cb_matches(black_id) where status = 'active';

create index if not exists cb_match_queue_open_control_seen_idx
  on public.cb_match_queue(control,seen_at)
  where match_id is null;
