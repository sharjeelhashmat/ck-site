// Browser check for the data cards (Rules 1c v6.9, "Brand data standard") and the homepage alignment fix. At 320, 375 and
// 1280: no page scrolls sideways (/areas in both sort orders and Abu Dhabi, a Dubai guide, an Abu Dhabi guide, each
// Insights article, the homepage); every chart sits inside a card and its labels stay inside the card; bar and change
// colours as the browser computes them are Brass and Brass Deep, Ink and Brass Deep; the Dubai sort toggle reorders the
// cards (click and keyboard) and sets aria-pressed; card values equal the table and Worker values. Not part of `npm test`:
// it needs Chromium.
//   PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e/charts.e2e.mjs <distDir>
// The Worker is replaced by routes inside the browser. The market figures are invented fixtures, never real data.
import path from 'node:path';
import assert from 'node:assert/strict';
import { start } from '../../qa/serve.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const dist = path.resolve(process.argv[2] ?? 'dist');
const WORKER = 'https://ck-lead-worker.sharjeelhashmat.workers.dev';

const row = (rank, area_en, label, value_bn, prior_value_bn, change_pct) => ({ rank, area_en, label, value_bn, prior_value_bn, share_pct: 5, change_pct, prior_zero: false, offplan_pct: 50 });
const top8 = [
  row(1, 'Madinat Al Mataar', 'Dubai South', 12, 10, 20), row(2, 'Palm Deira', 'Dubai Islands', 11, 8, 37.5), row(3, 'Business Bay', null, 10, 20, -50),
  row(4, 'Marsa Dubai', 'Dubai Marina, Dubai Harbour', 9, 18, -50), row(5, 'Wadi Al Safa 3', 'Majan', 8, 10, -20), row(6, 'Al Yelayiss 1', null, 7, 0.5, 1300),
  row(7, 'Wadi Al Safa 5', 'Dubailand Residence Complex', 6, 6, 0), row(8, 'Jabal Ali First', 'Jumeirah Lake Towers', 5, 5.5, -9.1),
];
const VALUE_ORDER = ['Dubai South', 'Dubai Islands', 'Business Bay', 'Dubai Marina, Dubai Harbour', 'Majan', 'Al Yelayiss 1', 'Dubailand Residence Complex', 'Jumeirah Lake Towers'];
const CHANGE_ORDER = ['Al Yelayiss 1', 'Dubai Islands', 'Dubai South', 'Dubailand Residence Complex', 'Jumeirah Lake Towers', 'Majan', 'Business Bay', 'Dubai Marina, Dubai Harbour'];
const months = { period: '2026-YTD09', prior_period: '2025-YTD09', first_month: '2026-01', last_month: '2026-09', prior_first_month: '2025-01', prior_last_month: '2025-09' };
const AREAS = { ...months, dubai: { ytd: { sales_bn: 300, total_bn: 450, mortgages_bn: 120, as_of: '2026-10-30' }, top8, total_res_bn: 180, as_of: '2026-10-30' } };
const AREA = { ...months, area: top8[3], total_res_bn: 180, as_of: '2026-10-30' };
const LAUNCHES = { abu_dhabi: { transaction_value_bn: 100, sales_value_bn: 70, mortgage_value_bn: 20, year: 2026, as_of: '2026-10-16', source_label: 'x', source_url: 'https://adrec.gov.ae/en' } };
const strip = (b) => JSON.parse(JSON.stringify(b, (k, v) => (k === 'prior_value_bn' ? undefined : v)));
const RGB = { ink: 'rgb(20, 37, 47)', brass: 'rgb(198, 162, 114)', brassDeep: 'rgb(126, 96, 52)', none: 'rgba(0, 0, 0, 0)' };

const server = await start(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let checks = 0;

async function open(p, width, { prior = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(prior ? b : strip(b)) });
  await page.route(/^https:\/\//, (r) => r.abort());
  await page.route(`${WORKER}/market/areas*`, (r) => json(r, AREAS));
  await page.route(`${WORKER}/market/area/**`, (r) => json(r, AREA));
  await page.route(`${WORKER}/market/launches`, (r) => json(r, LAUNCHES));
  await page.goto(base + p, { waitUntil: 'networkidle' });
  return { page, ctx };
}
const noSideScroll = async (page, label, width) => {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(sw <= width, `${label} @${width}: page is ${sw}px wide`);
  checks++;
};
// Every chart is inside a card, its labels stay inside the card, a value label never runs into its bar, and the colours
// are the standard's.
const cardsFit = async (page, label) => {
  const r = await page.$$eval('.dc-chart', (charts) => charts.filter((c) => c.getBoundingClientRect().width > 0).map((c) => {
    const card = c.closest('article.dc');
    if (!card) return { outside: true };
    const box = card.getBoundingClientRect();
    const out = [...c.querySelectorAll('.dc-period, .dc-val, .dc-bar')].filter((e) => { const q = e.getBoundingClientRect(); return q.left < box.left - 1 || q.right > box.right + 1; }).map((e) => e.textContent || e.className);
    const clash = [...c.querySelectorAll('.dc-row')].filter((rw) => {
      const bar = rw.querySelector('.dc-bar').getBoundingClientRect();
      const val = rw.querySelector('.dc-val').getBoundingClientRect();
      return Math.abs(bar.top - val.top) < 4 && bar.right > val.left + 0.5; // same line: the value starts after the bar
    }).map((rw) => rw.textContent);
    const cs = (sel, p) => getComputedStyle(c.querySelector(sel))[p];
    const change = card.querySelector('.dc-change, .dc-big-change');
    return {
      outside: false, out, clash,
      later: cs('.dc-bar--later', 'backgroundColor'), earlierBg: cs('.dc-bar--earlier', 'backgroundColor'), earlierBorder: cs('.dc-bar--earlier', 'borderTopColor'),
      earlierWidth: cs('.dc-bar--earlier', 'borderTopWidth'), height: cs('.dc-bar--later', 'height'),
      change: change ? [change.textContent, getComputedStyle(change).color] : null,
    };
  }));
  assert.ok(r.length > 0, `${label}: charts on screen`);
  for (const c of r) {
    assert.equal(c.outside, false, `${label}: a chart outside a card`);
    assert.deepEqual(c.out, [], `${label}: chart text outside the card`);
    assert.deepEqual(c.clash, [], `${label}: a value label runs into its bar`);
    // The outline is declared 1.5px (tests/charts.test.mjs pins the CSS); Chromium snaps a border to whole device pixels,
    // so it computes as 1px on a 1x screen and 1.5px on a 2x one.
    assert.deepEqual([c.later, c.earlierBg, c.earlierBorder, c.height], [RGB.brass, RGB.none, RGB.brassDeep, '10px'], `${label}: bar colours`);
    assert.ok(['1px', '1.5px'].includes(c.earlierWidth), `${label}: outline ${c.earlierWidth}`);
    if (c.change) assert.equal(c.change[1], /^[−-]/.test(c.change[0]) ? RGB.brassDeep : RGB.ink, `${label}: change ${c.change[0]}`);
  }
  checks++;
};
// Coordinator review 2: a card heading never breaks inside a word. For each word of each visible .dc-name, all of its
// line boxes share one top (a word split across lines has two), and the heading does not overflow its card.
const headingsWhole = async (page, label) => {
  const bad = await page.$$eval('.dc-name', (hs) => hs.filter((h) => h.getBoundingClientRect().width > 0).flatMap((h) => {
    const out = [];
    const node = h.firstChild;
    const text = node?.textContent ?? '';
    for (const m of text.matchAll(/\S+/g)) {
      const r = document.createRange();
      r.setStart(node, m.index);
      r.setEnd(node, m.index + m[0].length);
      const tops = new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top)));
      if (tops.size > 1) out.push(`"${m[0]}" split in "${text}"`);
    }
    if (h.scrollWidth > h.clientWidth + 1) out.push(`"${text}" overflows its card`);
    return out;
  }));
  assert.deepEqual(bad, [], `${label}: card headings`);
  checks++;
};
// Coordinator review 3: the card footer. The share text is at most 2 lines. If the change shares its line, the share text
// is one line; otherwise the change is on its own line below, right-aligned to the footer's right edge.
const footersFit = async (page, label) => {
  const bad = await page.$$eval('.dc-foot', (fs) => fs.filter((f) => f.getBoundingClientRect().width > 0).flatMap((f) => {
    const share = f.firstElementChild;
    const change = f.querySelector('.dc-change');
    const r = document.createRange();
    r.selectNodeContents(share);
    const lines = new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size;
    const sr = share.getBoundingClientRect(), cr = change.getBoundingClientRect(), fr = f.getBoundingClientRect();
    const out = [];
    if (lines > 2) out.push(`"${share.textContent}" is ${lines} lines`);
    const sameLine = cr.top < sr.bottom - 1;
    if (sameLine && lines > 1) out.push(`"${share.textContent}" wraps beside "${change.textContent}"`);
    if (!sameLine && Math.abs(cr.right - fr.right) > 1) out.push(`"${change.textContent}" below but not right-aligned`);
    if (cr.right > fr.right + 1 || sr.right > fr.right + 1) out.push(`"${share.textContent}" overflows`);
    return out;
  }));
  assert.deepEqual(bad, [], `${label}: card footers`);
  checks++;
};
const names = (page, panel) => page.$$eval(`.mk-panel[data-emirate="${panel}"] .dc-grid .dc-name`, (h) => h.map((x) => x.textContent));

try {
  for (const width of [320, 375, 1280]) {
    // Homepage, Insights, an Abu Dhabi guide: built at build time.
    for (const p of ['/', '/insights/dubai-2026-so-far-official-numbers', '/insights/does-rising-transaction-value-mean-rising-prices', '/insights/costs-investors-forget-before-yield', '/areas/saadiyat-island']) {
      const { page, ctx } = await open(p, width);
      await noSideScroll(page, p, width);
      if (p === '/insights/dubai-2026-so-far-official-numbers') {
        await cardsFit(page, p);
        assert.equal(await page.locator('.dc-grid .dc-chart[role="img"]').count(), 12, 'one card per table row (4 + 8)');
        // Card changes and values equal the table as the browser shows it.
        const grids = await page.$$eval('.dc-grid', (gs) => gs.map((g) => {
          let t = g.nextElementSibling;
          while (t && !t.classList.contains('table-scroll')) t = t.nextElementSibling;
          return {
            cards: [...g.querySelectorAll('.dc-big-change')].map((x) => x.textContent),
            later: [...g.querySelectorAll('.dc-row--later .dc-val')].map((x) => x.textContent),
            table: [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent)),
          };
        }));
        assert.deepEqual(grids[0].cards, ['+11%', '−33%', '−46%', '−25%']);
        assert.deepEqual(grids[0].cards, grids[0].table.map((r) => r[3]), 'quarter card changes are the table changes');
        assert.deepEqual(grids[0].later, grids[0].table.map((r) => `AED ${r[2]}bn`), 'quarter card 2026 values are the table values, as AED bn');
        assert.deepEqual(grids[1].cards, grids[1].table.map((r) => r[2]), 'Q3 card changes are the table changes');
        assert.deepEqual(grids[1].later, grids[1].table.map((r) => `AED ${r[1]}bn`), 'Q3 card values are the table values, as AED bn');
        checks++;
      }
      if (p === '/areas/saadiyat-island') {
        await cardsFit(page, p);
        assert.deepEqual(await page.$$eval('.mk-guide-card .dc-val', (t) => t.map((x) => x.textContent)), ['AED 8.2bn', 'AED 13.3bn']);
      }
      if (p === '/') {
        const align = await page.$$eval('main h2', (hs) => hs.map((h) => [h.textContent.trim(), getComputedStyle(h).textAlign]));
        assert.ok(align.length >= 4 && align.every(([, a]) => a === 'center'), `homepage headings all centred: ${JSON.stringify(align)}`);
        const w = await page.$$eval('main p', (ps) => {
          const pick = (t) => ps.find((p) => p.textContent.startsWith(t)).getBoundingClientRect().width;
          return [pick("You don't need to be in the UAE"), pick('Property decisions should be based')];
        });
        assert.equal(Math.round(w[0]), Math.round(w[1]), `paragraph widths ${w}`);
        checks++;
      }
      await ctx.close();
    }
    // /areas: Dubai (with and without prior_value_bn, both sort orders) and Abu Dhabi.
    for (const prior of [true, false]) {
      const { page, ctx } = await open('/areas', width, { prior });
      await page.waitForSelector('.mk-panel[data-emirate="dubai"]:not([hidden]) .dc-grid');
      await noSideScroll(page, `/areas Dubai prior=${prior}`, width);
      assert.equal(await page.locator('.mk-panel[data-emirate="dubai"] .dc-chart').count(), prior ? 8 : 0, `/areas Dubai charts with prior=${prior}`);
      assert.equal(await page.locator('.mk-panel[data-emirate="dubai"] figure, .mk-panel[data-emirate="dubai"] table').count(), 0, 'no chart block and no change table');
      if (prior) await cardsFit(page, '/areas Dubai');
      else assert.equal(await page.locator('.mk-panel[data-emirate="dubai"] article.dc[data-chart-gap="prior-period-not-in-data"]').count(), 8);
      // The sort toggle: value order without a click; change order with "#n by change"; back again; keyboard too.
      assert.deepEqual(await names(page, 'dubai'), VALUE_ORDER);
      const pressed = () => page.$$eval('.mk-panel[data-emirate="dubai"] .dc-sort button', (b) => b.map((x) => [x.textContent, x.getAttribute('aria-pressed')]));
      assert.deepEqual(await pressed(), [['Sales value', 'true'], ['Change vs last year', 'false']]);
      await page.click('.mk-panel[data-emirate="dubai"] .dc-sort button[data-sort="change"]');
      assert.deepEqual(await names(page, 'dubai'), CHANGE_ORDER);
      assert.deepEqual(await page.$$eval('.mk-panel[data-emirate="dubai"] .dc-rank', (r) => r.map((x) => x.textContent)), CHANGE_ORDER.map((_, i) => `#${i + 1} by change`));
      assert.deepEqual(await pressed(), [['Sales value', 'false'], ['Change vs last year', 'true']]);
      await noSideScroll(page, `/areas Dubai by change prior=${prior}`, width);
      if (prior) await cardsFit(page, '/areas Dubai by change');
      await page.focus('.mk-panel[data-emirate="dubai"] .dc-sort button[data-sort="value"]');
      await page.keyboard.press('Enter');
      assert.deepEqual(await names(page, 'dubai'), VALUE_ORDER, 'Enter on "Sales value" restores value order');
      assert.deepEqual(await page.$$eval('.mk-panel[data-emirate="dubai"] .dc-rank', (r) => r.map((x) => x.textContent)), VALUE_ORDER.map((_, i) => `#${i + 1}`));
      await page.focus('.mk-panel[data-emirate="dubai"] .dc-sort button[data-sort="change"]');
      await page.keyboard.press('Space');
      assert.deepEqual(await names(page, 'dubai'), CHANGE_ORDER, 'Space on "Change vs last year"');
      checks++;
      await page.click('.mk-pill[data-emirate="abu_dhabi"]');
      await noSideScroll(page, '/areas Abu Dhabi', width);
      // Abu Dhabi (adrec-areas.json prior_value_bn, owner decision 2026-11-07): four cards with a chart, four without.
      assert.equal(await page.locator('.mk-panel[data-emirate="abu_dhabi"] .dc-chart').count(), 4, '/areas Abu Dhabi charts');
      assert.equal(await page.locator('.mk-panel[data-emirate="abu_dhabi"] article.dc[data-chart-gap]').count(), 4);
      assert.equal(await page.locator('.mk-panel[data-emirate="abu_dhabi"] table').count(), 0, 'no separate change table');
      await cardsFit(page, '/areas Abu Dhabi');
      // The same toggle as Dubai: change order puts the n/p areas last with no change rank.
      const AD_VALUE = ['Hudayriyat Island', 'Saadiyat Island', 'Al Reem Island + Al Maryah Island', 'Yas Island', 'Al Ramhan Island', 'Al Fahid Island', 'Ghadeer Al Tayr', 'Zayed City'];
      assert.deepEqual(await names(page, 'abu_dhabi'), AD_VALUE);
      await page.click('.mk-panel[data-emirate="abu_dhabi"] .dc-sort button[data-sort="change"]');
      assert.deepEqual(await names(page, 'abu_dhabi'), ['Hudayriyat Island', 'Al Reem Island + Al Maryah Island', 'Yas Island', 'Saadiyat Island', 'Al Ramhan Island', 'Al Fahid Island', 'Ghadeer Al Tayr', 'Zayed City']);
      assert.deepEqual(await page.$$eval('.mk-panel[data-emirate="abu_dhabi"] .dc-rank', (r) => r.map((x) => (x.hidden ? '' : x.textContent))), ['#1 by change', '#2 by change', '#3 by change', '#4 by change', '', '', '', '']);
      assert.deepEqual(await page.$$eval('.mk-panel[data-emirate="abu_dhabi"] .dc-sort button', (b) => b.map((x) => x.getAttribute('aria-pressed'))), ['false', 'true']);
      await noSideScroll(page, '/areas Abu Dhabi by change', width);
      await page.focus('.mk-panel[data-emirate="abu_dhabi"] .dc-sort button[data-sort="value"]');
      await page.keyboard.press('Enter');
      assert.deepEqual(await names(page, 'abu_dhabi'), AD_VALUE);
      // The Dubai panel's order is untouched by the Abu Dhabi toggle.
      assert.deepEqual(await names(page, 'dubai'), CHANGE_ORDER);
      await ctx.close();
    }
    // A Dubai guide: one card with the pair when the Worker sends the prior period.
    {
      const { page, ctx } = await open('/areas/dubai-marina', width);
      await page.waitForSelector('#guide-figures:not([hidden])');
      await noSideScroll(page, '/areas/dubai-marina', width);
      assert.deepEqual(await page.$$eval('#guide-figures .dc-val', (t) => t.map((x) => x.textContent)), ['AED 18.0bn', 'AED 9.0bn']);
      assert.deepEqual(await page.$$eval('#guide-figures .dc-official', (t) => t.map((x) => x.textContent)), ['DLD: Marsa Dubai']);
      await cardsFit(page, '/areas/dubai-marina');
      await ctx.close();
    }
  }
  // Card headings at phone widths: /areas (Dubai from the Worker fixture, then Abu Dhabi) and the November article.
  for (const width of [320, 375, 414]) {
    {
      const { page, ctx } = await open('/areas', width);
      await page.waitForSelector('.mk-panel[data-emirate="dubai"]:not([hidden]) .dc-grid');
      assert.equal(await page.$eval('.dc-name', (h) => getComputedStyle(h).fontSize), '22px', `/areas @${width}: 22px card headings`);
      await headingsWhole(page, `/areas Dubai @${width}`);
      await footersFit(page, `/areas Dubai @${width}`);
      await page.click('.mk-panel[data-emirate="dubai"] .dc-sort button[data-sort="change"]');
      await headingsWhole(page, `/areas Dubai by change @${width}`);
      await page.click('.mk-pill[data-emirate="abu_dhabi"]');
      await headingsWhole(page, `/areas Abu Dhabi @${width}`);
      await footersFit(page, `/areas Abu Dhabi @${width}`);
      const cols = await page.$eval('.mk-panel[data-emirate="abu_dhabi"] .dc-grid', (g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
      assert.equal(cols, width < 336 ? 1 : 2, `/areas @${width}: grid columns`);
      await ctx.close();
    }
    {
      const { page, ctx } = await open('/insights/dubai-2026-so-far-official-numbers', width);
      await headingsWhole(page, `/insights @${width}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`charts e2e: ${checks} checks passed`);
