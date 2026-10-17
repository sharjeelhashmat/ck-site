// Browser checks for /areas, the guides, /new-launches and the newsletter (not part of `npm test`: it needs Chromium).
//   PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e/browser.e2e.mjs <distDir> [screenshotDir]
// The Worker and Turnstile are replaced by routes inside the browser; the market responses are fixtures (the owner's
// expected Dubai output for 2026-H1 and invented launch/ADREC numbers), never real data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const dist = path.resolve(process.argv[2] ?? 'dist');
const shots = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const WORKER = 'https://ck-lead-worker.sharjeelhashmat.workers.dev';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  let f = path.join(dist, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, `${p}.html`);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const top8 = [
  ['Al Yelayiss 1', null, 11.07, 6.1, 1407], ['Madinat Al Mataar', 'Dubai South', 10.92, 6.0, 16], ['Palm Deira', 'Dubai Islands', 10.16, 5.6, 80],
  ['Hadaeq Sheikh Mohammed Bin Rashid', 'Dubai Hills Estate', 8.51, 4.7, -14], ['Wadi Al Safa 3', 'Majan', 8.31, 4.5, 33], ['Business Bay', null, 8.04, 4.4, -41],
  ['Marsa Dubai', 'Dubai Marina, Dubai Harbour', 7.08, 3.9, -58], ['Wadi Al Safa 5', 'Dubailand Residence Complex', 6.99, 3.8, -40],
].map(([area_en, label, value_bn, share_pct, change_pct], i) => ({ rank: i + 1, area_en, label, value_bn, share_pct, change_pct, prior_zero: false, offplan_pct: 50 }));
const AREAS = { period: '2026-H1', prior_period: '2025-H1', dubai: { ytd: { sales_bn: 391.7, total_bn: 591.6, mortgages_bn: 154.7, as_of: '2026-10-09' }, top8, total_res_bn: 182.9, as_of: '2026-10-09' } };
const LAUNCHES = {
  dubai: { new_projects_90d: 41, top_areas_90d: [{ area_en: 'Al Yelayiss 1', label: null, count: 6 }, { area_en: 'Palm Deira', label: 'Dubai Islands', count: 5 }, { area_en: 'Madinat Al Mataar', label: 'Dubai South', count: 4 }, { area_en: 'Wadi Al Safa 3', label: 'Majan', count: 4 }, { area_en: 'Business Bay', label: null, count: 3 }], active_projects: 612, as_of: '2026-10-16', source_label: 'x', source_url: 'https://data.dubai/en/l/467654' },
  abu_dhabi: { transaction_value_bn: 117.04, sales_value_bn: 86.1, mortgage_value_bn: 25.5, year: 2026, as_of: '2026-10-16', source_label: 'x', source_url: 'https://adrec.gov.ae/en' },
};
const TURNSTILE = `(function(){var n=0,w={};window.turnstile={render:function(el,o){if(typeof el==='string')el=document.querySelector(el);if(!el)throw new Error('container');var id='w'+(++n);w[id]='tok';return id;},getResponse:function(id){return id?w[id]:'tok';},reset:function(){}};
document.querySelectorAll('.cf-turnstile').forEach(function(el){var i=document.createElement('input');i.type='hidden';i.name='cf-turnstile-response';i.value='tok';el.appendChild(i);});})();`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const results = [];
async function page(width, { areas = AREAS, launches = LAUNCHES, area = null } = {}) {
  const p = await browser.newPage({ viewport: { width, height: 900 } });
  const json = (r, body) => (body ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }) : r.abort());
  await p.route('https://challenges.cloudflare.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: TURNSTILE }));
  await p.route(`${WORKER}/market/areas*`, (r) => json(r, areas));
  await p.route(`${WORKER}/market/launches`, (r) => json(r, launches));
  await p.route(`${WORKER}/market/area/**`, (r) => json(r, area));
  await p.route(`${WORKER}/api/newsletter/subscribe`, (r) => json(r, { ok: true }));
  await p.route(`${WORKER}/lead`, (r) => json(r, { ok: true, id: 'x' }));
  return p;
}
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); } };
const noSideScroll = async (p) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'horizontal page scroll');
const shot = async (p, name, full = true) => { if (shots) await p.screenshot({ path: path.join(shots, `${name}.png`), fullPage: full }); };
const visible = (p, sel) => p.locator(sel).isVisible();

for (const width of [1280, 360]) {
  await check(`/areas both emirates @${width}: switch shown, Dubai default, the switch moves sections 3-7 together, sticky under the header`, async () => {
    const p = await page(width);
    await p.goto(`${base}/areas`);
    await p.waitForSelector('#mk-switch:not([hidden])');
    assert.equal(await p.getAttribute('.mk-pill[data-emirate="dubai"]', 'aria-checked'), 'true');
    assert.ok(await visible(p, '.mk-panel[data-emirate="dubai"]'));
    assert.ok(!(await visible(p, '.mk-panel[data-emirate="abu_dhabi"]')));
    assert.ok(await visible(p, '.mk-guides[data-emirate="dubai"]') && !(await visible(p, '.mk-guides[data-emirate="abu_dhabi"]')));
    assert.equal(await p.locator('.mk-panel[data-emirate="dubai"] .mk-card').count(), 8);
    assert.ok(await visible(p, '#mk-ask'));
    await noSideScroll(p);
    await shot(p, `areas-dubai-${width}`);
    await p.click('.mk-pill[data-emirate="abu_dhabi"]');
    assert.equal(await p.getAttribute('.mk-pill[data-emirate="abu_dhabi"]', 'aria-checked'), 'true');
    assert.ok(!(await visible(p, '.mk-panel[data-emirate="dubai"]')) && await visible(p, '.mk-panel[data-emirate="abu_dhabi"]'));
    assert.ok(!(await visible(p, '.mk-guides[data-emirate="dubai"]')) && await visible(p, '.mk-guides[data-emirate="abu_dhabi"]'));
    await noSideScroll(p);
    await shot(p, `areas-abu-dhabi-${width}`);
    await p.evaluate(() => window.scrollTo({ top: 1600, behavior: 'instant' }));
    await p.waitForTimeout(100);
    const gap = await p.evaluate(() => document.getElementById('mk-switch').getBoundingClientRect().top - document.querySelector('.site-nav').getBoundingClientRect().bottom);
    assert.ok(Math.abs(gap) <= 1, `sticky gap ${gap}px`);
    await shot(p, `areas-sticky-${width}`, false);
    await p.focus('.mk-pill[data-emirate="abu_dhabi"]');
    await p.keyboard.press('ArrowLeft');
    assert.equal(await p.getAttribute('.mk-pill[data-emirate="dubai"]', 'aria-checked'), 'true');
    await p.close();
  });

  await check(`/areas with Dubai data absent @${width}: Abu Dhabi alone, no switch`, async () => {
    const p = await page(width, { areas: null });
    await p.goto(`${base}/areas`);
    await p.waitForSelector('.mk-panel[data-emirate="abu_dhabi"]:not([hidden])');
    assert.ok(!(await visible(p, '#mk-switch')));
    assert.ok(!(await visible(p, '.mk-panel[data-emirate="dubai"]')));
    assert.ok(await visible(p, '.mk-guides[data-emirate="abu_dhabi"]') && !(await visible(p, '.mk-guides[data-emirate="dubai"]')));
    await noSideScroll(p);
    await shot(p, `areas-no-dubai-${width}`);
    await p.close();
  });

  await check(`/areas with no Worker data @${width}: no switch; static Abu Dhabi areas alone if the build has them, else no figures and both guide lists`, async () => {
    const p = await page(width, { areas: null, launches: null });
    await p.goto(`${base}/areas`);
    await p.waitForTimeout(600);
    assert.ok(!(await visible(p, '#mk-switch')));
    if ((await p.getAttribute('.mk-panel[data-emirate="abu_dhabi"]', 'data-static')) === 'yes') {
      assert.ok(await visible(p, '.mk-panel[data-emirate="abu_dhabi"]') && !(await visible(p, '.mk-panel[data-emirate="dubai"]')));
      assert.ok(await visible(p, '.mk-guides[data-emirate="abu_dhabi"]') && !(await visible(p, '.mk-guides[data-emirate="dubai"]')));
    } else {
      assert.ok(!(await visible(p, '#mk-ask')));
      assert.ok(await visible(p, '.mk-guides[data-emirate="dubai"]') && await visible(p, '.mk-guides[data-emirate="abu_dhabi"]'));
      assert.equal(await p.locator('.mk-panel:not([hidden])').count(), 0);
    }
    await p.close();
  });

  await check(`guide pages @${width}: Dubai card from the Worker, hidden on failure; no side scroll`, async () => {
    const hills = { period: '2026-H1', prior_period: '2025-H1', area: top8[3], total_res_bn: 182.9, as_of: '2026-10-09' };
    const p = await page(width, { area: hills });
    await p.goto(`${base}/areas/dubai-hills`);
    await p.waitForSelector('#guide-figures:not([hidden])');
    assert.match(await p.textContent('#guide-figures'), /AED 8\.5bn[\s\S]*4\.7% of Dubai's total[\s\S]*−14%/);
    await noSideScroll(p);
    await shot(p, `guide-dubai-hills-${width}`);
    await p.close();
    const q = await page(width, { area: null });
    await q.goto(`${base}/areas/downtown-dubai`);
    await q.waitForTimeout(500);
    assert.ok(!(await visible(q, '#guide-figures')));
    await q.goto(`${base}/areas/saadiyat-island`);
    await noSideScroll(q);
    await shot(q, `guide-saadiyat-island-${width}`);
    await q.close();
  });

  await check(`/new-launches @${width}: Launch activity panel, two cards, one full-width card, hidden when empty`, async () => {
    const p = await page(width);
    await p.goto(`${base}/new-launches`);
    await p.waitForSelector('#launch-activity:not([hidden])');
    assert.equal(await p.locator('#launch-activity .mk-launch').count(), 2);
    await noSideScroll(p);
    await shot(p, `new-launches-panel-${width}`, false);
    await p.close();
    const one = await page(width, { launches: { dubai: null, abu_dhabi: LAUNCHES.abu_dhabi } });
    await one.goto(`${base}/new-launches`);
    await one.waitForSelector('#launch-activity:not([hidden])');
    assert.equal(await one.locator('.mk-launch-grid--one .mk-launch').count(), 1);
    await one.close();
    const none = await page(width, { launches: { dubai: null, abu_dhabi: null } });
    await none.goto(`${base}/new-launches`);
    await none.waitForTimeout(500);
    assert.ok(!(await visible(none, '#launch-activity')));
    await none.close();
  });
}

await check('footer with GOLIVE empty (1280 and 360)', async () => {
  for (const width of [1280, 360]) {
    const p = await page(width);
    await p.goto(`${base}/about`);
    assert.equal(await p.locator('footer .disclosure').count(), 0);
    const footer = p.locator('footer.site-footer');
    if (shots) await footer.screenshot({ path: path.join(shots, `footer-golive-empty-${width}.png`) });
    await p.close();
  }
});

for (const route of ['/new-launches', '/about']) {
  await check(`newsletter success on ${route} (mocked Turnstile and Worker)`, async () => {
    const p = await page(1280);
    await p.goto(`${base}${route}`);
    await p.fill('footer .nl-form input[name=email]', 'reader@test.invalid');
    await p.click('footer .nl-form button[type=submit]');
    await p.waitForSelector('footer .nl-done:not([hidden])');
    await p.locator('footer .nl').scrollIntoViewIfNeeded();
    if (shots) await p.locator('footer .nl').screenshot({ path: path.join(shots, `newsletter-success-${route.slice(1)}.png`) });
    await p.close();
  });
}

await check('the launch question form on /new-launches no longer triggers the newsletter error (Part C regression)', async () => {
  const p = await page(1280);
  await p.goto(`${base}/new-launches`);
  await p.fill('#lead-form input[name=email]', 'reader@test.invalid');
  await p.click('#lead-form button[type=submit]');
  await p.waitForTimeout(500);
  assert.doesNotMatch((await p.textContent('#lead-form')) ?? '', /security check could not load/);
  await p.close();
});

await browser.close();
server.close();
for (const r of results) console.log(r.join(' | '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
