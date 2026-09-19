-- Cloudflare D1 migration 0001. Apply with: npx wrangler d1 migrations apply ck-leads --remote
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT, email TEXT, email_hash TEXT, phone TEXT, country TEXT,
  intent TEXT, budget_band TEXT, timeline TEXT, funding TEXT, message TEXT,
  consent_contact INTEGER NOT NULL, consent_nurture INTEGER NOT NULL DEFAULT 0,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  landing_page TEXT, referrer TEXT, source_type TEXT,
  status TEXT, reasons TEXT, escalation TEXT, score INTEGER, lane TEXT, alert_level TEXT,
  quarantined INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'NEW'
);
CREATE INDEX IF NOT EXISTS idx_leads_email_hash ON leads (email_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_lane ON leads (lane, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, created_at TEXT NOT NULL,
  template_id TEXT NOT NULL, template_hash TEXT NOT NULL, provider_id TEXT, outcome TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at);

CREATE TABLE IF NOT EXISTS suppression (
  email_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, reason TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, type TEXT NOT NULL, lead_id TEXT, detail TEXT
);
