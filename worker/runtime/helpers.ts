// Shared set-up for the PR 2c runtime tests (workerd, real D1 and KV). The older files keep their own copies.
import { env } from 'cloudflare:workers';
import { vi } from 'vitest';
import type { Env } from '../src/index';
import { templateHash, type Template } from '../src/templates';
import templatesJson from '../templates/lead-replies.v1.json';

export const TEMPLATES = (templatesJson as { templates: Template[] }).templates;
export const cf = env as unknown as Env;
export const ORIGIN = 'https://sharjeelhashmat.com';
export const STAGING = 'https://ck-site-staging.sharjeelhashmat.workers.dev';

// Rate limiters that never limit, so a test file can post more than 5 times a minute; runtime/rate-limit.test.ts uses the
// real bindings from wrangler.toml instead.
export const OPEN_LIMITER = { limit: async () => ({ success: true }) } as unknown as RateLimit;
export const OPEN_LIMITS = { RL_FORMS: OPEN_LIMITER, RL_UNSUB: OPEN_LIMITER, RL_FEEDBACK: OPEN_LIMITER, RL_READ: OPEN_LIMITER };

export const baseEnv = (over: Record<string, unknown> = {}): Env =>
  ({
    ...cf,
    ...OPEN_LIMITS,
    TURNSTILE_SECRET: 'test-secret',
    BREVO_API_KEY: 'brevo-test',
    RESEND_API_KEY: 're_test',
    EMAIL_PROVIDER: 'resend',
    UNSUB_SECRET: 'unsub-test-secret',
    SITE_URL: ORIGIN,
    WORKER_URL: 'https://ck-lead-worker.example.workers.dev',
    BOOKING_URL: 'https://cal.example.com/sh',
    AFFILIATION: 'Example Brokerage',
    FROM_LEADS_EMAIL: 'hello@mail.sharjeelhashmat.com',
    FROM_ALERTS_EMAIL: 'alerts@mail.sharjeelhashmat.com',
    FROM_NEWS_EMAIL: 'brief@news.sharjeelhashmat.com',
    REPLY_TO: 'hello@sharjeelhashmat.com',
    MAILBOX_CONFIRMED: 'yes',
    ALERT_EMAIL: 'owner@example.com',
    SLA_HOURS: '24',
    STAGING_ORIGIN: STAGING,
    ...over,
  }) as Env;

// Every channel on and every gate set.
export const LIVE = { OUTBOUND_REPLIES: 'on', OUTBOUND_NEWSLETTER: 'on', OUTBOUND_ALERTS: 'on', BRN: '12345', AGENCY_ORN: '67890' };

export function lead(over: Record<string, unknown> = {}) {
  return {
    name: 'Amira Khan', email: 'amira@example.com', phone: '+971501234567', country: 'AE',
    intent: 'invest', budget_band: 'over_5m', timeline: 'now', funding: 'cash',
    message: 'Yield-focused unit.', consent_contact: true, consent_nurture: false,
    utm_source: 'linkedin', landing_page: '/investment-approach', company_website: '',
    turnstile_token: 'ok', ...over,
  };
}

export async function approveAllInKv(e: Env) {
  const map: Record<string, string> = {};
  for (const t of TEMPLATES) map[t.id] = await templateHash(t);
  await e.KV.put('approved_templates', JSON.stringify(map));
}

export const rows = async (sql: string, ...b: unknown[]) => (await cf.DB.prepare(sql).bind(...b).all()).results as Record<string, unknown>[];

export async function clearDb() {
  for (const t of ['leads', 'messages', 'events', 'suppression', 'newsletter_subscribers', 'investor_profiles', 'outbox']) {
    await cf.DB.exec(`DELETE FROM ${t}`).catch(() => undefined);
  }
  await cf.KV.delete('approved_templates');
}

export interface Call { url: string; body: Record<string, unknown> | null; headers: Record<string, string> }

export interface Siteverify { success?: boolean; hostname?: string; action?: string }

/** Turnstile answers success for token "ok" with the given hostname and action (by default the route's own). */
export function stubFetch(calls: Call[], opts: { siteverify?: (token: string) => Siteverify; email?: (url: string, n: number) => Response | Promise<Response> } = {}) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    if (url.startsWith('https://challenges.cloudflare.com/turnstile/v0/siteverify')) {
      const form = init?.body as FormData;
      const token = String(form.get('response'));
      calls.push({ url, body: { response: token }, headers });
      const out = opts.siteverify?.(token) ?? { success: token === 'ok' || token.startsWith('ok:'), hostname: 'sharjeelhashmat.com', action: token.startsWith('ok:') ? token.slice(3) : undefined };
      return Response.json(out);
    }
    if (url === 'https://api.resend.com/emails' || url === 'https://api.brevo.com/v3/smtp/email') {
      calls.push({ url, body: JSON.parse(init?.body as string), headers });
      if (opts.email) return opts.email(url, calls.length);
      return url.includes('resend') ? Response.json({ id: `re-${calls.length}` }) : Response.json({ messageId: `m-${calls.length}` }, { status: 201 });
    }
    return new Response('unexpected outbound call: ' + url, { status: 500 });
  });
}

export const emails = (calls: Call[]) => calls.filter((c) => c.url.includes('resend.com') || c.url.includes('brevo.com'));
export const toOf = (c: Call) => {
  const b = c.body as { to: unknown[] };
  const t = b.to[0];
  return typeof t === 'string' ? t : (t as { email: string }).email;
};
