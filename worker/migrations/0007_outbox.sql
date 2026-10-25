-- Cloudflare D1 migration 0007. Apply with: npx wrangler d1 migrations apply ck-leads --remote
-- PR 2c item 1 (gaps G01, G02, G06): the outbox. One row per message the Worker decides about (lead reply, newsletter
-- welcome, owner alert). A row is claimed BEFORE the provider is called, with one INSERT that is conditional on the
-- daily cap and that does nothing when dedupe_key already exists; no row back means "do not send". The row then
-- carries the receipt: status sent with the provider id and sent_at, or failed with an error code (never a payload).
-- dedupe_key is kind + ':' + a stable subject: lead_reply:<lead id>:<template id>, newsletter_welcome:<sha256 of the
-- address>:<list>, owner_alert:<type>:<lead id>. No email address, phone or name in any column. For a skipped row,
-- error holds the reason code (suppressed, daily_cap, duplicate, quarantined, blocked, ...).
-- status: claimed | sent | failed | skipped. No automatic resend of a failed row: the readiness workflow reports it.
-- The messages table stays as the send history; the outbox is the source of truth for "was it sent".
-- Kept 730 days (src/retention.ts), which also counts the purge in the new retention_runs.outbox column.
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  lead_id TEXT,
  template_id TEXT,
  template_hash TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_id TEXT,
  error TEXT,
  sent_at TEXT,
  attempts INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_outbox_kind_created ON outbox (kind, created_at);
ALTER TABLE retention_runs ADD COLUMN outbox INT NOT NULL DEFAULT 0;
