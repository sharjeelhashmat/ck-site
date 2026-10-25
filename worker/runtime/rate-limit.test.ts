// PR 2c item 4b (gap G05): per-IP rate limits with the Workers Rate Limiting binding (wrangler.toml [[ratelimits]]),
// using the real bindings here. Per minute: /lead, /profile and the newsletter signup 5 each, /unsubscribe (both
// unsubscribe routes) 20, the unsubscribe feedback 10, GET routes 60. Over the limit: 429 with Retry-After and the same
// CORS header as the route's normal answers. /health is exempt. Each route and each IP counts separately.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';
import { baseEnv, cf, clearDb, ORIGIN, stubFetch, type Call } from './helpers';

let calls: Call[] = [];
beforeEach(async () => { calls = []; await clearDb(); stubFetch(calls); });
afterEach(() => vi.unstubAllGlobals());

// The limiters from wrangler.toml, not the open ones baseEnv uses.
const limited = (): Env => ({ ...baseEnv(), RL_FORMS: cf.RL_FORMS, RL_UNSUB: cf.RL_UNSUB, RL_FEEDBACK: cf.RL_FEEDBACK, RL_READ: cf.RL_READ } as Env);
let ipSeq = 0;
const freshIp = () => `198.51.100.${++ipSeq}`;

const hit = (method: string, path: string, ip: string, e: Env, body?: string) =>
  worker.fetch(new Request(`https://api.test${path}`, {
    method,
    headers: { origin: ORIGIN, 'cf-connecting-ip': ip, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body,
  }), e);

async function burst(method: string, path: string, n: number, ip: string, e: Env, body?: string) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((await hit(method, path, ip, e, body)).status);
  return out;
}

describe('rate limits per route and IP', () => {
  for (const [path, limit] of [['/lead', 5], ['/profile', 5], ['/api/newsletter/subscribe', 5]] as const) {
    it(`${path}: ${limit} a minute per IP, then 429 with Retry-After and CORS; another IP is unaffected`, async () => {
      const e = limited();
      const ip = freshIp();
      const first = await burst('POST', path, limit, ip, e, '{}');
      expect(first.every((s) => s !== 429), first.join(',')).toBe(true);
      const over = await hit('POST', path, ip, e, '{}');
      expect(over.status).toBe(429);
      expect(over.headers.get('retry-after')).toBe('60');
      expect(over.headers.get('access-control-allow-origin')).toBe(ORIGIN);
      expect(await over.json()).toEqual({ ok: false, error: 'rate_limited' });
      expect((await hit('POST', path, freshIp(), e, '{}')).status).not.toBe(429);
    });
  }

  it('the form routes count separately: using up /lead leaves the signup open', async () => {
    const e = limited();
    const ip = freshIp();
    await burst('POST', '/lead', 6, ip, e, '{}');
    expect((await hit('POST', '/api/newsletter/subscribe', ip, e, '{}')).status).not.toBe(429);
  });

  for (const path of ['/unsubscribe', '/api/newsletter/unsubscribe']) {
    it(`${path}: 20 a minute per IP (GET and POST together), then 429 with Retry-After`, async () => {
      const e = limited();
      const ip = freshIp();
      const first = [...(await burst('GET', path, 10, ip, e)), ...(await burst('POST', path, 10, ip, e, ''))];
      expect(first.every((s) => s !== 429), first.join(',')).toBe(true);
      const over = await hit('POST', path, ip, e, '');
      expect(over.status).toBe(429);
      expect(over.headers.get('retry-after')).toBe('60');
    });
  }

  it('/api/newsletter/unsubscribe/feedback: 10 a minute per IP', async () => {
    const e = limited();
    const ip = freshIp();
    const first = await burst('POST', '/api/newsletter/unsubscribe/feedback', 10, ip, e, '');
    expect(first.every((s) => s !== 429)).toBe(true);
    expect((await hit('POST', '/api/newsletter/unsubscribe/feedback', ip, e, '')).status).toBe(429);
  });

  it('GET /market/*: 60 a minute per IP, 429 keeps the CORS header', async () => {
    const e = limited();
    const ip = freshIp();
    const first = await burst('GET', '/market/status', 60, ip, e);
    expect(first.every((s) => s !== 429)).toBe(true);
    const over = await hit('GET', '/market/areas?period=12m', ip, e);
    expect(over.status).toBe(429);
    expect(over.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(over.headers.get('retry-after')).toBe('60');
  });

  it('/health is exempt and preflights are not counted', async () => {
    const e = limited();
    const ip = freshIp();
    expect((await burst('GET', '/health', 80, ip, e)).every((s) => s === 200)).toBe(true);
    expect((await burst('OPTIONS', '/lead', 10, ip, e)).every((s) => s === 204)).toBe(true);
    expect((await hit('POST', '/lead', ip, e, '{}')).status).not.toBe(429);
  });

  it('wrangler.toml declares the four limiters (free plan binding)', () => {
    for (const b of [cf.RL_FORMS, cf.RL_UNSUB, cf.RL_FEEDBACK, cf.RL_READ]) expect(typeof b?.limit).toBe('function');
  });
});
