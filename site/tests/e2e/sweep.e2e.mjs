// Browser check for the site sweep (owner 2026-11-08). /sell: the six steps are the shared numbered chips (the same
// component and styles as the abroad steps), left aligned with the page: the first chip of every row starts at the lede's
// left edge. 404: the Home and Area guides buttons, no Contact button. No sideways scroll at 320, 375 and 1280.
// Not part of `npm test`: it needs Chromium.
import path from 'node:path';
import assert from 'node:assert/strict';
import { start } from '../../qa/serve.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const dist = path.resolve(process.argv[2] ?? 'dist');
const server = await start(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const SELL = ['Comparable analysis', 'Pricing strategy', 'Marketing', 'Qualified buyers', 'Negotiation', 'Completion'];
let checks = 0;

try {
  for (const width of [320, 375, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.route(/^https:\/\//, (r) => r.abort());
    await page.goto(base + '/sell', { waitUntil: 'load' });
    const at = `/sell @${width}`;
    const m = await page.evaluate(() => {
      const ol = document.querySelector('main ol.step-chips');
      const lede = document.querySelector('main .lede').getBoundingClientRect();
      const box = ol.getBoundingClientRect();
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
      return { scroll: document.documentElement.scrollWidth, role: ol.getAttribute('role'), ledeLeft: lede.left, box: { left: box.left, right: box.right }, chips };
    });
    assert.ok(m.scroll <= width, `${at}: page is ${m.scroll}px wide`);
    assert.equal(m.role, 'list', `${at}: ordered list`);
    assert.deepEqual(m.chips.map((c) => c.label), SELL, `${at}: six steps in order`);
    for (const c of m.chips) {
      assert.ok(c.left >= m.box.left - 0.5 && c.right <= m.box.right + 0.5, `${at}: "${c.label}" inside the column`);
      assert.equal(c.bg, 'rgb(255, 255, 255)', `${at}: white`);
      assert.equal(c.border, '1px solid rgb(227, 221, 207)', `${at}: border`);
      assert.ok(c.radius >= c.height / 2, `${at}: fully rounded`);
      assert.equal(c.size, '13px', `${at}: 13px`);
      assert.match(c.family, /Inter/, `${at}: Inter`);
      assert.deepEqual(c.num, ['rgb(126, 96, 52)', '500'], `${at}: number in Brass Deep`);
    }
    // Left aligned: the first chip on every row starts at the lede's left edge.
    const rows = [...new Set(m.chips.map((c) => Math.round(c.top)))];
    for (const top of rows) {
      const first = Math.min(...m.chips.filter((c) => Math.round(c.top) === top).map((c) => c.left));
      assert.ok(Math.abs(first - m.ledeLeft) <= 0.5, `${at}: row at ${top} starts at the page's left edge (${first} vs ${m.ledeLeft})`);
    }
    if (width === 320) assert.ok(rows.length > 1, `${at}: the chips wrap`);
    checks++;
    await page.close();

    const p404 = await browser.newPage({ viewport: { width, height: 800 } });
    await p404.goto(base + '/404', { waitUntil: 'load' });
    const b = await p404.evaluate(() => ({
      buttons: [...document.querySelectorAll('main .actions a')].map((a) => [a.textContent, a.getAttribute('href'), a.getBoundingClientRect().width > 0]),
      lede: document.querySelector('main .lede').textContent, scroll: document.documentElement.scrollWidth,
    }));
    assert.deepEqual(b.buttons, [['Home', '/', true], ['Area guides', '/areas', true]], `/404 @${width}: buttons`);
    assert.equal(b.lede, 'Try the homepage or the area guides.');
    assert.ok(b.scroll <= width, `/404 @${width}: no sideways scroll`);
    checks++;
    await p404.close();
  }
  console.log(`sweep e2e: ${checks} checks passed`);
} finally {
  await browser.close();
  server.close();
}
