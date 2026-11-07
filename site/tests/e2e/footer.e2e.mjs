// Browser check for the footer lockup (owner 2026-11-07, Rules 1c v6.9): the Brand Package file logo-horizontal-ivory.svg,
// shown once and cropped by CSS only. At 320, 375, 768 and 1280: the crop frame holds the lockup's whole ink box
// (x 217 to 2668, y 235 to 725 of the 2880 x 960 canvas) with nothing clipped, the frame keeps the file's proportions,
// it is never wider than 27rem or the row, and the page does not scroll sideways. The header lockup is unchanged.
// Not part of `npm test`: it needs Chromium.
//   PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e/footer.e2e.mjs <distDir>
import path from 'node:path';
import assert from 'node:assert/strict';
import { start } from '../../qa/serve.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const dist = path.resolve(process.argv[2] ?? 'dist');
const server = await start(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

const CANVAS = { w: 2880, h: 960 };
const INK = { x0: 217, y0: 235, x1: 2668, y1: 725 };
let checks = 0;

try {
  for (const width of [320, 375, 768, 1280]) {
    for (const p of ['/', '/about', '/insights/dubai-2026-so-far-official-numbers']) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.route(/^https:\/\//, (r) => r.abort());
      await page.goto(base + p, { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelector('footer .lockup')?.complete);
      const m = await page.evaluate(() => {
        const f = document.querySelector('footer.site-footer');
        const R = (e) => e.getBoundingClientRect();
        const frame = f.querySelector('.brand-lockup');
        const img = frame.querySelector('img');
        const header = [...document.querySelectorAll('header.site-nav img')];
        return {
          imgs: [...f.querySelectorAll('img')].map((x) => [x.getAttribute('src'), x.alt]), natural: [img.naturalWidth, img.naturalHeight],
          frame: R(frame).toJSON(), img: R(img).toJSON(), rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
          row: R(frame.parentElement).width, scrollWidth: document.documentElement.scrollWidth,
          header: header.map((x) => [x.getAttribute('src'), x.alt, Math.round(R(x).height)]),
        };
      });
      const at = `${p} @${width}`;
      assert.deepEqual(m.imgs, [['/logo-horizontal-ivory.svg', 'Sharjeel Hashmat, Property Consultant · UAE']], `${at}: one image, the Brand Package lockup`);
      assert.deepEqual(m.natural, [CANVAS.w, CANVAS.h], `${at}: the file's own canvas`);
      const s = m.img.width / CANVAS.w;
      assert.ok(Math.abs(m.img.height / m.img.width - CANVAS.h / CANVAS.w) < 0.002, `${at}: the image is not stretched`);
      const ink = { left: m.img.left + INK.x0 * s, right: m.img.left + INK.x1 * s, top: m.img.top + INK.y0 * s, bottom: m.img.top + INK.y1 * s };
      for (const [k, ok] of [['left', ink.left >= m.frame.left - 0.5], ['right', ink.right <= m.frame.right + 0.5], ['top', ink.top >= m.frame.top - 0.5], ['bottom', ink.bottom <= m.frame.bottom + 0.5]]) {
        assert.ok(ok, `${at}: the lockup's ${k} edge is clipped (ink ${JSON.stringify(ink)}, frame ${JSON.stringify(m.frame)})`);
      }
      assert.ok(m.frame.width <= 27 * m.rem + 0.5 && m.frame.width <= m.row + 0.5, `${at}: frame ${m.frame.width}px`);
      assert.ok(Math.abs(m.frame.width / m.frame.height - 2480 / 510) < 0.02, `${at}: frame proportions`);
      assert.ok(m.scrollWidth <= width, `${at}: page is ${m.scrollWidth}px wide`);
      assert.deepEqual(m.header, [['/logo-web-ivory.svg', 'Sharjeel Hashmat', width <= 640 ? 40 : 52]], `${at}: header lockup unchanged`);
      checks++;
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`footer e2e: ${checks} checks passed`);
