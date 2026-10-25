import { readConfig, type Config } from './config';
import { sha256Hex } from './hash';
import { subscribe, unsubscribeFeedbackForm, validateFeedback, type NewsletterDeps } from './newsletter';
import { processLead, type AlertPayload, type Deps, type LeadRow } from './pipeline';
import { handleMarket } from './market';
import { MAX_PROFILE_BODY, saveProfile, type ProfileDeps } from './profile';
import { sendEmail } from './send';
import templatesJson from '../templates/lead-replies.v1.json';
import type { Template } from './templates';
import { verifyNewsletterToken, verifyUnsubToken } from './unsub';
import { runAndRecordRetention, SUBSCRIBER_HASH_PREFIX } from './retention';
import { safeError } from './log';
import { MAX_BODY, readBody, utf8 } from './body';
import { TURNSTILE_ACTIONS, turnstileHosts, verifyTurnstile } from './turnstile';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  TURNSTILE_SECRET: string;
  BREVO_API_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_PROVIDER?: string;
  UNSUB_SECRET?: string;
  SCORING_JSON?: string;
  OUTBOUND?: string;
  BRN?: string;
  AFFILIATION?: string;
  LEAD_STRICT?: string;
  BOOKING_URL?: string;
  SITE_URL?: string;
  WORKER_URL?: string;
  SLA_HOURS?: string;
  FROM_LEADS_EMAIL?: string;
  FROM_LEADS_NAME?: string;
  FROM_ALERTS_EMAIL?: string;
  FROM_ALERTS_NAME?: string;
  FROM_NEWS_EMAIL?: string;
  FROM_NEWS_NAME?: string;
  REPLY_TO?: string;
  MAILBOX_CONFIRMED?: string;
  ALERT_EMAIL?: string;
  DAILY_SEND_CAP?: string;
  EXTRA_ORIGINS?: string;
  STAGING_ORIGIN?: string;
  ALLOW_TEST_TURNSTILE?: string;
}

const TEMPLATES = (templatesJson as { templates: Template[] }).templates;

// KV unavailable or the value unreadable: no template counts as approved, so nothing is sent (fail closed).
async function approvedTemplates(env: Env): Promise<Record<string, string>> {
  try {
    const v = await env.KV.get('approved_templates', 'json');
    return (v && typeof v === 'object' ? v : {}) as Record<string, string>;
  } catch {
    return {};
  }
}

function allowedOrigins(siteUrl: string, extra: string[] = []): string[] {
  try {
    const u = new URL(siteUrl);
    const bare = u.hostname.replace(/^www\./, '');
    return [`https://${bare}`, `https://www.${bare}`, ...extra];
  } catch {
    return [...extra];
  }
}

function json(body: unknown, status: number, origin?: string): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['vary'] = 'origin';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function preflight(corsOrigin: string | undefined): Response {
  return new Response(null, {
    status: 204,
    headers: corsOrigin
      ? { 'access-control-allow-origin': corsOrigin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' }
      : {},
  });
}

// Every page and plain-text answer the Worker serves to a browser (audit item 7): nothing loads, nothing frames it,
// forms post only back to the Worker, and no referrer leaves it.
export const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
const PAGE_SECURITY = { 'content-security-policy': PAGE_CSP, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' };

function page(status: number, title: string, message: string, extra = ''): Response {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><main style="font:16px system-ui;margin:3rem auto;max-width:28rem;padding:0 1rem"><p>${message}</p>${extra}</main>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...PAGE_SECURITY },
  });
}

function plain(status: number, text: string): Response {
  return new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...PAGE_SECURITY } });
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// GET on an unsubscribe link changes nothing (link scanners and previews open it): it shows one button that POSTs back to
// the same URL. Mail clients that support RFC 8058 POST to it directly (List-Unsubscribe-Post).
function confirmUnsubscribe(action: string, question: string): Response {
  const button = 'font:inherit;padding:.5rem 1.25rem;border:1px solid #333;border-radius:4px;background:#fff;color:#111;cursor:pointer';
  return page(200, 'Unsubscribe', question, `<form method="post" action="${attr(action)}"><button type="submit" style="${button}">Unsubscribe</button></form>`);
}

/** POST bodies on the unsubscribe routes carry nothing we need ("List-Unsubscribe=One-Click" or an empty form): capped and dropped. */
async function bodyTooLarge(req: Request): Promise<boolean> {
  return (await readBody(req, MAX_BODY)) === null;
}

/** A JSON body within the limit, or the 413 / 400 answer (with the route's CORS header) to return instead. */
async function jsonBody(req: Request, max: number, corsOrigin: string | undefined): Promise<{ raw: unknown } | { res: Response }> {
  const bytes = await readBody(req, max);
  if (!bytes) return { res: json({ ok: false, error: 'too_large' }, 413, corsOrigin) };
  try { return { raw: JSON.parse(utf8(bytes)) }; } catch { return { res: json({ ok: false, error: 'invalid_input', field: 'body' }, 400, corsOrigin) }; }
}

// Turnstile (src/turnstile.ts): re-exported for the runtime tests.
export { TURNSTILE_TEST_SECRETS, verifyTurnstile } from './turnstile';

/** The route's Turnstile check; a failure logs its reason code only (never the token). */
async function human(req: Request, env: Env, cfg: Config, raw: unknown, action: string): Promise<boolean> {
  const token = (raw as Record<string, unknown> | null)?.turnstile_token;
  const v = await verifyTurnstile(env.TURNSTILE_SECRET, token, req.headers.get('cf-connecting-ip'), {
    hosts: turnstileHosts(cfg.siteUrl, cfg.stagingOrigin), action, allowTest: env.ALLOW_TEST_TURNSTILE === 'yes',
  });
  if (!v.ok) console.warn('turnstile: rejected', v.reason);
  return v.ok;
}

// One factory for every route's dependencies (audit item 27): the config is read once per request, and the shared D1
// writers (messages, events) and the owner-alert sender exist once.
function makeDeps(env: Env, cfg: Config): { lead: Deps; newsletter: NewsletterDeps; profile: ProfileDeps } {
  const keys = { resend: env.RESEND_API_KEY, brevo: env.BREVO_API_KEY };
  const countSentSince = async (sinceIso: string) => {
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE outcome = 'sent' AND created_at >= ?1").bind(sinceIso).first<{ n: number }>();
    return r?.n ?? 0;
  };
  const logMessage: Deps['logMessage'] = async (m) => {
    await env.DB.prepare('INSERT INTO messages (id, lead_id, created_at, template_id, template_hash, provider_id, outcome) VALUES (?1,?2,?3,?4,?5,?6,?7)')
      .bind(m.id, m.lead_id, m.created_at, m.template_id, m.template_hash, m.provider_id, m.outcome).run();
  };
  const logEvent: Deps['logEvent'] = async (type, leadId, detail) => {
    await env.DB.prepare('INSERT INTO events (id, created_at, type, lead_id, detail) VALUES (?1,?2,?3,?4,?5)')
      .bind(crypto.randomUUID(), new Date().toISOString(), type, leadId, detail).run();
  };
  const notifyOwner = async (subject: string, text: string) => {
    if (!cfg.hasEmailKey || !cfg.alertEmail || !cfg.senders.alerts.email) return;
    await sendEmail(cfg.emailProvider, keys, cfg.senders.alerts, cfg.alertEmail, { stream: 'leads', to: cfg.alertEmail, toName: 'Sharjeel Hashmat', subject, text });
  };

  const lead: Deps = {
    now: () => new Date(),
    uuid: () => crypto.randomUUID(),
    hash: sha256Hex,
    async findRecentByEmailHash(hash, sinceIso) {
      // Staging TEST leads are ignored, so a test enquiry never makes a real one from the same address a DUPLICATE.
      const r = await env.DB.prepare("SELECT 1 AS x FROM leads WHERE email_hash = ?1 AND created_at >= ?2 AND (status IS NULL OR status != 'TEST') LIMIT 1").bind(hash, sinceIso).first();
      return r !== null;
    },
    async isSuppressed(hash) {
      const r = await env.DB.prepare('SELECT 1 AS x FROM suppression WHERE email_hash = ?1').bind(hash).first();
      return r !== null;
    },
    countSentSince,
    async insertLead(row: LeadRow) {
      const l = row.lead;
      const a = l.attribution;
      await env.DB.prepare(
        `INSERT INTO leads (id, created_at, name, email, email_hash, phone, country, intent, budget_band, timeline, funding, message,
          consent_contact, consent_nurture, utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_page, referrer, source_type,
          status, reasons, escalation, score, lane, alert_level, quarantined)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29)`,
      ).bind(
        row.id, row.created_at, l.name, l.email, row.email_hash, l.phone, l.country, l.intent, l.budget_band, l.timeline, l.funding, l.message,
        1, l.consent_nurture ? 1 : 0, a.utm_source, a.utm_medium, a.utm_campaign, a.utm_content, a.utm_term, a.landing_page, a.referrer, a.source_type,
        row.status, JSON.stringify(row.reasons), JSON.stringify(row.escalation), row.score, row.lane, row.alert_level, row.status === 'VALID' ? 0 : 1,
      ).run();
    },
    logMessage,
    logEvent,
    async send(msg) {
      const sender = cfg.senders[msg.stream];
      if (!sender.email || !cfg.replyTo) throw new Error('no_sender');
      return sendEmail(cfg.emailProvider, keys, sender, cfg.replyTo, msg);
    },
    async alertOwner(p: AlertPayload) {
      const l = p.lead;
      const tag = p.outbound === 'not_stored' ? 'NOT STORED: reply by hand' : p.alert_level === 'instant' ? 'ACTION' : 'DIGEST';
      const subject = `[${tag}] ${p.lane} ${p.score}/100 · ${l.name} · ${l.intent}`;
      const text = [
        `Lane: ${p.lane}   Score: ${p.score}   Firewall: ${p.status}`,
        p.escalation.length ? `Escalation: ${p.escalation.join(', ')}` : '',
        `Name: ${l.name}`, `Email: ${l.email}`, `Phone: ${l.phone ?? '-'}`, `Country: ${l.country ?? '-'}`,
        `Intent: ${l.intent}   Budget (AED): ${l.budget_band}   Timeline: ${l.timeline}   Funding: ${l.funding}`,
        `Source: ${l.attribution.source_type} (${l.attribution.utm_source ?? '-'} / ${l.attribution.utm_campaign ?? '-'})  Landing: ${l.attribution.landing_page ?? '-'}`,
        `Automated reply: ${p.outbound}`, '', 'Message:', l.message.slice(0, 600) || '-', '', `Lead ID: ${p.id}`,
      ].filter(Boolean).join('\n');
      await notifyOwner(subject, text);
    },
  };

  const newsletter: NewsletterDeps = {
    now: () => new Date(),
    uuid: () => crypto.randomUUID(),
    async upsertSubscriber(row) {
      // An unsubscribed address stays unsubscribed: a POST never clears unsubscribed_at (H8). Rows the retention job
      // anonymised keep only the address's hash, so they are matched by it and the opt-out still holds.
      const existing = await env.DB.prepare('SELECT id FROM newsletter_subscribers WHERE email = ?1 OR email = ?2 LIMIT 1')
        .bind(row.email, `${SUBSCRIBER_HASH_PREFIX}${await sha256Hex(row.email)}`).first<{ id: string }>();
      if (existing) return { id: existing.id, confirm: false };
      const r = await env.DB.prepare('INSERT INTO newsletter_subscribers (id, email, subscribed_at, source) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(email) DO NOTHING')
        .bind(row.id, row.email, row.subscribed_at, row.source).run();
      return { id: row.id, confirm: (r.meta.changes ?? 0) > 0 };
    },
    countSentSince,
    logMessage,
    async send(msg) {
      const sender = cfg.senders.news;
      if (!sender.email || !cfg.replyTo) throw new Error('no_sender');
      return sendEmail(cfg.emailProvider, keys, sender, cfg.replyTo, msg);
    },
  };

  const profile: ProfileDeps = {
    now: () => new Date(),
    async findLead(id) {
      return env.DB.prepare('SELECT created_at, quarantined, status, name, email, intent, lane FROM leads WHERE id = ?1').bind(id).first();
    },
    async upsertProfile(leadId, p, nowIso) {
      const existing = await env.DB.prepare('SELECT 1 AS x FROM investor_profiles WHERE lead_id = ?1').bind(leadId).first();
      await env.DB.prepare(
        `INSERT INTO investor_profiles (lead_id, created_at, updated_at, objective, property_type, risk_tolerance, holding_period, areas)
         VALUES (?1,?2,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(lead_id) DO UPDATE SET updated_at = ?2, objective = ?3, property_type = ?4, risk_tolerance = ?5, holding_period = ?6, areas = ?7`,
      ).bind(leadId, nowIso, p.objective, p.property_type, p.risk_tolerance, p.holding_period, JSON.stringify(p.areas)).run();
      return existing ? 'updated' : 'created';
    },
    logEvent,
    notifyOwner,
  };

  return { lead, newsletter, profile };
}

function corsFor(req: Request, cfg: Config) {
  const origins = allowedOrigins(cfg.siteUrl, cfg.extraOrigins);
  const origin = req.headers.get('origin') ?? '';
  const corsOrigin = origins.includes(origin) ? origin : undefined;
  // STAGING_ORIGIN (exact match, "" = off) is admitted on /lead, /health, /profile and /market (TEST leads only, see
  // profile.ts); the newsletter keeps the production list, so the staging site can never trigger real mail.
  const staging = !corsOrigin && cfg.stagingOrigin !== '' && origin === cfg.stagingOrigin;
  return { corsOrigin, staging, leadCors: corsOrigin ?? (staging ? origin : undefined) };
}

export default {
  // Anything unexpected becomes a JSON 500 that still carries the request's CORS header, so the site can show its
  // retry / WhatsApp message instead of a CORS error. Never a stack trace.
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handle(req, env);
    } catch (e) {
      console.error('worker: unhandled error', safeError(e));
      let cors: string | undefined;
      try {
        const c = corsFor(req, readConfig(env as unknown as Record<string, string | undefined>));
        cors = new URL(req.url).pathname.startsWith('/api/newsletter/') ? c.corsOrigin : c.leadCors;
      } catch { cors = undefined; }
      return json({ ok: false, error: 'internal_error' }, 500, cors);
    }
  },

  // Daily data retention (B4, owner decision 2026-10-17): cron "17 1 * * *" in wrangler.toml.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Counts only in the log; the run is also recorded in retention_runs (audit F8).
    ctx.waitUntil(runAndRecordRetention(env.DB, new Date()).then(
      (r) => console.log('retention', JSON.stringify(r)),
      (e) => { console.error('retention: failed', safeError(e)); throw e; },
    ));
  },
};

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const cfg = readConfig(env as unknown as Record<string, string | undefined>);
  const { corsOrigin, staging, leadCors } = corsFor(req, cfg);

  if (url.pathname === '/health') return json({ ok: true }, 200, leadCors);

  // Read-only market figures (aggregates only) for the site's /areas, area guide and /new-launches pages.
  const market = await handleMarket(req, url, env.DB, leadCors);
  if (market) return market;

  if (url.pathname === '/lead') {
    const corsOrigin = leadCors;
    if (req.method === 'OPTIONS') return preflight(corsOrigin);
    if (req.method !== 'POST') return json({ ok: false }, 405);
    if (!corsOrigin) return json({ ok: false, error: 'forbidden' }, 403);

    const body = await jsonBody(req, MAX_BODY, corsOrigin);
    if ('res' in body) return body.res;
    const raw = body.raw;

    // Fail closed: without the Turnstile secret no enquiry can be verified, so none is accepted.
    if (!env.TURNSTILE_SECRET) {
      console.error('lead: TURNSTILE_SECRET is not set; rejecting the enquiry (fail closed)');
      return json({ ok: false, error: 'verification_unavailable' }, 503, corsOrigin);
    }
    if (!(await human(req, env, cfg, raw, TURNSTILE_ACTIONS.lead))) return json({ ok: false, error: 'verification_failed' }, 403, corsOrigin);

    const approved = await approvedTemplates(env);
    const result = await processLead(raw, { config: cfg, templates: TEMPLATES, approved, unsubSecret: env.UNSUB_SECRET, staging }, makeDeps(env, cfg).lead);
    return json(result.body, result.status, corsOrigin);
  }

  if (url.pathname === '/profile') {
    const corsOrigin = leadCors;
    if (req.method === 'OPTIONS') return preflight(corsOrigin);
    if (req.method !== 'POST') return json({ ok: false }, 405);
    if (!corsOrigin) return json({ ok: false, error: 'forbidden' }, 403);
    const body = await jsonBody(req, MAX_PROFILE_BODY, corsOrigin);
    if ('res' in body) return body.res;
    const result = await saveProfile(body.raw, makeDeps(env, cfg).profile, { staging });
    return json(result.body, result.status, corsOrigin);
  }

  // Lead-reply unsubscribe (audit item 2). GET shows a confirm button and changes nothing; POST (that button, or a mail
  // client's RFC 8058 one-click request) suppresses the address. Both check the same signed token.
  if (url.pathname === '/unsubscribe' && (req.method === 'GET' || req.method === 'POST')) {
    const email = (url.searchParams.get('e') ?? '').trim().toLowerCase();
    const token = url.searchParams.get('t') ?? '';
    if (req.method === 'POST' && (await bodyTooLarge(req))) return plain(413, 'Too large.');
    if (!env.UNSUB_SECRET || !email || !(await verifyUnsubToken(email, token, env.UNSUB_SECRET))) return plain(400, 'Invalid link.');
    if (req.method === 'GET') return confirmUnsubscribe(`/unsubscribe${url.search}`, 'Stop all further messages to this address?');
    const hash = await sha256Hex(email);
    await env.DB.prepare('INSERT OR IGNORE INTO suppression (email_hash, created_at, reason) VALUES (?1, ?2, ?3)').bind(hash, new Date().toISOString(), 'unsubscribe').run();
    return page(200, 'Unsubscribed', 'You are unsubscribed. No further messages will be sent.');
  }

  if (url.pathname === '/api/newsletter/subscribe') {
    if (req.method === 'OPTIONS') return preflight(corsOrigin);
    if (req.method !== 'POST') return json({ ok: false }, 405);
    if (!corsOrigin) return json({ ok: false, error: 'forbidden' }, 403);

    const body = await jsonBody(req, MAX_BODY, corsOrigin);
    if ('res' in body) return body.res;
    const raw = body.raw;

    // Same fail-closed guard as /lead (audit item 10).
    if (!env.TURNSTILE_SECRET) {
      console.error('newsletter: TURNSTILE_SECRET is not set; rejecting the signup (fail closed)');
      return json({ ok: false, error: 'verification_unavailable' }, 503, corsOrigin);
    }
    if (!(await human(req, env, cfg, raw, TURNSTILE_ACTIONS.newsletter))) return json({ ok: false, error: 'verification_failed' }, 403, corsOrigin);

    const approved = await approvedTemplates(env);
    const result = await subscribe(raw, { config: cfg, templates: TEMPLATES, approved, unsubSecret: env.UNSUB_SECRET }, makeDeps(env, cfg).newsletter);
    return json(result.body, result.status, corsOrigin);
  }

  // Newsletter unsubscribe (audit item 2): GET confirms and changes nothing; POST unsubscribes, then offers the optional
  // feedback form. Both check the same signed token.
  if (url.pathname === '/api/newsletter/unsubscribe' && (req.method === 'GET' || req.method === 'POST')) {
    const token = url.searchParams.get('token') ?? '';
    if (req.method === 'POST' && (await bodyTooLarge(req))) return plain(413, 'Too large.');
    const email = env.UNSUB_SECRET ? await verifyNewsletterToken(token, env.UNSUB_SECRET) : null;
    if (!email) return plain(400, 'Invalid link.');
    if (req.method === 'GET') return confirmUnsubscribe(`/api/newsletter/unsubscribe${url.search}`, 'Stop receiving The Compass Key Monthly?');
    await env.DB.prepare('UPDATE newsletter_subscribers SET unsubscribed_at = ?1 WHERE email = ?2 AND unsubscribed_at IS NULL')
      .bind(new Date().toISOString(), email).run();
    return page(200, 'Unsubscribed', 'You are unsubscribed from The Compass Key Monthly. No further issues will be sent.', unsubscribeFeedbackForm(token));
  }

  // Optional feedback, posted from the page above. The same signed token identifies the subscriber; it is not
  // consumed by the unsubscribe, so no second token is needed. Only a row that is actually unsubscribed is updated.
  if (url.pathname === '/api/newsletter/unsubscribe/feedback' && req.method === 'POST') {
    const body = await readBody(req, MAX_BODY);
    if (!body) return plain(413, 'Too large.');
    const form = new URLSearchParams(utf8(body));
    const email = env.UNSUB_SECRET ? await verifyNewsletterToken(form.get('token') ?? '', env.UNSUB_SECRET) : null;
    if (!email) return plain(400, 'Invalid link.');
    const fb = validateFeedback(form);
    if (fb.kind === 'skip') return page(200, 'Unsubscribed', 'You are unsubscribed. Nothing else to do.');
    try {
      await env.DB.prepare('UPDATE newsletter_subscribers SET unsubscribe_reason = ?1, unsubscribe_reason_detail = ?2, unsubscribe_feedback_at = ?3 WHERE email = ?4 AND unsubscribed_at IS NOT NULL')
        .bind(fb.reason, fb.detail, new Date().toISOString(), email).run();
    } catch {
      return page(200, 'Unsubscribed', 'You are unsubscribed. Your feedback could not be saved, but nothing else is needed.');
    }
    return page(200, 'Unsubscribed', 'Thank you. You are unsubscribed.');
  }

  return json({ ok: false }, 404);
}
