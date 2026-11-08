// /invest fixes (owner 2026-11-08): the ROI calculator's annualised return is a true IRR on the cash flows, the default
// appreciation is 0, the intro and the Market Intelligence copy are exact, and the five checks are Cormorant card
// headings. Run after `npm run build`. Layout in a browser: tests/e2e/invest.e2e.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cashFlows, computeROI, formatPct, irr } from '../src/lib/roi.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const page = () => readFileSync(join(root, 'dist', 'invest.html'), 'utf8');
const DEFAULTS = { budget: 1500000, expectedAnnualRent: 105000, annualServiceCharges: 15000, holdingPeriodYears: 5, acquisitionCostPct: 7, expectedAnnualAppreciationPct: 0 };

test('IRR: the cash flows are -(price + acquisition), the yearly net income, and the exit value in the last year', () => {
  assert.deepEqual(cashFlows({ ...DEFAULTS, expectedAnnualAppreciationPct: 3 }).map((x) => Math.round(x)), [-1605000, 90000, 90000, 90000, 90000, 90000 + 1738911]);
  assert.deepEqual(cashFlows(DEFAULTS), [-1605000, 90000, 90000, 90000, 90000, 1590000]);
});

test('IRR with the default inputs: 7.1% (7.06) at 3% appreciation, 4.4% at 0%', () => {
  const at3 = computeROI({ ...DEFAULTS, expectedAnnualAppreciationPct: 3 }).annualizedReturnPct;
  assert.ok(Math.abs(at3 - 7.0567) < 0.001, `${at3}`);
  assert.equal(formatPct(at3), '7.1%');
  const at0 = computeROI(DEFAULTS).annualizedReturnPct;
  assert.ok(Math.abs(at0 - 4.4095) < 0.001, `${at0}`);
  assert.equal(formatPct(at0), '4.4%');
  // The NPV at the solved rate is zero.
  const r = at3 / 100;
  assert.ok(Math.abs(cashFlows({ ...DEFAULTS, expectedAnnualAppreciationPct: 3 }).reduce((s, c, t) => s + c / (1 + r) ** t, 0)) < 1e-3);
});

test('IRR, hand-checked: -100 then 10 then 110 is exactly 10%; -1000 then 0, 0, 1331 is 10% (1.1 cubed = 1.331)', () => {
  assert.ok(Math.abs(irr([-100, 10, 110]) - 0.1) < 1e-9);
  assert.ok(Math.abs(irr([-1000, 0, 0, 1331]) - 0.1) < 1e-9);
  // A round trip with no gain is 0%; a loss gives a negative rate.
  assert.ok(Math.abs(irr([-100, 100])) < 1e-9);
  assert.ok(irr([-100, 5, 5, 60]) < 0);
});

test('IRR: no solution shows "n/a", never a dash, NaN or a fake zero', () => {
  for (const cf of [[], [-100], [0, 0], [-1, -1], [100, 10], [-100, NaN]]) assert.equal(irr(cf), null, JSON.stringify(cf));
  assert.equal(computeROI({ ...DEFAULTS, holdingPeriodYears: 0 }).annualizedReturnPct, null);
  assert.equal(computeROI({ ...DEFAULTS, budget: 0, expectedAnnualRent: 0, annualServiceCharges: 0 }).annualizedReturnPct, null);
  assert.equal(formatPct(null), 'n/a');
  assert.equal(formatPct(NaN), 'n/a');
});

test('the built /invest: defaults (appreciation 0), the exact intro, the "ROI calculator" heading, the IRR label, the Insights link', () => {
  const h = page();
  const roi = h.slice(h.indexOf('<div class="card" id="roi">'), h.indexOf('<script', h.indexOf('<div class="card" id="roi">')));
  const values = Object.fromEntries([...roi.matchAll(/<input id="roi-(\w+)"[^>]*value="([^"]*)"/g)].map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(values, DEFAULTS);
  assert.match(roi, /<h2>ROI calculator<\/h2>\s*<p class="small">A quick, directional estimate, not a substitute for a property-specific analysis\.<\/p>/);
  assert.doesNotMatch(roi, /ROI Calculator|Compass Key Brief/);
  assert.match(roi, /<div class="stat-label">Annualised return \(IRR\)<\/div>/);
  assert.match(h, /<p style="max-width:36rem">Transaction activity, pricing trends, rental market movement and new launch supply: tracked and interpreted, not just reported\. Full market updates are in <a href="\/insights">Insights<\/a>\.<\/p>/);
});

test('the five checks: Cormorant card headings (the .card h2 style, as the Buy cards) in the five-card grid', () => {
  const h = page();
  const grid = h.slice(h.indexOf('<div class="checks-grid"'), h.indexOf('<div style="margin-top:var(--space-12)"><div class="card" id="roi">'));
  assert.deepEqual([...grid.matchAll(/<div class="card"><h2>([^<]+)<\/h2>/g)].map((m) => m[1]), ['Price', 'Returns', 'Risk', 'Exit', 'My view']);
  assert.doesNotMatch(grid, /<h2 style=/, 'no inline Inter style on the headings');
  const buy = readFileSync(join(root, 'dist', 'buy.html'), 'utf8');
  assert.match(buy, /<div class="card"[^>]*>\s*<h2[^>]*>Ready Properties<\/h2>/, 'the Buy cards use the same plain card h2');
});
