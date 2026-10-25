// Median Lighthouse scores and metrics per page (PR 2b item 5b), from the filesystem upload in ./lhci. Prints a markdown
// table, and appends it to the GitHub run summary when there is one. Reads only; the pass/fail verdict is "lhci assert".
//   node lhci-summary.mjs [lhciDir]
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? 'lhci');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const byUrl = new Map();
for (const run of manifest) {
  const lhr = JSON.parse(fs.readFileSync(path.join(dir, path.basename(run.jsonPath)), 'utf8'));
  const a = (id) => lhr.audits[id]?.numericValue ?? NaN;
  const row = {
    ...Object.fromEntries(['performance', 'accessibility', 'best-practices', 'seo'].map((c) => [c, lhr.categories[c]?.score ?? NaN])),
    lcp: a('largest-contentful-paint'), cls: a('cumulative-layout-shift'), tbt: a('total-blocking-time'), bytes: a('total-byte-weight'),
  };
  byUrl.set(run.url, [...(byUrl.get(run.url) ?? []), row]);
}
const lines = [
  '### Lighthouse medians (mobile, 3 runs per page)', '',
  '| page | performance | accessibility | best practices | SEO | LCP ms | CLS | TBT ms | bytes |', '|---|---|---|---|---|---|---|---|---|',
];
for (const [url, rows] of byUrl) {
  const m = (k) => median(rows.map((r) => r[k]));
  lines.push(`| ${new URL(url).pathname} | ${m('performance')} | ${m('accessibility')} | ${m('best-practices')} | ${m('seo')} | ${Math.round(m('lcp'))} | ${m('cls').toFixed(3)} | ${Math.round(m('tbt'))} | ${Math.round(m('bytes'))} |`);
}
const md = lines.join('\n') + '\n';
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
