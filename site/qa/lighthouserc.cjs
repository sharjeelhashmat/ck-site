// Lighthouse CI (PR 2b item 5b; gap G12, owner decision 2026-10-19). Free and serverless: the reports are written to
// ./lhci (filesystem upload); temporary-public-storage is never used. Mobile (Lighthouse's default form factor and
// simulated throttling), 3 runs per page, assertions on the median run.
// The built site is served locally by serve.mjs. The pages' calls to the lead Worker and Turnstile are blocked: from a
// local origin they could only fail (CORS), so the result measures this site's own code, the same in CI and locally.
// SEO is asserted only on pages the build marks indexable: a noindex build has none (it fails "is-crawlable" by design),
// and a public build keeps thin pages and Insights (until three articles) noindex on purpose.
const fs = require('node:fs');
const path = require('node:path');
const DIST = process.env.QA_DIST || '../dist';
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;
const PAGES = ['/', '/about', '/contact', '/new-launches', '/investor-profile', '/areas/downtown-dubai', '/insights/costs-investors-forget-before-yield'];
const indexed = (p) => {
  const f = path.resolve(__dirname, DIST, p === '/' ? 'index.html' : `.${p}.html`);
  return /<meta name="robots" content="index,/.test(fs.readFileSync(f, 'utf8'));
};
const esc = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SEO_PAGES = PAGES.filter(indexed);
const median = (minScore) => ['error', { minScore, aggregationMethod: 'median-run' }];
const max = (maxNumericValue) => ['error', { maxNumericValue, aggregationMethod: 'median-run' }];

module.exports = {
  ci: {
    collect: {
      startServerCommand: `node serve.mjs ${DIST} ${PORT}`,
      startServerReadyPattern: 'listening on',
      url: PAGES.map((p) => BASE + p),
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--headless=new --no-sandbox',
        blockedUrlPatterns: ['*ck-lead-worker.sharjeelhashmat.workers.dev*', '*challenges.cloudflare.com*', '*cloudflareinsights.com*'],
      },
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: '.*',
          assertions: {
            'categories:performance': median(0.9),
            'categories:accessibility': median(0.95),
            'categories:best-practices': median(0.95),
            'largest-contentful-paint': max(2500),
            'cumulative-layout-shift': max(0.1),
            'total-blocking-time': max(200),
            'total-byte-weight': max(1200000),
          },
        },
        ...(SEO_PAGES.length ? [{ matchingUrlPattern: `^${esc(BASE)}(${SEO_PAGES.map(esc).join('|')})$`, assertions: { 'categories:seo': median(0.95) } }] : []),
      ],
    },
    upload: { target: 'filesystem', outputDir: './lhci' },
  },
};
module.exports.PAGES = PAGES;
module.exports.SEO_PAGES = SEO_PAGES;
