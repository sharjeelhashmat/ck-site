// Browser check for the five Dubai guides of 2026-11-08 and the guide order on /areas. With a Worker response the Dubai
// guide cards put this year's top 8 areas first, in rank order, then the rest in the file's order; without one the
// file's order stays. Each new guide page shows its figures card (the data card for its DLD area) and does not scroll
// sideways at 320, 375 and 1280. Not part of `npm test`: it needs Chromium.
//   PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e/guides.e2e.mjs <distDir>
// The Worker is replaced by routes inside the browser. The figures are invented fixtures shaped like its responses.
import path from 'node:path';
import assert from 'node:assert/strict';
import { start } from '../../qa/serve.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const dist = path.resolve(process.argv[2] ?? 'dist');
const WORKER = 'https://ck-lead-worker.sharjeelhashmat.workers.dev';

const months = { period: '2026-YTD09', prior_period: '2025-YTD09', first_month: '2026-01', last_month: '2026-09', prior_first_month: '2025-01', prior_last_month: '2025-09' };
const row = (rank, area_en, label, value_bn, prior_value_bn, change_pct) => ({ rank, area_en, label, value_bn, prior_value_bn, share_pct: 5, change_pct, prior_zero: false, offplan_pct: 80 });
const top8 = [
  row(1, 'Madinat Al Mataar', 'Dubai South', 16.9, 14, 21), row(2, 'Al Yelayiss 1', null, 12.2, 0.9, 1200), row(3, 'Palm Deira', 'Dubai Islands', 11.5, 8.4, 37),
  row(4, 'Hadaeq Sheikh Mohammed Bin Rashid', 'Dubai Hills Estate', 10.8, 15.1, -29), row(5, 'Wadi Al Safa 3', 'Majan', 10.6, 15.3, -31),
  row(6, 'Business Bay', null, 10.5, 23.2, -55), row(7, 'Marsa Dubai', 'Dubai Marina, Dubai Harbour', 9.8, 22.7, -57), row(8, 'Wadi Al Safa 5', 'Dubailand Residence Complex', 9.3, 15.4, -39),
];
const AREAS = { ...months, dubai: { ytd: { sales_bn: 400, total_bn: 600, mortgages_bn: 160, as_of: '2026-10-30' }, top8, total_res_bn: 250, as_of: '2026-10-30' } };
const NEW = { 'dubai-south': 'Madinat Al Mataar', 'business-bay': 'Business Bay', majan: 'Wadi Al Safa 3', 'dubailand-residence-complex': 'Wadi Al Safa 5', 'al-yelayiss': 'Al Yelayiss 1' };
const RANKED = ['dubai-south', 'al-yelayiss', 'dubai-islands', 'dubai-hills', 'majan', 'business-bay', 'dubai-marina', 'dubailand-residence-complex', 'downtown-dubai', 'dubai-creek-harbour', 'palm-jumeirah', 'palm-jebel-ali', 'dubai-maritime-city'];
const FILE_ORDER = ['downtown-dubai', 'dubai-marina', 'dubai-hills', 'dubai-creek-harbour', 'dubai-islands', 'palm-jumeirah', 'palm-jebel-ali', 'dubai-maritime-city', 'dubai-south', 'business-bay', 'majan', 'dubailand-residence-complex', 'al-yelayiss'];
const AD_ORDER = ['hudayriyat-island', 'saadiyat-island', 'al-reem-al-maryah-island', 'yas-island', 'ramhan-island', 'fahid-island', 'ghadeer-al-tayr', 'zayed-city'];

const server = await start(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let checks = 0;

async function open(p, width, { worker = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
  await page.route(/^https:\/\//, (r) => r.abort());
  if (worker) {
    await page.route(`${WORKER}/market/areas*`, (r) => json(r, AREAS));
    await page.route(`${WORKER}/market/area/**`, (r) => {
      const area = decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop());
      const a = top8.find((x) => x.area_en === area);
      return a ? json(r, { ...months, area: a, total_res_bn: 250, as_of: '2026-10-30' }) : r.fulfill({ status: 404, body: '' });
    });
    await page.route(`${WORKER}/market/launches`, (r) => json(r, {}));
  }
  await page.goto(base + p, { waitUntil: 'networkidle' });
  return { page, ctx };
}
const noSideScroll = async (page, label, width) => {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(sw <= width, `${label} @${width}: page is ${sw}px wide`);
  checks++;
};
const order = (page, e) => page.$$eval(`.mk-guides[data-emirate="${e}"] .mk-guide`, (a) => a.map((x) => x.getAttribute('href').replace('/areas/', '')));

try {
  for (const width of [320, 375, 1280]) {
    // /areas with the Worker: the Dubai guides in top 8 order; Abu Dhabi by ADREC rank.
    {
      const { page, ctx } = await open('/areas', width);
      await page.waitForSelector('.mk-panel[data-emirate="dubai"]:not([hidden]) .dc-grid');
      assert.deepEqual(await order(page, 'dubai'), RANKED, `/areas @${width}: Dubai guides, top 8 first`);
      assert.deepEqual(await order(page, 'abu_dhabi'), AD_ORDER, `/areas @${width}: Abu Dhabi guides by ADREC rank`);
      await noSideScroll(page, '/areas', width);
      await ctx.close();
    }
    // /areas without the Worker: the file's order.
    {
      const { page, ctx } = await open('/areas', width, { worker: false });
      assert.deepEqual(await order(page, 'dubai'), FILE_ORDER, `/areas @${width}: no Worker, the file's order`);
      checks++;
      await ctx.close();
    }
    // Each new guide: its figures card for its DLD area, no sideways scroll.
    for (const [slug, area] of Object.entries(NEW)) {
      const { page, ctx } = await open(`/areas/${slug}`, width);
      await page.waitForSelector('#guide-figures:not([hidden]) article.dc');
      const card = await page.$eval('#guide-figures', (c) => ({ area: c.dataset.area, vals: [...c.querySelectorAll('.dc-val')].map((x) => x.textContent), chart: !!c.querySelector('.dc-chart[role="img"]') }));
      const a = top8.find((x) => x.area_en === area);
      assert.equal(card.area, area, slug);
      assert.ok(card.chart, `${slug}: the bar pair`);
      assert.deepEqual(card.vals, [`AED ${a.prior_value_bn.toFixed(1)}bn`, `AED ${a.value_bn.toFixed(1)}bn`], `${slug}: card values are the Worker's`);
      await noSideScroll(page, `/areas/${slug}`, width);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`guides e2e: ${checks} checks passed`);
