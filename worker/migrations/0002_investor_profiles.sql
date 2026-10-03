-- Cloudflare D1 migration 0002: investor profile (step 2). Additive only: no existing table or column is changed.
-- Apply with: npx wrangler d1 migrations apply ck-leads --remote
CREATE TABLE IF NOT EXISTS investor_profiles (
  lead_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  objective TEXT NOT NULL,
  property_type TEXT NOT NULL,
  risk_tolerance TEXT NOT NULL,
  holding_period TEXT NOT NULL,
  areas TEXT NOT NULL DEFAULT '[]'
);
