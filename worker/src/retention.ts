// Data retention (audit B4, owner decision 2026-10-17). Run daily by the cron in wrangler.toml ("17 1 * * *").
//   leads SPAM / TEST / DUPLICATE        deleted 30 days after created_at
//   all other leads                      deleted 24 months (730 days) after created_at
//   investor_profiles                    deleted once their lead no longer exists
//   events                               deleted after 12 months (365 days)
//   messages (send log)                  deleted after 24 months (730 days)
//   newsletter_subscribers               active subscribers kept while subscribed;
//                                        unsubscribe_reason_detail cleared 180 days after the feedback;
//                                        unsubscribed for over 24 months: the email is replaced by its SHA-256 hash
//                                        (kept as a suppression so the opt-out still holds) and the other personal
//                                        fields are cleared.
// One read (the rows to anonymise), then every change in one D1 batch (a batch is a single transaction).
// Every run, successful or not, then writes one row to retention_runs (migration 0006; audit F8): counts only, kept 400 days,
// read by the private GitHub readiness workflow, never by an HTTP route (owner decision G08).
import { sha256Hex } from './hash';
import { safeError } from './log';

/** An anonymised newsletter row stores this prefix + the hex SHA-256 of the lower-cased address. */
export const SUBSCRIBER_HASH_PREFIX = 'sha256:';

export const RETENTION_DAYS = { quarantinedLead: 30, lead: 730, event: 365, message: 730, feedbackDetail: 180, unsubscribed: 730 } as const;

/** At most this many newsletter rows are anonymised per run; the rest follow on the next days. */
const HASH_BATCH = 200;

const before = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

export interface RetentionResult {
  leads_quarantined: number;
  leads_expired: number;
  investor_profiles: number;
  events: number;
  messages: number;
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
    db.prepare('DELETE FROM messages WHERE created_at < ?1').bind(before(now, RETENTION_DAYS.message)),
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
    messages: changes(4),
    feedback_details: changes(5),
    subscribers_anonymised: anonymise.reduce((n, _, i) => n + changes(6 + i), 0),
  };
}

/** retention_runs rows older than this are removed by the run that records the next one. */
export const RETENTION_RUNS_DAYS = 400;

async function recordRun(db: D1Database, now: Date, r: RetentionResult | null, error: string | null): Promise<void> {
  await db.batch([
    db.prepare('INSERT INTO retention_runs (run_at, leads, events, feedback, newsletter, messages, ok, error) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
      .bind(now.toISOString(), r ? r.leads_quarantined + r.leads_expired : 0, r?.events ?? 0, r?.feedback_details ?? 0, r?.subscribers_anonymised ?? 0,
        r?.messages ?? 0, r ? 1 : 0, error),
    db.prepare('DELETE FROM retention_runs WHERE run_at < ?1').bind(before(now, RETENTION_RUNS_DAYS)),
  ]);
}

/** The daily job: runRetention, then one retention_runs row (ok 1 with the counts, or ok 0 with the redacted error). */
export async function runAndRecordRetention(db: D1Database, now: Date): Promise<RetentionResult> {
  let r: RetentionResult;
  try {
    r = await runRetention(db, now);
  } catch (e) {
    // Record the failure, then fail the run as before (a failed record must not hide the original error).
    await recordRun(db, now, null, safeError(e)).catch(() => undefined);
    throw e;
  }
  await recordRun(db, now, r, null);
  return r;
}
