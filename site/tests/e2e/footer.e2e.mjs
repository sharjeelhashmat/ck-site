// Browser check for the footer lockup (owner 2026-11-07, Rules 1c v6.9; Coordinator note on legibility, 2026-11-07).
// From 704px: the Brand Package file logo-horizontal-ivory.svg, shown once and cropped by CSS only. The crop frame holds
// the lockup's whole ink box (x 217 to 2668, y 235 to 725 of the 2880 x 960 canvas), keeps the file's proportions, and
// the tagline capitals (38 units at least) are at least 10px tall. Below 704px (no stacked file in the Brand Package):
// the stacked lockup from PR 109, with the title on its own line under the wordmark, its left edge on the start of the
// wordmark text (within 1px), 4 to 8px under it, the mark centred against both lines. At every width nothing wraps, the
// page does not scroll sideways and the header lockup is unchanged. Not part of `npm test`: it needs Chromium.
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
const CAPS = 38; // tagline capital height in canvas units (38 to 40 measured)
// logo-web-ivory.svg geometry (viewBox 205 225 2480 510): where the wordmark text starts and where its ink ends.
const VIEW = { x: 205, y: 225, w: 2480, h: 510 };
const TEXT_X = 880.27;
const INK_BOTTOM = 586.32;
let checks = 0;

try {
  for (const width of [320, 375, 703, 704, 768, 1280]) {
    for (const p of ['/', '/about', '/insights/dubai-2026-so-far-official-numbers']) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.route(/^https:\/\//, (r) => r.abort());
      await page.goto(base + p, { waitUntil: 'load' });
      await page.waitForFunction(() => [...document.querySelectorAll('footer img')].every((i) => i.complete));
      const m = await page.evaluate(({ VIEW, TEXT_X, INK_BOTTOM }) => {
        const f = document.querySelector('footer.site-footer');
        const R = (e) => e.getBoundingClientRect();
        const shown = (e) => R(e).width > 0 && getComputedStyle(e).display !== 'none';
        const frame = f.querySelector('.brand-lockup');
        const stacked = f.querySelector('.brand-stacked');
        const out = { lockupShown: shown(frame), stackedShown: shown(stacked), scrollWidth: document.documentElement.scrollWidth, header: [...document.querySelectorAll('header.site-nav img')].map((x) => [x.getAttribute('src'), x.alt, Math.round(R(x).height)]) };
        if (out.lockupShown) {
          const img = frame.querySelector('img');
          Object.assign(out, { alt: img.alt, natural: [img.naturalWidth, img.naturalHeight], frame: R(frame).toJSON(), img: R(img).toJSON(), row: R(frame.parentElement).width });
        }
        if (out.stackedShown) {
          const word = stacked.querySelector('.brand-word');
          const img = word.querySelector('img');
          const title = stacked.querySelector('span');
          const w = R(word), i = R(img), t = R(title), mk = R(stacked.querySelector('.brand-mark'));
          Object.assign(out, {
            title: title.textContent, titleLine: parseFloat(getComputedStyle(title).lineHeight),
            wordBottom: w.bottom, inkBottom: i.top + (i.height * (INK_BOTTOM - VIEW.y)) / VIEW.h, textLeft: i.left + (i.width * (TEXT_X - VIEW.x)) / VIEW.w,
            titleTop: t.top, titleLeft: t.left, titleHeight: t.height, blockTop: w.top, blockBottom: t.bottom, markMid: (mk.top + mk.bottom) / 2,
            wordAlt: img.alt, wordHeight: w.height,
          });
        }
        return out;
      }, { VIEW, TEXT_X, INK_BOTTOM });
      const at = `${p} @${width}`;
      assert.deepEqual([m.lockupShown, m.stackedShown], width >= 704 ? [true, false] : [false, true], `${at}: which lockup shows`);
      if (m.lockupShown) {
        assert.equal(m.alt, 'Sharjeel Hashmat, Property Consultant · UAE', `${at}: alt`);
        assert.deepEqual(m.natural, [CANVAS.w, CANVAS.h], `${at}: the file's own canvas`);
        const s = m.img.width / CANVAS.w;
        assert.ok(Math.abs(m.img.height / m.img.width - CANVAS.h / CANVAS.w) < 0.002, `${at}: the image is not stretched`);
        assert.ok(CAPS * s >= 10, `${at}: tagline capitals ${(CAPS * s).toFixed(2)}px`);
        const ink = { left: m.img.left + INK.x0 * s, right: m.img.left + INK.x1 * s, top: m.img.top + INK.y0 * s, bottom: m.img.top + INK.y1 * s };
        for (const [k, ok] of [['left', ink.left >= m.frame.left - 0.5], ['right', ink.right <= m.frame.right + 0.5], ['top', ink.top >= m.frame.top - 0.5], ['bottom', ink.bottom <= m.frame.bottom + 0.5]]) {
          assert.ok(ok, `${at}: the lockup's ${k} edge is clipped`);
        }
        assert.ok(Math.abs(m.frame.width - 656) < 0.5, `${at}: frame ${m.frame.width}px`);
        assert.ok(Math.abs(m.frame.width / m.frame.height - 2480 / 510) < 0.02, `${at}: frame proportions`);
      } else {
        assert.equal(m.title, 'Property Consultant · UAE', `${at}: wording`);
        assert.equal(m.wordAlt, 'Sharjeel Hashmat', `${at}: the wordmark keeps its alt`);
        assert.ok(m.titleTop >= m.wordBottom, `${at}: title below the wordmark`);
        const gap = m.titleTop - m.inkBottom;
        assert.ok(gap >= 4 && gap <= 8, `${at}: gap under the wordmark ink is ${gap.toFixed(2)}px`);
        assert.ok(Math.abs(m.titleLeft - m.textLeft) <= 1, `${at}: title left ${m.titleLeft} vs wordmark text ${m.textLeft}`);
        assert.ok(Math.abs(m.markMid - (m.blockTop + m.blockBottom) / 2) <= 1, `${at}: mark centred against the two lines`);
        assert.equal(m.titleHeight, m.titleLine, `${at}: the title is one line`);
        assert.equal(m.wordHeight, 25, `${at}: the wordmark is one line`);
      }
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
