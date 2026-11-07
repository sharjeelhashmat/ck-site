// Browser check for the stacked footer lockup (owner 2026-11-07, "Property Consultant has to go below"): at 320, 375, 768
// and 1280 the title sits on its own line below the "Sharjeel Hashmat" wordmark, its left edge on the start of the
// wordmark text (within 1px), 4 to 8px under it, the mark centred against both lines, nothing wraps and the page does not
// scroll sideways. The header lockup is unchanged. Not part of `npm test`: it needs Chromium.
//   PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e/footer.e2e.mjs <distDir>
import path from 'node:path';
import assert from 'node:assert/strict';
import { start } from '../../qa/serve.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const dist = path.resolve(process.argv[2] ?? 'dist');
const server = await start(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

// logo-web-ivory.svg geometry (viewBox 205 225 2480 510): where the wordmark text starts and where its ink ends.
const VIEW = { x: 205, y: 225, w: 2480, h: 510 };
const TEXT_X = 880.27;
const INK_BOTTOM = 586.32;
let checks = 0;

try {
  for (const width of [320, 375, 768, 1280]) {
    for (const p of ['/', '/about', '/insights/dubai-2026-so-far-official-numbers']) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.route(/^https:\/\//, (r) => r.abort());
      await page.goto(base + p, { waitUntil: 'load' });
      const m = await page.evaluate(({ VIEW, TEXT_X, INK_BOTTOM }) => {
        const f = document.querySelector('footer.site-footer');
        const R = (e) => e.getBoundingClientRect();
        const word = f.querySelector('.brand-word');
        const img = word.querySelector('img');
        const title = f.querySelector('.brand > span');
        const w = R(word), i = R(img), t = R(title), mk = R(f.querySelector('.brand-mark'));
        const header = [...document.querySelectorAll('header.site-nav img')];
        return {
          title: title.textContent, titleLine: parseFloat(getComputedStyle(title).lineHeight),
          wordBottom: w.bottom, inkBottom: i.top + (i.height * (INK_BOTTOM - VIEW.y)) / VIEW.h, textLeft: i.left + (i.width * (TEXT_X - VIEW.x)) / VIEW.w,
          titleTop: t.top, titleLeft: t.left, titleHeight: t.height, blockTop: w.top, blockBottom: t.bottom, markMid: (mk.top + mk.bottom) / 2,
          wordAlt: img.alt, wordHeight: w.height, scrollWidth: document.documentElement.scrollWidth,
          header: header.map((x) => [x.getAttribute('src'), x.alt, Math.round(R(x).height)]),
        };
      }, { VIEW, TEXT_X, INK_BOTTOM });
      const at = `${p} @${width}`;
      assert.equal(m.title, 'Property Consultant · UAE', `${at}: wording`);
      assert.equal(m.wordAlt, 'Sharjeel Hashmat', `${at}: the wordmark keeps its alt`);
      assert.ok(m.titleTop >= m.wordBottom, `${at}: title top ${m.titleTop} is below the wordmark bottom ${m.wordBottom}`);
      const gap = m.titleTop - m.inkBottom;
      assert.ok(gap >= 4 && gap <= 8, `${at}: gap under the wordmark ink is ${gap.toFixed(2)}px`);
      assert.ok(Math.abs(m.titleLeft - m.textLeft) <= 1, `${at}: title left ${m.titleLeft} vs wordmark text ${m.textLeft}`);
      assert.ok(Math.abs(m.markMid - (m.blockTop + m.blockBottom) / 2) <= 1, `${at}: mark centred against the two lines`);
      assert.equal(m.titleHeight, m.titleLine, `${at}: the title is one line`);
      assert.equal(m.wordHeight, 25, `${at}: the wordmark is one line`);
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
