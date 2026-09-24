-- Cloudflare D1 migration 0003. Apply with: npx wrangler d1 migrations apply ck-leads --remote
-- Optional, skippable feedback shown after a newsletter unsubscribe has already happened. Additive only: nullable
-- columns, no backfill. The unsubscribe itself never reads or writes these.
ALTER TABLE newsletter_subscribers ADD COLUMN unsubscribe_reason TEXT;
ALTER TABLE newsletter_subscribers ADD COLUMN unsubscribe_reason_detail TEXT;
ALTER TABLE newsletter_subscribers ADD COLUMN unsubscribe_feedback_at TEXT;
