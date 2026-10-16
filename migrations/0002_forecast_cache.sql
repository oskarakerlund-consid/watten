-- Cached thunder forecasts from MET Norway, keyed by rounded position.
-- `hours` is a JSON array of { start, probability }. Times are UTC epoch milliseconds.
CREATE TABLE forecast_cache (
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  hours TEXT NOT NULL,
  expires_utc INTEGER NOT NULL,
  last_modified TEXT,
  fetched_utc INTEGER NOT NULL,
  PRIMARY KEY (lat, lon)
) STRICT;
