// Audit fixes PR 2 (best-practice items, Coordinator additions 2026-10-18/19). Run after `npm run build` (the noindex
// build in dist/); the public-build checks build their own copy into a temp dir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLIVE_TEST } from './helpers/golive.mjs';
import { checkArticle } from '../src/lib/intel.mjs';
import { pageTitle } from '../src/lib/seo.mjs';
import { jsonLd } from '../src/lib/jsonld.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const read = (p) => readFileSync(join(dist, p), 'utf8');
const src = (p) => readFileSync(join(root, p), 'utf8');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const htmlIn = (d) => walk(d).filter((f) => f.endsWith('.html'));
const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const ldOf = (h) => JSON.parse(h.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);

function build(env) {
  const out = mkdtempSync(join(tmpdir(), 'ck-pr2-'));
  const r = spawnSync('npx', ['astro', 'build', '--outDir', out], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const p = spawnSync(process.execPath, ['scripts/postbuild.mjs', out], { cwd: root, encoding: 'utf8' });
  assert.equal(p.status, 0, p.stdout + p.stderr);
  return out;
}
const PUBLIC = { PUBLIC_INDEXABLE: 'true', GOLIVE_OVERRIDES: GOLIVE_TEST };
let publicOut;
const pub = () => (publicOut ??= build(PUBLIC));

// ---------- 22. Non-indexable builds: robots Allow, X-Robots-Tag noindex, no sitemap ----------
test('22: noindex build: robots.txt allows crawling, every path sends X-Robots-Tag: noindex, no sitemap', () => {
  assert.equal(read('robots.txt'), 'User-agent: *\nAllow: /\n');
  const block = read('_headers').match(/^\/\*\n((?: {2}.+\n)+)/m)[1];
  assert.match(block, /^ {2}X-Robots-Tag: noindex$/m);
  assert.deepEqual(readdirSync(dist).filter((f) => /sitemap/.test(f)), []);
  for (const f of htmlIn(dist)) assert.match(readFileSync(f, 'utf8'), /<meta name="robots" content="noindex,nofollow">/, f);
});

test('22: public build is unchanged: robots advertises the sitemap, no X-Robots-Tag, the sitemap lists the real pages', () => {
  const out = pub();
  assert.equal(readFileSync(join(out, 'robots.txt'), 'utf8'), 'User-agent: *\nAllow: /\n\nSitemap: https://www.sharjeelhashmat.com/sitemap-index.xml\n');
  assert.doesNotMatch(readFileSync(join(out, '_headers'), 'utf8'), /X-Robots-Tag/);
  const s = readFileSync(join(out, 'sitemap-0.xml'), 'utf8');
  assert.doesNotMatch(s, /\/investor-profile</);
  // /new-launches enters with the agency, BRN and permit (audit M2; tests/new-launches-indexing.test.mjs).
  assert.match(s, /\/new-launches</);
  for (const p of ['/areas', '/areas/downtown-dubai', '/areas/hudayriyat-island', '/areas/zayed-city', '/buy', '/invest', '/investment-approach', '/contact']) {
    assert.match(s, new RegExp(p + '<'), p);
  }
  // Two published articles: Insights stays out of the sitemap until three are (decision 5); archived ones never enter.
  assert.doesNotMatch(s, /\/insights/);
});

// ---------- 18. CSP connect-src from the data-worker origins in the built HTML ----------
test('18: connect-src is exactly the data-worker origins found in the built pages', () => {
  const origins = new Set();
  for (const f of htmlIn(dist)) for (const m of readFileSync(f, 'utf8').matchAll(/\bdata-worker="([^"]*)"/g)) origins.add(new URL(m[1]).origin);
  assert.deepEqual([...origins], ['https://ck-lead-worker.sharjeelhashmat.workers.dev']);
  const csp = read('_headers').match(/Content-Security-Policy: (.*)/)[1];
  assert.match(csp, /connect-src 'self' https:\/\/ck-lead-worker\.sharjeelhashmat\.workers\.dev https:\/\/challenges\.cloudflare\.com;/);
  assert.doesNotMatch(src('scripts/postbuild.mjs'), /ck-lead-worker/, 'no second hard-coded Worker URL');
  // Another Worker URL at build time moves the CSP with it.
  const out = build({ PUBLIC_WORKER_URL: 'https://other-worker.example.workers.dev' });
  const other = readFileSync(join(out, '_headers'), 'utf8').match(/Content-Security-Policy: (.*)/)[1];
  assert.match(other, /connect-src 'self' https:\/\/other-worker\.example\.workers\.dev https:\/\/challenges\.cloudflare\.com;/);
  assert.doesNotMatch(other, /ck-lead-worker/);
});

test('27: the stale /*.html cache rule is gone from _headers', () => {
  assert.doesNotMatch(read('_headers'), /^\/\*\.html$/m);
});

// ---------- 16. JSON-LD ----------
test('16: noindex build and public build without an agency address: one Person node, no RealEstateAgent', () => {
  for (const out of [dist, pub()]) {
    const ld = ldOf(readFileSync(join(out, 'index.html'), 'utf8'));
    assert.equal(ld['@type'], 'Person');
    assert.equal(ld.name, 'Sharjeel Hashmat');
    assert.equal(ld.jobTitle, 'Property Consultant · UAE');
    assert.deepEqual(ld.knowsLanguage, ['English', 'Urdu']);
    assert.ok(Array.isArray(ld.sameAs) && ld.sameAs.length === 2);
    // No agency node, so no ORN (the agency's number). The broker's own BRN sits on the Person once the agency line
    // shows (owner 2026-10-26): never on the noindex build with empty values, always on the public test build.
    assert.doesNotMatch(JSON.stringify(ld), /RealEstateAgent|"ORN"/);
    const ids = (ld.identifier ?? []).map((i) => [i.name, i.value]);
    if (out === dist) assert.deepEqual(ids, []);
    else assert.deepEqual(ids, [['BRN', 'TEST-BRN'], ['UAE Media Council advertiser permit', 'TEST-PERMIT']]);
  }
});

test('16: jsonLd: the agency node appears only with an agency, and links to the person', () => {
  const site = { name: 'N', title: 'Property Consultant', origin: 'https://x.example', phoneE164: '1', email: 'e@x.example', areasServed: 'UAE', languages: ['English'], instagram: 'i', linkedin: 'l' };
  assert.equal(jsonLd({ site, agency: null, brn: '', permitNo: '', article: null })['@type'], 'Person');
  const g = jsonLd({ site, agency: { name: 'A', orn: '9', address: 'Addr' }, brn: '7', permitNo: '', article: null })['@graph'];
  assert.deepEqual(g.map((n) => n['@type']), ['Person', 'RealEstateAgent']);
  assert.deepEqual(g[0].worksFor, { '@id': 'https://x.example/#agency' });
  // ORN = the agency, BRN = the broker (owner 2026-10-26).
  assert.deepEqual(g[0].identifier, [{ '@type': 'PropertyValue', name: 'BRN', value: '7' }]);
  assert.deepEqual(g[1].identifier, [{ '@type': 'PropertyValue', name: 'ORN', value: '9' }]);
});

// ---------- 21. Titles, descriptions, article metadata, share-image alt ----------
test('21: every page title is at most 60 characters and every description 70 to 160, in both build modes', () => {
  for (const out of [dist, pub()]) {
    for (const f of htmlIn(out)) {
      const h = readFileSync(f, 'utf8');
      const t = decode(h.match(/<title>([^<]*)<\/title>/)[1]);
      const d = decode(h.match(/<meta name="description" content="([^"]*)">/)[1]);
      assert.ok(t.length <= 60, `${f}: title ${t.length} characters: ${t}`);
      assert.ok(d.length >= 70 && d.length <= 160, `${f}: description ${d.length} characters`);
      assert.match(h, /<meta property="og:image:alt" content="Sharjeel Hashmat, Property Consultant · UAE">/, f);
    }
  }
  assert.equal(pageTitle(undefined, 'Sharjeel Hashmat', 'Property Consultant'), 'Sharjeel Hashmat, Property Consultant · UAE');
  assert.equal(pageTitle('About', 'Sharjeel Hashmat', 'Property Consultant'), 'About · Sharjeel Hashmat');
  const long = 'The costs investors forget before they calculate yield';
  assert.equal(pageTitle(long, 'Sharjeel Hashmat', 'Property Consultant'), long);
});

test('21: the pages the deploy smoke test reads keep "Sharjeel Hashmat" in their titles', () => {
  for (const p of ['index.html', 'investment-approach.html', 'contact.html', 'privacy.html', 'terms.html', 'investor-profile.html', 'insights.html']) {
    assert.match(read(p).match(/<title>([^<]*)<\/title>/)[1], /Sharjeel Hashmat/, p);
  }
});

test('21: insight pages are og:type article with an Article node; other pages are website', () => {
  const a = read('insights/costs-investors-forget-before-yield.html');
  assert.match(a, /<meta property="og:type" content="article">/);
  const g = ldOf(a)['@graph'];
  const art = g.find((n) => n['@type'] === 'Article');
  assert.deepEqual(art, {
    '@type': 'Article', headline: 'The costs investors forget before they calculate yield', datePublished: '2026-09-21', dateModified: '2026-09-21',
    author: { '@id': 'https://www.sharjeelhashmat.com/#person' }, mainEntityOfPage: 'https://www.sharjeelhashmat.com/insights/costs-investors-forget-before-yield',
  });
  assert.match(read('about.html'), /<meta property="og:type" content="website">/);
});

// ---------- 35. Archived insights ----------
test('35: checkArticle accepts archived with no other validation; archived is never built or listed', () => {
  assert.deepEqual(checkArticle({ slug: 'x', status: 'archived' }, '2026-10-24'), { errors: [], stale: false, publishable: false });
  assert.match(checkArticle({ slug: 'x', status: 'gone' }, '2026-10-24').errors.join(), /draft, published or archived/);
  const dir = join(root, 'src/data/insights');
  const records = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const published = records.filter((r) => r.status === 'published').map((r) => r.slug).sort();
  assert.deepEqual(published, ['costs-investors-forget-before-yield', 'does-rising-transaction-value-mean-rising-prices']);
  for (const slug of ['dubai-q1-2026-who-is-buying', 'dubai-august-2026-market-view']) {
    assert.equal(records.find((r) => r.slug === slug).status, 'archived', slug);
    for (const out of [dist, pub()]) {
      assert.equal(existsSync(join(out, 'insights', `${slug}.html`)), false, `${slug} is not built (404)`);
      for (const f of walk(out).filter((x) => /\.(html|xml|txt)$/.test(x))) assert.doesNotMatch(readFileSync(f, 'utf8'), new RegExp(slug), `${f} links ${slug}`);
    }
  }
  // llms.txt lists exactly the published articles.
  const llms = [...src('public/llms.txt').matchAll(/\/insights\/([a-z0-9-]+)\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(llms, published);
  assert.deepEqual(readdirSync(join(dist, 'insights')).sort(), published.map((s) => `${s}.html`));
});

// ---------- 36. No link leaks out of the alert templates ----------
test('36: no unclosed <a> on any page, and no link wraps #lead-next', () => {
  for (const f of htmlIn(dist)) {
    const h = readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    let depth = 0;
    for (const m of h.matchAll(/<(\/?)a\b[^>]*>/g)) {
      depth += m[1] ? -1 : 1;
      assert.ok(depth === 0 || depth === 1, `${f}: nested or unclosed <a> near ${m.index}`);
      if (depth === 1) {
        const close = h.indexOf('</a>', m.index);
        assert.doesNotMatch(h.slice(m.index + m[0].length, close), /id="lead-next"|Prefer WhatsApp\?|<a\b/, `${f}: a link wraps #lead-next or another link`);
      }
    }
    assert.equal(depth, 0, `${f}: unclosed <a>`);
    assert.doesNotMatch(h, /<template/, `${f}: no <template> elements`);
  }
});

// ---------- 38. FAQ ----------
test('38: FAQ "How do I start working with you?" has the owner-approved answer, visibly and in FAQPage JSON-LD', () => {
  const answer = 'Fill out the contact form or message me on WhatsApp. Investors can then add a short Investor Profile for a more tailored match.';
  const h = read('faq.html');
  const faq = [...h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((x) => x['@type'] === 'FAQPage');
  const q = faq.mainEntity.find((e) => e.name === 'How do I start working with you?');
  assert.equal(q.acceptedAnswer.text, answer);
  assert.ok(decode(h.replace(/<[^>]+>/g, '')).includes(answer));
  for (const f of htmlIn(dist)) assert.doesNotMatch(readFileSync(f, 'utf8'), /book a call/i, f);
});

// ---------- 20, 23, 24, 25. Assets, newsletter timeout, ROI calculator, tap targets ----------
test('20: Cormorant Garamond latin 400 normal and italic are preloaded, the same files the CSS uses; print logo is lazy', () => {
  const h = read('index.html');
  const pre = [...h.matchAll(/<link rel="preload" href="([^"]+)" as="font" type="font\/woff2" crossorigin>/g)].map((m) => m[1]);
  assert.equal(pre.length, 2);
  assert.ok(pre.some((p) => /cormorant-garamond-latin-400-normal/.test(p)) && pre.some((p) => /cormorant-garamond-latin-400-italic/.test(p)));
  for (const p of pre) assert.ok(existsSync(join(dist, p)), p);
  assert.match(h, /class="print-only print-head"[^>]*>\s*<img class="logo" src="\/logo-web-ink\.svg" alt="Sharjeel Hashmat" width="175" height="36" loading="lazy" decoding="async">/);
});

test('23: the newsletter request has a 15 s timeout and keeps the existing failure message', () => {
  const c = src('src/components/NewsletterSignup.astro');
  assert.match(c, /signal: AbortSignal\.timeout\(15_000\)/);
  assert.match(c, /say\('Connection problem\. Please try again\.', false\)/);
});

test('24: html lang en-GB; the ROI grid is not live, one polite line announces the net yield; "Annualised"', () => {
  for (const f of htmlIn(dist)) assert.match(readFileSync(f, 'utf8'), /<html lang="en-GB">/, f);
  const h = read('invest.html');
  const roi = h.match(/<div class="card" id="roi">[\s\S]*?<\/div>\s*<script/)[0];
  assert.equal((roi.match(/aria-live/g) ?? []).length, 1);
  assert.match(roi, /<p class="sr-only" aria-live="polite" data-live><\/p>/);
  assert.match(roi, /Annualised Return/);
  assert.doesNotMatch(h, /Annualized/);
});

test('25: footer links and source references are at least 24 px tap targets', () => {
  const css = src('src/styles/global.css');
  assert.match(css, /\.foot-links a \{ display: inline-flex; align-items: center; min-height: 24px; \}/);
  assert.match(css, /\.cite a \{[^}]*min-width: 24px; min-height: 24px; \}/);
  assert.match(src('src/pages/new-launches.astro'), /\.nl-ref a \{[^}]*min-width: 24px; min-height: 24px; \}/);
});

// ---------- 26. Guide figures card below the first section ----------
test('26: the Dubai figures card sits after "What it is", so loading it moves no text above the fold', () => {
  const h = read('areas/dubai-hills.html');
  assert.ok(h.indexOf('id="guide-figures"') > h.indexOf('>What it is</h2>'));
});

// ---------- 27. Dead code ----------
test('27: removed dead code stays removed', () => {
  assert.equal(existsSync(join(root, 'src/lib/method.ts')), false);
  assert.doesNotMatch(src('src/lib/site.ts'), /slugify/);
  assert.doesNotMatch(src('src/layouts/Base.astro'), /path\?: string/);
  const css = src('src/styles/global.css');
  for (const c of ['.grid--4', '.section--tight', '.figure ']) assert.ok(!css.includes(c), c);
  for (const f of ['src/lib/lead-submit.mjs', 'src/lib/profile-submit.mjs']) {
    assert.match(src(f), /from '\.\/post-json\.mjs'/, f);
    assert.doesNotMatch(src(f), /new AbortController/, f);
  }
});
