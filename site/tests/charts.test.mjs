// Comparison charts (Rules 1c v6.6, owner decisions 2026-11-06): every comparison of figures is shown with a chart as well
// as the numbers. Unit checks of lib/chart.mjs and the market renderers, the article chart spec, and the built site: each
// chart repeats its table's values exactly, no comparison table ships without a chart (or a recorded data gap), and no
// chart library or external request is involved. The 320px checks need Chromium: tests/e2e/charts.e2e.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changeAgrees, changeValue, chartRows, checkChartSpec, figure, isComparisonTable, renderCompareChart, renderTableChart } from '../src/lib/chart.mjs';
import { checkArticle } from '../src/lib/intel.mjs';
import { checkAdrecAreas, dubaiRows, fmtBn, renderChange, renderGuideCard, renderTop } from '../src/lib/market.mjs';
import { validArticle } from './helpers/fixtures.mjs';
import { decodeEntities } from '../scripts/html-text.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const read = (p) => readFileSync(join(root, p), 'utf8');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const htmlFiles = () => walk(dist).filter((f) => f.endsWith('.html'));
const articles = () => readdirSync(join(root, 'src/data/insights')).map((f) => JSON.parse(read(`src/data/insights/${f}`)));
const texts = (svg, cls) => [...svg.matchAll(new RegExp(`<text class="${cls}[^"]*"[^>]*>([^<]*)</text>`, 'g'))].map((m) => decodeEntities(m[1]));

const ROWS = [
  { label: 'Q1', earlier: 96.5, later: 107.5, earlierText: '96.5', laterText: '107.5', change: '+11%' },
  { label: 'Q2 & more', earlier: 112.5, later: 75.4, earlierText: '112.5', laterText: '75.4', change: '−33%' },
];
const chart = () => renderCompareChart({ id: 'c1', title: 'Sales by quarter', earlierLabel: '2025', laterLabel: '2026', rows: ROWS, caption: 'Source: test.' });

// ---------- the renderer ----------

test('chart: paired bars, every value and change as text, role="img" with a title and a description', () => {
  const h = chart();
  assert.match(h, /^<figure class="cmp" data-chart="compare">/);
  assert.match(h, /<svg class="cmp-svg" width="100%" height="\d+" role="img" aria-labelledby="c1-t c1-d"/);
  assert.match(h, /<title id="c1-t">Sales by quarter<\/title><desc id="c1-d">Q1: 96\.5 in 2025, 107\.5 in 2026, change \+11%; Q2 &amp; more: 112\.5 in 2025, 75\.4 in 2026, change −33%\.<\/desc>/);
  assert.deepEqual(texts(h, 'cmp-value'), ['96.5', '107.5', '112.5', '75.4'], 'every value is written, earlier then later');
  assert.deepEqual(texts(h, 'cmp-change'), ['+11%', '−33%'], 'the change on each pair');
  assert.deepEqual(texts(h, 'cmp-key'), ['2025', '2026'], 'legend');
  assert.equal((h.match(/<rect class="cmp-earlier"/g) ?? []).length, 3, 'two earlier bars and a legend key');
  assert.equal((h.match(/<rect class="cmp-later"/g) ?? []).length, 3, 'two later bars and a legend key');
  assert.match(h, /cmp-change cmp-rise[^>]*>\+11%/);
  assert.match(h, /cmp-change cmp-fall[^>]*>−33%/);
  assert.match(h, /<figcaption class="cmp-src">Source: test\.<\/figcaption>\n<\/figure>$/);
  // Text never scales down: no viewBox, bar lengths are percentages of the chart width.
  assert.doesNotMatch(h, /viewBox/);
  const widths = [...h.matchAll(/<rect class="cmp-(?:earlier|later)" x="0" y="\d+" width="([\d.]+)%"/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 4);
  assert.ok(Math.max(...widths) <= 70 && widths.every((w) => w > 0), `${widths}`);
  assert.ok(widths[2] > widths[0] && widths[1] > widths[3], 'bar lengths follow the values');
});

test('chart: nothing to draw renders nothing; no script, style, link or external reference', () => {
  assert.equal(renderCompareChart({ id: 'x', title: 't', earlierLabel: 'a', laterLabel: 'b', rows: [], caption: '' }), '');
  assert.equal(renderCompareChart({ id: 'x', title: 't', earlierLabel: 'a', laterLabel: 'b', rows: [{ ...ROWS[0], earlier: NaN }], caption: '' }), '');
  const h = chart();
  assert.doesNotMatch(h, /<script|<style|<link|<img|<image|<use|href="http|src=/);
  assert.deepEqual([...h.matchAll(/https?:\/\/[^\s"]+/g)].map((m) => m[0]), ['http://www.w3.org/2000/svg'], 'only the SVG namespace');
});

test('chart: labels wrap and text is escaped', () => {
  const h = renderCompareChart({ id: 'w', title: '<b>', earlierLabel: 'a', laterLabel: 'b', caption: '', rows: [{ ...ROWS[0], label: 'Al Barsha South Fourth (Jumeirah Village Circle)' }] });
  assert.ok(texts(h, 'cmp-label').length >= 2, 'a long label takes more than one line');
  assert.equal(texts(h, 'cmp-label').join(' '), 'Al Barsha South Fourth (Jumeirah Village Circle)');
  assert.match(h, /<title id="w-t">&lt;b&gt;<\/title>/);
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

test('build: each Insights comparison table has its chart above it, with exactly the table values', () => {
  const pub = articles().filter((x) => x.status === 'published');
  let charts = 0;
  for (const a of pub) {
    const h = readFileSync(join(dist, 'insights', `${a.slug}.html`), 'utf8');
    const specs = a.body.filter((b) => b.table && b.chart);
    const figs = [...h.matchAll(/<figure class="cmp" data-chart="compare">([\s\S]*?)<\/figure>\s*<div class="table-scroll"/g)].map((m) => m[1]);
    assert.equal(figs.length, specs.length, `${a.slug}: one chart directly above each charted table`);
    specs.forEach((b, k) => {
      const rows = chartRows(b.table, b.chart);
      assert.deepEqual(texts(figs[k], 'cmp-value'), rows.flatMap((r) => [r.earlierText, r.laterText]), `${a.slug} chart ${k + 1}: values`);
      assert.deepEqual(texts(figs[k], 'cmp-change'), b.table.rows.map((r) => r[b.chart.change]), `${a.slug} chart ${k + 1}: changes are the table's`);
      for (const [side, s] of [['earlier', b.chart.earlier], ['later', b.chart.later]]) {
        if ('col' in s) assert.deepEqual(rows.map((r) => r[`${side}Text`]), b.table.rows.map((r) => r[s.col]), `${a.slug}: ${side} values are the table column`);
      }
      assert.match(figs[k], /role="img"/);
      assert.ok(figs[k].includes(`<figcaption class="cmp-src">Source: ${b.chart.source} <a href="#src-1">[1]</a>. ${b.chart.period}.</figcaption>`), `${a.slug} chart ${k + 1}: source and period line`);
      charts++;
    });
    assert.doesNotMatch(h, /chart\.js|chartjs|d3\.v|echarts|highcharts|apexcharts|<canvas/i, `${a.slug}: no chart library`);
  }
  assert.equal(charts, 2);
});

test('build: renderTableChart is what the page shows', () => {
  const a = articles().find((x) => x.slug === 'dubai-2026-so-far-official-numbers');
  const h = readFileSync(join(dist, 'insights', `${a.slug}.html`), 'utf8');
  a.body.forEach((b, i) => { if (b.chart) assert.ok(h.includes(renderTableChart(`chart-${i + 1}`, b.table, b.chart, b.src)), `block ${i + 1}`); });
});

test('guard: no comparison table on any built page ships without a chart (or a recorded data gap)', () => {
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
      const charted = /<\/figure>\s*$/.test(h.slice(0, wrap)) && h.lastIndexOf('<figure class="cmp"', wrap) > h.lastIndexOf('</table>', wrap);
      const gap = /data-chart-gap="prior-period-not-in-data"/.test(tag);
      assert.ok(charted || gap, `${f.slice(dist.length)}: comparison table (${head.join(', ')}) without a chart`);
      // A gap is allowed only while the data really has no prior period: /areas Abu Dhabi reads adrec-areas.json.
      if (gap) assert.equal(adHasPrior, false, `${f}: adrec-areas.json has prior_value_bn, so the table needs its chart`);
    }
  }
  assert.ok(tables >= 3, `${tables} comparison tables (2 Insights, /areas Abu Dhabi)`);
});

test('guard: Abu Dhabi charts draw exactly where adrec-areas.json has prior_value_bn, the gap is recorded everywhere else', () => {
  const adrec = JSON.parse(read('src/data/adrec-areas.json'));
  const withPrior = adrec.areas.filter((a) => 'prior_value_bn' in a);
  assert.deepEqual(withPrior.map((a) => a.guide), ['hudayriyat-island', 'saadiyat-island', 'al-reem-al-maryah-island', 'yas-island']);
  // /areas, Abu Dhabi panel: the top areas chart and the change chart, one pair per area with a prior value, no gap.
  const h = readFileSync(join(dist, 'areas.html'), 'utf8');
  const panel = h.slice(h.indexOf('<div class="mk-panel" data-emirate="abu_dhabi"'), h.indexOf('<section class="mk-guides"'));
  const figs = [...panel.matchAll(/<figure class="cmp"[\s\S]*?<\/figure>/g)].map((m) => m[0]);
  assert.equal(figs.length, 2, '/areas Abu Dhabi: two charts');
  for (const fig of figs) {
    assert.equal(texts(fig, 'cmp-change').length, withPrior.length);
    assert.ok(fig.includes(`<figcaption class="cmp-src">${adrec.chart_caption.replace(/'/g, '&#39;')}</figcaption>`), 'approved caption, plain text');
  }
  assert.doesNotMatch(panel, /data-chart-gap/);
  // Each Abu Dhabi guide: a chart and no gap with a prior value; no chart and the gap without one.
  for (const a of adrec.areas) {
    const g = readFileSync(join(dist, 'areas', `${a.guide}.html`), 'utf8');
    const card = g.slice(g.indexOf('<div class="mk-guide-card"'), g.indexOf('</div>', g.indexOf('<div class="mk-guide-card"')));
    if ('prior_value_bn' in a) {
      assert.match(card, /<figure class="cmp"/, a.guide);
      assert.doesNotMatch(card, /data-chart-gap/, a.guide);
      assert.deepEqual(texts(card, 'cmp-value'), [fmtBn(a.prior_value_bn), fmtBn(a.value_bn)], a.guide);
    } else {
      assert.doesNotMatch(card, /<figure/, a.guide);
      assert.match(card, /^<div class="mk-guide-card" data-chart-gap="prior-period-not-in-data"[ >]/, a.guide);
    }
  }
});

// ---------- /areas and the area guides ----------

const DUBAI = {
  period: '2026-YTD09',
  areas: [
    { rank: 1, area: 'Madinat Al Mataar', label: 'Dubai South', value_bn: 16.89, prior_value_bn: 13.96, share_pct: 6.7, change_pct: 21 },
    { rank: 2, area: 'Business Bay', label: null, value_bn: 10.5, prior_value_bn: 23.24, share_pct: 4.2, change_pct: -54.8 },
    { rank: 3, area: 'New Area', label: null, value_bn: 2.1, prior_value_bn: null, share_pct: 1, change_pct: null, prior_zero: true },
  ],
};

test('/areas: with the prior period in the data, both sections draw the chart from the same rows', () => {
  for (const [h, id] of [[renderTop('dubai', DUBAI), 'cmp-top-dubai'], [renderChange('dubai', DUBAI), 'cmp-chg-dubai']]) {
    const svg = h.slice(h.indexOf('<figure class="cmp"'), h.indexOf('</figure>'));
    assert.match(svg, new RegExp(`aria-labelledby="${id}-t ${id}-d"`));
    assert.deepEqual(texts(svg, 'cmp-key'), ['Jan to Sep 2025', 'Jan to Sep 2026']);
    assert.equal(texts(svg, 'cmp-change').length, 2, 'the row without a prior period is left out, never estimated');
    for (const a of DUBAI.areas.slice(0, 2)) for (const v of [fmtBn(a.value_bn), fmtBn(a.prior_value_bn)]) assert.ok(texts(svg, 'cmp-value').includes(v), `${a.area} ${v}`);
    assert.match(h, /<figcaption class="cmp-src">Source: Dubai Land Department, Real Estate Transactions open data\. Residential sales value, Jan to Sep 2025 against Jan to Sep 2026\.<\/figcaption>/);
  }
  assert.deepEqual(texts(renderChange('dubai', DUBAI), 'cmp-change'), ['+21%', '−55%'], 'change order follows the table (highest first)');
  assert.doesNotMatch(renderChange('dubai', DUBAI), /data-chart-gap/);
});

test('/areas: without the prior period (today\'s Worker and adrec-areas.json) no chart is drawn and the gap is recorded', () => {
  const none = { ...DUBAI, areas: DUBAI.areas.map(({ prior_value_bn, ...a }) => a) };
  assert.doesNotMatch(renderTop('dubai', none), /<figure/);
  assert.doesNotMatch(renderChange('dubai', none), /<figure/);
  assert.match(renderChange('dubai', none), /<div class="mk-table-card" data-chart-gap="prior-period-not-in-data">/);
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

test('area guide card: one pair when the prior period is in the data, none without it', () => {
  const area = DUBAI.areas[1];
  const h = renderGuideCard('dubai', { period: '2026-YTD09', dldArea: 'Business Bay', area });
  assert.deepEqual(texts(h, 'cmp-value'), ['AED 23.2bn', 'AED 10.5bn']);
  assert.deepEqual(texts(h, 'cmp-change'), ['−55%']);
  assert.match(h, /aria-labelledby="cmp-guide-dubai-t cmp-guide-dubai-d"/);
  assert.doesNotMatch(renderGuideCard('dubai', { period: '2026-YTD09', area: { ...area, prior_value_bn: null } }), /<figure/);
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
  // The caption is required with a prior value and is plain text.
  const { chart_caption, ...noCaption } = file;
  assert.ok(checkAdrecAreas(noCaption, slugs).includes('chart_caption is required once a prior_value_bn is listed'));
  assert.ok(checkAdrecAreas({ ...file, chart_caption: 'Source: <a href="https://adrec.gov.ae/">ADREC</a>' }, slugs).includes('chart_caption must be plain text with no link'));
  assert.ok(checkAdrecAreas(withPrior(4, 1), slugs).some((e) => /areas\[4\]: prior_value_bn needs a published change/.test(e)));
  assert.ok(checkAdrecAreas(withPrior(2, 0), slugs).some((e) => /areas\[2\]: prior_value_bn must be a number above zero/.test(e)));
});

// ---------- no library, no request, no new dependency ----------

test('no chart library, script or dependency: the charts are strings built by lib/chart.mjs', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@astrojs/sitemap', '@fontsource-variable/inter', '@fontsource/cormorant-garamond', 'astro', 'libphonenumber-js']);
  const src = read('src/lib/chart.mjs');
  assert.doesNotMatch(src, /^\s*import\s/m, 'lib/chart.mjs imports nothing');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|document\.|window\./);
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
