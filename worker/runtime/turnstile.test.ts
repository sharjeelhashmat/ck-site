// PR 2c item 2 (gap G03; PR 2 item 1 absorbed): a Turnstile pass counts only when siteverify says success AND the widget
// ran on one of our hosts (production bare and www from SITE_URL, plus the STAGING_ORIGIN host) AND its action is the one
// the route's form sets ('lead' on /lead, 'newsletter' on the signup). The reason is logged as a code; the token never is.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { verifyTurnstile } from '../src/index';
import { baseEnv, clearDb, lead, ORIGIN, rows, STAGING, stubFetch, type Call, type Siteverify } from './helpers';

let calls: Call[] = [];
let answer: Siteverify = {};
beforeEach(async () => {
  calls = [];
  answer = {};
  await clearDb();
  stubFetch(calls, { siteverify: () => answer });
});
afterEach(() => vi.unstubAllGlobals());

const post = (path: string, body: unknown, origin = ORIGIN) =>
  worker.fetch(new Request(`https://api.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) }), baseEnv());
const signup = { email: 'reader@example.com', source: 'footer', company_website: '', turnstile_token: 'tok-secret-value' };

describe('Turnstile: hostname and action', () => {
  it('/lead passes only with success, an allowed hostname and action "lead"', async () => {
    for (const hostname of ['sharjeelhashmat.com', 'www.sharjeelhashmat.com', 'ck-site-staging.sharjeelhashmat.workers.dev']) {
      answer = { success: true, hostname, action: 'lead' };
      expect((await post('/lead', lead({ email: `a.${hostname.length}@example.com` }))).status, hostname).toBe(202);
    }
    expect(await rows('SELECT id FROM leads')).toHaveLength(3);
  });

  const rejected: Array<[string, Siteverify]> = [
    ['wrong hostname', { success: true, hostname: 'evil.example', action: 'lead' }],
    ['look-alike hostname', { success: true, hostname: 'sharjeelhashmat.com.evil.example', action: 'lead' }],
    ['no hostname', { success: true, action: 'lead' }],
    ['wrong action', { success: true, hostname: 'sharjeelhashmat.com', action: 'newsletter' }],
    ['no action', { success: true, hostname: 'sharjeelhashmat.com' }],
    ['success false', { success: false, hostname: 'sharjeelhashmat.com', action: 'lead' }],
  ];
  for (const [label, a] of rejected) {
    it(`/lead rejects ${label}: 403 verification_failed, nothing stored`, async () => {
      answer = a;
      const res = await post('/lead', lead());
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ ok: false, error: 'verification_failed' });
      expect(await rows('SELECT id FROM leads')).toHaveLength(0);
    });
  }

  it('/lead rejects a siteverify timeout', async () => {
    vi.stubGlobal('fetch', async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); });
    expect((await post('/lead', lead())).status).toBe(403);
  });

  it('the newsletter signup needs action "newsletter" (a lead token is refused there)', async () => {
    answer = { success: true, hostname: 'sharjeelhashmat.com', action: 'lead' };
    expect((await post('/api/newsletter/subscribe', signup)).status).toBe(403);
    answer = { success: true, hostname: 'evil.example', action: 'newsletter' };
    expect((await post('/api/newsletter/subscribe', signup)).status).toBe(403);
    answer = { success: true, hostname: 'www.sharjeelhashmat.com', action: 'newsletter' };
    expect((await post('/api/newsletter/subscribe', signup)).status).toBe(200);
  });

  it('a staging lead still needs an allowed hostname and the right action', async () => {
    answer = { success: true, hostname: 'evil.example', action: 'lead' };
    expect((await post('/lead', lead(), STAGING)).status).toBe(403);
  });

  it('logs the reason code, never the token', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')); });
    answer = { success: true, hostname: 'evil.example', action: 'newsletter' };
    await post('/api/newsletter/subscribe', signup);
    answer = { success: true, hostname: 'sharjeelhashmat.com', action: 'other' };
    await post('/lead', lead({ turnstile_token: 'tok-secret-value' }));
    spy.mockRestore();
    expect(lines).toEqual(['turnstile: rejected hostname_mismatch', 'turnstile: rejected action_mismatch']);
    expect(lines.join(' ')).not.toContain('tok-secret-value');
  });
});

describe('verifyTurnstile reason codes', () => {
  const hosts = ['sharjeelhashmat.com'];
  const run = (a: Siteverify | Error, token: unknown = 't') => {
    vi.stubGlobal('fetch', async () => { if (a instanceof Error) throw a; return Response.json(a); });
    return verifyTurnstile('secret', token, null, { hosts, action: 'lead' });
  };
  it('names why a check failed', async () => {
    expect(await run({ success: true, hostname: 'sharjeelhashmat.com', action: 'lead' })).toEqual({ ok: true, reason: 'ok' });
    expect(await run({ success: false })).toEqual({ ok: false, reason: 'not_success' });
    expect(await run({ success: true, hostname: 'x.example', action: 'lead' })).toEqual({ ok: false, reason: 'hostname_mismatch' });
    expect(await run({ success: true, hostname: 'sharjeelhashmat.com', action: 'x' })).toEqual({ ok: false, reason: 'action_mismatch' });
    expect(await run(new DOMException('t', 'TimeoutError'))).toEqual({ ok: false, reason: 'timeout' });
    expect(await run(new Error('net'))).toEqual({ ok: false, reason: 'unreachable' });
    expect(await run({ success: true }, '')).toEqual({ ok: false, reason: 'no_token' });
    expect(await verifyTurnstile(undefined, 't', null, { hosts, action: 'lead' })).toEqual({ ok: false, reason: 'no_secret' });
    expect(await verifyTurnstile('1x0000000000000000000000000000000AA', 't', null, { hosts, action: 'lead' })).toEqual({ ok: false, reason: 'test_secret' });
  });
});
