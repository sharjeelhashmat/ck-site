import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';

const cf = env as unknown as Env;
const ORIGIN = 'https://sharjeelhashmat.com';
const e = (): Env =>
  ({
    ...cf, TURNSTILE_SECRET: 's', BREVO_API_KEY: 'b', RESEND_API_KEY: 'r', EMAIL_PROVIDER: 'resend', UNSUB_SECRET: 'u',
    SITE_URL: ORIGIN, WORKER_URL: 'https://ck-lead-worker.example.workers.dev', FROM_ALERTS_EMAIL: 'alerts@mail.sharjeelhashmat.com',
    REPLY_TO: 'hello@sharjeelhashmat.com', ALERT_EMAIL: 'owner@example.com', OUTBOUND: 'off',
  }) as Env;

let mails: Array<{ subject: string; text: string }> = [];
beforeEach(async () => {
  mails = [];
  for (const t of ['leads', 'messages', 'events', 'investor_profiles']) await cf.DB.exec(`DELETE FROM ${t}`);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://challenges.cloudflare.com')) return Response.json({ success: true });
    if (url === 'https://api.resend.com/emails') { mails.push(JSON.parse(init?.body as string)); return Response.json({ id: 're-1' }); }
    return new Response('unexpected: ' + url, { status: 500 });
  });
});
afterEach(() => vi.unstubAllGlobals());

const lead = { name: 'Amira Khan', email: 'amira@example.com', phone: '+971501234567', country: 'AE', intent: 'invest', budget_band: 'over_5m', timeline: 'now', funding: 'cash', message: 'Yield-focused unit.', consent_contact: true, consent_nurture: false, company_website: '', turnstile_token: 'ok' };
const send = (path: string, body: unknown, origin: string | null = ORIGIN) =>
  worker.fetch(new Request(`https://api.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) }), e());
const profile = (id: string, over: Record<string, unknown> = {}) => ({ lead_id: id, objective: 'capital_growth', property_type: 'villa', risk_tolerance: 'low', holding_period: '10y_plus', areas: ['palm-jumeirah'], ...over });
const rows = async (sql: string, ...b: unknown[]) => (await cf.DB.prepare(sql).bind(...b).all()).results as Record<string, unknown>[];

describe('POST /profile on workerd with real D1', () => {
  it('stores a profile for a real enquiry, alerts the owner once, and updates in place on a second send', async () => {
    const { id } = (await (await send('/lead', lead)).json()) as { id: string };
    const r1 = await send('/profile', profile(id));
    expect(r1.status).toBe(200);
    expect(r1.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const [row] = await rows('SELECT * FROM investor_profiles WHERE lead_id = ?1', id);
    expect(row).toMatchObject({ objective: 'capital_growth', property_type: 'villa', risk_tolerance: 'low', holding_period: '10y_plus', areas: '["palm-jumeirah"]' });
    const profileMails = mails.filter((m) => m.subject.startsWith('[PROFILE]'));
    expect(profileMails).toHaveLength(1);

    expect((await send('/profile', profile(id, { objective: 'mix' }))).status).toBe(200);
    expect(await rows('SELECT * FROM investor_profiles')).toHaveLength(1);
    expect((await rows('SELECT objective FROM investor_profiles WHERE lead_id = ?1', id))[0]!.objective).toBe('mix');
    expect(mails.filter((m) => m.subject.startsWith('[PROFILE]'))).toHaveLength(1);
    const ev = (await rows("SELECT type FROM events WHERE type LIKE 'profile%' ORDER BY created_at")).map((x) => x.type);
    expect(ev).toEqual(['profile_saved', 'profile_updated']);
  });

  it('does not touch the lead row, its score or its lane', async () => {
    const { id } = (await (await send('/lead', lead)).json()) as { id: string };
    const before = await rows('SELECT score, lane, status FROM leads WHERE id = ?1', id);
    await send('/profile', profile(id));
    expect(await rows('SELECT score, lane, status FROM leads WHERE id = ?1', id)).toEqual(before);
  });

  it('unknown id: 404 invalid_link and nothing stored; a bad body is 400', async () => {
    const r = await send('/profile', profile('3f2b8c1e-7d4a-4e6b-9c10-2a5d8e9f0b11'));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ ok: false, error: 'invalid_link' });
    expect(await rows('SELECT * FROM investor_profiles')).toHaveLength(0);
    expect((await send('/profile', { lead_id: 'x' })).status).toBe(400);
    expect((await send('/profile', '{nope')).status).toBe(400);
  });

  it('a quarantined (spam) lead cannot attach a profile and gets the same answer as an unknown id', async () => {
    const { id } = (await (await send('/lead', { ...lead, company_website: 'http://spam.example' })).json()) as { id: string };
    expect((await rows('SELECT quarantined FROM leads WHERE id = ?1', id))[0]!.quarantined).toBe(1);
    const r = await send('/profile', profile(id));
    expect(r.status).toBe(404);
  });

  it('an enquiry older than 7 days is refused', async () => {
    const { id } = (await (await send('/lead', lead)).json()) as { id: string };
    await cf.DB.prepare('UPDATE leads SET created_at = ?1 WHERE id = ?2').bind('2020-01-01T00:00:00.000Z', id).run();
    expect((await send('/profile', profile(id))).status).toBe(410);
  });

  it('CORS: site origins only; wrong method and oversized body rejected', async () => {
    const id = '3f2b8c1e-7d4a-4e6b-9c10-2a5d8e9f0b11';
    expect((await send('/profile', profile(id), 'https://evil.example')).status).toBe(403);
    expect((await send('/profile', profile(id), null)).status).toBe(403);
    expect((await send('/profile', 'x'.repeat(5000))).status).toBe(413);
    expect((await worker.fetch(new Request('https://api.test/profile', { headers: { origin: ORIGIN } }), e())).status).toBe(405);
    const opt = await worker.fetch(new Request('https://api.test/profile', { method: 'OPTIONS', headers: { origin: 'https://www.sharjeelhashmat.com' } }), e());
    expect(opt.status).toBe(204);
    expect(opt.headers.get('access-control-allow-origin')).toBe('https://www.sharjeelhashmat.com');
  });
});

describe('POST /profile from the staging origin (TEST leads only)', () => {
  const STAGING = 'https://ck-site-web.sharjeelhashmat.workers.dev';
  const env2 = (over: Record<string, string> = {}): Env => ({ ...e(), STAGING_ORIGIN: STAGING, ...over }) as Env;
  const post = (path: string, body: unknown, origin: string | null, en: Env) =>
    worker.fetch(new Request(`https://api.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }), en);
  const testLead = async (en = env2()) => ((await (await post('/lead', lead, STAGING, en)).json()) as { id: string }).id;
  const realLead = async (en = env2()) => ((await (await post('/lead', lead, ORIGIN, en)).json()) as { id: string }).id;

  it('preflight from staging is allowed; with STAGING_ORIGIN empty it is not', async () => {
    const pre = await worker.fetch(new Request('https://api.test/profile', { method: 'OPTIONS', headers: { origin: STAGING } }), env2());
    expect(pre.headers.get('access-control-allow-origin')).toBe(STAGING);
    const off = await worker.fetch(new Request('https://api.test/profile', { method: 'OPTIONS', headers: { origin: STAGING } }), env2({ STAGING_ORIGIN: '' }));
    expect(off.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('staging + TEST lead: stored, CORS header, no owner alert, lead row untouched', async () => {
    const en = env2();
    const id = await testLead(en);
    expect((await rows('SELECT status FROM leads WHERE id = ?1', id))[0]!.status).toBe('TEST');
    const before = await rows('SELECT score, lane, status, quarantined, alert_level FROM leads WHERE id = ?1', id);
    const r = await post('/profile', profile(id), STAGING, en);
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe(STAGING);
    expect(await rows('SELECT lead_id FROM investor_profiles WHERE lead_id = ?1', id)).toHaveLength(1);
    expect(mails).toHaveLength(0);
    expect(await rows('SELECT score, lane, status, quarantined, alert_level FROM leads WHERE id = ?1', id)).toEqual(before);
    expect(await rows('SELECT * FROM messages')).toHaveLength(0);
  });

  it('staging + a real (non-TEST) lead or an unknown id: 403 not_allowed with the CORS header, nothing stored, no alert', async () => {
    const en = env2();
    const id = await realLead(en);
    mails = [];
    for (const target of [id, '3f2b8c1e-7d4a-4e6b-9c10-2a5d8e9f0b11']) {
      const r = await post('/profile', profile(target), STAGING, en);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ ok: false, error: 'not_allowed' });
      expect(r.headers.get('access-control-allow-origin')).toBe(STAGING);
    }
    expect(await rows('SELECT * FROM investor_profiles')).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });

  it('unknown origin is still rejected; production cannot reach a TEST lead; production is otherwise unchanged', async () => {
    const en = env2();
    const id = await testLead(en);
    const evil = await post('/profile', profile(id), 'https://evil.example', en);
    expect(evil.status).toBe(403);
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    const prodOnTest = await post('/profile', profile(id), ORIGIN, en);
    expect(prodOnTest.status).toBe(404);
    expect(await prodOnTest.json()).toEqual({ ok: false, error: 'invalid_link' });
    const real = await realLead(en);
    const ok = await post('/profile', profile(real), ORIGIN, en);
    expect(ok.status).toBe(200);
    expect(mails.filter((m) => m.subject.startsWith('[PROFILE]'))).toHaveLength(1);
  });

  it('other + other_area is stored inside areas; mismatches are 400 invalid_other_area; advice is accepted', async () => {
    const en = env2();
    const id = await realLead(en);
    const bad1 = await post('/profile', profile(id, { areas: ['other'] }), ORIGIN, en);
    expect(bad1.status).toBe(400);
    expect(await bad1.json()).toEqual({ ok: false, error: 'invalid_other_area' });
    const bad2 = await post('/profile', profile(id, { areas: ['palm-jumeirah'], other_area: 'JVC' }), ORIGIN, en);
    expect(await bad2.json()).toEqual({ ok: false, error: 'invalid_other_area' });
    const ok = await post('/profile', profile(id, { areas: ['other', 'advice', 'palm-jumeirah'], other_area: '  Yas   <Island> ' }), ORIGIN, en);
    expect(ok.status).toBe(200);
    expect((await rows('SELECT areas FROM investor_profiles WHERE lead_id = ?1', id))[0]!.areas).toBe('["advice","other:Yas Island","palm-jumeirah"]');
  });
});
