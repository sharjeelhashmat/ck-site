// Data retention (audit B4, owner decision 2026-10-17). Run daily by the cron in wrangler.toml ("17 1 * * *").
//   leads SPAM / TEST / DUPLICATE        deleted 30 days after created_at
//   all other leads                      deleted 24 months (730 days) after created_at
//   investor_profiles                    deleted once their lead no longer exists
//   events                               deleted after 12 months (365 days)
//   newsletter_subscribers               active subscribers kept while subscribed;
//                                        unsubscribe_reason_detail cleared 180 days after the feedback;
//                                        unsubscribed for over 24 months: the email is replaced by its SHA-256 hash
//                                        (kept as a suppression so the opt-out still holds) and the other personal
//                                        fields are cleared.
// One read (the rows to anonymise), then every change in one D1 batch (a batch is a single transaction).
import { sha256Hex } from './hash';

/** An anonymised newsletter row stores this prefix + the hex SHA-256 of the lower-cased address. */
export const SUBSCRIBER_HASH_PREFIX = 'sha256:';

export const RETENTION_DAYS = { quarantinedLead: 30, lead: 730, event: 365, feedbackDetail: 180, unsubscribed: 730 } as const;

/** At most this many newsletter rows are anonymised per run; the rest follow on the next days. */
const HASH_BATCH = 200;

const before = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

export interface RetentionResult {
  leads_quarantined: number;
  leads_expired: number;
  investor_profiles: number;
  events: number;
  feedback_details: number;
  subscribers_anonymised: number;
}

export async function runRetention(db: D1Database, now: Date): Promise<RetentionResult> {
  const toHash = (await db.prepare(
    `SELECT id, email FROM newsletter_subscribers
     WHERE unsubscribed_at IS NOT NULL AND unsubscribed_at < ?1 AND email NOT LIKE '${SUBSCRIBER_HASH_PREFIX}%' LIMIT ${HASH_BATCH}`,
  ).bind(before(now, RETENTION_DAYS.unsubscribed)).all<{ id: string; email: string }>()).results ?? [];

  const anonymise = await Promise.all(toHash.map(async (r) =>
    db.prepare(`UPDATE newsletter_subscribers SET email = ?1, source = NULL, unsubscribe_reason = NULL, unsubscribe_reason_detail = NULL,
      unsubscribe_feedback_at = NULL WHERE id = ?2`).bind(`${SUBSCRIBER_HASH_PREFIX}${await sha256Hex(r.email.trim().toLowerCase())}`, r.id)));

  const res = await db.batch([
    db.prepare("DELETE FROM leads WHERE status IN ('SPAM', 'TEST', 'DUPLICATE') AND created_at < ?1").bind(before(now, RETENTION_DAYS.quarantinedLead)),
    db.prepare('DELETE FROM leads WHERE created_at < ?1').bind(before(now, RETENTION_DAYS.lead)),
    db.prepare('DELETE FROM investor_profiles WHERE lead_id NOT IN (SELECT id FROM leads)'),
    db.prepare('DELETE FROM events WHERE created_at < ?1').bind(before(now, RETENTION_DAYS.event)),
    db.prepare('UPDATE newsletter_subscribers SET unsubscribe_reason_detail = NULL WHERE unsubscribe_reason_detail IS NOT NULL AND unsubscribe_feedback_at < ?1')
      .bind(before(now, RETENTION_DAYS.feedbackDetail)),
    ...anonymise,
  ]);
  const changes = (i: number) => res[i]?.meta.changes ?? 0;
  return {
    leads_quarantined: changes(0),
    leads_expired: changes(1),
    investor_profiles: changes(2),
    events: changes(3),
    feedback_details: changes(4),
    subscribers_anonymised: anonymise.reduce((n, _, i) => n + changes(5 + i), 0),
  };
}
