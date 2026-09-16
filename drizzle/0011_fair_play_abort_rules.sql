-- Fair-play tracking for online matches.
CREATE TABLE IF NOT EXISTS arena_abort_events (
  match_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS arena_abort_events_user_created
  ON arena_abort_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS arena_fair_play (
  user_id TEXT PRIMARY KEY,
  total_aborts INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  cooldown_notified_at INTEGER NOT NULL DEFAULT 0,
  clean_match_streak INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);