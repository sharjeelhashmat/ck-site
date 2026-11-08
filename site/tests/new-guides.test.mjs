// The five Dubai area guides of 2026-11-08 (owner approval, Rules 8d v6.7) and the guide order on /areas (top 8 areas by
// sales value first). Run after `npm run build`. The 320px checks need Chromium: tests/e2e/guides.e2e.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGuideSections, guideSections, rankedAreas, TOP } from '../src/lib/guide-order.mjs';
import { dubaiRows, renderGuideCard } from '../src/lib/market.mjs';
import { decodeEntities, stripScripts, stripStyles, stripTags } from '../scripts/html-text.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const read = (p) => readFileSync(join(dist, p), 'utf8');
const mainOf = (h) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
// Page text through the repo's own HTML helpers (any case, repeated until stable), as tests/finish-all.test.mjs does.
const text = (h) => decodeEntities(stripTags(stripStyles(stripScripts(h, ' '), ' '), ' ')).replace(/\s+/g, ' ');

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
      // Curly quotes and em or en dashes, written as escapes so this file holds none of them itself.
      assert.doesNotMatch(t, /[\u2018\u2019\u201c\u201d\u2014\u2013]/, `${g.slug}: straight quotes, no dashes`);
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

// ---------- guide sections on /areas (Rules 8d v6.7: "More areas") ----------

test('guide sections: the top 8 areas\' guides in rank order, every other guide alphabetical under "More areas"; nothing dropped', () => {
  const guides = [['A', 'Zeta'], ['B', 'Beta'], ['C', 'Alpha'], ['D', 'Delta'], ['E', 'Echo'], [null, 'Gamma'], ['F', 'Alpha']].map(([area, name]) => ({ area, name }));
  assert.deepEqual(guideSections(guides, ['E', 'X', 'B']), { top: [4, 1], more: [2, 6, 3, 5, 0] }, 'X has no guide; Alpha (twice, JSON order), Delta, Gamma, Zeta');
  assert.deepEqual(guideSections(guides, []), { top: [0, 1, 2, 3, 4, 5, 6], more: [] }, 'no ranking: every guide in the first section, JSON order');
  assert.deepEqual(guideSections(guides, null), { top: [0, 1, 2, 3, 4, 5, 6], more: [] });
  // Only the top 8: an area ranked ninth goes to "More areas".
  assert.equal(TOP, 8);
  assert.deepEqual(guideSections(guides, ['1', '2', '3', '4', '5', '6', '7', '8', 'F']), { top: [], more: [2, 6, 1, 3, 4, 5, 0] }, 'an empty first section');
  assert.deepEqual(rankedAreas([{ rank: 2, area: 'B' }, { rank: 1, area: 'A' }]), ['A', 'B']);
});

/** One emirate's guide sections in the built /areas: [{group, heading, count, hidden, cards: [{slug, order, area, name}]}]. */
const builtSections = (h, e) => [...h.matchAll(new RegExp(`<section class="mk-guides" data-emirate="${e}" data-group="(top|more)" data-count="(\\d+)"( hidden)? aria-labelledby="[^"]+">\\s*<h2 class="mk-h2" id="[^"]+">([^<]+)</h2>([\\s\\S]*?)</section>`, 'g'))]
  .map((m) => ({
    group: m[1], count: Number(m[2]), hidden: Boolean(m[3]), heading: decodeEntities(m[4]),
    cards: [...m[5].matchAll(/<a class="card mk-guide" href="\/areas\/([a-z-]+)" data-order="(\d+)"(?: data-area="([^"]*)")? data-name="([^"]*)"/g)].map((c) => ({ slug: c[1], order: Number(c[2]), area: decodeEntities(c[3] ?? ''), name: decodeEntities(c[4]) })),
  }));

test('guide sections in the built /areas: Abu Dhabi split by ADREC\'s top 8 (no "More areas", none to show); Dubai all in "Area guides" until the Worker answers', () => {
  const h = read('areas.html');
  const adrec = JSON.parse(readFileSync(join(root, 'src/data/adrec-areas.json'), 'utf8'));
  const ad = builtSections(h, 'abu_dhabi');
  assert.deepEqual(ad.map((s) => [s.group, s.heading, s.count, s.hidden]), [['top', 'Area guides · Abu Dhabi', 8, false]], 'every Abu Dhabi guide is in ADREC\'s top 8, so "More areas · Abu Dhabi" is not rendered');
  assert.deepEqual(ad[0].cards.map((c) => c.slug), [...adrec.areas].sort((a, b) => a.rank - b.rank).slice(0, TOP).map((a) => a.guide), 'ADREC rank order');
  assert.doesNotMatch(h, /More areas · Abu Dhabi/);
  const dubai = builtSections(h, 'dubai');
  assert.deepEqual(dubai.map((s) => [s.group, s.heading, s.count, s.hidden]), [['top', 'Area guides · Dubai', 13, false], ['more', 'More areas · Dubai', 0, true]], 'the empty "More areas · Dubai" waits hidden for the Worker');
  assert.deepEqual(dubai[0].cards.map((c) => c.slug), GUIDES.filter((g) => g.emirate === 'dubai').map((g) => g.slug), 'JSON order');
  assert.deepEqual(dubai[0].cards.map((c) => c.name), GUIDES.filter((g) => g.emirate === 'dubai').map((g) => g.h1));
  assert.equal(dubai[0].cards.length + ad[0].cards.length, GUIDES.length, 'no guide dropped');
  // The browser splits the Dubai cards with the Worker's ranking, before initAreasPage decides what shows.
  const page = readFileSync(join(root, 'src/pages/areas/index.astro'), 'utf8');
  assert.match(page, /if \(dubaiData\) applyGuideSections\(document, 'dubai', rankedAreas\(dubaiData\.areas\)\);/);
  assert.ok(page.indexOf('applyGuideSections(document') < page.indexOf('initAreasPage(document, html)'));
});

/** A fake of the two Dubai guide sections in a page, with the cards as the build writes them. */
function dubaiDoc() {
  const dubai = GUIDES.filter((g) => g.emirate === 'dubai');
  const card = (g, i) => ({ slug: g.slug, dataset: { order: String(i), area: g.dld_area, name: g.h1 } });
  const grid = (children) => ({ children, appendChild(c) { for (const s of grids) s.children = s.children.filter((x) => x !== c); this.children.push(c); } });
  const grids = [grid([...dubai.map(card)].reverse()), grid([])];
  const sections = ['top', 'more'].map((group, k) => ({ group, dataset: { count: k ? '0' : String(dubai.length) }, hidden: k === 1, querySelector: (s) => (s === '.mk-guide-grid' ? grids[k] : null) }));
  return {
    sections, grids, dubai,
    querySelector: (sel) => sections.find((s) => sel === `.mk-guides[data-emirate="dubai"][data-group="${s.group}"]`) ?? null,
  };
}
const TOP8 = [[1, 'Madinat Al Mataar'], [2, 'Al Yelayiss 1'], [3, 'Palm Deira'], [4, 'Hadaeq Sheikh Mohammed Bin Rashid'], [5, 'Wadi Al Safa 3'], [6, 'Business Bay'], [7, 'Marsa Dubai'], [8, 'Wadi Al Safa 5']]
  .map(([rank, area_en]) => ({ rank, area_en, label: null, value_bn: 10 - rank / 10, share_pct: 4, change_pct: 1, prior_zero: false }));

test('guide sections in a page (DOM): the live Dubai top 8 under "Area guides" in rank order, the other five alphabetical under "More areas"', () => {
  const doc = dubaiDoc();
  const slugs = (k) => doc.grids[k].children.map((c) => c.slug);
  const top = ['dubai-south', 'al-yelayiss', 'dubai-islands', 'dubai-hills', 'majan', 'business-bay', 'dubai-marina', 'dubailand-residence-complex'];
  // Alphabetical by name: Downtown Dubai, Dubai Creek Harbour, Dubai Maritime City, Palm Jebel Ali, Palm Jumeirah.
  const more = ['downtown-dubai', 'dubai-creek-harbour', 'dubai-maritime-city', 'palm-jebel-ali', 'palm-jumeirah'];
  applyGuideSections(doc, 'dubai', rankedAreas(dubaiRows({ dubai: { top8: TOP8 } })));
  assert.deepEqual([slugs(0), slugs(1)], [top, more]);
  assert.deepEqual(doc.sections.map((s) => s.dataset.count), ['8', '5']);
  applyGuideSections(doc, 'dubai', rankedAreas(dubaiRows({ dubai: { top8: TOP8 } })));
  assert.deepEqual([slugs(0), slugs(1)], [top, more], 'applying twice gives the same sections');
  // No ranking: every guide back in the first section, JSON order, and the empty "More areas" hidden.
  applyGuideSections(doc, 'dubai', []);
  assert.deepEqual([slugs(0), slugs(1)], [doc.dubai.map((g) => g.slug), []]);
  assert.equal(doc.sections[1].hidden, true);
  assert.deepEqual(doc.sections.map((s) => s.dataset.count), ['13', '0']);
  // A ranking with none of the guides' areas: the first section empties and is hidden; all guides alphabetical below.
  const other = dubaiDoc();
  applyGuideSections(other, 'dubai', ['Nowhere 1', 'Nowhere 2']);
  assert.equal(other.sections[0].hidden, true);
  assert.equal(other.sections[0].dataset.count, '0');
  assert.deepEqual(other.grids[1].children.map((c) => c.dataset.name), [...other.dubai.map((g) => g.h1)].sort((a, b) => a.localeCompare(b, 'en')));
});
