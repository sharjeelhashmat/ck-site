// Security PR 1 (CodeQL code scanning fixes): the Worker admits a browser origin and a Turnstile hostname only by exact
// match against its allowlist, never by a substring, prefix or suffix of the raw string. Allowlist with SITE_URL
// https://sharjeelhashmat.com and STAGING_ORIGIN https://ck-site-staging.sharjeelhashmat.workers.dev:
//   CORS origins: https://sharjeelhashmat.com, https://www.sharjeelhashmat.com, each EXTRA_ORIGINS entry, and
//     STAGING_ORIGIN on /lead, /profile, /health and /market only (never the newsletter).
//   Turnstile hostnames: sharjeelhashmat.com, www.sharjeelhashmat.com, ck-site-staging.sharjeelhashmat.workers.dev.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { parseExtraOrigins } from '../src/config';
import { turnstileHosts } from '../src/turnstile';
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

const PROFILE = { lead_id: '3f2b8c1e-7d4a-4e6b-9c10-2a5d8e9f0b11', objective: 'mix', property_type: 'villa', risk_tolerance: 'low', holding_period: '2_5y' };
const SIGNUP = { email: 'reader@example.com', source: 'footer', company_website: '', turnstile_token: 'ok' };
const POSTS: Array<[string, unknown]> = [['/lead', lead()], ['/profile', PROFILE], ['/api/newsletter/subscribe', SIGNUP]];

const req = (path: string, method: string, origin: string, body?: unknown) =>
  new Request(`https://api.test${path}`, {
    method,
    headers: { origin, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

// Origins an attacker can send that contain, start with or end with a real host, or differ only in scheme or port.
const FAKE_ORIGINS = [
  'https://evil.example',
  'https://sharjeelhashmat.com.evil.example',
  'https://www.sharjeelhashmat.com.evil.example',
  'https://evil.example/sharjeelhashmat.com',
  'https://evil.example/?https://sharjeelhashmat.com',
  'https://sharjeelhashmat.com@evil.example',
  'https://evil.example#sharjeelhashmat.com',
  'https://evilsharjeelhashmat.com',
  'https://evil-sharjeelhashmat.com',
  'https://sub.sharjeelhashmat.com',
  'https://sharjeelhashmat.com.',
  'https://sharjeelhashmat.com:8443',
  'https://sharjeelhashmat.com/',
  'http://sharjeelhashmat.com',
  'http://www.sharjeelhashmat.com',
  'http://ck-site-staging.sharjeelhashmat.workers.dev',
  'https://ck-site-staging.sharjeelhashmat.workers.dev.evil.example',
  'https://x.ck-site-staging.sharjeelhashmat.workers.dev',
  'https://evil.workers.dev',
  'null',
  '',
];

describe('CORS origin allowlist: exact match only', () => {
  for (const origin of FAKE_ORIGINS) {
    it(`refuses origin ${JSON.stringify(origin)} on every POST route and its preflight, and stores nothing`, async () => {
      for (const [path, body] of POSTS) {
        const pre = await worker.fetch(req(path, 'OPTIONS', origin), baseEnv());
        expect(pre.headers.get('access-control-allow-origin'), `${path} preflight`).toBeNull();
        const res = await worker.fetch(req(path, 'POST', origin, body), baseEnv());
        expect(res.status, path).toBe(403);
        expect(res.headers.get('access-control-allow-origin'), path).toBeNull();
      }
      for (const path of ['/health', '/market/launches']) {
        const res = await worker.fetch(req(path, 'GET', origin), baseEnv());
        expect(res.headers.get('access-control-allow-origin'), path).toBeNull();
      }
      expect(await rows('SELECT id FROM leads')).toHaveLength(0);
      expect(await rows('SELECT id FROM newsletter_subscribers')).toHaveLength(0);
      expect(calls).toHaveLength(0);
    });
  }

  it('EXTRA_ORIGINS keeps bare https origins only: no path, userinfo, port, wildcard or http', () => {
    expect(parseExtraOrigins('https://preview.example, HTTPS://Second.Example')).toEqual(['https://preview.example', 'https://second.example']);
    for (const bad of ['http://preview.example', 'https://preview.example/', 'https://preview.example/sharjeelhashmat.com', 'https://sharjeelhashmat.com@evil.example', 'https://preview.example:8443', 'https://*.example', 'preview.example', 'https://localhost']) {
      expect(parseExtraOrigins(bad), bad).toEqual([]);
    }
  });

  it('an EXTRA_ORIGINS entry is admitted exactly, and its look-alikes are not', async () => {
    const extra = 'https://preview.example';
    const e = baseEnv({ EXTRA_ORIGINS: extra });
    expect((await worker.fetch(req('/lead', 'OPTIONS', extra), e)).headers.get('access-control-allow-origin')).toBe(extra);
    for (const o of [`${extra}.evil.example`, `${extra}@evil.example`, 'http://preview.example', 'https://x.preview.example']) {
      expect((await worker.fetch(req('/lead', 'OPTIONS', o), e)).headers.get('access-control-allow-origin'), o).toBeNull();
    }
  });

  it('every real origin still passes: production bare and www everywhere, staging on /lead, /profile, /health and /market', async () => {
    for (const origin of [ORIGIN, 'https://www.sharjeelhashmat.com']) {
      for (const [path] of POSTS) {
        expect((await worker.fetch(req(path, 'OPTIONS', origin), baseEnv())).headers.get('access-control-allow-origin'), `${origin} ${path}`).toBe(origin);
      }
      for (const path of ['/health', '/market/launches']) {
        expect((await worker.fetch(req(path, 'GET', origin), baseEnv())).headers.get('access-control-allow-origin'), `${origin} ${path}`).toBe(origin);
      }
    }
    for (const path of ['/lead', '/profile']) {
      expect((await worker.fetch(req(path, 'OPTIONS', STAGING), baseEnv())).headers.get('access-control-allow-origin'), path).toBe(STAGING);
    }
    for (const path of ['/health', '/market/launches']) {
      expect((await worker.fetch(req(path, 'GET', STAGING), baseEnv())).headers.get('access-control-allow-origin'), path).toBe(STAGING);
    }
    expect((await worker.fetch(req('/api/newsletter/subscribe', 'OPTIONS', STAGING), baseEnv())).headers.get('access-control-allow-origin')).toBeNull();

    answer = { success: true, hostname: 'sharjeelhashmat.com', action: 'lead' };
    expect((await worker.fetch(req('/lead', 'POST', ORIGIN, lead()), baseEnv())).status).toBe(202);
    answer = { success: true, hostname: 'www.sharjeelhashmat.com', action: 'lead' };
    expect((await worker.fetch(req('/lead', 'POST', 'https://www.sharjeelhashmat.com', lead({ email: 'b@example.com' })), baseEnv())).status).toBe(202);
    expect(await rows('SELECT id FROM leads')).toHaveLength(2);
  });
});

describe('Turnstile hostname allowlist: exact match only', () => {
  it('the allowlist is the bare and www production hosts plus the staging host, lower case, no scheme', () => {
    expect(turnstileHosts('https://sharjeelhashmat.com', STAGING)).toEqual(['sharjeelhashmat.com', 'www.sharjeelhashmat.com', 'ck-site-staging.sharjeelhashmat.workers.dev']);
    expect(turnstileHosts('https://www.sharjeelhashmat.com', '')).toEqual(['sharjeelhashmat.com', 'www.sharjeelhashmat.com']);
  });

  const FAKE_HOSTNAMES = [
    'evil.example',
    'sharjeelhashmat.com.evil.example',
    'www.sharjeelhashmat.com.evil.example',
    'evil.example/sharjeelhashmat.com',
    'sharjeelhashmat.com@evil.example',
    'evilsharjeelhashmat.com',
    'sub.sharjeelhashmat.com',
    'sharjeelhashmat.com.',
    'sharjeelhashmat.com:443',
    'https://sharjeelhashmat.com',
    'ck-site-staging.sharjeelhashmat.workers.dev.evil.example',
    'x.ck-site-staging.sharjeelhashmat.workers.dev',
    '',
  ];
  for (const hostname of FAKE_HOSTNAMES) {
    it(`a token solved on ${JSON.stringify(hostname)} is refused on /lead and the newsletter`, async () => {
      answer = { success: true, hostname, action: 'lead' };
      const res = await worker.fetch(req('/lead', 'POST', ORIGIN, lead()), baseEnv());
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ ok: false, error: 'verification_failed' });
      answer = { success: true, hostname, action: 'newsletter' };
      expect((await worker.fetch(req('/api/newsletter/subscribe', 'POST', ORIGIN, SIGNUP), baseEnv())).status).toBe(403);
      expect(await rows('SELECT id FROM leads')).toHaveLength(0);
      expect(await rows('SELECT id FROM newsletter_subscribers')).toHaveLength(0);
    });
  }

  it('every real hostname still passes, in any letter case', async () => {
    const real = ['sharjeelhashmat.com', 'www.sharjeelhashmat.com', 'ck-site-staging.sharjeelhashmat.workers.dev', 'WWW.SharjeelHashmat.com'];
    for (const [i, hostname] of real.entries()) {
      answer = { success: true, hostname, action: 'lead' };
      expect((await worker.fetch(req('/lead', 'POST', ORIGIN, lead({ email: `r${i}@example.com` })), baseEnv())).status, hostname).toBe(202);
    }
    expect(await rows('SELECT id FROM leads')).toHaveLength(real.length);
    answer = { success: true, hostname: 'www.sharjeelhashmat.com', action: 'newsletter' };
    expect((await worker.fetch(req('/api/newsletter/subscribe', 'POST', ORIGIN, SIGNUP), baseEnv())).status).toBe(200);
  });
});
