PRAGMA journal_mode = WAL;

-- Rolls
CREATE TABLE IF NOT EXISTS roll_sessions (
  message_id TEXT PRIMARY KEY,
  guild_id   TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  item_name  TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_closed  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS roll_entries (
  message_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  user_name  TEXT NOT NULL,
  roll_value INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

-- Polls (boss votes)
CREATE TABLE IF NOT EXISTS polls (
  poll_id    TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  guild_id   TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  mode       TEXT NOT NULL,           -- 'single' | 'multi'
  max_votes  INTEGER NOT NULL,
  ends_at    INTEGER,                 -- nullable
  is_closed  INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_options (
  poll_id   TEXT NOT NULL,
  option_id TEXT NOT NULL,
  label     TEXT NOT NULL,
  PRIMARY KEY (poll_id, option_id)
);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id   TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  user_name TEXT NOT NULL,
  option_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, user_id, option_id)
);

-- Events (RSVP)
CREATE TABLE IF NOT EXISTS events (
  event_id   TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  guild_id   TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  start_at   INTEGER NOT NULL,        -- unix ms
  duration_mins INTEGER,
  notes      TEXT,
  is_locked  INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  user_name  TEXT NOT NULL,
  status     TEXT NOT NULL,           -- 'tank'|'healer'|'dps'|'cant'
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
