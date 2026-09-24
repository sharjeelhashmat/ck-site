import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';
import { templateHash, type Template } from '../src/templates';
import templatesJson from '../templates/lead-replies.v1.json';

const TEMPLATES = (templatesJson as { templates: Template[] }).templates;

const cf = env as unknown as Env;
const ORIGIN = 'https://sharjeelhashmat.com';
const baseEnv = (over: Record<string, string> = {}): Env =>
  ({
    ...(env as unknown as Env),
    TURNSTILE_SECRET: 'test-secret',
    BREVO_API_KEY: 'brevo-test',
    UNSUB_SECRET: 'unsub-test-secret',
    SITE_URL: ORIGIN,
    WORKER_URL: 'https://ck-lead-worker.example.workers.dev',
    BOOKING_URL: 'https://cal.example.com/sh',
    AFFILIATION: 'Royals Field Properties',
    FROM_LEADS_EMAIL: 'hello@mail.sharjeelhashmat.com',
    FROM_ALERTS_EMAIL: 'alerts@mail.sharjeelhashmat.com',
    REPLY_TO: 'hello@sharjeelhashmat.com',
    MAILBOX_CONFIRMED: 'yes',
    ALERT_EMAIL: 'owner@example.com',
    SLA_HOURS: '24',
    EMAIL_PROVIDER: 'brevo', // explicit, so tests do not depend on the production value in wrangler.toml
    ...over,
  }) as Env;

const LIVE = { OUTBOUND: 'on', BRN: '12345' };

interface Call { url: string; body: Record<string, unknown> | null }
let calls: Call[] = [];

function lead(over: Record<string, unknown> = {}) {
  return {
    name: 'Amira Khan', email: 'amira@example.com', phone: '+971501234567', country: 'AE',
    intent: 'invest', budget_band: 'over_5m', timeline: 'now', funding: 'cash',
    message: 'Yield-focused unit.', consent_contact: true, consent_nurture: false,
    utm_source: 'linkedin', landing_page: '/investment-approach', company_website: '',
    turnstile_token: 'ok', ...over,
  };
}

function post(body: unknown, e: Env, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  return worker.fetch(new Request('https://api.test/lead', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }), e);
}

async function approveAllInKv(e: Env) {
  const map: Record<string, string> = {};
  for (const t of TEMPLATES) map[t.id] = await templateHash(t);
  await e.KV.put('approved_templates', JSON.stringify(map));
}

const rows = async (sql: string, ...b: unknown[]) => (await cf.DB.prepare(sql).bind(...b).all()).results as Record<string, unknown>[];

beforeEach(async () => {
  calls = [];
  await cf.DB.exec('DELETE FROM leads');
  await cf.DB.exec('DELETE FROM messages');
  await cf.DB.exec('DELETE FROM events');
  await cf.DB.exec('DELETE FROM suppression');
  await cf.DB.exec('DELETE FROM newsletter_subscribers');
  await cf.KV.delete('approved_templates');
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://challenges.cloudflare.com/turnstile/v0/siteverify')) {
      const form = init?.body as FormData;
      calls.push({ url, body: { response: form.get('response'), secret: form.get('secret') } });
      return Response.json({ success: form.get('response') === 'ok' });
    }
    if (url === 'https://api.resend.com/emails') {
      calls.push({ url, body: { ...JSON.parse(init?.body as string), _auth: (init?.headers as Record<string, string>).authorization } });
      return Response.json({ id: `re-${calls.length}` }, { status: 200 });
    }
    if (url === 'https://api.brevo.com/v3/smtp/email') {
      calls.push({ url, body: JSON.parse(init?.body as string) });
      return Response.json({ messageId: `m-${calls.length}` }, { status: 201 });
    }
    return new Response('unexpected outbound call: ' + url, { status: 500 });
  });
});
afterEach(() => vi.unstubAllGlobals());

const brevo = () => calls.filter((c) => c.url.includes('brevo'));
const resend = () => calls.filter((c) => c.url.includes('resend'));

describe('worker on workerd', () => {
  it('serves /health and 404s unknown paths', async () => {
    expect((await worker.fetch(new Request('https://api.test/health'), baseEnv())).status).toBe(200);
    expect((await worker.fetch(new Request('https://api.test/nope'), baseEnv())).status).toBe(404);
  });

  it('CORS: allows only the site origins', async () => {
    const ok = await worker.fetch(new Request('https://api.test/lead', { method: 'OPTIONS', headers: { origin: 'https://www.sharjeelhashmat.com' } }), baseEnv());
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://www.sharjeelhashmat.com');
    const bad = await worker.fetch(new Request('https://api.test/lead', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), baseEnv());
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
    expect((await post(lead(), baseEnv(), 'https://evil.example')).status).toBe(403);
    expect((await post(lead(), baseEnv(), null)).status).toBe(403);
  });

  it('rejects wrong methods, oversized and malformed bodies', async () => {
    expect((await worker.fetch(new Request('https://api.test/lead', { headers: { origin: ORIGIN } }), baseEnv())).status).toBe(405);
    expect((await post('x'.repeat(9000), baseEnv())).status).toBe(413);
    expect((await post('{not json', baseEnv())).status).toBe(400);
  });

  it('Turnstile failure: 403 and nothing stored', async () => {
    const res = await post(lead({ turnstile_token: 'bad' }), baseEnv());
    expect(res.status).toBe(403);
    expect(await rows('SELECT id FROM leads')).toHaveLength(0);
    expect((await post(lead({ turnstile_token: undefined }), baseEnv())).status).toBe(403);
  });

  it('validation failure: 400 with the failing field only', async () => {
    const res = await post(lead({ consent_contact: false }), baseEnv());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_input', field: 'consent_contact' });
  });

  it('live path: stores the lead in D1, sends the approved acknowledgment, alerts the owner', async () => {
    const e = baseEnv(LIVE);
    await approveAllInKv(e);
    const res = await post(lead(), e);
    expect(res.status).toBe(202);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);

    const [row] = await rows('SELECT * FROM leads WHERE id = ?1', body.id);
    expect(row).toMatchObject({ lane: 'PRIORITY', status: 'VALID', score: 90 - 3, quarantined: 0, source_type: 'linkedin', landing_page: '/investment-approach', consent_contact: 1 });
    expect(row!.email_hash).toMatch(/^[0-9a-f]{64}$/);

    const msgs = await rows('SELECT * FROM messages');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ lead_id: body.id, template_id: 'ACK-PRIORITY', outcome: 'sent' });

    const sent = brevo();
    expect(sent).toHaveLength(2);
    const ack = sent[0]!.body as { sender: { email: string }; replyTo: { email: string }; to: { email: string }[]; textContent: string };
    expect(ack.to[0]!.email).toBe('amira@example.com');
    expect(ack.sender.email).toBe('hello@mail.sharjeelhashmat.com');
    expect(ack.replyTo.email).toBe('hello@sharjeelhashmat.com');
    expect(ack.textContent).toContain('Royals Field Properties · BRN 12345');
    expect(ack.textContent).toContain('within 24 hours');
    const alert = sent[1]!.body as { subject: string; to: { email: string }[]; sender: { email: string } };
    expect(alert.to[0]!.email).toBe('owner@example.com');
    expect(alert.sender.email).toBe('alerts@mail.sharjeelhashmat.com');
    expect(alert.subject).toMatch(/^\[ACTION\] PRIORITY/);
  });

  it('default config (OUTBOUND off): lead stored and owner alerted, nothing sent to the lead', async () => {
    const e = baseEnv();
    await approveAllInKv(e);
    const res = await post(lead(), e);
    expect(res.status).toBe(202);
    expect(await rows('SELECT id FROM leads')).toHaveLength(1);
    expect(await rows('SELECT id FROM messages')).toHaveLength(0);
    expect(brevo()).toHaveLength(1);
    expect((brevo()[0]!.body as { to: { email: string }[] }).to[0]!.email).toBe('owner@example.com');
  });

  it('BRN pending: nothing is sent even with outbound on and every template approved', async () => {
    const e = baseEnv({ OUTBOUND: 'on' });
    await approveAllInKv(e);
    await post(lead(), e);
    expect(await rows('SELECT id FROM messages')).toHaveLength(0);
    expect((await rows("SELECT detail FROM events WHERE type = 'outbound'"))[0]!.detail).toBe('skipped:blocked');
  });

  it('no approved templates in KV: nothing is sent', async () => {
    await post(lead(), baseEnv(LIVE));
    expect((await rows("SELECT detail FROM events WHERE type = 'outbound'"))[0]!.detail).toBe('skipped:not_approved');
    expect(await rows('SELECT id FROM messages')).toHaveLength(0);
  });

  it('duplicate within 24h: second submission is stored as DUPLICATE and gets no second reply', async () => {
    const e = baseEnv(LIVE);
    await approveAllInKv(e);
    await post(lead(), e);
    await post(lead(), e);
    const all = await rows('SELECT status, lane FROM leads ORDER BY created_at');
    expect(all.map((r) => r.status)).toEqual(['VALID', 'DUPLICATE']);
    expect(await rows('SELECT id FROM messages')).toHaveLength(1);
  });

  it('honeypot: quarantined as SPAM with no reply and no alert; client still sees 202', async () => {
    const e = baseEnv(LIVE);
    await approveAllInKv(e);
    const res = await post(lead({ company_website: 'spam.example' }), e);
    expect(res.status).toBe(202);
    expect(await rows('SELECT status, quarantined, lane FROM leads')).toEqual([{ status: 'SPAM', quarantined: 1, lane: 'NONE' }]);
    expect(brevo()).toHaveLength(0);
  });

  it('escalation: neutral template and instant alert', async () => {
    const e = baseEnv(LIVE);
    await approveAllInKv(e);
    await post(lead({ message: 'Is the return guaranteed? I want a discount.' }), e);
    expect((await rows('SELECT lane FROM leads'))[0]!.lane).toBe('ESCALATED');
    expect((brevo()[0]!.body as { textContent: string }).textContent).toContain('needs me personally');
  });

  it('unsubscribe flow: opt-in nurture reply carries a working link; suppression blocks later sends', async () => {
    const e = baseEnv(LIVE);
    await approveAllInKv(e);
    const mid = { intent: 'buy', budget_band: '1m_2m', timeline: '3m', funding: 'mortgage', utm_source: '', phone: '', consent_nurture: true };
    await post(lead(mid), e);
    const ack = brevo()[0]!.body as { textContent: string; headers?: Record<string, string> };
    const link = ack.textContent.match(/https:\/\/[^\s]+\/unsubscribe\?[^\s]+/)![0];
    expect(ack.headers?.['List-Unsubscribe']).toContain('/unsubscribe');

    const bad = await worker.fetch(new Request(link.replace(/t=[0-9a-f]+/, 't=deadbeef')), e);
    expect(bad.status).toBe(400);
    expect(await rows('SELECT * FROM suppression')).toHaveLength(0);

    const good = await worker.fetch(new Request(link), e);
    expect(good.status).toBe(200);
    expect(await rows('SELECT * FROM suppression')).toHaveLength(1);

    // Push the earlier lead outside the 24h window, then the same person enquires again.
    await cf.DB.exec("UPDATE leads SET created_at = '2026-01-01T00:00:00.000Z'");
    calls = [];
    await post(lead(mid), e);
    expect((await rows("SELECT detail FROM events WHERE type = 'outbound' ORDER BY created_at DESC"))[0]!.detail).toBe('skipped:suppressed');
    expect(brevo().every((c) => (c.body as { to: { email: string }[] }).to[0]!.email === 'owner@example.com')).toBe(true);
  });

  it('a template edited after approval is not sent (hash mismatch inside workerd)', async () => {
    const e = baseEnv(LIVE);
    const map: Record<string, string> = {};
    for (const t of TEMPLATES) map[t.id] = await templateHash(t);
    map['ACK-PRIORITY'] = 'f'.repeat(64);
    await e.KV.put('approved_templates', JSON.stringify(map));
    await post(lead(), e);
    expect(await rows('SELECT id FROM messages')).toHaveLength(0);
  });

  it('email provider outage is contained: lead stored, client gets 202', async () => {
    const e = baseEnv(LIVE);
    await approveAllInKv(e);
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('turnstile')) return Response.json({ success: true });
      return new Response('down', { status: 503 });
    });
    const res = await post(lead(), e);
    expect(res.status).toBe(202);
    expect(await rows('SELECT id FROM leads')).toHaveLength(1);
    expect((await rows("SELECT detail FROM events WHERE type = 'outbound'"))[0]!.detail).toBe('failed:send');
    expect((await rows("SELECT type FROM events WHERE type = 'alert_failed'"))).toHaveLength(1);
  });

  it('resend provider: acknowledgment and owner alert go through Resend, nothing through Brevo', async () => {
    const e = baseEnv({ ...LIVE, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test', BREVO_API_KEY: '' });
    await approveAllInKv(e);
    const res = await post(lead(), e);
    expect(res.status).toBe(202);
    expect(brevo()).toHaveLength(0);
    const sent = resend();
    expect(sent).toHaveLength(2);
    const ack = sent[0]!.body as { from: string; to: string[]; reply_to: string; text: string; _auth: string };
    expect(ack._auth).toBe('Bearer re_test');
    expect(ack.from).toBe('Sharjeel Hashmat <hello@mail.sharjeelhashmat.com>');
    expect(ack.to).toEqual(['amira@example.com']);
    expect(ack.reply_to).toBe('hello@sharjeelhashmat.com');
    expect(ack.text).toContain('Royals Field Properties · BRN 12345');
    const alert = sent[1]!.body as { from: string; to: string[]; subject: string };
    expect(alert.from).toBe('Lead desk <alerts@mail.sharjeelhashmat.com>');
    expect(alert.to).toEqual(['owner@example.com']);
    expect(alert.subject).toMatch(/^\[ACTION\] PRIORITY/);
    expect((await rows('SELECT template_id, outcome FROM messages'))[0]).toMatchObject({ template_id: 'ACK-PRIORITY', outcome: 'sent' });
  });

  it('resend selected but no Resend key: nothing is sent and the lead is still stored', async () => {
    const e = baseEnv({ ...LIVE, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: '' });
    await approveAllInKv(e);
    const res = await post(lead(), e);
    expect(res.status).toBe(202);
    expect(resend()).toHaveLength(0);
    expect(brevo()).toHaveLength(0);
    expect(await rows('SELECT id FROM leads')).toHaveLength(1);
    expect((await rows("SELECT detail FROM events WHERE type = 'outbound'"))[0]!.detail).toBe('skipped:blocked');
  });
});

describe('newsletter on workerd', () => {
  const NEWS = { FROM_NEWS_EMAIL: 'brief@news.sharjeelhashmat.com' };
  const sub = (body: Record<string, unknown>, e: Env, origin: string | null = ORIGIN) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (origin) headers.origin = origin;
    return worker.fetch(new Request('https://api.test/api/newsletter/subscribe', { method: 'POST', headers, body: JSON.stringify(body) }), e);
  };
  const signup = (over: Record<string, unknown> = {}) => ({ email: 'reader@example.com', source: 'footer', company_website: '', turnstile_token: 'ok', ...over });
  const unsubscribe = (url: string, e: Env) => worker.fetch(new Request(url.replace('https://ck-lead-worker.example.workers.dev', 'https://api.test')), e);

  it('CORS, Turnstile and validation match the enquiry route', async () => {
    const pre = await worker.fetch(new Request('https://api.test/api/newsletter/subscribe', { method: 'OPTIONS', headers: { origin: 'https://www.sharjeelhashmat.com' } }), baseEnv());
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://www.sharjeelhashmat.com');
    expect((await sub(signup(), baseEnv(), 'https://evil.example')).status).toBe(403);
    expect((await sub(signup({ turnstile_token: 'bad' }), baseEnv())).status).toBe(403);
    const bad = await sub(signup({ email: 'nope' }), baseEnv());
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ ok: false, error: 'invalid_input', field: 'email' });
    expect(await rows('SELECT id FROM newsletter_subscribers')).toHaveLength(0);
  });

  it('default config: the subscriber is stored with its source, nothing is sent', async () => {
    const res = await sub(signup(), baseEnv(NEWS));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const r = await rows('SELECT email, source, unsubscribed_at FROM newsletter_subscribers');
    expect(r).toEqual([{ email: 'reader@example.com', source: 'footer', unsubscribed_at: null }]);
    expect(brevo()).toHaveLength(0);
  });

  it('live and approved: one welcome from the news sender; a repeat signup stores nothing new and sends nothing', async () => {
    const e = baseEnv({ ...LIVE, ...NEWS });
    await approveAllInKv(e);
    expect((await sub(signup(), e)).status).toBe(200);
    expect((await sub(signup({ email: 'READER@example.com' }), e)).status).toBe(200);
    expect(await rows('SELECT id FROM newsletter_subscribers')).toHaveLength(1);
    expect(brevo()).toHaveLength(1);
    const mail = brevo()[0]!.body as { sender: { email: string }; subject: string; textContent: string; headers: Record<string, string> };
    expect(mail.sender.email).toBe('brief@news.sharjeelhashmat.com');
    expect(mail.subject).toBe("Subscribed · The Investor's Brief");
    expect(mail.headers['List-Unsubscribe']).toMatch(/\/api\/newsletter\/unsubscribe\?token=/);
    expect(await rows("SELECT template_id FROM messages WHERE outcome = 'sent'")).toEqual([{ template_id: 'NEWS-WELCOME' }]);
  });

  it('unsubscribe link sets unsubscribed_at; a forged token is refused; signing up again re-activates and welcomes', async () => {
    const e = baseEnv({ ...LIVE, ...NEWS });
    await approveAllInKv(e);
    await sub(signup(), e);
    const link = (brevo()[0]!.body as { headers: Record<string, string> }).headers['List-Unsubscribe']!.slice(1, -1);

    expect((await worker.fetch(new Request('https://api.test/api/newsletter/unsubscribe?token=forged.00'), e)).status).toBe(400);
    const res = await unsubscribe(link, e);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('unsubscribed');
    expect((await rows('SELECT unsubscribed_at FROM newsletter_subscribers'))[0]!.unsubscribed_at).not.toBeNull();
    // Newsletter opt-out does not suppress lead replies.
    expect(await rows('SELECT email_hash FROM suppression')).toHaveLength(0);

    await sub(signup({ source: 'insights/dubai-q1-2026-who-is-buying' }), e);
    expect(await rows('SELECT source, unsubscribed_at FROM newsletter_subscribers')).toEqual([{ source: 'insights/dubai-q1-2026-who-is-buying', unsubscribed_at: null }]);
    expect(brevo()).toHaveLength(2);
  });
});
