// Browser check for "Buying in the UAE from abroad" (owner 2026-11-08, option B) on /buy and the homepage: at 320, 375
// and 1280 no page scrolls sideways, the 7 steps are an ordered list of chips that wrap inside the section and centre,
// and each chip is white with a 1px #E3DDCF border, fully rounded, 13px Inter, its number in Brass Deep at 500.
// Not part of `npm test`: it needs Chromium.
//   PLAYWRIGHT=/path/to/playwright/index.mjs node tests/e2e/abroad.e2e.mjs <distDir>
import path from 'node:path';
import assert from 'node:assert/strict';
import { start } from '../../qa/serve.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const dist = path.resolve(process.argv[2] ?? 'dist');
const server = await start(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const STEPS = ['Briefing', 'Virtual shortlist', 'Remote viewings', 'Due diligence', 'Negotiation', 'Transaction coordination', 'Handover or leasing'];
let checks = 0;

try {
  for (const width of [320, 375, 1280]) {
    for (const p of ['/', '/buy']) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.route(/^https:\/\//, (r) => r.abort());
      await page.goto(base + p, { waitUntil: 'load' });
      const at = `${p} @${width}`;
      const m = await page.evaluate(() => {
        const s = document.querySelector('[data-abroad-steps]');
        const ol = s.querySelector('ol');
        const box = s.getBoundingClientRect();
        const chips = [...ol.querySelectorAll('li')].map((li) => {
          const r = li.getBoundingClientRect();
          const cs = getComputedStyle(li);
          const n = getComputedStyle(li.querySelector('.step-num'));
          return {
            label: li.textContent.replace(/^\d/, ''), left: r.left, right: r.right, top: r.top, height: r.height,
            bg: cs.backgroundColor, border: [cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor].join(' '), radius: parseFloat(cs.borderTopLeftRadius),
            size: cs.fontSize, family: cs.fontFamily, num: [n.color, n.fontWeight],
          };
        });
        return {
          scroll: document.documentElement.scrollWidth, tag: ol.tagName, role: ol.getAttribute('role'), box: { left: box.left, right: box.right, center: (box.left + box.right) / 2 },
          align: getComputedStyle(s).textAlign, chips,
        };
      });
      assert.ok(m.scroll <= width, `${at}: page is ${m.scroll}px wide`);
      assert.deepEqual([m.tag, m.role], ['OL', 'list'], `${at}: ordered list`);
      assert.equal(m.align, 'center', `${at}: centred`);
      assert.deepEqual(m.chips.map((c) => c.label), STEPS, `${at}: steps in order`);
      for (const c of m.chips) {
        assert.ok(c.left >= m.box.left - 0.5 && c.right <= m.box.right + 0.5, `${at}: "${c.label}" inside the section`);
        assert.equal(c.bg, 'rgb(255, 255, 255)', `${at}: white`);
        assert.equal(c.border, '1px solid rgb(227, 221, 207)', `${at}: border`);
        assert.ok(c.radius >= c.height / 2, `${at}: fully rounded (${c.radius} vs ${c.height})`);
        assert.equal(c.size, '13px', `${at}: 13px`);
        assert.match(c.family, /Inter/, `${at}: Inter`);
        assert.deepEqual(c.num, ['rgb(126, 96, 52)', '500'], `${at}: number in Brass Deep`);
      }
      // The chips wrap and centre: on every row the gaps left and right of the chips are equal within a pixel.
      const rows = [...new Set(m.chips.map((c) => Math.round(c.top)))];
      for (const top of rows) {
        const row = m.chips.filter((c) => Math.round(c.top) === top);
        const gapL = Math.min(...row.map((c) => c.left)) - m.box.left;
        const gapR = m.box.right - Math.max(...row.map((c) => c.right));
        assert.ok(Math.abs(gapL - gapR) <= 1, `${at}: row at ${top} centred (${gapL.toFixed(1)} vs ${gapR.toFixed(1)})`);
      }
      if (width === 320) assert.ok(rows.length > 1, `${at}: the chips wrap`);
      checks++;
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`abroad e2e: ${checks} checks passed`);
