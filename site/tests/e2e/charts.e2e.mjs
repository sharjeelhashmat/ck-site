// Browser check for the comparison charts (Rules 1c v6.6) and the homepage alignment fix: at 320px no page scrolls
// sideways; the Insights charts are on screen; with a Worker response that carries prior_value_bn the /areas and Dubai guide
// charts are drawn in the same render path and show the same figures as the cards and the table. Not part of `npm test`: it
// needs Chromium.
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
const months = { period: '2026-YTD09', prior_period: '2025-YTD09', first_month: '2026-01', last_month: '2026-09', prior_first_month: '2025-01', prior_last_month: '2025-09' };
const AREAS = { ...months, dubai: { ytd: { sales_bn: 300, total_bn: 450, mortgages_bn: 120, as_of: '2026-10-30' }, top8, total_res_bn: 180, as_of: '2026-10-30' } };
const AREA = { ...months, area: top8[3], total_res_bn: 180, as_of: '2026-10-30' };
const LAUNCHES = { abu_dhabi: { transaction_value_bn: 100, sales_value_bn: 70, mortgage_value_bn: 20, year: 2026, as_of: '2026-10-16', source_label: 'x', source_url: 'https://adrec.gov.ae/en' } };
const strip = (b) => JSON.parse(JSON.stringify(b, (k, v) => (k === 'prior_value_bn' ? undefined : v)));

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
// Every chart on screen fits its card and its text does not overflow the chart.
const chartsFit = async (page, label) => {
  const bad = await page.$$eval('figure.cmp', (figs) => figs.flatMap((f) => {
    const box = f.querySelector('svg').getBoundingClientRect();
    if (box.width === 0) return [];
    return [...f.querySelectorAll('text')].filter((t) => { const r = t.getBoundingClientRect(); return r.right > box.right + 1 || r.left < box.left - 1; }).map((t) => t.textContent);
  }));
  assert.deepEqual(bad, [], `${label}: chart text outside the chart`);
  // In each pair the value labels end before the change label starts.
  const clash = await page.$$eval('figure.cmp .cmp-row', (rows) => rows.filter((g) => g.getBoundingClientRect().width > 0).flatMap((g) => {
    const right = Math.max(...[...g.querySelectorAll('.cmp-value')].map((t) => t.getBoundingClientRect().right));
    const change = g.querySelector('.cmp-change');
    return right + 4 <= change.getBoundingClientRect().left ? [] : [change.textContent];
  }));
  assert.deepEqual(clash, [], `${label}: a value label runs into the change label`);
  checks++;
};

try {
  for (const width of [320, 375, 1280]) {
    // Homepage, Insights, the Abu Dhabi side of /areas and an Abu Dhabi guide: built at build time.
    for (const p of ['/', '/insights/dubai-2026-so-far-official-numbers', '/insights/does-rising-transaction-value-mean-rising-prices', '/insights/costs-investors-forget-before-yield', '/areas/saadiyat-island']) {
      const { page, ctx } = await open(p, width);
      await noSideScroll(page, p, width);
      await chartsFit(page, p);
      if (p === '/insights/dubai-2026-so-far-official-numbers') {
        assert.equal(await page.locator('figure.cmp svg[role="img"]').count(), 2, 'two charts');
        // Chart values equal the table values as the browser shows them.
        const pairs = await page.$$eval('figure.cmp', (figs) => figs.map((f) => {
          const table = f.nextElementSibling.querySelector('table');
          return { chart: [...f.querySelectorAll('.cmp-change')].map((t) => t.textContent), table: [...table.querySelectorAll('tbody tr')].map((tr) => tr.children[3].textContent) };
        }));
        assert.deepEqual(pairs[0].chart, ['+11%', '−33%', '−46%', '−25%']);
        assert.deepEqual(pairs[0].table, pairs[0].chart, 'quarter chart changes are the table changes');
        checks++;
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
    // /areas: Dubai (with and without prior_value_bn) and Abu Dhabi.
    for (const prior of [true, false]) {
      const { page, ctx } = await open('/areas', width, { prior });
      await page.waitForSelector('.mk-panel[data-emirate="dubai"]:not([hidden]) [data-slot="change"] table');
      await noSideScroll(page, `/areas Dubai prior=${prior}`, width);
      const n = await page.locator('.mk-panel[data-emirate="dubai"] figure.cmp').count();
      assert.equal(n, prior ? 2 : 0, `/areas Dubai charts with prior=${prior}`);
      if (prior) {
        await chartsFit(page, '/areas Dubai');
        // The change chart shows the table's sales values and changes, in the table's order.
        const { chart, table } = await page.$eval('#mk-chg-dubai', (h) => {
          const s = h.closest('section');
          return {
            chart: [...s.querySelectorAll('.cmp-change')].map((t) => t.textContent),
            table: [...s.querySelectorAll('tbody tr')].map((tr) => tr.lastElementChild.textContent),
          };
        });
        assert.deepEqual(chart, table, '/areas change chart = table');
        checks++;
      } else {
        assert.equal(await page.locator('.mk-panel[data-emirate="dubai"] [data-chart-gap="prior-period-not-in-data"]').count(), 1);
      }
      await page.click('.mk-pill[data-emirate="abu_dhabi"]');
      await noSideScroll(page, '/areas Abu Dhabi', width);
      // Abu Dhabi (adrec-areas.json prior_value_bn, owner decision 2026-11-07): both charts, the change chart in table order.
      assert.equal(await page.locator('.mk-panel[data-emirate="abu_dhabi"] figure.cmp').count(), 2, '/areas Abu Dhabi charts');
      await chartsFit(page, '/areas Abu Dhabi');
      const ad = await page.$eval('#mk-chg-abu_dhabi', (h) => {
        const s = h.closest('section');
        return { chart: [...s.querySelectorAll('.cmp-change')].map((t) => t.textContent), table: [...s.querySelectorAll('tbody tr')].map((tr) => tr.lastElementChild.textContent) };
      });
      assert.deepEqual(ad.chart, ad.table, '/areas Abu Dhabi change chart = table');
      await ctx.close();
    }
    // A Dubai guide: one pair when the Worker sends the prior period.
    {
      const { page, ctx } = await open('/areas/dubai-marina', width);
      await page.waitForSelector('#guide-figures:not([hidden])');
      await noSideScroll(page, '/areas/dubai-marina', width);
      assert.deepEqual(await page.$$eval('#guide-figures .cmp-value', (t) => t.map((x) => x.textContent)), ['AED 18.0bn', 'AED 9.0bn']);
      await chartsFit(page, '/areas/dubai-marina');
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`charts e2e: ${checks} checks passed`);
