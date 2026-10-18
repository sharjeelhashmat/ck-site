-- Cloudflare D1 migration 0005. Apply with: npx wrangler d1 migrations apply ck-leads --remote
-- Precomputed /market/* response bodies (audit B1). The market-data-sync import writes them in the same atomic --file
-- import as the data they are computed from, so a request reads one row; the Worker computes live only when a row is
-- missing. Keys: "areas:<period>", "area:<period>:<area_en>", "launches". Aggregates only, no personal data.
CREATE TABLE IF NOT EXISTS market_cache (
  key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  computed_at TEXT NOT NULL
);
