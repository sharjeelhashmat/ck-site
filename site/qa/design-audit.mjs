// Rendered check of Rules 1c v5.8 (PR 5) on every built page, in Chromium at 320, 375 and 1280 px:
//   - every visible text (and ::before/::after content) is Cormorant 600, Cormorant Italic 400, Inter 400 or Inter 500;
//   - Inter sizes are scale steps (12, 14, 16, 48 px); Cormorant is a scale step (22 italic, 28, 44, 64) or between two
//     (the fluid h1 and h2), never below 22 px;
//   - every corner radius is 0 or a --radius-* token (8, 12, 16, 24, 9999 px);
//   - no horizontal scroll.
// The static check is tests/design-rules.test.mjs; this one sees what the browser applies (inherited styles and the
// browser's own defaults, such as bold <strong> or <th>).
//   node design-audit.mjs <distDir>          CHROMIUM=/path/to/chrome optional (default: Playwright's Chromium)
// The Worker's market endpoints answer with invented fixture figures (as in a11y.mjs); nothing leaves the machine.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { start } from './serve.mjs';

const WORKER = 'https://ck-lead-worker.sharjeelhashmat.workers.dev';
const WIDTHS = [320, 375, 1280];
const today = new Date().toISOString().slice(0, 10);
const row = (rank, area_en) => ({ rank, area_en, label: null, value_bn: 9 - rank, share_pct: 5 - rank / 2, change_pct: 10 - rank * 5, prior_zero: false, offplan_pct: 50 });
const top8 = ['Al Yelayiss 1', 'Madinat Al Mataar', 'Palm Deira', 'Hadaeq Sheikh Mohammed Bin Rashid', 'Wadi Al Safa 3', 'Business Bay', 'Marsa Dubai', 'Wadi Al Safa 5'].map((a, i) => row(i + 1, a));
const FIXTURES = {
  areas: { period: '2026-YTD09', prior_period: '2025-YTD09', first_month: '2026-01', last_month: '2026-09', prior_first_month: '2025-01', prior_last_month: '2025-09', dubai: { ytd: { sales_bn: 391.7, total_bn: 591.6, mortgages_bn: 154.7, as_of: today }, top8, total_res_bn: 182.9, as_of: today } },
  area: { period: '2026-YTD09', prior_period: '2025-YTD09', first_month: '2026-01', last_month: '2026-09', prior_first_month: '2025-01', prior_last_month: '2025-09', area: top8[6], total_res_bn: 182.9, as_of: today },
  launches: {
    dubai: { new_projects_90d: 41, top_areas_90d: [{ area_en: 'Business Bay', label: null, count: 3 }], active_projects: 612, as_of: today, source_label: 'x', source_url: 'https://data.dubai/en/l/467654' },
    abu_dhabi: { transaction_value_bn: 117.04, sales_value_bn: 86.1, mortgage_value_bn: 25.5, year: 2026, as_of: today, source_label: 'x', source_url: 'https://adrec.gov.ae/en' },
  },
};

export function pagesOf(dist) {
  const pages = [];
  const walk = (d, pre = '') => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== '_astro') walk(path.join(d, e.name), `${pre}/${e.name}`);
      else if (e.name.endsWith('.html')) pages.push(`${pre}/${e.name === 'index.html' ? '' : e.name.replace(/\.html$/, '')}`);
    }
  };
  walk(dist);
  return pages.sort();
}

// Opens `p` with the Worker answered by the fixtures and every other https request blocked.
export async function openPage(browser, base, p, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 812 : 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(/^https:\/\//, (r) => r.abort());
  await page.route(`${WORKER}/market/areas*`, (r) => json(r, FIXTURES.areas));
  await page.route(`${WORKER}/market/area/**`, (r) => json(r, FIXTURES.area));
  await page.route(`${WORKER}/market/launches`, (r) => json(r, FIXTURES.launches));
  await page.goto(base + p, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

function inPage(width) {
  const INTER = [12, 14, 16, 48];
  const SERIF_STEPS = [22, 28, 44, 64];
  const RADII = [0, 8, 12, 16, 24, 9999];
  const bad = [];
  const name = (el) => el.tagName.toLowerCase() + [...el.classList].map((c) => `.${c}`).join('');
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden'; };
  const text = (cs, label) => {
    const fam = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    const w = cs.fontWeight;
    const size = parseFloat(cs.fontSize);
    const italic = cs.fontStyle !== 'normal';
    if (/Cormorant/.test(fam)) {
      if (!(italic ? w === '400' : w === '600')) bad.push(`${label}: Cormorant ${italic ? 'italic' : 'normal'} ${w}`);
      if (size < 22) bad.push(`${label}: Cormorant at ${size}px`);
      else if (!SERIF_STEPS.includes(Math.round(size)) && !(size >= 28 && size <= 64)) bad.push(`${label}: Cormorant at ${size}px, off the scale`);
      if (Math.round(size) === 22 && !italic) bad.push(`${label}: Cormorant 22px is the italic tagline step`);
    } else if (/Inter/.test(fam)) {
      if (!['400', '500'].includes(w)) bad.push(`${label}: Inter ${w}`);
      if (!INTER.includes(Math.round(size * 100) / 100)) bad.push(`${label}: Inter at ${size}px, off the scale`);
    } else bad.push(`${label}: font ${fam}`);
  };
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) text(cs, name(el));
    for (const ps of ['::before', '::after']) {
      const c = getComputedStyle(el, ps).content;
      if (c && c !== 'none' && c !== 'normal' && c !== '""') text(getComputedStyle(el, ps), name(el) + ps);
    }
    for (const k of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']) {
      const v = parseFloat(cs[k]);
      if (!RADII.includes(v)) bad.push(`${name(el)}: ${k} ${cs[k]}`);
    }
  }
  const sw = document.documentElement.scrollWidth;
  if (sw > width) bad.push(`page scrolls sideways: ${sw}px at ${width}px`);
  return [...new Set(bad)];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dist = '../dist'] = process.argv.slice(2);
  const server = await start(dist);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  let failures = 0;
  try {
    for (const width of WIDTHS) {
      for (const p of pagesOf(dist)) {
        const { ctx, page } = await openPage(browser, base, p, width);
        const bad = await page.evaluate(inPage, width);
        failures += bad.length;
        console.log(`${bad.length ? 'FAIL' : 'PASS'} ${p} @${width}${bad.length ? `: ${bad.join('; ')}` : ''}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `${failures} problem(s)` : 'every page passes');
  process.exit(failures ? 1 : 0);
}
