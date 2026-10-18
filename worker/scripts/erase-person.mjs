#!/usr/bin/env node
// Erasure of one person's data (audit B4). PRINTS the SQL only; it never connects to D1. The owner reviews it, then runs:
//   node scripts/erase-person.mjs person@example.com > erase.sql
//   npx wrangler d1 execute ck-leads --remote --file erase.sql      (one --file import is atomic)
// The address is validated strictly (letters, digits and . _ % + - only) and lower-cased, so it can never break out of
// its SQL string; leads are matched by the same SHA-256 the Worker stores in leads.email_hash.
// Tables: leads (and, through the lead ids, investor_profiles, events and messages) are deleted; the newsletter row,
// if any, keeps only the address's hash, marked unsubscribed, so the opt-out still holds (src/retention.ts does the
// same after 24 months). The lead-reply suppression table already holds hashes only and is kept for the same reason.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*\.[a-z]{2,63}$/;
export const SUBSCRIBER_HASH_PREFIX = 'sha256:';

/** @param {string} input @param {Date} [now] @returns {string} */
export function eraseSql(input, now = new Date()) {
  const email = String(input ?? '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new Error('not a valid email address (letters, digits and . _ % + - only)');
  const hash = createHash('sha256').update(email).digest('hex');
  const at = now.toISOString();
  const leadIds = `SELECT id FROM leads WHERE email_hash = '${hash}' OR email = '${email}'`;
  const subscriberIds = `SELECT id FROM newsletter_subscribers WHERE email = '${email}'`;
  return [
    `-- Erasure for one person, generated ${at}. Review before running; nothing has been executed.`,
    `DELETE FROM investor_profiles WHERE lead_id IN (${leadIds});`,
    `DELETE FROM events WHERE lead_id IN (${leadIds});`,
    `DELETE FROM messages WHERE lead_id IN (${leadIds}) OR lead_id IN (${subscriberIds});`,
    `DELETE FROM leads WHERE email_hash = '${hash}' OR email = '${email}';`,
    `UPDATE newsletter_subscribers SET email = '${SUBSCRIBER_HASH_PREFIX}${hash}', source = NULL, unsubscribe_reason = NULL, unsubscribe_reason_detail = NULL, unsubscribe_feedback_at = NULL, unsubscribed_at = COALESCE(unsubscribed_at, '${at}') WHERE email = '${email}';`,
    '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.argv.length !== 3) throw new Error('usage: node scripts/erase-person.mjs <email>');
    process.stdout.write(eraseSql(process.argv[2]));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
  }
}
