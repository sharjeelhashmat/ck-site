// The outbox (PR 2c item 1; gaps G01, G02, G06; migration 0007). One mechanism for every message the Worker sends:
//   claim  one INSERT ... SELECT ... WHERE <cap> AND <guard> ON CONFLICT(dedupe_key) DO NOTHING RETURNING id.
//          A row back = this request owns the send. No row = someone already did (same dedupe_key), the daily cap is
//          reached, or (lead replies) the address already had a reply in the last 24 h. SQLite runs the statement as one
//          unit, so two requests at once can never both claim past the cap or for the same subject.
//   send   only after a claim, with the row id as the provider's idempotency key.
//   mark   sent (provider id, sent_at) or failed (an error code, never the payload). A row left "claimed" (the Worker
//          stopped mid-send) and a "failed" row are reported by the readiness workflow; nothing is resent automatically.
// No email address, phone or name in any outbox column.

export type OutboxKind = 'lead_reply' | 'newsletter_welcome' | 'owner_alert';
const KINDS: readonly OutboxKind[] = ['lead_reply', 'newsletter_welcome', 'owner_alert'];

/** Skip reasons that mean "no reply was due" (the readiness reply check accepts these, and only these). */
export const REPLY_SKIP_OK = ['suppressed', 'daily_cap', 'duplicate', 'quarantined'] as const;

export const NEWSLETTER_LIST = 'monthly';

export const dedupeKey = {
  leadReply: (leadId: string, templateId: string | null) => `lead_reply:${leadId}:${templateId ?? 'none'}`,
  welcome: (emailHash: string, list = NEWSLETTER_LIST) => `newsletter_welcome:${emailHash}:${list}`,
  leadAlert: (leadId: string) => `owner_alert:lead:${leadId}`,
  notStoredAlert: (leadId: string) => `owner_alert:not_stored:${leadId}`,
  profileAlert: (leadId: string) => `owner_alert:profile:${leadId}`,
};

export interface OutboxRow {
  id: string;
  dedupe_key: string;
  kind: OutboxKind;
  lead_id: string | null;
  template_id: string | null;
  template_hash: string | null;
  created_at: string;
}

export interface ClaimGuard {
  /** Daily cap: rows of these kinds, claimed or sent since `since`, must be fewer than `cap`. */
  capKinds?: OutboxKind[];
  cap?: number;
  since?: string;
  /** Lead replies: no other lead with this email hash since `since` has a reply claimed, sent or failed. */
  recipient?: { emailHash: string; since: string };
}

export type ClaimResult = { claimed: true; id: string } | { claimed: false; reason: 'duplicate' | 'recipient' | 'daily_cap' };

export interface Outbox {
  claim(row: OutboxRow, guard?: ClaimGuard): Promise<ClaimResult>;
  /** A decision not to send, with its reason. Does nothing when the dedupe_key already has a row. */
  skip(row: OutboxRow, reason: string): Promise<void>;
  sent(id: string, providerId: string, at: string): Promise<void>;
  failed(id: string, code: string): Promise<void>;
}

/** The error code stored for a failed send: a fixed code, never a message that could carry a payload. */
export function sendErrorCode(e: unknown): string {
  if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) return 'timeout';
  const m = e instanceof Error ? e.message : '';
  return /^(email_provider_\d{3}|no_email_key|no_sender|no_provider_id)$/.test(m) ? m : 'send_error';
}

export type SendOutcome =
  | { outcome: 'sent'; id: string; provider_id: string }
  | { outcome: 'failed'; id: string; code: string }
  | { outcome: 'skipped'; reason: 'duplicate' | 'recipient' | 'daily_cap' };

/** Claim, then send with the row id as idempotency key, then record the receipt. A failed mark leaves the row claimed. */
export async function sendOnce(
  ob: Outbox, row: OutboxRow, guard: ClaimGuard | undefined, now: () => Date,
  send: (idempotencyKey: string) => Promise<{ provider_id: string }>,
): Promise<SendOutcome> {
  const c = await ob.claim(row, guard);
  if (!c.claimed) return { outcome: 'skipped', reason: c.reason };
  let res: { provider_id: string };
  try {
    res = await send(c.id);
  } catch (e) {
    const code = sendErrorCode(e);
    await ob.failed(c.id, code).catch(() => undefined);
    return { outcome: 'failed', id: c.id, code };
  }
  await ob.sent(c.id, res.provider_id, now().toISOString()).catch(() => undefined);
  return { outcome: 'sent', id: c.id, provider_id: res.provider_id };
}

// D1, through the few methods used here (D1Database satisfies this; the unit tests use an in-memory twin in test/helpers.ts).
interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface SqlDb { prepare(sql: string): Stmt }

const ACTIVE = "('claimed', 'sent')";
// A failed send may still have reached the provider (a timeout): it blocks another automatic reply to the address too.
const RECIPIENT = `EXISTS (SELECT 1 FROM leads l JOIN outbox o ON o.lead_id = l.id
  WHERE l.email_hash = ?10 AND l.created_at >= ?11 AND l.id != ?4 AND o.kind = 'lead_reply' AND o.status IN ('claimed', 'sent', 'failed'))`;

export function d1Outbox(db: SqlDb): Outbox {
  return {
    async claim(row, guard = {}) {
      const kinds = (guard.capKinds ?? []).filter((k) => KINDS.includes(k));
      const capped = kinds.length > 0 && guard.cap !== undefined && guard.since !== undefined;
      const cap = capped
        ? `(SELECT COUNT(*) FROM outbox WHERE kind IN (${kinds.map((k) => `'${k}'`).join(', ')}) AND status IN ${ACTIVE} AND created_at >= ?8) < ?9`
        : '1';
      const recipient = guard.recipient ? `NOT ${RECIPIENT}` : '1';
      const binds = [row.id, row.dedupe_key, row.kind, row.lead_id, row.template_id, row.template_hash, row.created_at,
        guard.since ?? '', guard.cap ?? 0, guard.recipient?.emailHash ?? '', guard.recipient?.since ?? ''];
      // SQLite counts parameters up to the highest number used (gaps allowed): bind exactly that many.
      const upTo = guard.recipient ? 11 : capped ? 9 : 7;
      const got = await db.prepare(
        `INSERT INTO outbox (id, dedupe_key, kind, lead_id, template_id, template_hash, created_at, status, attempts)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'claimed', 1 WHERE ${cap} AND ${recipient}
         ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`,
      ).bind(...binds.slice(0, upTo)).first<{ id: string }>();
      if (got) return { claimed: true, id: got.id };
      // Why not (advisory only; the decision above was atomic).
      const why = await db.prepare(
        `SELECT EXISTS (SELECT 1 FROM outbox WHERE dedupe_key = ?2) AS dup, ${guard.recipient ? RECIPIENT : '0'} AS rcpt`,
      ).bind(...binds.slice(0, guard.recipient ? 11 : 2)).first<{ dup: number; rcpt: number }>();
      if (why?.dup) return { claimed: false, reason: 'duplicate' };
      if (why?.rcpt) return { claimed: false, reason: 'recipient' };
      return { claimed: false, reason: 'daily_cap' };
    },
    async skip(row, reason) {
      await db.prepare(
        `INSERT INTO outbox (id, dedupe_key, kind, lead_id, template_id, template_hash, created_at, status, error, attempts)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'skipped', ?8, 0) ON CONFLICT(dedupe_key) DO NOTHING`,
      ).bind(row.id, row.dedupe_key, row.kind, row.lead_id, row.template_id, row.template_hash, row.created_at, reason).run();
    },
    async sent(id, providerId, at) {
      await db.prepare("UPDATE outbox SET status = 'sent', provider_id = ?2, sent_at = ?3, error = NULL WHERE id = ?1 AND status = 'claimed'").bind(id, providerId, at).run();
    },
    async failed(id, code) {
      await db.prepare("UPDATE outbox SET status = 'failed', error = ?2 WHERE id = ?1 AND status = 'claimed'").bind(id, code).run();
    },
  };
}
