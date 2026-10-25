// Launch-readiness check (PR 2b item 3): the gaps found in the pre-launch audit cannot come back unnoticed. Runs over a
// built site: by tests/launch-readiness.test.mjs (so `npm test` fails, in CI and in every deploy) and directly in CI:
//   node scripts/readiness.mjs [distDir]      prints one row per rule; exit 1 on any FAIL, warnings never fail
//
// Rules (each one has a seeded bad fixture in tests/launch-readiness.test.mjs):
//   links      an <a> left unclosed, nested in another <a>, or wrapping #lead-next (audit M1)
//   insights   an archived or draft insight in the sitemap, llms.txt, /insights, any internal link, or built at all
//   meta       a page title over 60 characters, or a description outside 70 to 160 characters (PR 2 item 21)
//   privacy    the Privacy page lacks the retention periods: "30 days", "24 months" or "730 days", "12 months" or "365 days"
//              (a WARNING until PRIVACY_RETENTION_REQUIRED is true)
//   noindex    a non-indexable build emits a sitemap, advertises one, or a page or path lacks noindex (PR 2 item 22)
//   wording    "Book a call", "Broker", "Real Estate Consultant", a Gmail address or "Royals Field" on any page
//   whatsapp   /new-launches has more WhatsApp links than the site-wide ones (nav and floating button): no extra CTA
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The lawyer-approved Privacy PR flips this ONE constant to true; from then on missing retention periods fail the build.
export const PRIVACY_RETENTION_REQUIRED = false;

export const TITLE_MAX = 60;
export const DESC_MIN = 70;
export const DESC_MAX = 160;
const SITE_ROOT = fileURLToPath(new URL('../', import.meta.url));
const INSIGHTS_DIR = join(SITE_ROOT, 'src', 'data', 'insights');
// Checked in every built page (HTML). llms.txt is not a page: it names "Broker" only to say the title is not that.
const BANNED = [
  ['Book a call', /book a call/i],
  ['Broker', /\bbrokers?\b/i],
  ['Real Estate Consultant', /real estate consultant/i],
  ['a Gmail address', /[a-z0-9._%+-]+@(gmail|googlemail)\.com/i],
  ['Royals Field', /royals\s+field/i],
];
const WA_RE = /<a\b[^>]*href="https:\/\/(wa\.me|api\.whatsapp\.com|wa\.link)\/[^"]*"/gi;
// The form's failure message carries a WhatsApp fallback in a hidden template; it is shown only when sending fails.
const ALERT_TPL_RE = /<div id="(lead|profile)-alert-tpl" hidden>[\s\S]*?<\/div>/g;

const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const textOf = (h) => decode(h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');

/** Slugs of every insight that is not published (archived, draft or anything else). */
export function unpublishedInsights(dir = INSIGHTS_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return r.status === 'published' ? [] : [r.slug ?? f.replace(/\.json$/, '')];
  });
}

/**
 * @param {string} dist built site
 * @param {{ indexable?: boolean, insightsDir?: string, privacyRequired?: boolean }} [opts]
 *   indexable: the build was meant to be public (PUBLIC_INDEXABLE=true); default from the environment, as the build reads it
 * @returns {{ rule: string, level: 'FAIL' | 'WARN', message: string }[]}
 */
export function checkReadiness(dist, opts = {}) {
  const indexable = opts.indexable ?? process.env.PUBLIC_INDEXABLE === 'true';
  const privacyRequired = opts.privacyRequired ?? PRIVACY_RETENTION_REQUIRED;
  const out = [];
  const fail = (rule, message) => out.push({ rule, level: 'FAIL', message });
  const files = walk(dist).map((f) => relative(dist, f).split(sep).join('/'));
  const pages = files.filter((f) => f.endsWith('.html'));
  const read = (f) => readFileSync(join(dist, f), 'utf8');
  const has = (f) => files.includes(f);

  for (const f of pages) {
    const h = read(f);

    // links
    const body = h.replace(/<script[\s\S]*?<\/script>/g, '');
    let depth = 0;
    for (const m of body.matchAll(/<(\/?)a\b[^>]*>/g)) {
      depth += m[1] ? -1 : 1;
      if (depth < 0 || depth > 1) { fail('links', `${f}: nested or stray <a> near offset ${m.index}`); break; }
      if (depth === 1) {
        const close = body.indexOf('</a>', m.index);
        const inner = body.slice(m.index + m[0].length, close < 0 ? undefined : close);
        if (close < 0) { fail('links', `${f}: <a> near offset ${m.index} is never closed`); break; }
        if (/id="lead-next"/.test(inner)) fail('links', `${f}: an <a> wraps #lead-next`);
      }
    }
    if (depth > 0 && !out.some((x) => x.rule === 'links' && x.message.startsWith(f))) fail('links', `${f}: unclosed <a>`);

    // meta
    const t = h.match(/<title>([^<]*)<\/title>/);
    const d = h.match(/<meta name="description" content="([^"]*)">/);
    if (!t) fail('meta', `${f}: no <title>`);
    else if (decode(t[1]).length > TITLE_MAX) fail('meta', `${f}: title is ${decode(t[1]).length} characters (max ${TITLE_MAX}): ${decode(t[1])}`);
    if (!d) fail('meta', `${f}: no meta description`);
    else {
      const n = decode(d[1]).length;
      if (n < DESC_MIN || n > DESC_MAX) fail('meta', `${f}: description is ${n} characters (${DESC_MIN} to ${DESC_MAX})`);
    }

    // wording
    for (const [label, re] of BANNED) if (re.test(h)) fail('wording', `${f}: contains ${label}`);

    // noindex (pages)
    if (!indexable && !/<meta name="robots" content="noindex,nofollow">/.test(h)) fail('noindex', `${f}: non-indexable build without <meta name="robots" content="noindex,nofollow">`);
  }

  // insights
  const hidden = unpublishedInsights(opts.insightsDir);
  const listings = files.filter((f) => /^sitemap.*\.xml$/.test(f) || f === 'llms.txt' || f === 'insights.html');
  for (const slug of hidden) {
    if (has(`insights/${slug}.html`) || has(`insights/${slug}/index.html`)) fail('insights', `${slug} (not published) is built`);
    for (const f of listings) if (read(f).includes(slug)) fail('insights', `${f} lists ${slug} (not published)`);
    const link = new RegExp(`href="(https://www\\.sharjeelhashmat\\.com)?/insights/${slug}(\\.html)?[/"#?]`);
    for (const f of pages) if (f !== 'insights.html' && link.test(read(f))) fail('insights', `${f} links ${slug} (not published)`);
  }

  // privacy
  if (!has('privacy.html')) fail('privacy', 'privacy.html is missing');
  else {
    const p = textOf(read('privacy.html'));
    const missing = [['30 days'], ['24 months', '730 days'], ['12 months', '365 days']].filter((alts) => !alts.some((a) => p.includes(a)));
    if (missing.length) {
      const message = `privacy.html lacks the retention period(s): ${missing.map((a) => a.map((x) => `"${x}"`).join(' or ')).join('; ')}`;
      out.push({ rule: 'privacy', level: privacyRequired ? 'FAIL' : 'WARN', message: privacyRequired ? message : `${message} (warning until PRIVACY_RETENTION_REQUIRED is true)` });
    }
  }

  // noindex (site)
  if (!indexable) {
    for (const f of files.filter((x) => /sitemap/i.test(x))) fail('noindex', `non-indexable build emits ${f}`);
    if (!has('robots.txt')) fail('noindex', 'robots.txt is missing');
    else if (/^Sitemap:/mi.test(read('robots.txt'))) fail('noindex', 'non-indexable build advertises a sitemap in robots.txt');
    const block = has('_headers') ? read('_headers').match(/^\/\*\n((?: {2}.+\n)+)/m)?.[1] ?? '' : '';
    if (!/^ {2}X-Robots-Tag: noindex$/m.test(block)) fail('noindex', 'non-indexable build: _headers does not send X-Robots-Tag: noindex on /*');
  }

  // whatsapp
  if (!has('new-launches.html')) fail('whatsapp', 'new-launches.html is missing');
  else {
    const h = read('new-launches.html').replace(ALERT_TPL_RE, '');
    const main = h.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? '';
    const total = (h.match(WA_RE) ?? []).length;
    const siteWide = total - (main.match(WA_RE) ?? []).length;
    if (total > siteWide) fail('whatsapp', `new-launches.html has ${total} WhatsApp links, more than the ${siteWide} site-wide ones (an extra WhatsApp CTA)`);
  }
  return out;
}

export const RULES = ['links', 'insights', 'meta', 'privacy', 'noindex', 'wording', 'whatsapp'];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dist = process.argv[2] ?? join(SITE_ROOT, 'dist');
  const results = checkReadiness(dist);
  const gh = Boolean(process.env.GITHUB_ACTIONS);
  console.log(`Launch readiness (${process.env.PUBLIC_INDEXABLE === 'true' ? 'public' : 'non-indexable'} build, ${dist})`);
  for (const r of RULES) {
    const hits = results.filter((x) => x.rule === r);
    const level = hits.some((x) => x.level === 'FAIL') ? 'FAIL' : hits.length ? 'WARN' : 'PASS';
    console.log(`  ${level.padEnd(4)} ${r}`);
    for (const x of hits) {
      console.log(`       ${x.level}: ${x.message}`);
      if (gh) console.log(`::${x.level === 'FAIL' ? 'error' : 'warning'} title=Launch readiness: ${r}::${x.message}`);
    }
  }
  process.exitCode = results.some((x) => x.level === 'FAIL') ? 1 : 0;
}
