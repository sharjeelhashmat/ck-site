// Accessibility check (PR 2b item 5a; gap G12): axe-core on the built site at 375 and 1280 px. Fails on any serious or
// critical violation and writes the full JSON report (every impact) for the CI artifact.
//   node a11y.mjs <distDir> <report.json>          CHROMIUM=/path/to/chrome optional (default: Playwright's Chromium)
// The lead Worker's market endpoints answer with invented fixture figures, so the Worker-driven panels render and are
// checked too; Turnstile is blocked (third-party iframe, not this site's markup). Nothing leaves the machine.
import fs from 'node:fs';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { start } from './serve.mjs';
import lhci from './lighthouserc.cjs';

const WORKER = 'https://ck-lead-worker.sharjeelhashmat.workers.dev';
const WIDTHS = [375, 1280];
const FAIL_ON = ['serious', 'critical'];

// Invented figures (shapes as in tests/e2e/browser.e2e.mjs); never real data.
const today = new Date().toISOString().slice(0, 10);
const row = (rank, area_en, label) => ({ rank, area_en, label, value_bn: 9 - rank, share_pct: 5 - rank / 2, change_pct: 10 - rank * 5, prior_zero: false, offplan_pct: 50 });
const top8 = ['Al Yelayiss 1', 'Madinat Al Mataar', 'Palm Deira', 'Hadaeq Sheikh Mohammed Bin Rashid', 'Wadi Al Safa 3', 'Business Bay', 'Marsa Dubai', 'Wadi Al Safa 5'].map((a, i) => row(i + 1, a, null));
const FIXTURES = {
  areas: { period: '2026-H1', prior_period: '2025-H1', dubai: { ytd: { sales_bn: 391.7, total_bn: 591.6, mortgages_bn: 154.7, as_of: today }, top8, total_res_bn: 182.9, as_of: today } },
  area: { period: '2026-H1', prior_period: '2025-H1', area: top8[5], total_res_bn: 182.9, as_of: today },
  launches: {
    dubai: { new_projects_90d: 41, top_areas_90d: [{ area_en: 'Business Bay', label: null, count: 3 }], active_projects: 612, as_of: today, source_label: 'x', source_url: 'https://data.dubai/en/l/467654' },
    abu_dhabi: { transaction_value_bn: 117.04, sales_value_bn: 86.1, mortgage_value_bn: 25.5, year: 2026, as_of: today, source_label: 'x', source_url: 'https://adrec.gov.ae/en' },
  },
};

const [dist = '../dist', out = 'axe-report.json'] = process.argv.slice(2);
const server = await start(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const report = { generatedAt: new Date().toISOString(), failOn: FAIL_ON, pages: [] };
let failures = 0;
try {
  for (const width of WIDTHS) {
    for (const p of lhci.PAGES) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 812 : 800 } });
      const page = await ctx.newPage();
      const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      // Playwright tries the most recently added route first: the catch-all block goes first, the fixtures after it.
      await page.route(/^https:\/\//, (r) => r.abort());
      await page.route(`${WORKER}/market/areas*`, (r) => json(r, FIXTURES.areas));
      await page.route(`${WORKER}/market/area/**`, (r) => json(r, FIXTURES.area));
      await page.route(`${WORKER}/market/launches`, (r) => json(r, FIXTURES.launches));
      await page.goto(base + p, { waitUntil: 'networkidle' });
      if (p === '/new-launches') await page.waitForSelector('#launch-activity:not([hidden])');
      if (p.startsWith('/areas/')) await page.waitForSelector('#guide-figures:not([hidden])');
      const r = await new AxeBuilder({ page }).analyze();
      const violations = r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) }));
      const bad = violations.filter((v) => FAIL_ON.includes(v.impact));
      failures += bad.length;
      report.pages.push({ page: p, width, passes: r.passes.length, incomplete: r.incomplete.length, violations });
      console.log(`${bad.length ? 'FAIL' : 'PASS'} ${p} @${width}: ${violations.length} violation(s)${violations.length ? ` (${violations.map((v) => `${v.id}:${v.impact}`).join(', ')})` : ''}, ${r.passes.length} rules passed`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
report.seriousOrCritical = failures;
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(`\naxe-core ${report.pages.length} page checks, ${failures} serious or critical violation(s); report: ${out}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### axe-core\n\n| page | width | violations (any impact) | serious or critical |\n|---|---|---|---|\n${report.pages
    .map((x) => `| ${x.page} | ${x.width} | ${x.violations.length} | ${x.violations.filter((v) => FAIL_ON.includes(v.impact)).length} |`).join('\n')}\n`);
}
process.exitCode = failures ? 1 : 0;
