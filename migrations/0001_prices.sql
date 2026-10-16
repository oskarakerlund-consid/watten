-- Prices per zone and interval. Times are UTC epoch milliseconds; an interval covers [start_utc, end_utc).
CREATE TABLE prices (
  zone TEXT NOT NULL,
  start_utc INTEGER NOT NULL,
  end_utc INTEGER NOT NULL,
  sek_per_kwh REAL NOT NULL,
  PRIMARY KEY (zone, start_utc)
) STRICT;
