// Brand data standard (Rules 1c v6.9, owner 2026-11-07; replaces the v6.6 paired-bar chart blocks): every comparison of
// figures is shown as data cards, with the bar pair inside the card. Unit checks of lib/chart.mjs (the one card
// component), lib/card-sort.mjs (the sort toggle) and the market renderers; the article chart spec; and the built site:
// card values are the table, Worker and JSON values; no comparison table ships without its cards (or a recorded data
// gap); no chart ships outside a card; chart colours are Brass and Brass Deep for bars, Ink and Brass Deep (Ivory and
// Brass on Ink) for change text, never grey; no chart library or external request. 320px checks need Chromium:
// tests/e2e/charts.e2e.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { barFraction, cardFigure, changeAgrees, changeValue, chartRows, checkChartSpec, figure, isComparisonTable, renderBars, renderCardGrid, renderDataCard, renderTableCards, sortOrder } from '../src/lib/chart.mjs';
import { applySort } from '../src/lib/card-sort.mjs';
import { checkArticle } from '../src/lib/intel.mjs';
import { checkAdrecAreas, dubaiRows, fmtBn, formatChange, renderGuideCard, renderTop } from '../src/lib/market.mjs';
import { validArticle } from './helpers/fixtures.mjs';
import { decodeEntities } from '../scripts/html-text.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const read = (p) => readFileSync(join(root, p), 'utf8');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const htmlFiles = () => walk(dist).filter((f) => f.endsWith('.html'));
const articles = () => readdirSync(join(root, 'src/data/insights')).map((f) => JSON.parse(read(`src/data/insights/${f}`)));
/** Text of every element with this class (first class in the attribute), entity-decoded. */
const texts = (h, cls) => [...h.matchAll(new RegExp(`<(?:span|p|h3) class="${cls}(?: [^"]*)?"[^>]*>([^<]*)</`, 'g'))].map((m) => decodeEntities(m[1]));
const fractions = (h) => [...h.matchAll(/<span class="dc-bar dc-bar--(earlier|later)" style="--f:([\d.]+)"><\/span>/g)].map((m) => [m[1], Number(m[2])]);
/** Every card in a stretch of HTML, as its own string. */
const cardsOf = (h) => [...h.matchAll(/<article class="dc[ "][\s\S]*?<\/article>/g)].map((m) => m[0]);

const PAIR = { name: 'Q2 & more', earlierLabel: '2025', laterLabel: '2026', earlier: 112.5, later: 75.4, earlierText: '112.5', laterText: '75.4', change: '−33%' };

// The live Worker's Dubai top 8 for 2026-YTD09 (records to 30 Oct 2026), as /market/areas returns it.
const LIVE = {
  period: '2026-YTD09', prior_period: '2025-YTD09', first_month: '2026-01', last_month: '2026-09', prior_first_month: '2025-01', prior_last_month: '2025-09',
  dubai: {
    top8: [
      [1, 'Madinat Al Mataar', 'Dubai South', 16.89, 13.96, 6.7, 21], [2, 'Al Yelayiss 1', null, 12.18, 0.94, 4.8, 1200.9],
      [3, 'Palm Deira', 'Dubai Islands', 11.47, 8.4, 4.6, 36.5], [4, 'Hadaeq Sheikh Mohammed Bin Rashid', 'Dubai Hills Estate', 10.79, 15.14, 4.3, -28.8],
      [5, 'Wadi Al Safa 3', 'Majan', 10.55, 15.3, 4.2, -31], [6, 'Business Bay', null, 10.5, 23.24, 4.2, -54.8],
      [7, 'Marsa Dubai', 'Dubai Marina, Dubai Harbour', 9.75, 22.69, 3.9, -57], [8, 'Wadi Al Safa 5', 'Dubailand Residence Complex', 9.3, 15.35, 3.7, -39.4],
    ].map(([rank, area_en, label, value_bn, prior_value_bn, share_pct, change_pct]) => ({ rank, area_en, label, value_bn, prior_value_bn, share_pct, change_pct, prior_zero: false, offplan_pct: 50 })),
  },
};
const liveTop = () => renderTop('dubai', { period: LIVE.period, areas: dubaiRows(LIVE) });

// ---------- the card component ----------

test('card: the bar pair, earlier row above current, values and period labels as text, role="img" with both values and the change', () => {
  const h = renderBars(PAIR, 112.5);
  assert.equal(h, '<div class="dc-chart" data-chart="bars" role="img" aria-label="Q2 &amp; more: 112.5 in 2025, 75.4 in 2026, change −33%">'
    + '<div class="dc-row dc-row--earlier"><span class="dc-period">2025</span><span class="dc-track"><span class="dc-bar dc-bar--earlier" style="--f:1"></span><span class="dc-val">112.5</span></span></div>'
    + '<div class="dc-row dc-row--later"><span class="dc-period">2026</span><span class="dc-track"><span class="dc-bar dc-bar--later" style="--f:0.67"></span><span class="dc-val">75.4</span></span></div></div>');
  // The aria-label names the full periods when given.
  assert.match(renderBars({ ...PAIR, earlierName: 'Jan to Sep 2025', laterName: 'Jan to Sep 2026' }, 200), /aria-label="Q2 &amp; more: 112\.5 in Jan to Sep 2025, 75\.4 in Jan to Sep 2026, change −33%"/);
  // Nothing to draw: '' (never a zero bar, never a division by zero).
  for (const bad of [{ ...PAIR, earlier: 0 }, { ...PAIR, later: NaN }, { ...PAIR, earlier: -1 }]) assert.equal(renderBars(bad, 100), '', JSON.stringify(bad));
  assert.equal(renderBars(PAIR, 0), '');
  assert.equal(barFraction(5, 0), 0);
  assert.equal(barFraction(5, NaN), 0);
  assert.equal(barFraction(0.94, 23.24), 0.04);
  assert.equal(barFraction(30, 20), 1);
});

test('card: heading, official name, rank, value, big change, bars and footer, all escaped; no chart means no bars and a nochart card', () => {
  const h = renderDataCard({ name: '<b>Dubai South</b>', official: 'DLD: Madinat Al Mataar', rank: { value: '#1', change: '#3 by change' }, pair: { ...PAIR, name: 'Dubai South' }, max: 112.5, foot: { left: '6.7% of Dubai total', change: '+21%' } });
  assert.match(h, /^<article class="dc"><p class="dc-rank" data-rank-value="#1" data-rank-change="#3 by change">#1<\/p><h3 class="dc-name">&lt;b&gt;Dubai South&lt;\/b&gt;<\/h3><p class="dc-official">DLD: Madinat Al Mataar<\/p><div class="dc-chart"/);
  assert.match(h, /<p class="dc-foot"><span>6\.7% of Dubai total<\/span><span class="dc-change dc-rise">\+21%<\/span><\/p><\/article>$/);
  assert.doesNotMatch(h, /<b>/);
  const none = renderDataCard({ name: 'Zayed City', value: 'AED 1.9bn', pair: null, foot: { left: '2.7% of Abu Dhabi total', change: 'change n/p', dir: 'none' } });
  assert.match(none, /^<article class="dc dc--nochart"><h3 class="dc-name">Zayed City<\/h3><p class="dc-value">AED 1\.9bn<\/p><p class="dc-foot"><span>2\.7% of Abu Dhabi total<\/span><span class="dc-change dc-none">change n\/p<\/span><\/p><\/article>$/);
  assert.match(renderDataCard({ name: 'Q3', bigChange: '−46%', pair: PAIR }), /<p class="dc-big-change dc-fall">−46%<\/p>/);
});

test('card grid: one scale for the whole set, the largest value in it', () => {
  const g = renderCardGrid([{ name: 'A', pair: { ...PAIR, earlier: 10, later: 20 } }, { name: 'B', pair: { ...PAIR, earlier: 40, later: 5 } }]);
  assert.match(g, /^<div class="dc-grid dc-grid--4">/);
  assert.deepEqual(fractions(g), [['earlier', 0.25], ['later', 0.5], ['earlier', 1], ['later', 0.125]]);
  assert.equal(renderCardGrid([]), '');
});

test('sort order: change order puts "≈N×" above percentages, highest first; cards with no comparable change follow in value order', () => {
  const cards = [{ changeRank: [0, 21] }, { changeRank: null }, { changeRank: [1, 13] }, { changeRank: [0, -55] }, { changeRank: [0, 37] }];
  assert.deepEqual(sortOrder(cards, 'value'), [0, 1, 2, 3, 4]);
  assert.deepEqual(sortOrder(cards, 'change'), [2, 4, 0, 3, 1]);
});

test('chart: figures and changes are read as written', () => {
  assert.equal(figure('126.7'), 126.7);
  assert.equal(figure('AED 9.8bn'), 9.8);
  assert.equal(figure('1,234'), 1234);
  assert.ok(Number.isNaN(figure('n/p')));
  assert.equal(changeValue('+11%'), 11);
  assert.equal(changeValue('−46%'), -46);
  assert.equal(changeValue('≈8×'), 700);
  assert.equal(changeAgrees(96.5, 107.5, '+11%'), true);
  assert.equal(changeAgrees(96.5, 107.5, '+15%'), false);
  assert.equal(changeAgrees(2.3, 19.0, '≈8×'), true);
  assert.equal(cardFigure('96.5', true), 'AED 96.5bn');
  assert.equal(cardFigure('5.97', true), 'AED 5.97bn', 'the table\'s own digits');
  assert.equal(cardFigure('96.5', false), '96.5');
  assert.equal(figure(cardFigure('5.97', true)), 5.97);
});

// ---------- the sort toggle (a DOM test on a small fake document) ----------

/** A fake of the DOM that applySort touches: a section with the toggle buttons and a sortable grid of cards. */
function fakeSection(html) {
  const el = (attrs, extra = {}) => ({ dataset: {}, attrs: { ...attrs }, getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = String(v); }, ...extra });
  const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const cards = cardsOf(html).map((c) => {
    const o = /data-order-value="(\d+)" data-order-change="(\d+)"/.exec(c);
    const r = /<p class="dc-rank" data-rank-value="([^"]*)" data-rank-change="([^"]*)">([^<]*)<\/p>/.exec(c);
    const rank = el({}, { dataset: { rankValue: decodeEntities(r[1]), rankChange: decodeEntities(r[2]) }, textContent: decodeEntities(r[3]), hidden: false });
    return el({}, { name: decodeEntities(/<h3 class="dc-name">([^<]*)<\/h3>/.exec(c)[1]), dataset: { orderValue: o[1], orderChange: o[2] }, classList: { contains: (x) => x === 'dc' }, querySelector: (s) => (s === '.dc-rank' ? rank : null), rank });
  });
  const grid = { children: [...cards], appendChild(c) { this.children = [...this.children.filter((x) => x !== c), c]; } };
  const buttons = [...html.matchAll(/<button type="button" data-sort="(\w+)" aria-pressed="(\w+)">/g)].map((m) => el({ 'aria-pressed': m[2] }, { dataset: { [camel('sort')]: m[1] } }));
  return {
    grid, buttons,
    querySelector: (s) => (s === '.dc-grid[data-sortable="yes"]' ? grid : null),
    querySelectorAll: (s) => (s === '.dc-sort button[data-sort]' ? buttons : []),
  };
}

test('toggle: "Change vs last year" reorders the 8 cards by change with "#n by change" labels, "Sales value" restores value order', () => {
  const s = fakeSection(liveTop());
  const names = () => s.grid.children.map((c) => c.name);
  const ranks = () => s.grid.children.map((c) => c.rank.textContent);
  const value = ['Dubai South', 'Al Yelayiss 1', 'Dubai Islands', 'Dubai Hills Estate', 'Majan', 'Business Bay', 'Dubai Marina, Dubai Harbour', 'Dubailand Residence Complex'];
  assert.deepEqual(names(), value, 'no script: value order');
  applySort(s, 'change');
  assert.deepEqual(names(), ['Al Yelayiss 1', 'Dubai Islands', 'Dubai South', 'Dubai Hills Estate', 'Majan', 'Dubailand Residence Complex', 'Business Bay', 'Dubai Marina, Dubai Harbour']);
  assert.deepEqual(ranks(), ['#1 by change', '#2 by change', '#3 by change', '#4 by change', '#5 by change', '#6 by change', '#7 by change', '#8 by change']);
  assert.deepEqual(s.buttons.map((b) => [b.dataset.sort, b.getAttribute('aria-pressed')]), [['value', 'false'], ['change', 'true']]);
  applySort(s, 'value');
  assert.deepEqual(names(), value);
  assert.deepEqual(ranks(), ['#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8']);
  assert.deepEqual(s.buttons.map((b) => b.getAttribute('aria-pressed')), ['true', 'false']);
});

test('toggle: a card with no comparable change ("new this year") goes last in change order with its rank label hidden', () => {
  const rows = dubaiRows(LIVE).map((r, i) => (i === 0 ? { ...r, change_pct: null, prior_zero: true, prior_value_bn: undefined } : r));
  const h = renderTop('dubai', { period: LIVE.period, areas: rows });
  const first = cardsOf(h)[0];
  assert.match(first, /data-chart-gap="prior-period-not-in-data"/);
  assert.doesNotMatch(first, /data-chart="bars"/, 'never divided by a zero prior');
  assert.match(first, /<span class="dc-change dc-none">new this year<\/span>/);
  const s = fakeSection(h);
  applySort(s, 'change');
  const last = s.grid.children.at(-1);
  assert.equal(last.name, 'Dubai South');
  assert.equal(last.rank.hidden, true);
  assert.equal(last.rank.textContent, '');
});

test('toggle: Abu Dhabi (built page) sorts the same way; the n/p areas go last with their rank label hidden', () => {
  const h = readFileSync(join(dist, 'areas.html'), 'utf8');
  const panel = h.slice(h.indexOf('<div class="mk-panel" data-emirate="abu_dhabi"'), h.indexOf('<section class="mk-guides"'));
  assert.match(panel, /<h2 id="mk-top-abu_dhabi" class="mk-h2">Top areas · Abu Dhabi<\/h2>/);
  const s = fakeSection(panel);
  const names = () => s.grid.children.map((c) => c.name);
  const value = ['Hudayriyat Island', 'Saadiyat Island', 'Al Reem Island + Al Maryah Island', 'Yas Island', 'Al Ramhan Island', 'Al Fahid Island', 'Ghadeer Al Tayr', 'Zayed City'];
  assert.deepEqual(names(), value, 'no script: value order');
  applySort(s, 'change');
  assert.deepEqual(names(), ['Hudayriyat Island', 'Al Reem Island + Al Maryah Island', 'Yas Island', 'Saadiyat Island', 'Al Ramhan Island', 'Al Fahid Island', 'Ghadeer Al Tayr', 'Zayed City']);
  assert.deepEqual(s.grid.children.map((c) => [c.rank.textContent, c.rank.hidden]), [
    ['#1 by change', false], ['#2 by change', false], ['#3 by change', false], ['#4 by change', false], ['', true], ['', true], ['', true], ['', true],
  ]);
  assert.deepEqual(s.buttons.map((b) => b.getAttribute('aria-pressed')), ['false', 'true']);
  applySort(s, 'value');
  assert.deepEqual(names(), value);
  assert.deepEqual(s.grid.children.map((c) => [c.rank.textContent, c.rank.hidden]), value.map((_, i) => [`#${i + 1}`, false]));
});

// ---------- /areas and the area guides ----------

test('/areas Dubai: one section, 8 cards; card values are the Worker values; common name over the DLD name; one scale', () => {
  const h = liveTop();
  assert.match(h, /<h2 id="mk-top-dubai" class="mk-h2">Top areas · Dubai<\/h2>/);
  assert.doesNotMatch(h, /<table|Change vs last year ·/, 'the change section is merged into the cards');
  const cards = cardsOf(h);
  assert.equal(cards.length, 8);
  const max = Math.max(...LIVE.dubai.top8.flatMap((a) => [a.value_bn, a.prior_value_bn]));
  LIVE.dubai.top8.forEach((a, i) => {
    const c = cards[i];
    assert.deepEqual(texts(c, 'dc-val'), [fmtBn(a.prior_value_bn), fmtBn(a.value_bn)], a.area_en);
    assert.deepEqual(texts(c, 'dc-period'), ['2025', '2026'], a.area_en);
    assert.deepEqual(texts(c, 'dc-change'), [formatChange(a).text], a.area_en);
    assert.match(c, new RegExp(`<span>${a.share_pct.toFixed(1).replace('.', '\\.')}% of Dubai total</span>`), a.area_en);
    assert.deepEqual(fractions(c), [['earlier', Math.round((a.prior_value_bn / max) * 1000) / 1000], ['later', Math.round((a.value_bn / max) * 1000) / 1000]], a.area_en);
    assert.equal(texts(c, 'dc-name')[0], a.label ?? a.area_en);
    if (a.label) assert.deepEqual(texts(c, 'dc-official'), [`DLD: ${a.area_en}`]);
    else assert.deepEqual(texts(c, 'dc-official'), [], `${a.area_en}: no sub line`);
    assert.match(c, new RegExp(`role="img" aria-label="${(a.label ?? a.area_en)}: ${fmtBn(a.prior_value_bn).replace('.', '\\.')} in Jan to Sep 2025, ${fmtBn(a.value_bn).replace('.', '\\.')} in Jan to Sep 2026, change ${formatChange(a).text.replace('+', '\\+')}"`));
  });
  assert.equal(texts(cards[1], 'dc-change')[0], '≈13×', 'Al Yelayiss 1: +1200.9% is shown as the page formats it');
  assert.deepEqual(texts(cards[1], 'dc-name'), ['Al Yelayiss 1']);
  assert.match(h, /<\/div>\n<p class="mk-src">Source: Dubai Land Department, Real Estate Transactions open data via Data\.Dubai \(Open Data Licence\)\. Residential sales value\. Area names as registered by DLD\.<\/p>\n<\/section>$/, 'the source line under the grid');
});

test('/areas Dubai: a row without the prior period shows its value, no bars, and records the gap', () => {
  const rows = dubaiRows({ ...LIVE, dubai: { top8: LIVE.dubai.top8.map(({ prior_value_bn, ...a }) => a) } });
  const h = renderTop('dubai', { period: LIVE.period, areas: rows });
  assert.doesNotMatch(h, /data-chart="bars"/);
  assert.equal((h.match(/data-chart-gap="prior-period-not-in-data"/g) ?? []).length, 8);
  assert.match(cardsOf(h)[0], /<p class="dc-value">AED 16\.9bn<\/p>/);
});

test('/areas: dubaiRows passes prior_value_bn through only as a real number above zero', () => {
  const body = { dubai: { top8: [
    { rank: 1, area_en: 'A', value_bn: 5, share_pct: 2, change_pct: 10, prior_value_bn: 4.5 },
    { rank: 2, area_en: 'B', value_bn: 4, share_pct: 1, change_pct: 10, prior_value_bn: '3.6' },
    { rank: 3, area_en: 'C', value_bn: 3, share_pct: 1, change_pct: 10 },
  ] } };
  assert.deepEqual(dubaiRows(body).map((r) => r.prior_value_bn), [4.5, undefined, undefined]);
  assert.equal('prior_value_bn' in dubaiRows(body)[2], false, 'absent, not null, when the Worker does not send it');
});

test('area guide card: one data card; the bar pair when the prior period is in the data, none without it', () => {
  const a = dubaiRows(LIVE)[6];
  const h = renderGuideCard('dubai', { period: LIVE.period, name: 'Dubai Marina', dldArea: 'Marsa Dubai', area: a });
  assert.match(h, /^<article class="dc dc--single"><p class="mk-chip">Jan to Sep 2026 vs Jan to Sep 2025<\/p><p class="dc-official">DLD: Marsa Dubai<\/p><p class="dc-value">AED 9\.8bn<\/p><p class="dc-value-label">residential sales value, Jan to Sep 2026<\/p><div class="dc-chart"/);
  assert.deepEqual(texts(h, 'dc-val'), ['AED 22.7bn', 'AED 9.8bn']);
  assert.deepEqual(texts(h, 'dc-change'), ['−57%']);
  assert.deepEqual(fractions(h), [['earlier', 1], ['later', 0.43]], 'a single card scales to its own larger value');
  assert.doesNotMatch(h, /<h3/, 'the guide page heading is the name; the card adds none');
  assert.doesNotMatch(renderGuideCard('dubai', { period: LIVE.period, name: 'Dubai Marina', dldArea: 'Marsa Dubai', area: { ...a, prior_value_bn: undefined } }), /data-chart/);
});

// ---------- Abu Dhabi (owner-approved option B, 2026-11-07) ----------

const CAPTION = "Source: Abu Dhabi Real Estate Centre (ADREC), H1 2026 market report. H1 2025 values for Saadiyat, ADGM and Yas calculated from ADREC's published change; Hudayriyat as stated by ADREC.";

test('guard: Abu Dhabi charts draw exactly where adrec-areas.json has prior_value_bn, the gap is recorded everywhere else', () => {
  const adrec = JSON.parse(read('src/data/adrec-areas.json'));
  assert.equal(adrec.chart_caption, CAPTION);
  const withPrior = adrec.areas.filter((a) => 'prior_value_bn' in a);
  assert.deepEqual(withPrior.map((a) => [a.guide, a.value_bn, a.prior_value_bn]), [
    ['hudayriyat-island', 19.0, 2.4], ['saadiyat-island', 13.3, 8.2], ['al-reem-al-maryah-island', 10.5, 4.2], ['yas-island', 7.3, 3.8],
  ]);
  // /areas, Abu Dhabi panel: the 8 cards in one grid, a chart in the four with both periods, the caption under the grid.
  const h = readFileSync(join(dist, 'areas.html'), 'utf8');
  const panel = h.slice(h.indexOf('<div class="mk-panel" data-emirate="abu_dhabi"'), h.indexOf('<section class="mk-guides"'));
  const cards = cardsOf(panel);
  assert.equal(cards.length, 8);
  const max = Math.max(...withPrior.flatMap((a) => [a.value_bn, a.prior_value_bn]));
  adrec.areas.forEach((a, i) => {
    if ('prior_value_bn' in a) {
      assert.deepEqual(texts(cards[i], 'dc-val'), [fmtBn(a.prior_value_bn), fmtBn(a.value_bn)], a.area);
      assert.deepEqual(texts(cards[i], 'dc-period'), ['2025', '2026'], a.area);
      assert.deepEqual(fractions(cards[i]).map(([, f]) => f), [a.prior_value_bn, a.value_bn].map((v) => Math.round((v / max) * 1000) / 1000), a.area);
      assert.doesNotMatch(cards[i], /data-chart-gap/, a.area);
    } else {
      assert.doesNotMatch(cards[i], /data-chart="/, a.area);
      assert.match(cards[i], /data-chart-gap="prior-period-not-in-data"/, a.area);
      assert.deepEqual(texts(cards[i], 'dc-value'), [fmtBn(a.value_bn)], a.area);
    }
  });
  assert.match(panel, /<\/article><\/div>\n<p class="mk-src">ADREC did not publish a year-on-year change for 4 of the top areas \(n\/p = not published\)\. They are left out of this ranking rather than estimated\.<\/p>\n<p class="dc-src">Source: Abu Dhabi Real Estate Centre \(ADREC\), H1 2026 market report\. H1 2025 values for Saadiyat, ADGM and Yas calculated from ADREC&#39;s published change; Hudayriyat as stated by ADREC\.<\/p>\n<p class="mk-src">Source: Abu Dhabi Real Estate Centre \(ADREC\), H1 2026 market report \(published 18 Aug 2026\)\. Residential sales value\.<\/p>/, 'the n/p note, the approved caption (plain text) and the report line under the grid');
  // H1 2025 values appear only inside the charts.
  // (Hudayriyat's H1 2025, AED 2.4bn, is also Ghadeer Al Tayr's H1 2026 value, so this is checked card by card.)
  adrec.areas.forEach((a, i) => {
    if (!('prior_value_bn' in a)) return;
    const outside = cards[i].replace(/<div class="dc-chart"[\s\S]*?<\/div><\/div>/, '');
    assert.equal(outside.includes(fmtBn(a.prior_value_bn)), false, `${a.area}: H1 2025 only in the chart`);
  });
  assert.doesNotMatch(panel, /<table|Change vs last year ·/, 'no separate change table (owner symmetry rule)');
  // Each Abu Dhabi guide: a chart and one source line (the caption) with a prior value; no chart, the gap and the report
  // line without one.
  for (const a of adrec.areas) {
    const g = readFileSync(join(dist, 'areas', `${a.guide}.html`), 'utf8');
    const wrap = g.slice(g.indexOf('<div class="mk-guide-card"'), g.indexOf('</article>', g.indexOf('<div class="mk-guide-card"')));
    if ('prior_value_bn' in a) {
      assert.match(wrap, /data-chart="bars"/, a.guide);
      assert.doesNotMatch(wrap, /data-chart-gap/, a.guide);
      assert.deepEqual(texts(wrap, 'dc-val'), [fmtBn(a.prior_value_bn), fmtBn(a.value_bn)], a.guide);
      assert.deepEqual(texts(wrap, 'mk-src'), [CAPTION], `${a.guide}: one source line, the caption`);
    } else {
      assert.doesNotMatch(wrap, /data-chart=/, a.guide);
      assert.match(wrap, /^<div class="mk-guide-card" data-chart-gap="prior-period-not-in-data"[ >]/, a.guide);
      assert.deepEqual(texts(wrap, 'mk-src'), ['Source: Abu Dhabi Real Estate Centre (ADREC), H1 2026 market report (published 18 Aug 2026). Residential sales value.'], a.guide);
    }
  }
});

test('adrec-areas.json: an optional prior_value_bn must agree with the published change', () => {
  const file = JSON.parse(read('src/data/adrec-areas.json'));
  const slugs = file.areas.map((a) => a.guide);
  assert.deepEqual(checkAdrecAreas(file, slugs), []);
  const withPrior = (i, v) => ({ ...file, areas: file.areas.map((a, k) => (k === i ? { ...a, prior_value_bn: v } : a)) });
  assert.deepEqual(checkAdrecAreas(withPrior(1, 8.2), slugs), [], 'Saadiyat 13.3 against 8.2 is +62%, published +63%');
  assert.ok(checkAdrecAreas(withPrior(1, 10), slugs).some((e) => /areas\[1\]: prior_value_bn 10 does not match/.test(e)));
  assert.ok(checkAdrecAreas(withPrior(0, 2.4), slugs).length === 0, 'Hudayriyat 19.0 against 2.4 is about 8 times (≈8×)');
  // Derived priors (value / (1 + change), 1 dp): accepted within 0.05bn of the quotient, and no further.
  assert.deepEqual(checkAdrecAreas(withPrior(2, 4.2), slugs), [], 'Al Reem + Al Maryah 10.5 / 2.53 = 4.15, stored 4.2');
  assert.deepEqual(checkAdrecAreas(withPrior(3, 3.8), slugs), [], 'Yas 7.3 / 1.91 = 3.82, stored 3.8');
  assert.ok(checkAdrecAreas(withPrior(2, 4.3), slugs).some((e) => /areas\[2\]: prior_value_bn 4\.3 does not match/.test(e)));
  assert.ok(checkAdrecAreas(withPrior(3, 3.9), slugs).some((e) => /areas\[3\]: prior_value_bn 3\.9 does not match/.test(e)));
  assert.ok(checkAdrecAreas(withPrior(3, 3.7), slugs).some((e) => /areas\[3\]: prior_value_bn 3\.7 does not match/.test(e)));
  assert.ok(checkAdrecAreas(withPrior(4, 1), slugs).some((e) => /areas\[4\]: prior_value_bn needs a published change/.test(e)));
  assert.ok(checkAdrecAreas(withPrior(2, 0), slugs).some((e) => /areas\[2\]: prior_value_bn must be a number above zero/.test(e)));
  const { chart_caption, ...noCaption } = file;
  assert.ok(checkAdrecAreas(noCaption, slugs).includes('chart_caption is required once a prior_value_bn is listed'));
  assert.ok(checkAdrecAreas({ ...file, chart_caption: 'Source: <a href="https://adrec.gov.ae/">ADREC</a>' }, slugs).includes('chart_caption must be plain text with no link'));
});

// ---------- article chart spec ----------

const TABLE = { head: ['Quarter', '2025', '2026', 'Change'], rows: [['Q1', '96.5', '107.5', '+11%'], ['Q2', '112.5', '75.4', '−33%']] };
const SPEC = { title: 't', source: 's', period: 'p', label: 0, earlier: { label: '2025', col: 1 }, later: { label: '2026', col: 2 }, change: 3 };

test('chart spec: a valid spec passes; one that does not match its table fails', () => {
  assert.deepEqual(checkChartSpec(TABLE, SPEC), []);
  assert.deepEqual(checkChartSpec(TABLE, { ...SPEC, earlier: { label: '2025', values: ['96.5', '112.5'] } }), []);
  const bad = (spec, re) => assert.ok(checkChartSpec(TABLE, spec).some((e) => re.test(e)), JSON.stringify(spec));
  bad({ ...SPEC, title: '' }, /missing title/);
  bad({ ...SPEC, period: undefined }, /missing period/);
  bad({ ...SPEC, change: 9 }, /change must be a column/);
  bad({ ...SPEC, earlier: { label: '2025', col: 1, values: [] } }, /exactly one of col and values/);
  bad({ ...SPEC, earlier: { label: '2025', values: ['96.5'] } }, /one value per row/);
  bad({ ...SPEC, earlier: { label: '2025', values: ['96.5', 'n/p'] } }, /not a figure/);
  bad({ ...SPEC, earlier: { label: '2025', values: ['90', '112.5'] } }, /row 1 change \+11% does not match 90 to 107\.5/);
});

test('guard: a comparison table without a chart fails the article rules (the build fails with it)', () => {
  const art = (blk) => validArticle('chart-guard', { body: [blk] });
  const t = { table: TABLE, src: [1] };
  assert.equal(isComparisonTable(TABLE), true);
  assert.equal(isComparisonTable({ head: ['Step', 'Yield'], rows: [] }), false);
  assert.ok(checkArticle(art(t), '2026-09-21').errors.some((e) => /a comparison table needs a chart/.test(e)));
  assert.deepEqual(checkArticle(art({ ...t, chart: SPEC }), '2026-09-21').errors, []);
  assert.ok(checkArticle(art({ ...t, chart: { ...SPEC, change: 1 } }), '2026-09-21').errors.some((e) => /body block 1: chart: row 1/.test(e)));
  assert.ok(checkArticle(art({ p: 'x', chart: SPEC }), '2026-09-21').errors.some((e) => /chart is only allowed on a table/.test(e)));
  assert.deepEqual(checkArticle(art({ ...t, illustration: true }), '2026-09-21').errors, [], 'a made-up illustration needs no chart');
});

test('every published comparison table in src/data/insights declares a valid chart', () => {
  let n = 0;
  for (const a of articles().filter((x) => x.status === 'published')) {
    a.body.forEach((b, i) => {
      if (!b.table || !isComparisonTable(b.table)) return;
      n++;
      assert.ok(b.chart, `${a.slug} block ${i + 1}: comparison table without a chart`);
      assert.deepEqual(checkChartSpec(b.table, b.chart), [], `${a.slug} block ${i + 1}`);
    });
  }
  assert.equal(n, 2, 'the November article: the quarter table and the Q3 top 8 table');
});

test('the Q3 top 8 chart: Q3 2025 values are chart-only and every one agrees with the published change', () => {
  const a = articles().find((x) => x.slug === 'dubai-2026-so-far-official-numbers');
  const b = a.body.find((x) => x.table?.head[1] === 'Q3 2026 (AED bn)');
  assert.deepEqual(b.chart.earlier, { label: 'Q3 2025', values: ['4.51', '2.89', '4.45', '5.70', '5.88', '9.64', '2.34', '3.78'] });
  assert.deepEqual(b.table.head, ['DLD area (common name)', 'Q3 2026 (AED bn)', 'Change vs Q3 2025', 'Off-plan share of sales'], 'the table itself is unchanged');
  for (const v of b.chart.earlier.values) assert.equal(JSON.stringify(b.table).includes(`"${v}"`), false, `${v} is not in the table`);
});

// ---------- the built Insights pages ----------

test('build: each Insights comparison table has its cards above it, one per row, with exactly the table values; the table is unchanged', () => {
  let grids = 0;
  for (const a of articles().filter((x) => x.status === 'published')) {
    const h = readFileSync(join(dist, 'insights', `${a.slug}.html`), 'utf8');
    const specs = a.body.filter((b) => b.table && b.chart);
    const found = [...h.matchAll(/<div class="dc-grid dc-grid--2" role="group" aria-label="([^"]*)" id="chart-\d+">([\s\S]*?)<\/div><p class="dc-src">([\s\S]*?)<\/p>\s*<div class="table-scroll" tabindex="0"><table>([\s\S]*?)<\/table>/g)];
    assert.equal(found.length, specs.length, `${a.slug}: cards directly above each charted table`);
    specs.forEach((b, k) => {
      const [, label, grid, src, table] = found[k];
      const rows = chartRows(b.table, b.chart);
      const cards = cardsOf(grid);
      assert.equal(cards.length, b.table.rows.length, `${a.slug} grid ${k + 1}: one card per row`);
      assert.equal(decodeEntities(label), b.chart.title);
      cards.forEach((c, i) => {
        assert.deepEqual(texts(c, 'dc-name'), [rows[i].label], 'heading = the row label');
        assert.deepEqual(texts(c, 'dc-big-change'), [b.table.rows[i][b.chart.change]], 'the change, large, as the table writes it');
        // The site's money format with the table's own digits: "AED 96.5bn" (Coordinator review 2026-11-07).
        assert.deepEqual(texts(c, 'dc-val'), [`AED ${rows[i].earlierText}bn`, `AED ${rows[i].laterText}bn`]);
        assert.deepEqual(texts(c, 'dc-val').map(figure), [rows[i].earlier, rows[i].later], 'the same figures as the table');
        assert.deepEqual(texts(c, 'dc-period'), [b.chart.earlier.label, b.chart.later.label]);
      });
      for (const [side, s] of [['earlier', b.chart.earlier], ['later', b.chart.later]]) {
        if ('col' in s) assert.deepEqual(rows.map((r) => r[`${side}Text`]), b.table.rows.map((r) => r[s.col]), `${a.slug}: ${side} values are the table column`);
      }
      assert.equal(decodeEntities(src), `Source: ${b.chart.source} <a href="#src-1">[1]</a>. ${b.chart.period}.`);
      // The table below the cards is exactly the data.
      const cells = [...table.matchAll(/<td>([^<]*)<\/td>/g)].map((m) => decodeEntities(m[1]));
      assert.deepEqual(cells, b.table.rows.flat(), `${a.slug} table ${k + 1} unchanged`);
      grids++;
    });
    assert.doesNotMatch(h, /chart\.js|chartjs|d3\.v|echarts|highcharts|apexcharts|<canvas/i, `${a.slug}: no chart library`);
  }
  assert.equal(grids, 2);
});

test('build: renderTableCards is what the page shows', () => {
  const a = articles().find((x) => x.slug === 'dubai-2026-so-far-official-numbers');
  const h = readFileSync(join(dist, 'insights', `${a.slug}.html`), 'utf8');
  a.body.forEach((b, i) => { if (b.chart) assert.ok(h.includes(renderTableCards(`chart-${i + 1}`, b.table, b.chart, b.src)), `block ${i + 1}`); });
});

// ---------- guards on every built page ----------

test('guard: no comparison table on any built page ships without its cards (or a recorded data gap)', () => {
  const adrec = JSON.parse(read('src/data/adrec-areas.json'));
  const adHasPrior = adrec.areas.some((a) => 'prior_value_bn' in a);
  let tables = 0;
  for (const f of htmlFiles()) {
    const h = readFileSync(f, 'utf8');
    for (const m of h.matchAll(/<table[\s\S]*?<\/thead>/g)) {
      const head = [...m[0].matchAll(/<th[^>]*>([^<]*)</g)].map((x) => x[1]);
      if (!isComparisonTable({ head })) continue;
      tables++;
      const wrap = Math.max(h.lastIndexOf('<div class="table-scroll"', m.index), h.lastIndexOf('<div class="mk-table-card"', m.index));
      assert.ok(wrap >= 0, `${f}: comparison table outside a known wrapper`);
      const tag = h.slice(wrap, h.indexOf('>', wrap) + 1);
      // Its cards: the nearest card grid before it, after any earlier table, drawing at least one bar pair.
      const grid = h.lastIndexOf('<div class="dc-grid', wrap);
      const charted = grid > h.lastIndexOf('</table>', wrap) && h.slice(grid, wrap).includes('data-chart="bars"');
      const gap = /data-chart-gap="prior-period-not-in-data"/.test(tag);
      assert.ok(charted || gap, `${f.slice(dist.length)}: comparison table (${head.join(', ')}) without its cards`);
      // A gap is allowed only while the data really has no prior period: /areas Abu Dhabi reads adrec-areas.json.
      if (gap) assert.equal(adHasPrior, false, `${f}: adrec-areas.json has prior_value_bn, so the table needs its cards`);
    }
  }
  assert.equal(tables, 2, `${tables} comparison tables: the 2 in the November Insights article`);
});

test('guard: no comparison table section outside an Insights article: /areas compares in its cards only', () => {
  for (const f of htmlFiles()) {
    const rel = f.slice(dist.length);
    const h = readFileSync(f, 'utf8');
    assert.doesNotMatch(h, /Change vs last year ·|class="mk-table/, `${rel}: a separate change section`);
    if (rel.startsWith('/insights/')) continue;
    for (const m of h.matchAll(/<table[\s\S]*?<\/thead>/g)) {
      const head = [...m[0].matchAll(/<th[^>]*>([^<]*)</g)].map((x) => x[1]);
      assert.equal(isComparisonTable({ head }), false, `${rel}: comparison table (${head.join(', ')}) outside an article`);
    }
  }
  // The browser-rendered Dubai section has none either.
  assert.doesNotMatch(liveTop(), /<table/);
});

/** Every chart in a stretch of HTML must sit inside a data card. Returns the offending positions. */
const outsideCards = (h) => [...h.matchAll(/data-chart="|role="img"/g)].filter((m) => {
  if (/role="img"/.test(m[0]) && !/class="dc-chart"/.test(h.slice(h.lastIndexOf('<', m.index), m.index))) return false; // another role="img" (not a chart)
  return !(h.lastIndexOf('<article class="dc', m.index) > h.lastIndexOf('</article>', m.index));
}).map((m) => h.slice(Math.max(0, m.index - 80), m.index + 40));

test('guard: no standalone chart block ships on any page: every chart is inside a data card; the v6.6 chart blocks are gone', () => {
  let charts = 0;
  for (const f of walk(dist).filter((x) => /\.(html|js|css)$/.test(x))) {
    const h = readFileSync(f, 'utf8');
    assert.doesNotMatch(h, /class="cmp\b|cmp-svg|cmp-earlier|cmp-later|figure class="cmp"|data-chart="compare"/, `${f.slice(dist.length)}: a v6.6 chart block`);
    if (!f.endsWith('.html')) continue;
    assert.deepEqual(outsideCards(h), [], `${f.slice(dist.length)}: a chart outside a card`);
    charts += (h.match(/data-chart="bars"/g) ?? []).length;
  }
  assert.equal(charts, 4 + 4 + 12, `${charts} built charts: /areas Abu Dhabi 4, the 4 Abu Dhabi guides, Insights 4 + 8`);
  // And what the browser renders (/areas Dubai, the Dubai guides).
  for (const h of [liveTop(), renderGuideCard('dubai', { period: LIVE.period, name: 'Dubai Marina', dldArea: 'Marsa Dubai', area: dubaiRows(LIVE)[6] })]) {
    assert.ok(h.includes('data-chart="bars"'));
    assert.deepEqual(outsideCards(h), []);
  }
  assert.deepEqual(outsideCards('<div class="dc-chart" data-chart="bars" role="img"></div>').length, 2, 'the guard catches a chart outside a card');
});

// ---------- colours (Rules 1c v6.9) ----------

const TOKENS = Object.fromEntries([...read('src/styles/global.css').matchAll(/^\s*(--[a-z-]+):\s*(#[0-9a-f]{6})\b/gim)].map((m) => [m[1], m[2].toLowerCase()]));
const HEX = { ink: '#14252f', ivory: '#f3f0e7', brass: '#c6a272', brassDeep: '#7e6034', slate: '#627982', slateLight: '#8fa3ab', mono: '#1a1a1a' };
const COLOUR_PROPS = /^(color|background|background-color|border|border-color|border-top|border-right|border-bottom|border-left|outline|outline-color|fill|stroke|box-shadow|text-decoration-color)$/;
/** The colours a declaration value names, resolved through the :root tokens ('transparent' kept as is). */
const colours = (v) => [...v.matchAll(/var\((--[a-z-]+)\)|#[0-9a-f]{3,8}\b|\btransparent\b|\b(?:rgb|hsl)a?\([^)]*\)/gi)].map((m) => (m[1] ? TOKENS[m[1]] ?? m[1] : m[0].toLowerCase()));
/** [selector, property, colours] for every colour declaration in a stylesheet (nested @media and @container included). */
const colourDecls = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((m) => m[2].split(';').map((d) => d.split(':')).filter(([p]) => COLOUR_PROPS.test((p ?? '').trim()))
  .map(([p, ...v]) => [m[1].trim(), p.trim(), colours(v.join(':'))]));
const CHART_PART = /\.dc-(bar|chart|row|track|val|period|change|rise|fall|flat|none|big-change)\b/;

test('colours: chart bars are Brass (current) and a Brass Deep outline (earlier; Brass on Ink); change text Ink or Brass Deep (Ivory or Brass on Ink); never grey', () => {
  const css = read('src/styles/data-card.css');
  const decls = colourDecls(css);
  const chart = decls.filter(([sel]) => CHART_PART.test(sel));
  assert.ok(chart.length >= 8, `${chart.length} chart colour declarations`);
  for (const [sel, prop, cs] of chart) {
    const dark = /\.dc--dark\b/.test(sel);
    const bar = /\.dc-bar\b/.test(sel);
    const allowed = bar ? (dark ? [HEX.brass, 'transparent'] : [HEX.brass, HEX.brassDeep, 'transparent']) : dark ? [HEX.ivory, HEX.brass] : [HEX.ink, HEX.brassDeep];
    for (const c of cs) assert.ok(allowed.includes(c), `${sel} { ${prop} }: ${c} is not allowed in a chart (${allowed.join(', ')})`);
  }
  const get = (sel, prop) => decls.find(([s, p]) => s === sel && p === prop)?.[2];
  assert.deepEqual(get('.dc-bar--later', 'background'), [HEX.brass]);
  assert.deepEqual(get('.dc-bar--earlier', 'background'), ['transparent']);
  assert.deepEqual(get('.dc-bar--earlier', 'border'), [HEX.brassDeep]);
  assert.match(css, /\.dc-bar--earlier \{ background: transparent; border: 1\.5px solid var\(--brass-deep\); \}/);
  assert.deepEqual(get('.dc--dark .dc-bar--earlier', 'border-color'), [HEX.brass]);
  assert.deepEqual(get('.dc-rise, .dc-flat, .dc-none', 'color'), [HEX.ink]);
  assert.deepEqual(get('.dc-fall', 'color'), [HEX.brassDeep]);
  assert.deepEqual(get('.dc--dark .dc-rise, .dc--dark .dc-flat, .dc--dark .dc-none', 'color'), [HEX.ivory]);
  assert.deepEqual(get('.dc--dark .dc-fall', 'color'), [HEX.brass]);
  assert.match(css, /\.dc-bar \{[^}]*height: 10px;[^}]*border-radius: var\(--radius-sm\);/, '10px bars, fully rounded ends');
  // No grey anywhere in a chart, and no other stylesheet colours a chart part.
  for (const grey of [HEX.slate, HEX.slateLight, HEX.mono]) assert.ok(!chart.some(([, , cs]) => cs.includes(grey)), grey);
  for (const f of ['src/styles/global.css', 'src/styles/market.css']) {
    assert.deepEqual(colourDecls(read(f)).filter(([sel]) => CHART_PART.test(sel) || /\.dc\b/.test(sel)), [], `${f} colours no part of a data card`);
  }
  assert.equal(TOKENS['--gold'], HEX.brass);
  assert.equal(TOKENS['--brass-deep'], HEX.brassDeep);
});

test('colours: chart markup carries no colour of its own: the only inline style is the bar length', () => {
  const pieces = [liveTop(), renderGuideCard('dubai', { period: LIVE.period, area: dubaiRows(LIVE)[0], dldArea: 'Madinat Al Mataar' }), ...htmlFiles().map((f) => readFileSync(f, 'utf8'))];
  let n = 0;
  for (const h of pieces) {
    for (const m of h.matchAll(/<div class="dc-chart"[\s\S]*?<\/div><\/div>/g)) {
      n++;
      assert.doesNotMatch(m[0], /fill=|stroke=|color|#[0-9a-f]{3,6}\b|rgb|hsl/i, m[0].slice(0, 120));
      for (const s of m[0].matchAll(/style="([^"]*)"/g)) assert.match(s[1], /^--f:(0|1|0\.\d{1,3})$/, s[1]);
    }
  }
  assert.ok(n > 20, `${n} charts checked`);
});

// ---------- no library, no request, no new dependency ----------

test('no chart library, script or dependency: the cards are strings built by lib/chart.mjs', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@astrojs/sitemap', '@fontsource-variable/inter', '@fontsource/cormorant-garamond', 'astro', 'libphonenumber-js']);
  const src = read('src/lib/chart.mjs');
  assert.doesNotMatch(src, /^\s*import\s/m, 'lib/chart.mjs imports nothing');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|document\.|window\./);
  const sort = read('src/lib/card-sort.mjs');
  assert.doesNotMatch(sort, /^\s*import\s|fetch\(|XMLHttpRequest|innerHTML/m, 'the toggle only moves existing cards');
  // One component: every page that draws cards uses DataCard.astro or the same lib functions in the browser.
  assert.match(read('src/components/DataCard.astro'), /import '\.\.\/styles\/data-card\.css';/);
  for (const p of ['src/pages/areas/index.astro', 'src/pages/areas/[slug].astro', 'src/pages/insights/[slug].astro']) assert.match(read(p), /<DataCard html=\{/, p);
});

// ---------- homepage alignment (owner decision 2026-11-06, "4 yes") ----------

test('homepage: "Buying in the UAE from abroad" is centred in the same column as "Numbers, not headlines"', () => {
  const h = readFileSync(join(dist, 'index.html'), 'utf8');
  const block = (heading) => {
    const i = h.indexOf(heading);
    const open = h.lastIndexOf('<div class="', i);
    return h.slice(open, h.indexOf('>', open) + 1);
  };
  assert.match(h, /<div class="narrow center"[^>]*>\s*<p class="eyebrow both"[^>]*>For international clients<\/p>\s*<h2[^>]*>Buying in the UAE <em[^>]*>from abroad\.<\/em><\/h2>/);
  assert.equal(block('Buying in the UAE').replace(/ data-astro-cid-\w+/g, ''), block('Numbers, not').replace(/ data-astro-cid-\w+/g, ''), 'the same column element');
  assert.match(h, /You don't need to be in the UAE to make a well-informed property decision\. Briefing, virtual shortlist, remote viewings, due diligence, negotiation, transaction coordination and handover, all managed on your behalf\./, 'wording unchanged');
  assert.doesNotMatch(h, /class="wrap split"/);
});
