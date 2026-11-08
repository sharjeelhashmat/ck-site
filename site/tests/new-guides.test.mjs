// The five Dubai area guides of 2026-11-08 (owner approval, Rules 8d v6.7) and the guide order on /areas (top 8 areas by
// sales value first). Run after `npm run build`. The 320px checks need Chromium: tests/e2e/guides.e2e.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGuideOrder, guideOrder, rankedAreas, TOP } from '../src/lib/guide-order.mjs';
import { dubaiRows, renderGuideCard } from '../src/lib/market.mjs';
import { decodeEntities } from '../scripts/html-text.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const read = (p) => readFileSync(join(dist, p), 'utf8');
const mainOf = (h) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const text = (h) => decodeEntities(h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');

// The data file as the build reads it (lib/area-guides.ts: a guide's own view_heading, else the file's).
const DATA = JSON.parse(readFileSync(join(root, 'src/data/area-guides.json'), 'utf8'));
const GUIDES = DATA.guides;
const viewHeading = (g) => g.view_heading ?? DATA.view_heading;

const NEW = {
  'dubai-south': { h1: 'Dubai South', dld_area: 'Madinat Al Mataar' },
  'business-bay': { h1: 'Business Bay', dld_area: 'Business Bay' },
  majan: { h1: 'Majan', dld_area: 'Wadi Al Safa 3' },
  'dubailand-residence-complex': { h1: 'Dubailand Residence Complex', dld_area: 'Wadi Al Safa 5' },
  'al-yelayiss': { h1: 'Al Yelayiss', dld_area: 'Al Yelayiss 1' },
};
const isNew = (g) => g.slug in NEW;
const sortKeys = (o) => (Array.isArray(o) ? o.map(sortKeys) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])])) : o);

test('the five new Dubai guides: schema, slugs, DLD areas, "My view, November 2026", no digits, no curly quotes', () => {
  const added = GUIDES.filter(isNew);
  assert.deepEqual(added.map((g) => g.slug), Object.keys(NEW));
  for (const g of added) {
    assert.equal(g.emirate, 'dubai', g.slug);
    assert.equal(g.h1, NEW[g.slug].h1, g.slug);
    assert.equal(g.dld_area, NEW[g.slug].dld_area, g.slug);
    assert.equal(g.view_heading, 'My view, November 2026', g.slug);
    assert.equal(g.things_to_consider.length, 3, g.slug);
    assert.ok(g.one_liner.length <= 160, `${g.slug}: one-liner fits the meta description`);
    assert.equal(g.meta_description, undefined, g.slug);
    for (const t of [g.h1, g.one_liner, g.what_it_is, g.who_buys, ...g.things_to_consider, g.my_view]) {
      assert.doesNotMatch(t, /\d/, `${g.slug}: no digit in "${t.slice(0, 40)}"`);
      assert.doesNotMatch(t, /[‘’“”—–]/, `${g.slug}: straight quotes, no dashes`);
      assert.doesNotMatch(t, /https?:|www\.|<a\b/, `${g.slug}: no link in the copy`);
    }
  }
});

test('the 16 earlier guides are unchanged, byte for byte in content, and keep the file\'s "My view" heading', () => {
  const old = GUIDES.filter((g) => !isNew(g));
  assert.equal(old.length, 16);
  // sha256 of the 16 guides (keys sorted) as they stood on phase2-site before this change.
  assert.equal(createHash('sha256').update(JSON.stringify(sortKeys(old))).digest('hex'), 'f50c88913675319625924f26efbfa2ed33d4b1cc434db95802d73ab06cf8523f');
  for (const g of old) assert.equal(viewHeading(g), 'My view, October 2026', g.slug);
});

test('each new guide page renders at /areas/<slug> with its copy and the Dubai figures card for its DLD area', () => {
  for (const g of GUIDES.filter(isNew)) {
    const f = join('areas', `${g.slug}.html`);
    assert.ok(existsSync(join(dist, f)), f);
    const h = read(f);
    const m = mainOf(h);
    assert.match(h, new RegExp(`<title>${g.h1} · Sharjeel Hashmat</title>`), g.slug);
    assert.match(m, new RegExp(`<div class="mk-guide-card" id="guide-figures" hidden data-worker="https://ck-lead-worker\\.sharjeelhashmat\\.workers\\.dev" data-area="${g.dld_area}" data-period="ytd" data-name="${g.h1}"`), `${g.slug}: the live card asks the Worker for ${g.dld_area}`);
    const t = text(m);
    for (const piece of ['Area guide · Dubai', g.h1, g.one_liner, 'What it is', g.what_it_is, 'Who buys here', g.who_buys, 'Things to consider', ...g.things_to_consider, 'My view, November 2026', g.my_view]) {
      assert.ok(t.includes(decodeEntities(piece)), `${g.slug}: ${piece.slice(0, 50)}`);
    }
    // Soft launch: no call to action, no contact link, no external link in the guide.
    assert.doesNotMatch(m, /href="\/contact"|Ask me|wa\.me|ORN|BRN|permit/i, g.slug);
    for (const a of m.matchAll(/<a\b[^>]*href="([^"]+)"/g)) assert.match(a[1], /^(\/|#)/, `${g.slug}: internal link only, found ${a[1]}`);
  }
});

test('the Dubai figures card on a new guide is the data card (Rules 1c v6.9): common name over "DLD: <area>", the bar pair', () => {
  // The Worker's live 2026-YTD09 row for Madinat Al Mataar, as /market/area returns it.
  const area = { rank: 1, area: 'Madinat Al Mataar', label: 'Dubai South', value_bn: 16.89, prior_value_bn: 13.96, share_pct: 6.7, change_pct: 21, prior_zero: false };
  const h = renderGuideCard('dubai', { period: '2026-YTD09', name: 'Dubai South', dldArea: 'Madinat Al Mataar', area });
  assert.match(h, /^<article class="dc dc--single"><p class="mk-chip">Jan to Sep 2026 vs Jan to Sep 2025<\/p><p class="dc-official">DLD: Madinat Al Mataar<\/p><p class="dc-value">AED 16\.9bn<\/p>/);
  assert.match(h, /<div class="dc-chart" data-chart="bars" role="img" aria-label="Dubai South: AED 14\.0bn in Jan to Sep 2025, AED 16\.9bn in Jan to Sep 2026, change \+21%">/);
  // Business Bay: the DLD name is the guide's name, so no sub line.
  const bb = renderGuideCard('dubai', { period: '2026-YTD09', name: 'Business Bay', dldArea: 'Business Bay', area: { ...area, area: 'Business Bay', label: null } });
  assert.doesNotMatch(bb, /dc-official/);
  // Al Yelayiss: the guide is "Al Yelayiss", the DLD area "Al Yelayiss 1", so the DLD name shows.
  assert.match(renderGuideCard('dubai', { period: '2026-YTD09', name: 'Al Yelayiss', dldArea: 'Al Yelayiss 1', area: { ...area, area: 'Al Yelayiss 1', label: null } }), /<p class="dc-official">DLD: Al Yelayiss 1<\/p>/);
});

// ---------- guide order on /areas ----------

test('guide order: the top 8 areas by sales value first, in rank order, then the rest in JSON order; nothing dropped', () => {
  const guides = ['A', 'B', 'C', 'D', 'E', null, 'F'].map((area) => ({ area }));
  assert.deepEqual(guideOrder(guides, ['E', 'X', 'B']), [4, 1, 0, 2, 3, 5, 6], 'ranked areas with a guide lead; X has none');
  assert.deepEqual(guideOrder(guides, []), [0, 1, 2, 3, 4, 5, 6], 'no ranking: JSON order');
  assert.deepEqual(guideOrder(guides, null), [0, 1, 2, 3, 4, 5, 6]);
  // Only the top 8 lead: a guide ranked ninth keeps its JSON place.
  assert.equal(TOP, 8);
  assert.deepEqual(guideOrder(guides, ['1', '2', '3', '4', '5', '6', '7', '8', 'F']), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(rankedAreas([{ rank: 2, area: 'B' }, { rank: 1, area: 'A' }]), ['A', 'B']);
});

test('guide order in the built /areas: Abu Dhabi by ADREC rank; Dubai in JSON order until the Worker answers; every guide listed once', () => {
  const h = read('areas.html');
  const cards = (e) => {
    const s = h.slice(h.indexOf(`<section class="mk-guides" data-emirate="${e}"`), h.indexOf('</section>', h.indexOf(`<section class="mk-guides" data-emirate="${e}"`)));
    return [...s.matchAll(/<a class="card mk-guide" href="\/areas\/([a-z-]+)" data-order="(\d+)"(?: data-area="([^"]*)")?/g)].map((m) => ({ slug: m[1], order: Number(m[2]), area: decodeEntities(m[3] ?? '') }));
  };
  const dubai = cards('dubai');
  assert.deepEqual(dubai.map((c) => c.slug), GUIDES.filter((g) => g.emirate === 'dubai').map((g) => g.slug));
  assert.deepEqual(dubai.map((c) => c.order), dubai.map((_, i) => i));
  assert.deepEqual(dubai.map((c) => c.area), GUIDES.filter((g) => g.emirate === 'dubai').map((g) => g.dld_area));
  const adrec = JSON.parse(readFileSync(join(root, 'src/data/adrec-areas.json'), 'utf8'));
  const ad = cards('abu_dhabi');
  assert.deepEqual(ad.map((c) => c.slug), [...adrec.areas].sort((a, b) => a.rank - b.rank).map((a) => a.guide), 'ADREC rank order');
  assert.equal(dubai.length + ad.length, GUIDES.length, 'no guide dropped');
  // The browser applies the Worker's ranking to the Dubai cards.
  assert.match(readFileSync(join(root, 'src/pages/areas/index.astro'), 'utf8'), /if \(dubaiData\) applyGuideOrder\(document, 'dubai', rankedAreas\(dubaiData\.areas\)\);/);
});

test('guide order in a page (DOM): the live Dubai top 8 puts five new guides and three earlier ones first, the rest after', () => {
  const dubai = GUIDES.filter((g) => g.emirate === 'dubai');
  const card = (g, i) => ({ slug: g.slug, dataset: { order: String(i), area: g.dld_area } });
  const grid = { children: [...dubai.map(card)].reverse(), appendChild(c) { this.children = [...this.children.filter((x) => x !== c), c]; } };
  const doc = { querySelector: (s) => (s === '.mk-guides[data-emirate="dubai"] .mk-guide-grid' ? grid : null) };
  // The Worker's live top 8 for 2026-YTD09.
  const top8 = [[1, 'Madinat Al Mataar'], [2, 'Al Yelayiss 1'], [3, 'Palm Deira'], [4, 'Hadaeq Sheikh Mohammed Bin Rashid'], [5, 'Wadi Al Safa 3'], [6, 'Business Bay'], [7, 'Marsa Dubai'], [8, 'Wadi Al Safa 5']]
    .map(([rank, area_en]) => ({ rank, area_en, label: null, value_bn: 10 - rank / 10, share_pct: 4, change_pct: 1, prior_zero: false }));
  const want = ['dubai-south', 'al-yelayiss', 'dubai-islands', 'dubai-hills', 'majan', 'business-bay', 'dubai-marina', 'dubailand-residence-complex', 'downtown-dubai', 'dubai-creek-harbour', 'palm-jumeirah', 'palm-jebel-ali', 'dubai-maritime-city'];
  applyGuideOrder(doc, 'dubai', rankedAreas(dubaiRows({ dubai: { top8 } })));
  assert.deepEqual(grid.children.map((c) => c.slug), want);
  applyGuideOrder(doc, 'dubai', rankedAreas(dubaiRows({ dubai: { top8 } })));
  assert.deepEqual(grid.children.map((c) => c.slug), want, 'applying twice gives the same order');
  applyGuideOrder(doc, 'dubai', []);
  assert.deepEqual(grid.children.map((c) => c.slug), dubai.map((g) => g.slug), 'no ranking: back to the JSON order');
});
