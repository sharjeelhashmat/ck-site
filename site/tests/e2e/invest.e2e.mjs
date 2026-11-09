// Browser check for /invest (owner 2026-11-08). The five checks: one row of five equal cards on desktop, three then two
// centred on a tablet, stacked on a phone; no sideways scroll at 320, 375, 768 and 1280. The calculator shows the IRR from
// its defaults (appreciation 0: 4.4%) and recomputes it as the visitor types (3%: 7.1%). Not part of `npm test`: it needs
// Chromium.
import path from 'node:path';
import assert from 'node:assert/strict';
import { start } from '../../qa/serve.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const dist = path.resolve(process.argv[2] ?? 'dist');
const server = await start(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const rows = (boxes) => {
  const out = [];
  for (const b of boxes) {
    const row = out.find((r) => Math.abs(r[0].top - b.top) < 2);
    row ? row.push(b) : out.push([b]);
  }
  return out;
};
let checks = 0;

try {
  for (const width of [320, 375, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.route(/^https:\/\//, (r) => r.abort());
    await page.goto(base + '/invest', { waitUntil: 'load' });
    const m = await page.evaluate(() => {
      const grid = document.querySelector('.checks-grid');
      const g = grid.getBoundingClientRect();
      const cards = [...grid.querySelectorAll(':scope > .card')].map((c) => {
        const r = c.getBoundingClientRect();
        const h = c.querySelector('h2');
        return { top: r.top, left: r.left, right: r.right, width: r.width, font: getComputedStyle(h).fontFamily, size: parseFloat(getComputedStyle(h).fontSize), text: h.textContent };
      });
      const roiH = document.querySelector('#roi h2');
      return { grid: { left: g.left, right: g.right }, cards, roiH: [roiH.textContent, getComputedStyle(roiH).fontFamily], scrollWidth: document.documentElement.scrollWidth };
    });
    const at = `@${width}`;
    assert.equal(m.scrollWidth, width, `${at}: no sideways scroll`);
    assert.deepEqual(m.cards.map((c) => c.text), ['Price', 'Returns', 'Risk', 'Exit', 'My view'], at);
    for (const c of m.cards) assert.match(c.font, /^"?Cormorant/, `${at}: ${c.text} heading in Cormorant`);
    for (const c of m.cards) assert.ok(c.left >= m.grid.left - 0.5 && c.right <= m.grid.right + 0.5, `${at}: ${c.text} inside the grid`);
    assert.deepEqual([m.roiH[0], /^"?Cormorant/.test(m.roiH[1])], ['ROI calculator', true], `${at}: the calculator heading`);
    const r = rows(m.cards);
    const shape = r.map((x) => x.length);
    const want = width >= 1280 ? [5] : width >= 768 ? [3, 2] : [1, 1, 1, 1, 1];
    assert.deepEqual(shape, want, `${at}: cards per row`);
    const w0 = m.cards[0].width;
    for (const c of m.cards) assert.ok(Math.abs(c.width - w0) < 1, `${at}: equal card widths`);
    for (const row of r) {
      // Each row is centred in the grid (the short tablet row too).
      const gap = (row[0].left - m.grid.left) - (m.grid.right - row[row.length - 1].right);
      assert.ok(Math.abs(gap) < 1, `${at}: row of ${row.length} centred (${gap})`);
    }
    if (width === 1280) {
      const out = (k) => page.locator(`#roi [data-out="${k}"]`).textContent();
      assert.equal(await page.inputValue('#roi-expectedAnnualAppreciationPct'), '0');
      assert.equal(await out('annualizedReturnPct'), '4.4%', 'the default IRR');
      await page.fill('#roi-expectedAnnualAppreciationPct', '3');
      assert.equal(await out('annualizedReturnPct'), '7.1%', 'the IRR at 3% appreciation');
      await page.fill('#roi-holdingPeriodYears', '0');
      assert.equal(await out('annualizedReturnPct'), 'n/a', 'no cash flows after year 0');
      checks += 3;
    }
    checks += 6;
    await page.close();
  }
  console.log(`invest.e2e: ${checks} checks passed at 320, 375, 768 and 1280`);
} finally {
  await browser.close();
  server.close();
}
