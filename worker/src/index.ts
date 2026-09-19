import { readConfig } from './config';
import { sha256Hex } from './hash';
import { processLead, type AlertPayload, type Deps, type LeadRow } from './pipeline';
import { brevoSend } from './send';
import templatesJson from '../templates/lead-replies.v1.json';
import type { Template } from './templates';
import { verifyUnsubToken } from './unsub';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  TURNSTILE_SECRET: string;
  BREVO_API_KEY?: string;
  UNSUB_SECRET?: string;
  SCORING_JSON?: string;
  OUTBOUND?: string;
  BRN?: string;
  AFFILIATION?: string;
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
}

const TEMPLATES = (templatesJson as { templates: Template[] }).templates;
const MAX_BODY = 8 * 1024;

function allowedOrigins(siteUrl: string): string[] {
  try {
    const u = new URL(siteUrl);
    const bare = u.hostname.replace(/^www\./, '');
    return [`https://${bare}`, `https://www.${bare}`];
  } catch {
    return [];
  }
}

function json(body: unknown, status: number, origin?: string): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['vary'] = 'origin';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function verifyTurnstile(secret: string, token: unknown, ip: string | null): Promise<boolean> {
  if (typeof token !== 'string' || !token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = (await res.json().catch(() => ({}))) as { success?: boolean };
  return out.success === true;
}

function makeDeps(env: Env): Deps {
  const cfg = readConfig(env as unknown as Record<string, string | undefined>);
  return {
    now: () => new Date(),
    uuid: () => crypto.randomUUID(),
    hash: sha256Hex,
    async findRecentByEmailHash(hash, sinceIso) {
      const r = await env.DB.prepare('SELECT 1 AS x FROM leads WHERE email_hash = ?1 AND created_at >= ?2 LIMIT 1').bind(hash, sinceIso).first();
      return r !== null;
    },
    async isSuppressed(hash) {
      const r = await env.DB.prepare('SELECT 1 AS x FROM suppression WHERE email_hash = ?1').bind(hash).first();
      return r !== null;
    },
    async countSentSince(sinceIso) {
      const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE outcome = 'sent' AND created_at >= ?1").bind(sinceIso).first<{ n: number }>();
      return r?.n ?? 0;
    },
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
    async logMessage(m) {
      await env.DB.prepare('INSERT INTO messages (id, lead_id, created_at, template_id, template_hash, provider_id, outcome) VALUES (?1,?2,?3,?4,?5,?6,?7)')
        .bind(m.id, m.lead_id, m.created_at, m.template_id, m.template_hash, m.provider_id, m.outcome).run();
    },
    async logEvent(type, leadId, detail) {
      await env.DB.prepare('INSERT INTO events (id, created_at, type, lead_id, detail) VALUES (?1,?2,?3,?4,?5)')
        .bind(crypto.randomUUID(), new Date().toISOString(), type, leadId, detail).run();
    },
    async send(msg) {
      if (!env.BREVO_API_KEY) throw new Error('no_email_key');
      const sender = cfg.senders[msg.stream];
      if (!sender.email || !cfg.replyTo) throw new Error('no_sender');
      return brevoSend(env.BREVO_API_KEY, sender, cfg.replyTo, msg);
    },
    async alertOwner(p: AlertPayload) {
      if (!env.BREVO_API_KEY || !cfg.alertEmail || !cfg.senders.alerts.email) return;
      const l = p.lead;
      const subject = `[${p.alert_level === 'instant' ? 'ACTION' : 'DIGEST'}] ${p.lane} ${p.score}/100 · ${l.name} · ${l.intent}`;
      const text = [
        `Lane: ${p.lane}   Score: ${p.score}   Firewall: ${p.status}`,
        p.escalation.length ? `Escalation: ${p.escalation.join(', ')}` : '',
        `Name: ${l.name}`, `Email: ${l.email}`, `Phone: ${l.phone ?? '-'}`, `Country: ${l.country ?? '-'}`,
        `Intent: ${l.intent}   Budget (AED): ${l.budget_band}   Timeline: ${l.timeline}   Funding: ${l.funding}`,
        `Source: ${l.attribution.source_type} (${l.attribution.utm_source ?? '-'} / ${l.attribution.utm_campaign ?? '-'})  Landing: ${l.attribution.landing_page ?? '-'}`,
        `Automated reply: ${p.outbound}`, '', 'Message:', l.message.slice(0, 600) || '-', '', `Lead ID: ${p.id}`,
      ].filter(Boolean).join('\n');
      await brevoSend(env.BREVO_API_KEY, cfg.senders.alerts, cfg.alertEmail, { stream: 'leads', to: cfg.alertEmail, toName: 'Sharjeel Hashmat', subject, text });
    },
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const cfg = readConfig(env as unknown as Record<string, string | undefined>);
    const origins = allowedOrigins(cfg.siteUrl);
    const origin = req.headers.get('origin') ?? '';
    const corsOrigin = origins.includes(origin) ? origin : undefined;

    if (url.pathname === '/health') return json({ ok: true }, 200);

    if (url.pathname === '/lead') {
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: corsOrigin
            ? { 'access-control-allow-origin': corsOrigin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' }
            : {},
        });
      }
      if (req.method !== 'POST') return json({ ok: false }, 405);
      if (!corsOrigin) return json({ ok: false, error: 'forbidden' }, 403);

      const text = await req.text();
      if (text.length > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { return json({ ok: false, error: 'invalid_input', field: 'body' }, 400, corsOrigin); }

      const token = (raw as Record<string, unknown> | null)?.turnstile_token;
      const human = await verifyTurnstile(env.TURNSTILE_SECRET, token, req.headers.get('cf-connecting-ip'));
      if (!human) return json({ ok: false, error: 'verification_failed' }, 403, corsOrigin);

      const approved = ((await env.KV.get('approved_templates', 'json')) ?? {}) as Record<string, string>;
      const result = await processLead(raw, { config: cfg, templates: TEMPLATES, approved, unsubSecret: env.UNSUB_SECRET }, makeDeps(env));
      return json(result.body, result.status, corsOrigin);
    }

    if (url.pathname === '/unsubscribe' && req.method === 'GET') {
      const email = (url.searchParams.get('e') ?? '').trim().toLowerCase();
      const token = url.searchParams.get('t') ?? '';
      if (!env.UNSUB_SECRET || !email || !(await verifyUnsubToken(email, token, env.UNSUB_SECRET))) {
        return new Response('Invalid link.', { status: 400, headers: { 'content-type': 'text/plain' } });
      }
      const hash = await sha256Hex(email);
      await env.DB.prepare('INSERT OR IGNORE INTO suppression (email_hash, created_at, reason) VALUES (?1, ?2, ?3)').bind(hash, new Date().toISOString(), 'unsubscribe').run();
      return new Response('<!doctype html><meta charset="utf-8"><title>Unsubscribed</title><p style="font:16px system-ui;margin:3rem auto;max-width:28rem">You are unsubscribed. No further messages will be sent.</p>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    return json({ ok: false }, 404);
  },
};
