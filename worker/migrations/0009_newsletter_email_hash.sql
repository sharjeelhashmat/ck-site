-- Cloudflare D1 migration 0009. Apply with: npx wrangler d1 migrations apply ck-leads --remote
-- PR 2c item 8a: unsubscribe links no longer carry the address. The newsletter link's token names the subscriber by
-- the SHA-256 of the address, so the row needs that hash to be found. Written on every new signup; rows from before
-- this migration have NULL here and are still found by the legacy link format (the address itself) until those links
-- expire, or by a later job that sets the hash before it sends them anything. Additive only: one nullable column and
-- an index, no backfill.
ALTER TABLE newsletter_subscribers ADD COLUMN email_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email_hash ON newsletter_subscribers (email_hash);
