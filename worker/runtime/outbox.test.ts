// PR 2c item 1 (gaps G01, G02, G06) in workerd with real D1: one outbox row per message decides "send or not" before the
// provider is called (claim-then-send), carries the receipt (status, provider id, sent_at), and makes the first owner
// alert for a profile happen exactly once.
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';
import { d1Outbox } from '../src/outbox';
import { approveAllInKv, baseEnv, cf, clearDb, emails, lead, LIVE, ORIGIN, rows, stubFetch, toOf, type Call } from './helpers';

let calls: Call[] = [];
const verified = (action: string) => () => ({ success: true, hostname: 'sharjeelhashmat.com', action });
beforeEach(async () => { calls = []; await clearDb(); stubFetch(calls, { siteverify: verified('lead') }); });
afterEach(() => vi.unstubAllGlobals());

const post = (path: string, body: unknown, e: Env, ctx?: ExecutionContext) =>
  worker.fetch(new Request(`https://api.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) }), e, ctx);
const replies = () => emails(calls).filter((c) => toOf(c) !== 'owner@example.com');
const alerts = () => emails(calls).filter((c) => toOf(c) === 'owner@example.com');
const outbox = (kind?: string) => rows(`SELECT * FROM outbox ${kind ? 'WHERE kind = ?1' : ''} ORDER BY created_at`, ...(kind ? [kind] : []));
const live = async (over: Record<string, string> = {}) => { const e = baseEnv({ ...LIVE, ...over }); await approveAllInKv(e); return e; };

describe('outbox: lead replies', () => {
  it('a reply leaves one receipt: status sent, provider id, sent_at; Resend gets Idempotency-Key = outbox id; no address in any column', async () => {
    const e = await live();
    const res = await post('/lead', lead(), e);
    const { id } = (await res.json()) as { id: string };
    const [row] = await outbox('lead_reply');
    expect(row).toMatchObject({ lead_id: id, template_id: 'ACK-PRIORITY', status: 'sent', attempts: 1, error: null, dedupe_key: `lead_reply:${id}:ACK-PRIORITY` });
    expect(row!.provider_id).toMatch(/^re-\d+$/);
    expect(row!.sent_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(row!.template_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(replies()[0]!.headers['idempotency-key']).toBe(row!.id);
    const all = JSON.stringify(await outbox());
    for (const pii of ['amira@example.com', 'Amira', '+971501234567']) expect(all).not.toContain(pii);
  });

  it('duplicate submit, sent twice at once: one reply, one receipt', async () => {
    const e = await live();
    const [a, b] = await Promise.all([post('/lead', lead(), e), post('/lead', lead(), e)]);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect(replies()).toHaveLength(1);
    expect((await outbox('lead_reply')).filter((r) => r.status === 'sent')).toHaveLength(1);
    expect(await rows("SELECT id FROM messages WHERE outcome = 'sent'")).toHaveLength(1);
  });

  it('duplicate submit, sent twice in a row: one reply; the second lead records skipped duplicate', async () => {
    const e = await live();
    await post('/lead', lead(), e);
    await post('/lead', lead(), e);
    expect(replies()).toHaveLength(1);
    const r = await outbox('lead_reply');
    expect(r.map((x) => [x.status, x.error])).toEqual([['sent', null], ['skipped', 'duplicate']]);
  });

  it('daily cap: two different leads at cap-1 at the same time give exactly one claim and one reply', async () => {
    const e = await live({ DAILY_SEND_CAP: '3' });
    const now = new Date().toISOString();
    for (let i = 0; i < 2; i++) {
      await cf.DB.prepare("INSERT INTO outbox (id, dedupe_key, kind, created_at, status) VALUES (?1, ?2, 'lead_reply', ?3, 'sent')").bind(`seed-${i}`, `seed:${i}`, now).run();
    }
    // Owner alerts never count against the reply cap.
    for (let i = 0; i < 5; i++) {
      await cf.DB.prepare("INSERT INTO outbox (id, dedupe_key, kind, created_at, status) VALUES (?1, ?2, 'owner_alert', ?3, 'sent')").bind(`alert-${i}`, `alert:${i}`, now).run();
    }
    await Promise.all([post('/lead', lead({ email: 'one@example.com' }), e), post('/lead', lead({ email: 'two@example.com' }), e)]);
    expect(replies()).toHaveLength(1);
    const r = (await outbox('lead_reply')).filter((x) => !String(x.id).startsWith('seed-'));
    expect(r.map((x) => x.status).sort()).toEqual(['sent', 'skipped']);
    expect(r.find((x) => x.status === 'skipped')!.error).toBe('daily_cap');
    expect(alerts()).toHaveLength(2);
  });

  it('the claim itself is atomic: two claims at cap-1 at the same time, exactly one row', async () => {
    const ob = d1Outbox(cf.DB);
    const now = new Date().toISOString();
    await cf.DB.prepare("INSERT INTO outbox (id, dedupe_key, kind, created_at, status) VALUES ('s', 's', 'lead_reply', ?1, 'claimed')").bind(now).run();
    const claim = (n: number) => ob.claim(
      { id: `c${n}`, dedupe_key: `lead_reply:l${n}:T`, kind: 'lead_reply', lead_id: `l${n}`, template_id: 'T', template_hash: null, created_at: now },
      { capKinds: ['lead_reply'], cap: 2, since: now.slice(0, 10) + 'T00:00:00.000Z' },
    );
    const out = await Promise.all([claim(1), claim(2), claim(3)]);
    expect(out.filter((o) => o.claimed)).toHaveLength(1);
    expect(out.filter((o) => !o.claimed).map((o) => !o.claimed && o.reason)).toEqual(['daily_cap', 'daily_cap']);
    expect(await rows("SELECT id FROM outbox WHERE status = 'claimed'")).toHaveLength(2);
  });

  it('provider answers without an id: failed, error code only, no messages row, no "unknown" receipt', async () => {
    const e = await live();
    stubFetch(calls, { siteverify: verified('lead'), email: (_u, n) => (n === 2 ? Response.json({}) : Response.json({ id: `re-${n}` })) });
    await post('/lead', lead(), e);
    const [row] = await outbox('lead_reply');
    expect(row).toMatchObject({ status: 'failed', error: 'no_provider_id', provider_id: null, sent_at: null });
    expect(await rows('SELECT id FROM messages')).toHaveLength(0);
  });

  it('provider timeout: failed with code timeout; a retry of the same request at the same time sends nothing more', async () => {
    const e = await live();
    let attempts = 0;
    stubFetch(calls, {
      siteverify: verified('lead'),
      email: (url) => {
        if (!url.includes('resend')) return Response.json({ messageId: 'x' });
        const to = JSON.parse(JSON.stringify(calls.at(-1)!.body)).to[0];
        if (to === 'owner@example.com') return Response.json({ id: 'alert' });
        attempts += 1;
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    });
    await Promise.all([post('/lead', lead(), e), post('/lead', lead(), e)]);
    expect(attempts).toBe(1);
    const r = await outbox('lead_reply');
    expect(r.filter((x) => x.status === 'failed').map((x) => x.error)).toEqual(['timeout']);
    expect(r.filter((x) => x.status === 'sent')).toHaveLength(0);
  });

  it('a lead that gets no reply by design still leaves a lead_reply row: DUPLICATE and SUSPICIOUS skipped, SPAM and TEST none', async () => {
    const e = await live();
    await post('/lead', lead({ email: 'x@mailinator.com' }), e);
    await post('/lead', lead({ company_website: 'bot.example' }), e);
    const r = await rows("SELECT l.status, o.status AS o, o.error FROM leads l LEFT JOIN outbox o ON o.lead_id = l.id AND o.kind = 'lead_reply' ORDER BY l.created_at");
    expect(r).toEqual([{ status: 'SUSPICIOUS', o: 'skipped', error: 'quarantined' }, { status: 'SPAM', o: null, error: null }]);
  });

  it('replies off (go-live not complete): the row says skipped blocked', async () => {
    const e = baseEnv({ OUTBOUND_REPLIES: 'off' });
    await post('/lead', lead(), e);
    expect((await outbox('lead_reply')).map((x) => [x.status, x.error])).toEqual([['skipped', 'blocked']]);
  });
});

describe('outbox: owner alerts', () => {
  it('the lead alert has its own row, is not counted against the reply cap, and goes out in waitUntil', async () => {
    const e = await live();
    let release!: () => void;
    const gate = new Promise<void>((ok) => { release = ok; });
    stubFetch(calls, {
      siteverify: verified('lead'),
      email: async (_u, n) => { if (toOf(calls[n - 1]!) === 'owner@example.com') await gate; return Response.json({ id: `re-${n}` }); },
    });
    const ctx = createExecutionContext();
    const res = await post('/lead', lead(), e, ctx);
    // The response is ready while the alert is still waiting on the provider.
    expect(res.status).toBe(202);
    expect((await outbox('owner_alert')).map((x) => x.status)).toEqual(['claimed']);
    release();
    await waitOnExecutionContext(ctx);
    const [a] = await outbox('owner_alert');
    expect(a).toMatchObject({ status: 'sent', dedupe_key: `owner_alert:lead:${((await rows('SELECT id FROM leads'))[0]!.id)}` });
    expect(alerts()[0]!.headers['idempotency-key']).toBe(a!.id);
  });

  it('the not-stored alert stays awaited (the response waits for it)', async () => {
    const failing = new Proxy(cf.DB, {
      get(target, prop) {
        if (prop === 'prepare') return (sql: string) => (sql.trimStart().startsWith('INSERT INTO leads') ? { bind: () => ({ run: async () => { throw new Error('D1 down'); } }) } : target.prepare(sql));
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const e = { ...(await live()), DB: failing } as Env;
    const ctx = createExecutionContext();
    const res = await post('/lead', lead(), e, ctx);
    expect(res.status).toBe(503);
    expect(alerts()).toHaveLength(1);
    expect(((alerts()[0]!.body as { subject: string }).subject)).toMatch(/^\[NOT STORED/);
    await waitOnExecutionContext(ctx);
  });

  it('two first profile submissions at the same time: one owner alert (G06)', async () => {
    const e = baseEnv();
    const { id } = (await (await post('/lead', lead(), e)).json()) as { id: string };
    calls = [];
    stubFetch(calls);
    const p = { lead_id: id, objective: 'mix', property_type: 'villa', risk_tolerance: 'low', holding_period: '2_5y' };
    const [a, b] = await Promise.all([post('/profile', p, e), post('/profile', p, e)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(alerts()).toHaveLength(1);
    expect((await outbox('owner_alert')).filter((x) => String(x.dedupe_key).startsWith('owner_alert:profile:')).map((x) => x.status)).toEqual(['sent']);
    // A later update sends nothing more.
    await post('/profile', { ...p, objective: 'rental_income' }, e);
    expect(alerts()).toHaveLength(1);
    expect(await rows("SELECT type FROM events WHERE type LIKE 'profile_%' ORDER BY created_at")).toEqual(expect.arrayContaining([{ type: 'profile_saved' }, { type: 'profile_updated' }]));
  });
});

describe('outbox: newsletter welcome', () => {
  const sub = (body: Record<string, unknown>, e: Env) =>
    worker.fetch(new Request('https://api.test/api/newsletter/subscribe', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) }), e);

  it('one welcome per address and list, with a receipt; the key holds a hash, not the address', async () => {
    stubFetch(calls, { siteverify: verified('newsletter') });
    const e = await live();
    const s = { email: 'reader@example.com', source: 'footer', company_website: '', turnstile_token: 'ok' };
    await Promise.all([sub(s, e), sub(s, e)]);
    expect(replies()).toHaveLength(1);
    const r = await outbox('newsletter_welcome');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ status: 'sent', template_id: 'NEWS-WELCOME' });
    expect(String(r[0]!.dedupe_key)).toMatch(/^newsletter_welcome:[0-9a-f]{64}:monthly$/);
    expect(JSON.stringify(r)).not.toContain('reader@example.com');
  });
});
