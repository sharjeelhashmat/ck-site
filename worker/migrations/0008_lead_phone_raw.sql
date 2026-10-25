-- Cloudflare D1 migration 0008. Apply with: npx wrangler d1 migrations apply ck-leads --remote
-- PR 2c item 3 (gap G04): with LEAD_STRICT "false" a phone that is not a valid international number is kept as typed
-- (control characters removed, at most 40 characters) in phone_raw, with phone left NULL and phone_invalid = 1. Only the
-- owner alert shows it ("Phone (unverified)"); lead replies never use it. Additive only: two new columns on leads, no
-- backfill. Same retention as the lead row itself (deleted with it, src/retention.ts).
ALTER TABLE leads ADD COLUMN phone_raw TEXT;
ALTER TABLE leads ADD COLUMN phone_invalid INTEGER NOT NULL DEFAULT 0;
