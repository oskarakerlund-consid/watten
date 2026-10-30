-- Alerts sent per subscription, so the same alert is not sent again on the next cron run.
-- `kind` is 'cheap', 'expensive' or 'thunder'; `start_utc` is the start of the period alerted about.
-- Rows are deleted with their subscription, and old rows by the alert job. Times are UTC epoch milliseconds.
CREATE TABLE notifications_sent (
  endpoint TEXT NOT NULL REFERENCES push_subscriptions (endpoint) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  start_utc INTEGER NOT NULL,
  sent_utc INTEGER NOT NULL,
  PRIMARY KEY (endpoint, kind, start_utc)
) STRICT;
