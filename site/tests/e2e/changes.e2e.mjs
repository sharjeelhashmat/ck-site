// Browser check for "What's changing here" and the infrastructure trackers (PR 3) at 320/375/1280, on fixtures only.
// Builds the site with the fake events and project from tests/helpers/fixtures.mjs into a temp dir, then serves it.
// Not part of `npm test`: it needs Chromium.
//   PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e/changes.e2e.mjs [screenshotDir]
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { changesFixture } from '../helpers/fixtures.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const shots = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-changes-e2e-data-'));
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-changes-e2e-out-'));
const { events, projects } = changesFixture();
fs.mkdirSync(path.join(data, 'insights'));
fs.mkdirSync(path.join(data, 'projects'));
fs.writeFileSync(path.join(data, 'market-events.json'), JSON.stringify(events));
for (const p of projects) fs.writeFileSync(path.join(data, 'projects', `${p.slug}.json`), JSON.stringify(p));
const b = spawnSync('npx', ['astro', 'build', '--outDir', dist], { cwd: root, encoding: 'utf8', env: { ...process.env, INTEL_DATA_DIR: data, INTEL_TODAY: '2026-10-26', PUBLIC_INDEXABLE: 'false' } });
if (b.status !== 0) throw new Error(`fixture build failed:\n${b.stdout}${b.stderr}`);

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(dist, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, `${p}.html`);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const results = [];
// The sticky header and the floating buttons are hidden in screenshots only, so they do not cover the content.
const SHOT_STYLE = '.site-nav, .fab-stack { visibility: hidden !important; }';
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); } };

for (const width of [320, 375, 1280]) {
  const p = await browser.newPage({ viewport: { width, height: 900 } });
  // No Worker and no Turnstile: the market card stays hidden, which is the case this check is about.
  await p.route('https://**/*', (r) => r.abort());

  await check(`area page at ${width}px`, async () => {
    const r = await p.goto(`${base}/areas/dubai-marina`);
    assert.equal(r.status(), 200);
    const section = p.locator('section.changes');
    await section.scrollIntoViewIfNeeded();
    assert.ok(await section.isVisible(), 'section visible');
    assert.equal(await section.locator('h2').innerText(), "What's changing here");
    assert.equal(await section.locator('li.change').count(), 6);
    assert.ok(await section.locator('.badge--cancelled').isVisible(), 'cancelled badge visible');
    assert.ok(await section.getByText('last checked 2026-03-01').isVisible(), 'last checked visible');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'horizontal page scroll');
    const href = await section.locator('a[href^="/projects/"]').first().getAttribute('href');
    assert.equal((await p.request.get(`${base}${href}`)).status(), 200, `${href} resolves`);
    if (shots) await section.screenshot({ path: path.join(shots, `area-dubai-marina-${width}.png`), style: SHOT_STYLE });
  });

  await check(`tracker page at ${width}px`, async () => {
    const r = await p.goto(`${base}/projects/example-metro-line`);
    assert.equal(r.status(), 200);
    assert.equal(await p.locator('h1').innerText(), 'Example Metro Line (test fixture)');
    assert.equal(await p.locator('tbody tr').count(), 2);
    assert.ok(await p.getByText('This page records official announcements only. It does not predict prices or values.').isVisible());
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'horizontal page scroll');
    for (const a of await p.locator('.brief a[href^="/areas/"]').all()) {
      const href = await a.getAttribute('href');
      assert.equal((await p.request.get(`${base}${href}`)).status(), 200, `${href} resolves`);
    }
    if (shots) await p.locator('main').screenshot({ path: path.join(shots, `tracker-example-metro-line-${width}.png`), style: SHOT_STYLE });
  });
  await p.close();
}

await browser.close();
server.close();
for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
