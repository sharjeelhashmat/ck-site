import { readFileSync } from 'node:fs';
import { readConfig, type Config } from '../src/config';
import { sha256Hex } from '../src/hash';
import type { AlertPayload, Deps, LeadRow, OutboundMessage, PipelineCtx } from '../src/pipeline';
import { templateHash, type Template } from '../src/templates';

export const TEMPLATES = (JSON.parse(readFileSync(new URL('../templates/lead-replies.v1.json', import.meta.url), 'utf8')) as { templates: Template[] }).templates;

export const goodEnv: Record<string, string> = {
  OUTBOUND: 'on', BRN: '12345', AFFILIATION: 'Royals Field Properties',
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

export interface Fake {
  deps: Deps;
  sent: OutboundMessage[];
  rows: LeadRow[];
  alerts: AlertPayload[];
  events: string[];
  suppressed: Set<string>;
  state: { sentToday: number; duplicate: boolean };
}

export function makeFake(now = new Date('2026-09-20T08:00:00Z')): Fake {
  const f: Fake = {
    sent: [], rows: [], alerts: [], events: [], suppressed: new Set(), state: { sentToday: 0, duplicate: false },
    deps: undefined as unknown as Deps,
  };
  let n = 0;
  f.deps = {
    now: () => now,
    uuid: () => `id-${++n}`,
    hash: sha256Hex,
    findRecentByEmailHash: async () => f.state.duplicate,
    isSuppressed: async (h) => f.suppressed.has(h),
    countSentSince: async () => f.state.sentToday,
    insertLead: async (r) => { f.rows.push(r); },
    logMessage: async () => { f.state.sentToday += 1; },
    logEvent: async (type, _id, detail) => { f.events.push(`${type}:${detail}`); },
    send: async (m) => { f.sent.push(m); return { provider_id: 'p1' }; },
    alertOwner: async (p) => { f.alerts.push(p); },
  };
  return f;
}

export async function ctx(env: Record<string, string> = goodEnv, approved?: Record<string, string>): Promise<PipelineCtx> {
  const config: Config = readConfig(env);
  return { config, templates: TEMPLATES, approved: approved ?? (await approveAll()), unsubSecret: env.UNSUB_SECRET };
}
