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
  for (const p of ['/new-launches', '/insights', '/areas/downtown-dubai']) assert.doesNotMatch(s, new RegExp(p + '<'), p);
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

test('a production-indexable build refuses to run without a BRN', () => {
  const r = spawnSync('npx', ['astro', 'build', '--outDir', '/tmp/ck-site-brn-test'], { cwd: root, env: { ...process.env, PUBLIC_INDEXABLE: 'true', PUBLIC_BRN: '' }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /requires PUBLIC_BRN/);
});

