// Investment Intelligence System v1.0: rules and build behaviour. Uses throwaway fixtures written to a temp dir,
// never files under src/data. Independent of `npm run build` (each build test writes to its own outDir).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkClaim, checkOpportunity, checkArticle, insightsLive, areaSnapshotState,
  FACTORS, FRESHNESS_DAYS, INSIGHTS_MIN, VERDICTS,
} from '../src/lib/intel.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const TODAY = '2026-09-21';
import { claim, validOpp, validArticle } from './helpers/fixtures.mjs';

// ---------- rules ----------
test('a complete, fresh opportunity is publishable', () => {
  const r = checkOpportunity(validOpp(), TODAY);
  assert.deepEqual(r.errors, []);
  assert.equal(r.stale, false);
  assert.equal(r.publishable, true);
});

test('verdict labels are BUY, WATCH, PASS (decision 1)', () => {
  assert.deepEqual(VERDICTS, ['BUY', 'WATCH', 'PASS']);
  assert.ok(checkOpportunity(validOpp({ verdict: 'CONSIDER' }), TODAY).errors.some((e) => /verdict must be/.test(e)));
});

test('the seven factors are Location, Entry, Fundamentals, Yield, Supply, Liquidity, Risk in that order (decision, section 2)', () => {
  assert.deepEqual(FACTORS.map((f) => f.label), ['Location', 'Entry', 'Fundamentals', 'Yield', 'Supply', 'Liquidity', 'Risk']);
});

test('BUY is refused while any factor is Unverified', () => {
  const o = validOpp({ verdict: 'BUY' });
  o.factors.supply = { rating: 'Unverified', note: 'No pipeline data.', evidence: [] };
  assert.ok(checkOpportunity(o, TODAY).errors.some((e) => /BUY is not allowed/.test(e)));
  o.verdict = 'WATCH';
  assert.deepEqual(checkOpportunity(o, TODAY).errors, []);
});

test('no source means Unverified: a rated factor needs evidence that matches a claim', () => {
  const a = validOpp(); a.factors.location.evidence = [];
  assert.ok(checkOpportunity(a, TODAY).errors.some((e) => /No source means Unverified/.test(e)));
  const b = validOpp(); b.factors.location.evidence = ['nope'];
  assert.ok(checkOpportunity(b, TODAY).errors.some((e) => /matches no claim/.test(e)));
});

test('Entry needs 3 comparables and Yield needs an income claim, otherwise they must be Unverified', () => {
  const a = validOpp(); a.comparables = a.comparables.slice(0, 2); a.factors.entry.evidence = ['c1'];
  assert.ok(checkOpportunity(a, TODAY).errors.some((e) => /needs 3 comparable/.test(e)));
  a.factors.entry = { rating: 'Unverified', note: 'Too few comparables.', evidence: [] };
  assert.deepEqual(checkOpportunity(a, TODAY).errors, []);
  const b = validOpp(); b.income = []; b.factors.yield.evidence = [];
  assert.ok(checkOpportunity(b, TODAY).errors.length > 0);
  b.factors.yield = { rating: 'Unverified', note: 'No lease data.', evidence: [] };
  assert.deepEqual(checkOpportunity(b, TODAY).errors, []);
});

test('why it could work AND why it could fail are both mandatory, plus risks and what would change my view', () => {
  for (const k of ['couldWork', 'couldFail', 'risks', 'changeMyView']) {
    const o = validOpp(); o[k] = [];
    assert.ok(checkOpportunity(o, TODAY).errors.some((e) => e.includes(k)), k);
  }
});

test('a permit number is required to advertise', () => {
  assert.ok(checkOpportunity(validOpp({ compliance: {} }), TODAY).errors.some((e) => /permitNumber/.test(e)));
});

test('a claim without a source, date or verifier is rejected', () => {
  for (const f of ['sourceName', 'sourceUrl', 'publishedOn', 'verifiedBy', 'verifiedOn', 'value']) {
    const c = claim('x', 'price'); c[f] = '';
    assert.ok(checkClaim(c, TODAY).errors.length > 0, f);
  }
  assert.ok(checkClaim(claim('x', 'price', { sourceUrl: 'http://example.com' }), TODAY).errors.some((e) => /https/.test(e)));
});

test('freshness windows: price 14 days, income 30, comps/supply/area 90 (decision 4)', () => {
  assert.deepEqual(FRESHNESS_DAYS, { price: 14, income: 30, comps: 90, supply: 90, area: 90 });
  const on = (cat, verifiedOn) => checkClaim(claim('x', cat, { verifiedOn }), TODAY).stale;
  assert.equal(on('price', '2026-09-07'), false); // 14 days
  assert.equal(on('price', '2026-09-06'), true); // 15 days
  assert.equal(on('income', '2026-08-22'), false); // 30 days
  assert.equal(on('income', '2026-08-21'), true); // 31 days
  assert.equal(on('comps', '2026-06-23'), false); // 90 days
  assert.equal(on('comps', '2026-06-22'), true); // 91 days
});

test('a stale claim, an unverified claim or a past review-by date makes the record stale, not invalid', () => {
  const a = validOpp(); a.numbers[0].verifiedOn = '2026-08-01';
  const ra = checkOpportunity(a, TODAY);
  assert.equal(ra.stale, true); assert.deepEqual(ra.errors, []); assert.equal(ra.publishable, false);
  const b = validOpp(); b.income[0].verification = 'PENDING_REVIEW';
  assert.equal(checkOpportunity(b, TODAY).stale, true);
  assert.equal(checkOpportunity(validOpp({ reviewBy: '2026-09-20' }), TODAY).stale, true);
});

test('drafts and verified records are never held to publication rules and are never publishable', () => {
  for (const status of ['draft', 'verified', 'archived']) {
    const r = checkOpportunity({ slug: 'x', status }, TODAY);
    assert.equal(r.publishable, false); assert.deepEqual(r.errors, []);
  }
});

test('articles: sources required, tier-3-only rejected, property analysis needs both sides', () => {
  assert.equal(checkArticle(validArticle('a'), TODAY).publishable, true);
  assert.ok(checkArticle(validArticle('a', { sources: [] }), TODAY).errors.length > 0);
  const t3 = validArticle('a', { sources: [{ name: 'Press', tier: 3, url: 'https://example.com/p', publishedOn: '2026-09-01', verifiedOn: '2026-09-20' }] });
  assert.ok(checkArticle(t3, TODAY).errors.some((e) => /tier 3/.test(e)));
  const undated = validArticle('a', { sources: [{ name: 'Service page', tier: 1, url: 'https://example.com/s', undated: true, verifiedOn: '2026-09-20' }] });
  assert.equal(checkArticle(undated, TODAY).publishable, true); // a dateless government page is allowed when marked undated
  const noDate = validArticle('a', { sources: [{ name: 'Service page', tier: 1, url: 'https://example.com/s', verifiedOn: '2026-09-20' }] });
  assert.ok(checkArticle(noDate, TODAY).errors.some((e) => /missing publishedOn/.test(e))); // otherwise a date is mandatory
  const pa = validArticle('a', { series: 'Would I Buy It?' });
  assert.ok(checkArticle(pa, TODAY).errors.some((e) => /couldWork/.test(e)) && checkArticle(pa, TODAY).errors.some((e) => /couldFail/.test(e)));
});

test('Insights goes live at 3 non-stale published articles and not before (decision 5)', () => {
  assert.equal(INSIGHTS_MIN, 3);
  const two = [validArticle('a'), validArticle('b')];
  assert.equal(insightsLive(two, TODAY), false);
  const three = [...two, validArticle('c')];
  assert.equal(insightsLive(three, TODAY), true);
  assert.equal(insightsLive([...two, validArticle('c', { status: 'draft' })], TODAY), false);
  assert.equal(insightsLive([...two, validArticle('c', { reviewBy: '2026-09-01' })], TODAY), false); // stale one stops counting
});

test('an area page is live only when all three snapshot figures are sourced and fresh (decision 5)', () => {
  const fig = (over = {}) => ({ value: '1', sourceName: 'Example Register', sourceType: 'GOVERNMENT_DATA', sourceUrl: 'https://example.com/x', publishedOn: '2026-09-01', verifiedOn: '2026-09-20', ...over });
  const area = (snapshot) => ({ slug: 'x', name: 'X', overview: 'o', details: { snapshot } });
  assert.equal(areaSnapshotState(area(undefined), TODAY).live, false);
  assert.equal(areaSnapshotState(area({ priceSqft: fig(), rent: fig() }), TODAY).live, false);
  assert.equal(areaSnapshotState(area({ priceSqft: fig(), rent: fig(), netYield: fig() }), TODAY).live, true);
  assert.equal(areaSnapshotState(area({ priceSqft: fig(), rent: fig(), netYield: fig({ verifiedOn: '2026-06-01' }) }), TODAY).live, false);
  assert.equal(areaSnapshotState(area({ priceSqft: fig(), rent: fig(), netYield: fig({ sourceUrl: '' }) }), TODAY).live, false);
});

test('the shipped data directory holds no published record that fails the rules (drafts allowed)', async () => {
  const { loadIntel } = await import('../src/lib/intel-data.mjs');
  const prev = process.env.INTEL_DATA_DIR; delete process.env.INTEL_DATA_DIR;
  const intel = loadIntel();
  if (prev) process.env.INTEL_DATA_DIR = prev;
  for (const x of [...intel.opportunities, ...intel.articles]) {
    if (x.record.status === 'published') assert.deepEqual(x.check.errors, [], x.file);
  }
});

// ---------- build behaviour ----------
function writeData(dir, { opps = [], articles = [] }) {
  mkdirSync(join(dir, 'opportunities'), { recursive: true });
  mkdirSync(join(dir, 'insights'), { recursive: true });
  for (const o of opps) writeFileSync(join(dir, 'opportunities', `${o.slug}.json`), JSON.stringify(o));
  for (const a of articles) writeFileSync(join(dir, 'insights', `${a.slug}.json`), JSON.stringify(a));
}
function build(dataDir, { today = TODAY, indexable = true } = {}) {
  const out = mkdtempSync(join(tmpdir(), 'ck-intel-out-'));
  const r = spawnSync('npx', ['astro', 'build', '--outDir', out], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, INTEL_DATA_DIR: dataDir, INTEL_TODAY: today, PUBLIC_INDEXABLE: indexable ? 'true' : 'false', PUBLIC_BRN: indexable ? 'TEST-BRN' : '' },
  });
  return { out, status: r.status, log: r.stdout + r.stderr };
}
const html = (out, p) => readFileSync(join(out, p), 'utf8');
const IDS = ['summary', 'thesis', 'numbers', 'income', 'evidence', 'supply', 'exit', 'risk', 'both-sides', 'change-view', 'fit', 'sources'];

test('build: a published opportunity renders the 12-section Brief with sources, and enters the sitemap; drafts do not', () => {
  const data = mkdtempSync(join(tmpdir(), 'ck-intel-data-'));
  writeData(data, {
    opps: [validOpp(), { slug: 'draft-only', status: 'draft', project: 'Draft Project' }],
    articles: [validArticle('a'), validArticle('b'), validArticle('c'), validArticle('d-draft', { status: 'draft' })],
  });
  const r = build(data);
  assert.equal(r.status, 0, r.log);
  const brief = html(r.out, 'opportunities/sample-tower.html');
  for (const id of IDS) assert.match(brief, new RegExp(`<h2 id="${id}"`), `section ${id}`);
  assert.match(brief, /Sample Tower/);
  assert.match(brief, /Permit TEST-PERMIT-1/);
  assert.match(brief, /Working with Royals Field Properties · BRN TEST-BRN/);
  assert.match(brief, /Why it could work/); assert.match(brief, /Why it could fail/);
  assert.match(brief, /https:\/\/example\.com\/source/);
  assert.match(brief, /<meta name="robots" content="index,follow/);
  assert.doesNotMatch(brief, /™|\bbroker\b/i);
  assert.ok(!existsSync(join(r.out, 'opportunities/draft-only.html')), 'draft opportunity must not be built');
  assert.ok(!existsSync(join(r.out, 'insights/d-draft.html')), 'draft article must not be built');
  const site = readFileSync(join(r.out, 'sitemap-0.xml'), 'utf8');
  for (const p of ['/opportunities/sample-tower', '/opportunities', '/insights', '/insights/a']) assert.match(site, new RegExp(p + '<'), p);
  assert.match(html(r.out, 'insights.html'), /<meta name="robots" content="index,follow/);
});

test('build: two articles keep Insights noindex and out of the sitemap; an empty Opportunities page is noindex', () => {
  const data = mkdtempSync(join(tmpdir(), 'ck-intel-data-'));
  writeData(data, { articles: [validArticle('a'), validArticle('b')] });
  const r = build(data);
  assert.equal(r.status, 0, r.log);
  assert.match(html(r.out, 'insights.html'), /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html(r.out, 'opportunities.html'), /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html(r.out, 'opportunities.html'), /No opportunity has passed verification yet/);
  const site = readFileSync(join(r.out, 'sitemap-0.xml'), 'utf8');
  assert.doesNotMatch(site, /\/insights</); assert.doesNotMatch(site, /\/opportunities</);
});

test('build: a stale opportunity disappears; a stale article stays live with a review banner (no 404) but stops counting', () => {
  const data = mkdtempSync(join(tmpdir(), 'ck-intel-data-'));
  writeData(data, { opps: [validOpp()], articles: [validArticle('a'), validArticle('b'), validArticle('c')] });
  const r = build(data, { today: '2027-03-01' });
  assert.equal(r.status, 0, r.log);
  assert.ok(!existsSync(join(r.out, 'opportunities/sample-tower.html')), 'stale opportunity must not be built');
  assert.match(r.log, /STALE/);
  assert.match(html(r.out, 'insights/a.html'), /past its review date/);
  assert.match(html(r.out, 'insights.html'), /<meta name="robots" content="noindex,nofollow">/);
});

test('build: a published record that breaks the rules fails the build with the reason', () => {
  const data = mkdtempSync(join(tmpdir(), 'ck-intel-data-'));
  const bad = validOpp(); bad.couldFail = [];
  writeData(data, { opps: [bad] });
  const r = build(data);
  assert.notEqual(r.status, 0);
  assert.match(r.log, /couldFail is mandatory/);
});

test('build: on a non-public (staging) build every intelligence page is noindex', () => {
  const data = mkdtempSync(join(tmpdir(), 'ck-intel-data-'));
  writeData(data, { opps: [validOpp()], articles: [validArticle('a'), validArticle('b'), validArticle('c')] });
  const r = build(data, { indexable: false });
  assert.equal(r.status, 0, r.log);
  for (const p of ['opportunities/sample-tower.html', 'opportunities.html', 'insights.html', 'insights/a.html']) {
    assert.match(html(r.out, p), /<meta name="robots" content="noindex,nofollow">/, p);
  }
});

// ---------- public copy ----------
test('public methodology copy describes seven factors, from the same list the Brief uses', () => {
  const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
  assert.match(src('lib/method.ts'), /from '\.\/intel\.mjs'/);
  for (const p of ['pages/index.astro', 'pages/about.astro', 'pages/invest.astro', 'pages/investment-approach.astro']) {
    const t = src(p);
    assert.doesNotMatch(t, /\bsix (factors|-factor)|six-factor|payment structure and (potential )?exit|rental demand/i, p);
  }
  assert.match(src('pages/invest.astro'), /seven factors/);
  assert.match(src('pages/investment-approach.astro'), /seven factors/);
  assert.match(src('pages/about.astro'), /seven factors/);
});

// ---------- every number carries its source (owner rule 2026-09-21) ----------
const src = (tier, n) => ({ name: `Source ${n}`, tier, url: `https://example.com/${n}`, publishedOn: '2026-09-01', verifiedOn: '2026-09-20' });
const withBody = (body, sources) => validArticle('fig', { body, sources });

test('a paragraph, list or table that states a figure must name its source', () => {
  const s = [src(1, 'a')];
  for (const blk of [{ p: 'Sales rose 31% last quarter.' }, { p: 'Fees are AED 4,000.' }, { p: 'Value reached 252 billion.' }, { ul: ['Up 6%'] }, { table: { head: ['Item', 'Figure'], rows: [['Fee', '2%']] } }]) {
    assert.ok(checkArticle(withBody([blk], s), TODAY).errors.some((e) => /names no source/.test(e)), JSON.stringify(blk));
    assert.equal(checkArticle(withBody([{ ...blk, src: [1] }], s), TODAY).publishable, true, JSON.stringify(blk));
  }
  assert.equal(checkArticle(withBody([{ p: 'No numbers in this one.' }], s), TODAY).publishable, true);
  assert.equal(checkArticle(withBody([{ p: 'In Q1 of 2026 the market moved.' }], s), TODAY).publishable, true); // a date is not a figure
});

test('a figure cannot rest on tier 3 sources alone, even when the article has a tier 1 source elsewhere', () => {
  const s = [src(3, 'press'), src(1, 'official')];
  const r = checkArticle(withBody([{ p: 'Sales fell 35%.', src: [1] }], s), TODAY);
  assert.ok(r.errors.some((e) => /tier 3 sources only/.test(e)));
  assert.equal(checkArticle(withBody([{ p: 'Sales fell 35%.', src: [1, 2] }], s), TODAY).publishable, true);
  assert.equal(checkArticle(withBody([{ p: 'Sales fell 35%.', src: [2] }], s), TODAY).publishable, true);
});

test('a src number that matches no listed source is rejected', () => {
  const s = [src(1, 'a')];
  for (const bad of [[2], [0], ['1'], [1.5]]) assert.ok(checkArticle(withBody([{ p: 'Up 6%.', src: bad }], s), TODAY).errors.some((e) => /does not match a listed source/.test(e)), JSON.stringify(bad));
});

test('a made-up worked example is exempt only when it is marked illustration', () => {
  const s = [src(1, 'a')];
  const table = { table: { head: ['Step', 'Yield'], rows: [['Gross', '7.00%']] } };
  assert.equal(checkArticle(withBody([table], s), TODAY).publishable, false);
  assert.equal(checkArticle(withBody([{ ...table, illustration: true }], s), TODAY).publishable, true);
});

test('the shipped August Market View draft stays blocked by the figure-source rule (tier 3 sources only)', async () => {
  const { loadIntel } = await import('../src/lib/intel-data.mjs');
  const prev = process.env.INTEL_DATA_DIR; delete process.env.INTEL_DATA_DIR;
  const arts = loadIntel().articles;
  if (prev) process.env.INTEL_DATA_DIR = prev;
  const as = (slug) => ({ ...arts.find((x) => x.record.slug === slug).record, status: 'published' });
  assert.equal(checkArticle(as('costs-investors-forget-before-yield'), TODAY).errors.length, 0);
  assert.equal(checkArticle(as('does-rising-transaction-value-mean-rising-prices'), TODAY).errors.length, 0);
  assert.ok(checkArticle(as('dubai-august-2026-market-view'), TODAY).errors.some((e) => /tier 3 sources only/.test(e)));
});

test('build: figure markers link to the numbered Sources table', () => {
  const data = mkdtempSync(join(tmpdir(), 'ck-intel-data-'));
  const art = (slug) => validArticle(slug, { body: [{ h: 'H' }, { p: 'Sales rose 31%.', src: [1] }], sources: [src(1, 'official')] });
  writeData(data, { articles: [art('a'), art('b'), art('c')] });
  const r = build(data);
  assert.equal(r.status, 0, r.log);
  const page = html(r.out, 'insights/a.html');
  assert.match(page, /<sup class="cite"><a href="#src-1" aria-label="Source 1">\[1\]<\/a><\/sup>/);
  assert.match(page, /<tr id="src-1"><td>1<\/td>/);
});

test('build: a default build (no INTEL_DATA_DIR) emits a page for every published shipped article', () => {
  const out = mkdtempSync(join(tmpdir(), 'ck-intel-out-'));
  const env = { ...process.env, PUBLIC_INDEXABLE: 'false', PUBLIC_BRN: '' };
  delete env.INTEL_DATA_DIR; delete env.INTEL_TODAY;
  const r = spawnSync('npx', ['astro', 'build', '--outDir', out], { cwd: root, encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dir = join(root, 'src', 'data', 'insights');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const rec = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (rec.status === 'published') assert.ok(existsSync(join(out, 'insights', `${rec.slug}.html`)), `${rec.slug} was not built: the build is not reading src/data`);
  }
});
