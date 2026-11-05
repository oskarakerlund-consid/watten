import type { Alert, AlertKind, SentAlert } from "../domain/alerts";

interface SentRow {
  endpoint: string;
  kind: AlertKind;
  start_utc: number;
}

/** Alerts sent for periods starting at or after `since`, grouped by subscription endpoint. */
export async function loadSentAlerts(db: D1Database, since: number): Promise<Map<string, SentAlert[]>> {
  const { results } = await db
    .prepare("SELECT endpoint, kind, start_utc FROM notifications_sent WHERE start_utc >= ?1")
    .bind(since)
    .all<SentRow>();
  const byEndpoint = new Map<string, SentAlert[]>();
  for (const row of results) {
    const list = byEndpoint.get(row.endpoint) ?? [];
    list.push({ kind: row.kind, start: row.start_utc });
    byEndpoint.set(row.endpoint, list);
  }
  return byEndpoint;
}

/** Records an alert as sent. */
export async function recordSent(db: D1Database, endpoint: string, alert: Alert, now: number): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO notifications_sent (endpoint, kind, start_utc, sent_utc) VALUES (?1, ?2, ?3, ?4)")
    .bind(endpoint, alert.kind, alert.start, now)
    .run();
}

/** Deletes records of alerts for periods that started before `cutoff`. */
export async function deleteSentBefore(db: D1Database, cutoff: number): Promise<void> {
  await db.prepare("DELETE FROM notifications_sent WHERE start_utc < ?1").bind(cutoff).run();
}
