import { readFileSync } from 'node:fs';
import { readConfig, type Config } from '../src/config';
import { sha256Hex } from '../src/hash';
import type { AlertPayload, Deps, LeadRow, OutboundMessage, PipelineCtx } from '../src/pipeline';
import { templateHash, type Template } from '../src/templates';
import type { ClaimGuard, Outbox, OutboxRow } from '../src/outbox';

export const TEMPLATES = (JSON.parse(readFileSync(new URL('../templates/lead-replies.v1.json', import.meta.url), 'utf8')) as { templates: Template[] }).templates;

export const goodEnv: Record<string, string> = {
  OUTBOUND_REPLIES: 'on', OUTBOUND_NEWSLETTER: 'on', OUTBOUND_ALERTS: 'on', BRN: '12345', AFFILIATION: 'Example Brokerage',
  BOOKING_URL: 'https://cal.example.com/sh', SITE_URL: 'https://sharjeelhashmat.com', WORKER_URL: 'https://api.sharjeelhashmat.com',
  SLA_HOURS: '24', ALERT_EMAIL: 'hello@sharjeelhashmat.com', BREVO_API_KEY: 'k', UNSUB_SECRET: 's',
  FROM_LEADS_EMAIL: 'hello@mail.sharjeelhashmat.com', FROM_ALERTS_EMAIL: 'alerts@mail.sharjeelhashmat.com',
  REPLY_TO: 'hello@sharjeelhashmat.com', MAILBOX_CONFIRMED: 'yes',
};

export async function approveAll(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of TEMPLATES) out[t.id] = await templateHash(t);
  return out;
}

export function baseLead(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Amira Khan', email: 'amira@example.com', phone: '+971 50 123 4567', country: 'AE',
    intent: 'invest', budget_band: 'over_5m', timeline: 'now', funding: 'cash',
    message: 'Looking for a yield-focused unit.', consent_contact: true, consent_nurture: false,
    utm_source: 'linkedin', landing_page: '/investment-approach', company_website: '', ...over,
  };
}

// An in-memory twin of the D1 outbox (src/outbox.ts d1Outbox) with the same decisions: unique dedupe_key, the daily cap
// over claimed and sent rows, and the 24 h recipient guard. `extraToday` stands for rows sent earlier today.
export interface MemOutbox extends Outbox {
  rows: Array<OutboxRow & { status: string; provider_id: string | null; error: string | null; sent_at: string | null }>;
  extraToday: number;
}
export function memOutbox(leadEmailHash: (leadId: string) => string | undefined = () => undefined): MemOutbox {
  const ob: MemOutbox = {
    rows: [], extraToday: 0,
    async claim(row: OutboxRow, g: ClaimGuard = {}) {
      if (ob.rows.some((x) => x.dedupe_key === row.dedupe_key)) return { claimed: false, reason: 'duplicate' };
      if (g.recipient && ob.rows.some((x) => x.kind === 'lead_reply' && x.lead_id !== row.lead_id && ['claimed', 'sent', 'failed'].includes(x.status)
        && x.lead_id !== null && leadEmailHash(x.lead_id) === g.recipient!.emailHash)) return { claimed: false, reason: 'recipient' };
      if (g.capKinds && g.cap !== undefined && g.since !== undefined) {
        const n = ob.extraToday + ob.rows.filter((x) => g.capKinds!.includes(x.kind) && ['claimed', 'sent'].includes(x.status) && x.created_at >= g.since!).length;
        if (n >= g.cap) return { claimed: false, reason: 'daily_cap' };
      }
      ob.rows.push({ ...row, status: 'claimed', provider_id: null, error: null, sent_at: null });
      return { claimed: true, id: row.id };
    },
    async skip(row: OutboxRow, reason: string) {
      if (!ob.rows.some((x) => x.dedupe_key === row.dedupe_key)) ob.rows.push({ ...row, status: 'skipped', provider_id: null, error: reason, sent_at: null });
    },
    async sent(id: string, providerId: string, at: string) {
      const x = ob.rows.find((y) => y.id === id && y.status === 'claimed');
      if (x) Object.assign(x, { status: 'sent', provider_id: providerId, sent_at: at });
    },
    async failed(id: string, code: string) {
      const x = ob.rows.find((y) => y.id === id && y.status === 'claimed');
      if (x) Object.assign(x, { status: 'failed', error: code });
    },
  };
  return ob;
}

export interface Fake {
  deps: Deps;
  sent: OutboundMessage[];
  rows: LeadRow[];
  alerts: AlertPayload[];
  events: string[];
  suppressed: Set<string>;
  outbox: MemOutbox;
  state: { duplicate: boolean };
}

export function makeFake(now = new Date('2026-09-20T08:00:00Z')): Fake {
  const f: Fake = {
    sent: [], rows: [], alerts: [], events: [], suppressed: new Set(), state: { duplicate: false },
    outbox: memOutbox((id) => f.rows.find((r) => r.id === id)?.email_hash),
    deps: undefined as unknown as Deps,
  };
  let n = 0;
  f.deps = {
    now: () => now,
    uuid: () => `id-${++n}`,
    hash: sha256Hex,
    findRecentByEmailHash: async () => f.state.duplicate,
    isSuppressed: async (h) => f.suppressed.has(h),
    insertLead: async (r) => { f.rows.push(r); },
    logMessage: async () => {},
    logEvent: async (type, _id, detail) => { f.events.push(`${type}:${detail}`); },
    outbox: f.outbox,
    send: async (m) => { f.sent.push(m); return { provider_id: 'p1' }; },
    alertOwner: async (p) => { f.alerts.push(p); return { provider_id: 'a1' }; },
  };
  return f;
}

export async function ctx(env: Record<string, string> = goodEnv, approved?: Record<string, string>): Promise<PipelineCtx> {
  const config: Config = readConfig(env);
  return { config, templates: TEMPLATES, approved: approved ?? (await approveAll()), unsubSecret: env.UNSUB_SECRET };
}
