// The private Reelly research tool (worker/reelly). Real crypto: a generated RSA key signs real Cloudflare Access tokens,
// and the Access signing keys are served by a stub fetch. Reelly is a stub too; no network.
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

type CryptoKey = webcrypto.CryptoKey;
type JsonWebKey = webcrypto.JsonWebKey;
type CryptoKeyPair = webcrypto.CryptoKeyPair;
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, SECURITY_HEADERS, type Env } from '../reelly/src/app';
import { resetKeyCache, teamDomain } from '../reelly/src/access';
import { BASE, DATA_TTL, DICT_TTL, resolve, type CacheLike } from '../reelly/src/reelly';
import { OWNER_WHATSAPP } from '../reelly/src/config';
import { buildCss } from '../reelly/src/css';

const TEAM = 'ownerteam.cloudflareaccess.com';
const AUD = 'aud-tag-0123456789abcdef';
const KEY = 'SENTINEL-reelly-key-must-never-leak-7f3a9c';
const NOW = Date.UTC(2026, 10, 19, 9, 0, 0);
const ENV: Env = { REELLY_API_KEY: KEY, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, OWNER_EMAIL: 'owner@example.com' };

const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

let signer: CryptoKey;
let otherSigner: CryptoKey;
let jwk: JsonWebKey;
async function keys() {
  const gen = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
  const a = await gen();
  const b = await gen();
  signer = a.privateKey;
  otherSigner = b.privateKey;
  jwk = await crypto.subtle.exportKey('jwk', a.publicKey);
}
async function token(claims: Record<string, unknown> = {}, opts: { key?: CryptoKey; alg?: string; kid?: string } = {}) {
  const h = enc({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'kid-1', typ: 'JWT' });
  const p = enc({ iss: `https://${TEAM}`, aud: [AUD], exp: NOW / 1000 + 600, iat: NOW / 1000 - 10, nbf: NOW / 1000 - 10, email: 'owner@example.com', ...claims });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', opts.key ?? signer, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}

interface Call { url: string; headers: Record<string, string> }
/** A stub fetch: the Access certs, and Reelly answers from a map of URL to a list of responses (consumed in order). */
function stub(reelly: Record<string, Array<() => Response>>) {
  const calls: Call[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    calls.push({ url, headers });
    if (url === `https://${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [{ ...jwk, kid: 'kid-1', alg: 'RS256' }] });
    const queue = reelly[url];
    if (!queue || queue.length === 0) return new Response('no stub for ' + url, { status: 599 });
    return (queue.length > 1 ? queue.shift() : queue[0])!();
  }) as typeof fetch;
  return { f, calls, reelly: () => calls.filter((c) => c.url.startsWith(BASE)) };
}
const memCache = (): CacheLike & { puts: [string, number][] } => {
  const m = new Map<string, string>();
  const puts: [string, number][] = [];
  return { puts, async get(k) { return m.get(k) ?? null; }, async put(k, v, ttl) { m.set(k, v); puts.push([k, ttl]); } };
};
const ASSETS = { css: buildCss("@import '@fontsource-variable/inter';\nbody{margin:0}", ['.x{}']), fonts: { 'inter-latin-wght-normal.woff2': new ArrayBuffer(4) } };
const app = (s: ReturnType<typeof stub>, cache = memCache(), sleeps: number[] = []) =>
  createApp({ fetch: s.f, assets: ASSETS, cache, now: () => NOW, sleep: async (ms) => { sleeps.push(ms); } });
const get = async (a: ReturnType<typeof app>, path: string, env: Env = ENV, init: RequestInit = {}, tok?: string | null) => {
  const headers = new Headers(init.headers);
  if (tok !== null) headers.set('Cf-Access-Jwt-Assertion', tok ?? (await token()));
  return a.fetch(new Request(`https://ck-reelly-tool.owner.workers.dev${path}`, { ...init, headers }), env);
};
const ok = (body: unknown) => () => Response.json(body);
const allText = async (r: Response) => { let s = await r.clone().text(); r.headers.forEach((v, k) => { s += `\n${k}: ${v}`; }); return s; };

const PROJECT = {
  id: 77, name: 'Harbour Point', developer: 'Real Developer', location: { district: 'Dubai Marina', region: 'Dubai' }, cover_image: { url: 'https://media.reelly.example/c.webp' },
  min_price: 1500000, max_price: 3200000, price_currency: 'AED', sale_status: 'on_sale', sale_status_display: 'On Sale', construction_status: 'under_construction',
  completion_date: '2028-09-30', payment_plans: [{ id: 1, name: '60/40', is_handover: false, steps: [{ name: 'On booking', percentage: 20 }, { name: 'On handover', percentage: 40 }] }],
  typical_units: [{ unit_type: 'apartments', bedrooms: 2, from_price_aed: 1500000, to_price_aed: 2100000 }],
  marketing_brochure: 'https://media.reelly.example/brochure.pdf', floor_plans: [{ id: 3, name: 'fp/2br.pdf', file: 'https://media.reelly.example/2br.pdf' }],
};
const DICTS = {
  [`${BASE}/regions`]: [ok([{ id: 1, name: 'Dubai' }, { id: 2, name: 'Abu Dhabi' }])],
  [`${BASE}/districts`]: [ok({ count: 1, next: null, previous: null, results: [{ id: 10, name: 'Dubai Marina' }] })],
  [`${BASE}/developers`]: [ok([{ id: 5, name: 'Real Developer' }])],
};

beforeEach(async () => {
  resetKeyCache();
  if (!signer) await keys();
});

describe('Cloudflare Access: every request needs a valid token', () => {
  it('serves the owner with a valid token', async () => {
    const s = stub({ ...DICTS, [`${BASE}/projects?limit=24&offset=0&preferred_currency=AED`]: [ok({ count: 1, next: null, previous: null, results: [PROJECT] })] });
    const r = await get(app(s), '/launches');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('Harbour Point');
  });
  it('refuses a missing, malformed, unsigned, re-signed, expired, wrong-audience, wrong-issuer or wrong-email token', async () => {
    const s = stub({});
    const a = app(s);
    const bad = [
      null, 'not-a-token', 'a.b.c',
      await token({}, { alg: 'none' }), await token({}, { key: otherSigner }), await token({}, { kid: 'unknown' }),
      await token({ exp: NOW / 1000 - 1 }), await token({ aud: ['another-app'] }), await token({ iss: 'https://evil.cloudflareaccess.com' }),
      await token({ nbf: NOW / 1000 + 3600 }), await token({ email: 'someone@example.com' }), await token({ exp: undefined }),
    ];
    for (const t of bad) {
      for (const path of ['/launches', '/api/projects', '/assets/app.css', '/launches/77']) {
        const r = await get(a, path, ENV, {}, t);
        expect(r.status, `${path} ${String(t).slice(0, 20)}`).toBe(403);
      }
    }
    expect(s.reelly()).toEqual([]);
  });
  it('without OWNER_EMAIL, any email the Access policy let through is accepted', async () => {
    const s = stub({ ...DICTS, [`${BASE}/projects?limit=24&offset=0&preferred_currency=AED`]: [ok({ count: 0, next: null, previous: null, results: [] })] });
    const r = await get(app(s), '/launches', { ...ENV, OWNER_EMAIL: '' }, {}, await token({ email: 'someone@example.com' }));
    expect(r.status).toBe(200);
  });
  it('without the Access variables, everything answers 503 "not configured" and Reelly is never called', async () => {
    const s = stub({});
    for (const env of [{ ...ENV, ACCESS_AUD: '' }, { ...ENV, ACCESS_TEAM_DOMAIN: '' }, { ...ENV, ACCESS_TEAM_DOMAIN: 'evil.example.com' }]) {
      const page = await get(app(s), '/launches', env);
      expect(page.status).toBe(503);
      expect(await page.text()).toContain('Not configured');
      const api = await get(app(s), '/api/projects', env);
      expect([api.status, await api.json()]).toEqual([503, { error: 'not_configured', message: 'Cloudflare Access is not configured for this tool.' }]);
    }
    expect(s.calls).toEqual([]);
  });
  it('reads the team domain however it was pasted', () => {
    expect(teamDomain('https://OwnerTeam.cloudflareaccess.com/')).toBe(TEAM);
    expect(teamDomain('ownerteam.cloudflareaccess.com.evil.com')).toBeNull();
  });
});

describe('the proxy: GET only, allowlisted endpoints and parameters, the key only in its header', () => {
  it('refuses every method but GET, before anything else', async () => {
    const s = stub({});
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      const r = await get(app(s), '/api/projects', ENV, { method });
      expect(r.status, method).toBe(405);
    }
    expect(s.calls).toEqual([]);
  });
  it('refuses unknown or malformed paths', async () => {
    const s = stub({});
    for (const p of ['/api/brokers', '/api/projects/abc', '/api/projects/1/units/2', '/api/projects/1/../../admin', '/api/clients/projects', '/api/', '/api/projects/slug/Bad_Slug']) {
      const r = await get(app(s), p);
      expect(r.status, p).toBe(404);
    }
    expect(s.reelly()).toEqual([]);
  });
  it('keeps only the documented parameters and forwards no visitor header', async () => {
    const url = `${BASE}/projects?developer=5&limit=20&region=Dubai`;
    const s = stub({ [url]: [ok({ count: 0, next: null, previous: null, results: [] })] });
    const r = await get(app(s), '/api/projects?region=Dubai&developer=5&limit=20&api_key=x&format=xml&evil=%3Cscript%3E', ENV, {
      headers: { Authorization: 'Bearer visitor', 'X-API-Key': 'visitor-key', Cookie: 'a=b', 'X-Forwarded-For': '1.2.3.4' },
    });
    expect(r.status).toBe(200);
    expect(s.reelly()).toEqual([{ url, headers: { accept: 'application/json', 'x-api-key': KEY } }]);
  });
  it('never puts the key in a response: pages, JSON, errors, rate limits or headers', async () => {
    const s = stub({
      ...DICTS,
      [`${BASE}/projects?limit=24&offset=0&preferred_currency=AED`]: [ok({ count: 1, next: null, previous: null, results: [PROJECT] })],
      [`${BASE}/projects/77?preferred_currency=AED`]: [ok(PROJECT)],
      [`${BASE}/projects/77/units?limit=100&preferred_currency=AED`]: [ok({ count: 0, next: null, previous: null, results: [] })],
      [`${BASE}/projects/8`]: [() => new Response(`{"detail":"bad key ${KEY}"}`, { status: 403 })],
      [`${BASE}/projects/9`]: [() => new Response(KEY, { status: 429 })],
      [`${BASE}/projects/10`]: [() => new Response(`<html>${KEY}</html>`, { status: 500 })],
    });
    const a = app(s);
    for (const p of ['/launches', '/launches/77', '/api/projects/77', '/api/projects/8', '/api/projects/9', '/api/projects/10', '/api/status', '/launches?demo=1', '/nothing']) {
      expect(await allText(await get(a, p)), p).not.toContain(KEY);
    }
  });
  it('is never in the Worker bundle or its config, even when the key is in the build environment', () => {
    const toml = readFileSync(join(__dirname, '../reelly/wrangler.toml'), 'utf8');
    expect(toml).not.toMatch(/^\s*REELLY_API_KEY\s*=/m);
    const out = mkdtempSync(join(tmpdir(), 'reelly-bundle-'));
    execFileSync('npx', ['--no-install', 'wrangler', 'deploy', '--dry-run', '-c', 'reelly/wrangler.toml', '--outdir', out], {
      cwd: join(__dirname, '..'), env: { ...process.env, REELLY_API_KEY: KEY, WRANGLER_SEND_METRICS: 'false' }, stdio: 'pipe',
    });
    const files = readdirSync(out).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const js = readFileSync(join(out, f), 'utf8');
      expect(js, f).not.toContain(KEY);
      expect(js, f).toContain('X-API-Key');
    }
  }, 60_000);
});

describe('Reelly calls: pagination, 429, caching', () => {
  it('follows "next" until it is null for a dictionary', async () => {
    const s = stub({
      [`${BASE}/districts`]: [ok({ count: 3, next: `${BASE}/districts?limit=2&offset=2`, previous: null, results: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] })],
      [`${BASE}/districts?limit=2&offset=2`]: [ok({ count: 3, next: null, previous: `${BASE}/districts?limit=2`, results: [{ id: 3, name: 'C' }] })],
    });
    const r = await get(app(s), '/api/districts');
    expect(await r.json()).toEqual([{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }]);
    expect(s.reelly().map((c) => c.url)).toEqual([`${BASE}/districts`, `${BASE}/districts?limit=2&offset=2`]);
  });
  it('never follows a "next" that leaves the Reelly API, and never sends the key there', async () => {
    const s = stub({ [`${BASE}/districts`]: [ok({ count: 9, next: 'https://evil.example/steal', previous: null, results: [{ id: 1, name: 'A' }] })] });
    const r = await get(app(s), '/api/districts');
    expect(r.status).toBe(502);
    expect(s.calls.some((c) => new URL(c.url).hostname === 'evil.example')).toBe(false);
  });
  it('rewrites a list page\'s next and previous links to this tool', async () => {
    const s = stub({ [`${BASE}/projects?limit=2`]: [ok({ count: 5, next: `${BASE}/projects?limit=2&offset=2`, previous: null, results: [] })] });
    expect(await (await get(app(s), '/api/projects?limit=2')).json()).toEqual({ count: 5, next: '/api/projects?limit=2&offset=2', previous: null, results: [] });
  });
  it('retries a 429 with backoff (Retry-After honoured, at most 5 s), then succeeds', async () => {
    const sleeps: number[] = [];
    const s = stub({ [`${BASE}/projects/5`]: [() => new Response('', { status: 429, headers: { 'Retry-After': '30' } }), () => new Response('', { status: 429 }), ok({ id: 5, name: 'X' })] });
    const r = await get(app(s, memCache(), sleeps), '/api/projects/5');
    expect([r.status, sleeps]).toEqual([200, [5000, 1000]]);
  });
  it('reports a 429 that persists as a clear message, status 429', async () => {
    const s = stub({ [`${BASE}/projects/5`]: [() => new Response('', { status: 429 })] });
    const r = await get(app(s), '/api/projects/5');
    expect([r.status, await r.json()]).toEqual([429, { error: 'rate_limited', message: 'Reelly is limiting requests right now. Try again in a minute.' }]);
    expect(s.reelly()).toHaveLength(3);
  });
  it('caches dictionaries 24 hours and project data 1 hour; a cached answer makes no call', async () => {
    const cache = memCache();
    const s = stub({ ...DICTS, [`${BASE}/projects/77`]: [ok(PROJECT)] });
    const a = app(s, cache);
    await get(a, '/api/regions');
    await get(a, '/api/regions');
    await get(a, '/api/projects/77');
    expect(s.reelly().map((c) => c.url)).toEqual([`${BASE}/regions`, `${BASE}/projects/77`]);
    expect(cache.puts).toEqual([[`${BASE}/regions`, DICT_TTL], [`${BASE}/projects/77`, DATA_TTL]]);
    expect([DICT_TTL, DATA_TTL]).toEqual([86400, 3600]);
  });
  it('maps an invalid key to a plain message (never Reelly\'s body)', async () => {
    const s = stub({ [`${BASE}/projects/5`]: [() => new Response('{"detail":"Invalid API key"}', { status: 403 })] });
    const r = await get(app(s), '/api/projects/5');
    expect([r.status, await r.json()]).toEqual([502, { error: 'upstream', message: 'Reelly refused the API key (missing, invalid or expired).' }]);
  });
  it('resolve: the allowlist, with the documented parameters only', () => {
    expect(resolve('/projects/slug/harbour-point', new URLSearchParams('preferred_currency=AED&x=1'))).toEqual({ url: `${BASE}/projects/slug/harbour-point?preferred_currency=AED`, kind: 'data', ttl: DATA_TTL });
    expect(resolve('/units/types', new URLSearchParams('limit=5'))?.url).toBe(`${BASE}/units/types`);
    expect(resolve('/projects', new URLSearchParams('region=<x>'))?.url).toBe(`${BASE}/projects`);
    expect(resolve('/brokers', new URLSearchParams())).toBeNull();
  });
});

describe('not configured, demo data, pages', () => {
  it('without REELLY_API_KEY: the pages say "not configured" with a demo link, the proxy answers 503', async () => {
    const s = stub({});
    const env = { ...ENV, REELLY_API_KEY: '' };
    const page = await get(app(s), '/launches', env);
    expect(page.status).toBe(503);
    const h = await page.text();
    expect(h).toContain('Not configured');
    expect(h).toContain('href="/launches?demo=1"');
    const api = await get(app(s), '/api/projects', env);
    expect([api.status, ((await api.json()) as { error?: string }).error]).toEqual([503, 'not_configured']);
    expect(s.reelly()).toEqual([]);
  });
  it('demo mode works without a key and labels everything "Demo data"', async () => {
    const s = stub({});
    const env = { ...ENV, REELLY_API_KEY: '' };
    const list = await (await get(app(s), '/launches?demo=1', env)).text();
    expect(list.match(/<p class="lc-demo">Demo data<\/p>/g)).toHaveLength(3);
    expect(list).toContain('Demo data: placeholder values for layout only, not real projects.');
    const project = await get(app(s), '/launches/900001?demo=1', env);
    expect(project.status).toBe(200);
    const p = await project.text();
    expect(p).toContain('Demo data: placeholder values for layout only, not a real project.');
    expect(p).toContain('https://wa.me/971555414468?text=');
    expect(p).toContain('Source: built-in demo data for the layout, not from Reelly.');
    expect(p).not.toContain('Source: Reelly');
    expect(list).toContain('Source: built-in demo data for the layout, not from Reelly.');
    expect(s.reelly()).toEqual([]);
  });
  it('the listing and project page from Reelly data: cards, payment plans, unit types, units, documents, WhatsApp', async () => {
    const s = stub({
      ...DICTS,
      [`${BASE}/projects?completion_date_ranges=1798761600-1861919999&developer=5&districts=10&limit=24&offset=0&preferred_currency=AED&region=Dubai&sale_status=on_sale&status=under_construction&unit_price_from=1000000&unit_price_to=2000000`]: [ok({ count: 1, next: null, previous: null, results: [PROJECT] })],
      [`${BASE}/projects/77?preferred_currency=AED`]: [ok(PROJECT)],
      [`${BASE}/projects/77/units?limit=100&preferred_currency=AED`]: [ok({ count: 2, next: null, previous: null, results: [{ id: 1, unit_type: 'apartments', bedrooms: 2, size: 1200, price: 1600000, status: 'available' }, { id: 2, unit_type: 'apartments', bedrooms: 2, size: 1300, price: 1800000, status: 'sold' }] })],
    });
    const a = app(s);
    const list = await (await get(a, '/launches?region=Dubai&district=10&developer=5&sale_status=on_sale&status=under_construction&handover_from=2027&handover_to=2028&price_from=1000000&price_to=2000000')).text();
    expect(list).toContain('<a href="/launches/77">Harbour Point</a>');
    expect(list).toContain('AED 1,500,000');
    expect(list).toContain('<option value="10" selected>Dubai Marina</option>');
    expect(list).not.toContain('Demo data');
    const p = await (await get(a, '/launches/77')).text();
    for (const x of ['Payment plans', '60/40', '<span>On booking</span> <strong>20%</strong>', 'Unit types', 'Apartments, 2 bedrooms', 'AED 1,500,000 to AED 2,100,000', '1 of 2', 'Marketing brochure', 'https://wa.me/971555414468', 'Q3 2028']) expect(p, x).toContain(x);
  });
  it('every response is private, noindex and script-free; the stylesheet replaces the font imports', async () => {
    const s = stub({});
    const a = app(s);
    for (const p of ['/launches?demo=1', '/assets/app.css', '/assets/fonts/inter-latin-wght-normal.woff2', '/api/status', '/nothing']) {
      const r = await get(a, p);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(r.headers.get(k), `${p} ${k}`).toBe(k === 'Cache-Control' && p.startsWith('/assets/') ? r.headers.get(k) : v);
      expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
    }
    expect(SECURITY_HEADERS['Content-Security-Policy']).not.toMatch(/script-src/);
    const page = await (await get(a, '/launches?demo=1')).text();
    expect(page).not.toMatch(/<script/i);
    expect(page).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
    const css = await (await get(a, '/assets/app.css')).text();
    expect(css).not.toContain('@import');
    expect(css).toContain("font-family:'Inter Variable'");
    expect((await get(a, '/')).headers.get('Location')).toBe('/launches');
  });
  it('the WhatsApp number is the site\'s own (site.ts SITE.phoneE164)', () => {
    const site = readFileSync(join(__dirname, '../../site/src/lib/site.ts'), 'utf8');
    expect(site).toContain(`phoneE164: '${OWNER_WHATSAPP}'`);
  });
});
