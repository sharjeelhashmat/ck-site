-- Cloudflare D1 migration 0006. Apply with: npx wrangler d1 migrations apply ck-leads --remote
-- One row per daily retention run (PR 2b item 4b, audit F8): when it ran, how many rows each rule removed or cleared,
-- and whether it succeeded. Counts only, no personal data; the error text is redacted and capped (src/retention.ts).
-- No HTTP route exposes it (owner decision G08, 2026-10-19): the private GitHub readiness workflow (PR 2c) reads it.
-- The retention job itself keeps 400 days of rows.
CREATE TABLE IF NOT EXISTS retention_runs (
  run_at TEXT NOT NULL,
  leads INT NOT NULL DEFAULT 0,
  events INT NOT NULL DEFAULT 0,
  feedback INT NOT NULL DEFAULT 0,
  newsletter INT NOT NULL DEFAULT 0,
  messages INT NOT NULL DEFAULT 0,
  ok INT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_retention_runs_run_at ON retention_runs (run_at);
