// Browser checks for /areas, the guides, /new-launches, the newsletter, the enquiry and profile forms, and the audit fixes
// (320/375/1280, Worker blocked or malformed, Turnstile blocked, every page at 320px). Not part of `npm test`: it needs Chromium.
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
  // The Dubai as_of is today: the card hides data more than 120 days old.
  dubai: { new_projects_90d: 41, top_areas_90d: [{ area_en: 'Al Yelayiss 1', label: null, count: 6 }, { area_en: 'Palm Deira', label: 'Dubai Islands', count: 5 }, { area_en: 'Madinat Al Mataar', label: 'Dubai South', count: 4 }, { area_en: 'Wadi Al Safa 3', label: 'Majan', count: 4 }, { area_en: 'Business Bay', label: null, count: 3 }], active_projects: 612, as_of: new Date().toISOString().slice(0, 10), source_label: 'x', source_url: 'https://data.dubai/en/l/467654' },
  abu_dhabi: { transaction_value_bn: 117.04, sales_value_bn: 86.1, mortgage_value_bn: 25.5, year: 2026, as_of: '2026-10-16', source_label: 'x', source_url: 'https://adrec.gov.ae/en' },
};
const TURNSTILE = `(function(){var n=0,w={};window.turnstile={render:function(el,o){if(typeof el==='string')el=document.querySelector(el);if(!el)throw new Error('container');var id='w'+(++n);w[id]='tok';return id;},getResponse:function(id){return id?w[id]:'tok';},reset:function(){}};
document.querySelectorAll('.cf-turnstile').forEach(function(el){var i=document.createElement('input');i.type='hidden';i.name='cf-turnstile-response';i.value='tok';el.appendChild(i);});})();`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const results = [];
async function page(width, { areas = AREAS, launches = LAUNCHES, area = null, blockWorker = false, blockTurnstile = false, lead = [200, { ok: true, id: 'x' }] } = {}) {
  const p = await browser.newPage({ viewport: { width, height: 900 } });
  const json = (r, body, status = 200) => (body ? r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }) : r.abort());
  await p.route('https://challenges.cloudflare.com/**', (r) => (blockTurnstile ? r.abort() : r.fulfill({ contentType: 'text/javascript', body: TURNSTILE })));
  // Worker blocked: every request to it fails at the network level (DNS, firewall, ad blocker).
  if (blockWorker) { await p.route(`${WORKER}/**`, (r) => r.abort()); return p; }
  await p.route(`${WORKER}/market/areas*`, (r) => json(r, areas));
  await p.route(`${WORKER}/market/launches`, (r) => json(r, launches));
  await p.route(`${WORKER}/market/area/**`, (r) => json(r, area));
  await p.route(`${WORKER}/api/newsletter/subscribe`, (r) => json(r, { ok: true }));
  await p.route(`${WORKER}/lead`, (r) => json(r, lead[1], lead[0]));
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
    // Audit H10: with no switch there is no way to reach the Dubai guides, so they stay visible.
    assert.ok(await visible(p, '.mk-guides[data-emirate="abu_dhabi"]') && await visible(p, '.mk-guides[data-emirate="dubai"]'));
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
      assert.ok(await visible(p, '.mk-guides[data-emirate="abu_dhabi"]') && await visible(p, '.mk-guides[data-emirate="dubai"]'), 'H10: no switch, every guide list');
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

// ---------- Audit fixes (H10-H15, B2): 320 / 375 / 1280, Worker blocked or malformed, Turnstile blocked ----------
const noBadText = async (p) => {
  const t = await p.evaluate(() => document.body.innerText);
  assert.doesNotMatch(t, /\bNaN\b|\bundefined\b|\[object Object\]/, 'NaN / undefined in the page text');
};
// One malformed row among good ones, and a body where every row (and the year to date) is malformed.
const MALFORMED_ONE = { ...AREAS, dubai: { ...AREAS.dubai, top8: [...top8.slice(0, 7), { ...top8[7], value_bn: 'lots', share_pct: undefined, rank: 'eight' }] } };
const MALFORMED_ALL = { ...AREAS, dubai: { ...AREAS.dubai, ytd: { ...AREAS.dubai.ytd, sales_bn: 'NaN' }, top8: top8.map((r) => ({ ...r, value_bn: String(r.value_bn), share_pct: null })) } };

for (const width of [320, 375, 1280]) {
  for (const route of ['/', '/contact', '/areas']) {
    await check(`${route} @${width} with the Worker blocked: no side scroll, no NaN/undefined`, async () => {
      const p = await page(width, { blockWorker: true });
      await p.goto(`${base}${route}`);
      await p.waitForTimeout(400);
      await noSideScroll(p);
      await noBadText(p);
      if (route === '/areas') {
        assert.ok(!(await visible(p, '#mk-switch')), 'no switch');
        assert.ok(await visible(p, '.mk-guides[data-emirate="dubai"]'), 'Dubai guides visible when there is no switch');
        if ((await p.getAttribute('.mk-panel[data-emirate="abu_dhabi"]', 'data-static')) === 'yes') assert.ok(await visible(p, '.mk-panel[data-emirate="abu_dhabi"]'), 'Abu Dhabi panel visible');
      }
      await p.close();
    });
    await check(`${route} @${width} with one malformed /market/areas row: no side scroll, no NaN/undefined`, async () => {
      const p = await page(width, { areas: MALFORMED_ONE });
      await p.goto(`${base}${route}`);
      if (route === '/areas') {
        await p.waitForSelector('#mk-switch:not([hidden])');
        assert.equal(await p.locator('.mk-panel[data-emirate="dubai"] .mk-card').count(), 7, 'the malformed row is dropped');
        await noBadText(p);
        await noSideScroll(p);
        await p.click('.mk-pill[data-emirate="abu_dhabi"]');
        assert.ok(await visible(p, '.mk-panel[data-emirate="abu_dhabi"]'), 'Abu Dhabi panel visible');
      } else await p.waitForTimeout(300);
      await noBadText(p);
      await noSideScroll(p);
      await p.close();
    });
  }

  await check(`/areas @${width} with every /market/areas row malformed: Abu Dhabi panel visible, no switch, Dubai guides visible`, async () => {
    const p = await page(width, { areas: MALFORMED_ALL });
    await p.goto(`${base}/areas`);
    await p.waitForTimeout(500);
    await noBadText(p);
    await noSideScroll(p);
    assert.ok(!(await visible(p, '#mk-switch')));
    assert.ok(!(await visible(p, '.mk-panel[data-emirate="dubai"]')));
    assert.ok(await visible(p, '.mk-guides[data-emirate="dubai"]') && await visible(p, '.mk-guides[data-emirate="abu_dhabi"]'));
    if ((await p.getAttribute('.mk-panel[data-emirate="abu_dhabi"]', 'data-static')) === 'yes') assert.ok(await visible(p, '.mk-panel[data-emirate="abu_dhabi"]'));
    await p.close();
  });

  await check(`/areas @${width} with JavaScript off: the build-time Abu Dhabi panel and every guide list are visible`, async () => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false });
    const p = await ctx.newPage();
    await p.goto(`${base}/areas`);
    if ((await p.getAttribute('.mk-panel[data-emirate="abu_dhabi"]', 'data-static')) === 'yes') {
      assert.ok(await p.locator('.mk-panel[data-emirate="abu_dhabi"] .mk-card').first().isVisible(), 'Abu Dhabi figures without JS');
    }
    assert.ok(await visible(p, '.mk-guides[data-emirate="dubai"]') && await visible(p, '.mk-guides[data-emirate="abu_dhabi"]'));
    await noSideScroll(p);
    await ctx.close();
  });
}

const fillLead = async (p) => {
  await p.fill('#f-name', 'Test Person');
  await p.fill('#f-email', 'reader@test.invalid');
  await p.fill('#f-phone', '50 123 4567');
  await p.click('#lead-form .pill:has(input[value="whatsapp"])');
  await p.check('#lead-form input[name="consent_contact"]');
};

for (const width of [320, 375, 1280]) {
  await check(`/contact @${width} with the Turnstile script blocked: Send shows the WhatsApp + email alert, not "Please wait"`, async () => {
    const p = await page(width, { blockTurnstile: true });
    await p.goto(`${base}/contact`);
    await fillLead(p);
    await p.click('#lead-submit');
    await p.waitForSelector('#lead-alert a[href^="https://wa.me/"]', { timeout: 5000 });
    assert.match(await p.textContent('#lead-alert'), /could not be sent[\s\S]*WhatsApp[\s\S]*hello@sharjeelhashmat\.com/);
    assert.doesNotMatch((await p.textContent('#lead-status')) ?? '', /Please wait/);
    assert.equal(await p.isDisabled('#lead-submit'), false, 'Send stays usable');
    await noSideScroll(p);
    await shot(p, `contact-turnstile-blocked-${width}`, false);
    await p.close();
  });
}

await check('/new-launches (launch mode) with the Turnstile script blocked: the WhatsApp + email alert', async () => {
  const p = await page(375, { blockTurnstile: true });
  await p.goto(`${base}/new-launches`);
  await fillLead(p);
  await p.fill('#f-question', 'Is the plan fair?');
  await p.click('#lead-submit');
  await p.waitForSelector('#lead-alert a[href^="https://wa.me/"]', { timeout: 5000 });
  await p.close();
});

await check('/contact: Turnstile and libphonenumber load on demand, not with the page; a valid enquiry is received', async () => {
  const p = await page(1280);
  const scripts = [];
  p.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
  await p.goto(`${base}/contact`);
  await p.waitForTimeout(300);
  assert.ok(!scripts.some((u) => u.includes('challenges.cloudflare.com')), 'Turnstile not loaded with the page');
  assert.ok(!scripts.some((u) => /\/_astro\/phone\./.test(u)), 'phone library not loaded with the page');
  await p.focus('#f-name');
  await p.waitForFunction(() => !!window.turnstile);
  await p.fill('#f-phone', '5');
  await p.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /\/_astro\/phone\./.test(e.name)));
  await fillLead(p);
  await p.click('#lead-submit');
  await p.waitForSelector('.lead-success');
  assert.match(await p.textContent('.lead-success'), /Your enquiry has been received\. I'll answer on WhatsApp within 24 hours\./);
  await p.close();
});

await check('/contact: Worker blocked or answering 503 temporarily_unavailable -> the WhatsApp + email alert', async () => {
  for (const opts of [{ blockWorker: true }, { lead: [503, { ok: false, error: 'temporarily_unavailable' }] }]) {
    const p = await page(375, opts);
    await p.goto(`${base}/contact`);
    await fillLead(p);
    await p.click('#lead-submit');
    await p.waitForSelector('#lead-alert a[href^="https://wa.me/"]', { timeout: 20000 });
    assert.equal(await p.isDisabled('#lead-submit'), false);
    await p.close();
  }
});

await check('/contact errors: aria-invalid + aria-describedby, focus on the first invalid field, cleared when fixed', async () => {
  const p = await page(375);
  await p.goto(`${base}/contact`);
  await p.fill('#f-email', 'not-an-email');
  await p.click('#lead-submit');
  await p.waitForFunction(() => document.getElementById('lead-status').textContent.includes('Please fix'));
  assert.equal(await p.evaluate(() => document.activeElement?.id), 'f-name', 'focus on the first invalid field');
  for (const [sel, err] of [['#f-name', 'f-name-err'], ['#f-email', 'f-email-err'], ['#f-phone', 'f-phone-err'], ['#lead-form input[name="consent_contact"]', 'f-consent-err']]) {
    assert.equal(await p.getAttribute(sel, 'aria-invalid'), 'true', sel);
    assert.ok((await p.getAttribute(sel, 'aria-describedby')).split(' ').includes(err), sel);
    assert.ok(((await p.textContent(`#${err}`)) ?? '').length > 3, `${err} has text`);
    assert.equal(await p.getAttribute(`#${err}`, 'role'), null, `${err}: no per-field alert`);
  }
  assert.equal(await p.getAttribute('#lead-form input[value="call"]', 'aria-invalid'), 'true');
  const border = await p.evaluate(() => getComputedStyle(document.getElementById('f-name')).borderTopColor);
  assert.equal(border, 'rgb(161, 42, 42)', 'invalid border uses --err');
  await p.fill('#f-name', 'Test Person');
  assert.equal(await p.getAttribute('#f-name', 'aria-invalid'), null, 'cleared when fixed');
  assert.equal(await p.textContent('#f-name-err'), '');
  await p.fill('#f-email', 'still bad');
  assert.equal(await p.getAttribute('#f-email', 'aria-invalid'), 'true', 'kept while still invalid');
  await p.close();
});

await check('/investor-profile errors: aria-invalid + aria-describedby, focus on the first unanswered question', async () => {
  const p = await page(375);
  await p.goto(`${base}/investor-profile?lead=00000000-0000-0000-0000-000000000000`);
  await p.click('#profile-submit');
  assert.equal(await p.evaluate(() => document.activeElement?.id), 'p-objective');
  for (const id of ['p-objective', 'p-type', 'p-risk', 'p-hold']) {
    assert.equal(await p.getAttribute(`#${id}`, 'aria-invalid'), 'true', id);
    assert.equal(await p.getAttribute(`#${id}`, 'aria-describedby'), `${id}-err`);
  }
  await p.selectOption('#p-objective', { index: 1 });
  assert.equal(await p.getAttribute('#p-objective', 'aria-invalid'), null);
  await p.close();
});

const builtPages = (function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])); })(dist)
  .filter((f) => f.endsWith('.html')).map((f) => '/' + path.relative(dist, f).replace(/\.html$/, '').replace(/(^|\/)index$/, ''));
await check(`every built page (${builtPages.length}) at 320px: no horizontal overflow`, async () => {
  const p = await page(320);
  const bad = [];
  for (const u of builtPages) {
    await p.goto(`${base}${u}`);
    await p.waitForTimeout(150);
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (w[0] > w[1]) bad.push(`${u} (${w[0]}px)`);
  }
  assert.deepEqual(bad, []);
  await p.close();
});

await browser.close();
server.close();
for (const r of results) console.log(r.join(' | '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
