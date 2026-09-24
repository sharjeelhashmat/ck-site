-- Cloudflare D1 migration 0002. Apply with: npx wrangler d1 migrations apply ck-leads --remote
-- Standalone newsletter (single opt-in, owner decision 2026-09-24). Separate from leads: a subscriber is not a lead,
-- and unsubscribing here does not touch lead-reply suppression.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  subscribed_at TEXT NOT NULL,
  source TEXT,
  unsubscribed_at TEXT
);
