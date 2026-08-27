CREATE TABLE IF NOT EXISTS daily_stats (
  day TEXT PRIMARY KEY,
  total INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS visitor_day_seen (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  PRIMARY KEY (day, visitor_hash)
);

CREATE TABLE IF NOT EXISTS province_stats (
  day TEXT NOT NULL,
  province TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, province)
);

CREATE TABLE IF NOT EXISTS visit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  ts INTEGER NOT NULL,
  visitor_hash TEXT NOT NULL,
  province TEXT NOT NULL,
  path TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visit_log_day_ts ON visit_log(day, ts DESC);
