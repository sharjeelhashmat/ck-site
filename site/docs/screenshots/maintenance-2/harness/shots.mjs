// Maintenance PR 2 visual proof: full-page Chromium screenshots of a built site at 375 and 1280, deterministic so that a
// before and an after run differ only by the code under test. The lead Worker's /market responses are recorded once
// (mode "record") and replayed byte for byte (mode "replay"); every other external request is blocked; the clock is fixed;
// animations and transitions are off; the fixed header and the back-to-top button are taken out of the flow.
// Usage: PLAYWRIGHT=<playwright index.mjs> CHROMIUM=<chrome> node shots.mjs <dist> <outDir> <fixturesDir> <record|replay>
import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const [dist, out, fixtures, mode] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
mkdirSync(fixtures, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const WORKER = 'https://ck-lead-worker.sharjeelhashmat.workers.dev';
const FIXED_TIME = new Date('2026-11-18T08:00:00Z');

// A minimal static server: /x serves x.html (build.format "file"), unknown paths the built 404 page with status 404.
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml', '.ico': 'image/x-icon' };
const root = path.resolve(dist);
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const candidates = url === '/' ? ['index.html'] : [url.slice(1), `${url.slice(1)}.html`];
  for (const c of candidates) {
    const f = path.resolve(root, c);
    if (!f.startsWith(root + path.sep)) break;
    if (existsSync(f) && !f.endsWith(path.sep) && readdirSafe(f) === null) {
      res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
      return res.end(readFileSync(f));
    }
  }
  res.writeHead(404, { 'content-type': types['.html'] });
  res.end(readFileSync(path.join(root, '404.html')));
});
function readdirSafe(f) { try { return readdirSync(f); } catch { return null; } }
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const key = (u) => createHash('sha256').update(u).digest('hex').slice(0, 16);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });

async function open(p, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(FIXED_TIME);
  await page.route(/^https?:\/\//, async (r) => {
    const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (!u.startsWith(WORKER + '/market/')) return r.abort();
    const f = path.join(fixtures, `${key(u)}.json`);
    if (!existsSync(f)) {
      if (mode !== 'record') throw new Error(`no recorded response for ${u}`);
      const res = await r.fetch();
      writeFileSync(f, JSON.stringify({ url: u, status: res.status(), body: await res.text() }));
    }
    const rec = JSON.parse(readFileSync(f, 'utf8'));
    await r.fulfill({ status: rec.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: rec.body });
  });
  await page.goto(base + p, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}.site-nav{position:absolute!important}.mk-switch-bar{position:static!important}.to-top,[class*="to-top"],[class*="back-to-top"]{display:none!important}' });
  // Lazy images below the fold would never load in a headless full-page shot: load them all, then wait for them and the fonts.
  await page.evaluate(() => { for (const i of document.images) i.loading = 'eager'; });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  return { page, ctx };
}

// The page list (owner brief): every Insights article in this build is included.
const articles = readdirSync(path.join(root, 'insights')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
const SHOTS = [
  ['/', 'home'], ['/buy', 'buy'], ['/invest', 'invest'], ['/sell', 'sell'],
  ['/areas', 'areas-dubai-value', { emirate: 'dubai', sort: 'value' }],
  ['/areas', 'areas-dubai-change', { emirate: 'dubai', sort: 'change' }],
  ['/areas', 'areas-abu-dhabi-value', { emirate: 'abu_dhabi', sort: 'value' }],
  ['/areas', 'areas-abu-dhabi-change', { emirate: 'abu_dhabi', sort: 'change' }],
  ['/areas/dubai-marina', 'guide-dubai-marina'], ['/areas/saadiyat-island', 'guide-saadiyat-island'],
  ['/new-launches', 'new-launches'], ['/insights', 'insights'],
  ...articles.map((a) => [`/insights/${a}`, `insights-${a}`]),
  ['/about', 'about'], ['/contact', 'contact'], ['/faq', 'faq'], ['/investment-approach', 'investment-approach'],
  ['/this-page-does-not-exist', '404'],
];

try {
  for (const width of [375, 1280]) {
    for (const [p, name, opt] of SHOTS) {
      const { page, ctx } = await open(p, width);
      if (opt) {
        await page.waitForSelector('.mk-panel[data-emirate="dubai"]:not([hidden])');
        if (opt.emirate !== 'dubai') await page.click(`.mk-pill[data-emirate="${opt.emirate}"]`);
        const panel = `.mk-panel[data-emirate="${opt.emirate}"]`;
        await page.waitForSelector(`${panel}:not([hidden])`);
        const btn = page.locator(`${panel} .dc-sort button[data-sort="${opt.sort}"]`).first();
        if (await btn.count()) await btn.click();
        const pressed = await page.locator(`${panel} .dc-sort button[data-sort="${opt.sort}"]`).first().getAttribute('aria-pressed');
        if (pressed !== 'true') throw new Error(`${name}: sort ${opt.sort} not applied`);
        await page.mouse.move(0, 0);
      }
      await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true, animations: 'disabled' });
      console.log(`${name}-${width}.png`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
