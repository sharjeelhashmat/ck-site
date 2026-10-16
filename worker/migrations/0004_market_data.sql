-- Cloudflare D1 migration 0004. Apply with: npx wrangler d1 migrations apply ck-leads --remote
-- Market data (Part A, owner EXECUTE 2026-10-11). Aggregates only: written by the daily market-data-sync workflow from the
-- public DLD open data and the ADREC year-to-date feed; read by the Worker's GET /market/* routes. No project names, no
-- developer names, no raw transaction rows.

-- Residential sales per DLD area and month (trans_group_en = 'Sales' AND property_usage_en = 'Residential').
CREATE TABLE IF NOT EXISTS dld_area_month (
  area_en TEXT NOT NULL,
  month TEXT NOT NULL,                 -- YYYY-MM
  res_sales_value REAL NOT NULL,       -- AED, sum of actual_worth
  res_sales_count INTEGER NOT NULL,
  res_offplan_count INTEGER NOT NULL   -- reg_type_en contains "Off-Plan"
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dld_area_month_area_month ON dld_area_month (area_en, month);
CREATE INDEX IF NOT EXISTS idx_dld_area_month_month ON dld_area_month (month);

-- Emirate totals per month and transaction group (Sales, Mortgages, Gifts), all usages.
CREATE TABLE IF NOT EXISTS dld_month_totals (
  month TEXT NOT NULL,                 -- YYYY-MM
  trans_group TEXT NOT NULL,           -- trans_group_en
  value REAL NOT NULL,                 -- AED
  count INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dld_month_totals_month_group ON dld_month_totals (month, trans_group);
CREATE INDEX IF NOT EXISTS idx_dld_month_totals_month ON dld_month_totals (month);

-- Small derived figures: 'dld_projects' (project counts by area, no names) and 'adrec_ytd' (AED year to date).
CREATE TABLE IF NOT EXISTS market_stats (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('dld_projects', 'adrec_ytd')),
  payload_json TEXT NOT NULL,
  as_of TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_stats_source ON market_stats (source, fetched_at);

-- One row per sync run. dld_written = 1 when the DLD tables were replaced (the sanity guard passed).
CREATE TABLE IF NOT EXISTS market_sync_runs (
  run_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  rows_total INTEGER,
  rows_bad INTEGER,
  as_of TEXT,
  error TEXT,
  dld_written INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_market_sync_runs_started ON market_sync_runs (dld_written, started_at);

-- The workflow's last step inserts this run's ok flag here; the CHECK makes that insert, and so the job, fail when the
-- run was not ok. One small row per successful run.
CREATE TABLE IF NOT EXISTS market_sync_checks (
  run_id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL CHECK (ok = 1),
  checked_at TEXT NOT NULL
);
