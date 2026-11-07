// Browser check for the footer lockups (owner 2026-11-07, Rules 1c v6.9; Coordinator notes on legibility, 2026-11-07).
// Both are Brand Package files shown once each and cropped by CSS only. From 704px: logo-horizontal-ivory.svg in a 656px
// frame, whole ink box (x 217 to 2668, y 235 to 725 of 2880 x 960) unclipped, tagline capitals (38 units) at least 10px.
// Below 704px: logo-stacked-ivory.svg (Brand Package v3.0 sh_stacked_ivory_transparent.svg) at the footer's full content
// width up to 360px (at most 257px tall), centred, whole ink box (x 204 to 1396, y 374 to 1217 of 1600 x 1600) unclipped; its tagline size (26 to 27 units) is
// printed. Neither image is stretched, the page does not scroll sideways and the header lockup is unchanged. Not part of
// `npm test`: it needs Chromium.
//   PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e/footer.e2e.mjs <distDir>
import path from 'node:path';
import assert from 'node:assert/strict';
import { start } from '../../qa/serve.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const dist = path.resolve(process.argv[2] ?? 'dist');
const server = await start(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

const LOCKUPS = {
  horizontal: { canvas: [2880, 960], ink: { x0: 217, y0: 235, x1: 2668, y1: 725 }, frame: 2480 / 510, caps: [38, 40] },
  stacked: { canvas: [1600, 1600], ink: { x0: 204, y0: 374, x1: 1396, y1: 1217 }, frame: 1208 / 860, caps: [26, 27] },
};
const sizes = [];
let checks = 0;

try {
  for (const width of [320, 375, 600, 703, 704, 1280]) {
    for (const p of ['/', '/about', '/insights/dubai-2026-so-far-official-numbers']) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.route(/^https:\/\//, (r) => r.abort());
      await page.goto(base + p, { waitUntil: 'load' });
      await page.waitForFunction(() => [...document.querySelectorAll('footer img')].every((i) => i.complete));
      const m = await page.evaluate(() => {
        const f = document.querySelector('footer.site-footer');
        const R = (e) => e.getBoundingClientRect();
        const shown = (e) => R(e).width > 0 && getComputedStyle(e).display !== 'none';
        const one = (frame) => {
          const img = frame.querySelector('img');
          return { shown: shown(frame), src: img.getAttribute('src'), alt: img.alt, natural: [img.naturalWidth, img.naturalHeight], frame: R(frame).toJSON(), img: R(img).toJSON() };
        };
        const row = f.querySelector('.foot-row');
        const pad = parseFloat(getComputedStyle(row).paddingLeft) + parseFloat(getComputedStyle(row).paddingRight);
        return {
          horizontal: one(f.querySelector('.brand-lockup')), stacked: one(f.querySelector('.brand-stacked')), row: R(row).width - pad, rowLeft: R(row).left + parseFloat(getComputedStyle(row).paddingLeft),
          imgs: [...f.querySelectorAll('img')].map((x) => x.getAttribute('src')), typed: /Property Consultant · UAE/.test(f.textContent),
          scrollWidth: document.documentElement.scrollWidth, header: [...document.querySelectorAll('header.site-nav img')].map((x) => [x.getAttribute('src'), x.alt, Math.round(R(x).height)]),
        };
      });
      const at = `${p} @${width}`;
      const kind = width >= 704 ? 'horizontal' : 'stacked';
      const other = kind === 'horizontal' ? 'stacked' : 'horizontal';
      assert.deepEqual([m[kind].shown, m[other].shown], [true, false], `${at}: ${kind} lockup shows`);
      assert.deepEqual(m.imgs, ['/logo-horizontal-ivory.svg', '/logo-stacked-ivory.svg'], `${at}: the two Brand Package files only`);
      assert.equal(m.typed, false, `${at}: no typed title line`);
      const L = LOCKUPS[kind], x = m[kind];
      assert.equal(x.alt, 'Sharjeel Hashmat, Property Consultant · UAE', `${at}: alt`);
      assert.deepEqual(x.natural, L.canvas, `${at}: the file's own canvas`);
      const s = x.img.width / L.canvas[0];
      assert.ok(Math.abs(x.img.height / x.img.width - L.canvas[1] / L.canvas[0]) < 0.002, `${at}: the image is not stretched`);
      const ink = { left: x.img.left + L.ink.x0 * s, right: x.img.left + L.ink.x1 * s, top: x.img.top + L.ink.y0 * s, bottom: x.img.top + L.ink.y1 * s };
      for (const [k, ok] of [['left', ink.left >= x.frame.left - 0.5], ['right', ink.right <= x.frame.right + 0.5], ['top', ink.top >= x.frame.top - 0.5], ['bottom', ink.bottom <= x.frame.bottom + 0.5]]) {
        assert.ok(ok, `${at}: the ${kind} lockup's ${k} edge is clipped`);
      }
      assert.ok(Math.abs(x.frame.width / x.frame.height - L.frame) < 0.02, `${at}: frame proportions`);
      const caps = L.caps.map((u) => (u * s).toFixed(2));
      if (kind === 'horizontal') {
        assert.ok(Math.abs(x.frame.width - 656) < 0.5, `${at}: frame ${x.frame.width}px`);
        assert.ok(L.caps[0] * s >= 10, `${at}: tagline capitals ${caps[0]}px`);
      } else {
        assert.ok(Math.abs(x.frame.width - Math.min(m.row, 360)) < 0.5, `${at}: frame ${x.frame.width}px, footer content ${m.row}px`);
        assert.ok(x.frame.height <= 257, `${at}: frame ${x.frame.height}px tall`);
        assert.ok(Math.abs((x.frame.left + x.frame.right) / 2 - (m.rowLeft + m.row / 2)) < 0.5, `${at}: centred`);
      }
      if (p === '/') sizes.push(`${width}px: ${kind}, frame ${x.frame.width.toFixed(1)} x ${x.frame.height.toFixed(1)}px, tagline capitals ${caps.join(' to ')}px`);
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
console.log(sizes.join('\n'));
console.log(`footer e2e: ${checks} checks passed`);
