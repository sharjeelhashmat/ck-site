// Run after `npm run build`. Guards the promises made in MIGRATION.md and the Worker contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url).pathname;
const dist = join(root, 'dist');
const read = (p) => readFileSync(join(dist, p), 'utf8');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));

// Every path in the live sitemap on 2026-09-20 (see MIGRATION.md).
const LEGACY = ['/', '/buy', '/invest', '/sell', '/areas', '/new-launches', '/insights', '/about', '/contact', '/privacy', '/terms',
  '/areas/downtown-dubai', '/areas/dubai-marina', '/areas/dubai-hills', '/areas/dubai-creek-harbour', '/areas/dubai-islands',
  '/areas/palm-jumeirah', '/areas/palm-jebel-ali', '/areas/dubai-maritime-city'];

test('every legacy URL still resolves to a built page (301 map is identity)', () => {
  for (const p of LEGACY) {
    const f = p === '/' ? 'index.html' : p.slice(1) + '.html';
    assert.ok(existsSync(join(dist, f)), `missing ${f}`);
  }
});

test('page required by the approved lead-reply templates exists and the Worker still points at it', () => {
  assert.ok(existsSync(join(dist, 'investment-approach.html')));
  const pipeline = readFileSync(join(root, '../worker/src/pipeline.ts'), 'utf8');
  assert.match(pipeline, /\$\{c\.siteUrl\}\/investment-approach/);
});

test('every page has one title, one h1, a www canonical, and is noindex in non-production builds', () => {
  for (const f of htmlFiles) {
    const h = readFileSync(f, 'utf8');
    assert.equal((h.match(/<title>/g) ?? []).length, 1, f);
    assert.equal((h.match(/<h1[ >]/g) ?? []).length, 1, `${f}: h1 count`);
    assert.match(h, /<link rel="canonical" href="https:\/\/www\.sharjeelhashmat\.com/, f);
    assert.match(h, /<meta name="robots" content="noindex,nofollow">/, f);
  }
  assert.match(read('robots.txt'), /Disallow: \//);
});

test('owner decisions hold: no Gmail, no "Investment Advisor", no Firebase, no "broker" word, no trademark symbol, brokerage named beside BRN', () => {
  for (const f of htmlFiles) {
    const h = readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    assert.doesNotMatch(h, /gmail/i, f);
    assert.doesNotMatch(h, /investment advis[eo]r/i, f);
    assert.doesNotMatch(h, /firebase|firestore/i, f);
    assert.doesNotMatch(h, /\bbroker\b/i, f);
    assert.match(h, /BRN /, `${f}: BRN line`);
    assert.match(h, /Working with Royals Field Properties · BRN /, `${f}: brokerage beside BRN`);
    assert.doesNotMatch(h, /™/, `${f}: no trademark symbol`);
    assert.doesNotMatch(h, /affiliated with any employer/i, f);
    assert.doesNotMatch(h, /every listed property/i, f);
  }
});

test('sitemap lists only pages with real content', () => {
  const s = read('sitemap-0.xml');
  for (const p of ['/new-launches', '/investor-profile', '/areas/downtown-dubai']) assert.doesNotMatch(s, new RegExp(p + '<'), p);
  // Decision 5: Insights enters the sitemap once 3 non-stale articles are published (true since 2026-09-21).
  for (const p of ['/insights', '/insights/dubai-q1-2026-who-is-buying']) assert.match(s, new RegExp(p + '<'), p);
  for (const p of ['/buy', '/invest', '/investment-approach', '/contact']) assert.match(s, new RegExp(p + '<'), p);
});

test('form field values are a subset of what the Worker accepts', () => {
  const types = readFileSync(join(root, '../worker/src/types.ts'), 'utf8');
  const enumOf = (name) => [...types.match(new RegExp(`${name} = \\[([^\\]]+)\\]`))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const allowed = { intent: enumOf('INTENTS'), budget_band: enumOf('BUDGETS'), timeline: enumOf('TIMELINES'), funding: enumOf('FUNDINGS') };
  for (const page of ['contact.html', 'sell.html']) {
    const h = read(page);
    for (const [name, set] of Object.entries(allowed)) {
      const sel = h.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)</select>`));
      const hidden = h.match(new RegExp(`<input type="hidden" name="${name}" value="([^"]+)"`));
      const vals = sel ? [...sel[1].matchAll(/value="([^"]*)"/g)].map((m) => m[1]) : hidden ? [hidden[1]] : [];
      for (const v of vals) assert.ok(set.includes(v), `${page}: ${name}=${v} not accepted by Worker`);
    }
    assert.match(h, /name="company_website"/, `${page}: honeypot field name must match Worker`);
    assert.match(h, /data-sitekey="0x4AAAAAAE9Ndhe9on1juQ_h"/, `${page}: turnstile key`);
  }
});

test('CSP: no unsafe-inline for scripts, and every inline script is hash-covered', () => {
  const headers = read('_headers');
  const scriptSrc = headers.match(/script-src ([^;]+);/)[1];
  assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-eval/);
  for (const f of htmlFiles) {
    const h = readFileSync(f, 'utf8');
    for (const m of h.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/ld\+json/.test(m[1])) continue;
      const hash = `'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`;
      assert.ok(scriptSrc.includes(hash), `${f}: inline script not covered by CSP`);
    }
  }
});

test('llms.txt lists every published article, no drafts, and every link resolves to a built page', () => {
  const llms = read('llms.txt');
  const urls = [...llms.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((m) => new URL(m[1]));
  for (const u of urls) assert.equal(u.origin, 'https://www.sharjeelhashmat.com', `llms.txt link ${u.href} must use the canonical www origin`);
  const links = urls.map((u) => u.pathname);
  assert.ok(links.length > 0);
  // The Investor Profile works only from the link shown after an enquiry, so it is never offered as a page to visit.
  assert.ok(!links.includes('/investor-profile'), 'llms.txt must not list /investor-profile');
  for (const p of links) {
    const f = p === '/' ? 'index.html' : p.slice(1) + '.html';
    assert.ok(existsSync(join(dist, f)), `llms.txt links to ${p}, which is not a built page`);
  }
  const dataDir = join(root, 'src/data/insights');
  for (const f of readdirSync(dataDir).filter((n) => n.endsWith('.json'))) {
    const a = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
    const listed = links.includes(`/insights/${a.slug}`);
    if (a.status === 'published') assert.ok(listed, `llms.txt is missing published article ${a.slug}`);
    else assert.ok(!listed, `llms.txt lists unpublished article ${a.slug}`);
  }
});

test('analytics: a default build has no beacon and the CSP does not allow Cloudflare Insights', () => {
  for (const f of htmlFiles) assert.doesNotMatch(readFileSync(f, 'utf8'), /cloudflareinsights/, f);
  assert.doesNotMatch(read('_headers'), /cloudflareinsights/);
});

test('analytics: the beacon ships only on a public build with a token, and the CSP then allows exactly its origins', () => {
  const build = (outDir, env) => spawnSync('npx', ['astro', 'build', '--outDir', outDir], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
  const token = 'abcdef0123456789abcdef0123456789';

  const pub = '/tmp/ck-site-analytics-public';
  assert.equal(build(pub, { PUBLIC_INDEXABLE: 'true', PUBLIC_BRN: 'TEST-123', PUBLIC_CF_ANALYTICS_TOKEN: token }).status, 0);
  for (const f of walk(pub).filter((p) => p.endsWith('.html'))) {
    assert.match(readFileSync(f, 'utf8'), new RegExp(`data-cf-beacon="\\{(&#34;|&quot;)token\\1:\\1${token}\\1\\}"`), `${f}: beacon`);
  }
  assert.equal(spawnSync('node', ['scripts/postbuild.mjs', pub], { cwd: root, encoding: 'utf8' }).status, 0);
  const headers = readFileSync(join(pub, '_headers'), 'utf8');
  assert.match(headers.match(/script-src ([^;]+);/)[1], / https:\/\/static\.cloudflareinsights\.com$/);
  assert.match(headers.match(/connect-src ([^;]+);/)[1], / https:\/\/cloudflareinsights\.com$/);

  const staging = '/tmp/ck-site-analytics-staging';
  assert.equal(build(staging, { PUBLIC_INDEXABLE: 'false', PUBLIC_CF_ANALYTICS_TOKEN: token }).status, 0);
  for (const f of walk(staging).filter((p) => p.endsWith('.html'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /cloudflareinsights/, f);
});

test('a production-indexable build refuses to run without a BRN', () => {
  const r = spawnSync('npx', ['astro', 'build', '--outDir', '/tmp/ck-site-brn-test'], { cwd: root, env: { ...process.env, PUBLIC_INDEXABLE: 'true', PUBLIC_BRN: '' }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /requires PUBLIC_BRN/);
});


test('no wildcard redirect shadows a built page (Cloudflare applies _redirects before static assets)', () => {
  for (const line of read('_redirects').split('\n')) {
    const m = line.trim().match(/^(\/\S*)\/\*\s/);
    if (!m) continue;
    const prefix = m[1].slice(1);
    const shadowed = htmlFiles.map((f) => f.slice(dist.length + 1)).filter((f) => f.startsWith(prefix + '/'));
    assert.deepEqual(shadowed, [], `redirect ${m[1]}/* hides built pages`);
  }
});
