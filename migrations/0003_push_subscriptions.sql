-- Web Push subscriptions. Personal data: kept only while subscribed, deleted on unsubscribe or when the push service reports it gone.
-- `lat`/`lon` are rounded to two decimals, or NULL when the user has not shared a position. Times are UTC epoch milliseconds.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  zone TEXT NOT NULL,
  lat REAL,
  lon REAL,
  created_utc INTEGER NOT NULL
) STRICT;
