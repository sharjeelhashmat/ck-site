// Launch-readiness check (PR 2b item 3, scripts/readiness.mjs). Run after `npm run build`: the real build must pass, and
// a copy of it with one seeded defect must fail on exactly that rule, for every rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkReadiness, PRIVACY_RETENTION_REQUIRED, RULES, unpublishedInsights } from '../scripts/readiness.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const indexable = process.env.PUBLIC_INDEXABLE === 'true';
const fails = (r) => [...new Set(r.filter((x) => x.level === 'FAIL').map((x) => x.rule))];

/** A copy of the real build with one change; returns the rules that FAIL on it. */
function seeded(edit, opts = {}) {
  const d = mkdtempSync(join(tmpdir(), 'ck-ready-'));
  try {
    cpSync(dist, d, { recursive: true });
    const file = (f) => join(d, f);
    edit({ dir: d, read: (f) => readFileSync(file(f), 'utf8'), write: (f, s) => writeFileSync(file(f), s), file });
    return fails(checkReadiness(d, { indexable: false, ...opts }));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}
const replaceIn = (f, from, to) => ({ read, write }) => {
  const h = read(f);
  assert.ok(h.includes(from), `${f} contains the text to replace`);
  write(f, h.replace(from, to));
};

test('the real build passes every rule (Privacy retention is a warning until PRIVACY_RETENTION_REQUIRED)', () => {
  const r = checkReadiness(dist, { indexable });
  assert.deepEqual(r.filter((x) => x.level === 'FAIL'), []);
  for (const w of r.filter((x) => x.level === 'WARN')) console.log(`WARNING (launch readiness, ${w.rule}): ${w.message}`);
  assert.equal(PRIVACY_RETENTION_REQUIRED, false, 'flipped to true only by the lawyer-approved Privacy PR');
  assert.deepEqual(RULES, ['links', 'insights', 'meta', 'privacy', 'noindex', 'wording', 'whatsapp']);
});

test('links: an <a> wrapping #lead-next fails', () => {
  const from = '<p class="fine" id="lead-next" hidden style="margin-top:1rem"></p>';
  assert.deepEqual(seeded(replaceIn('contact.html', from, `<a href="#x">${from}</a>`)), ['links']);
});

test('links: an unclosed <a> fails, and a nested <a> fails', () => {
  assert.deepEqual(seeded(({ read, write }) => write('about.html', read('about.html').replace(/<\/a>(?![\s\S]*<\/a>)/, ''))), ['links']);
  assert.deepEqual(seeded(replaceIn('about.html', '<a class="skip" href="#main">', '<a class="skip" href="#main"><a href="/x">x</a>')), ['links']);
});

test('insights: an archived insight in the sitemap, llms.txt, /insights, an internal link or as a built page fails', () => {
  const slug = 'dubai-q1-2026-who-is-buying';
  assert.ok(unpublishedInsights().includes(slug), `${slug} is archived`);
  const link = `<a href="/insights/${slug}">old</a>`;
  assert.deepEqual(seeded(({ write }) => write('sitemap-0.xml', `<url><loc>https://www.sharjeelhashmat.com/insights/${slug}</loc></url>`), { indexable: true }), ['insights']);
  assert.deepEqual(seeded(({ read, write }) => write('llms.txt', `${read('llms.txt')}- [Old](https://www.sharjeelhashmat.com/insights/${slug})\n`)), ['insights']);
  assert.deepEqual(seeded(replaceIn('insights.html', '</main>', `${link}</main>`)), ['insights']);
  assert.deepEqual(seeded(replaceIn('about.html', '</main>', `${link}</main>`)), ['insights']);
  assert.deepEqual(seeded(({ read, write }) => write(`insights/${slug}.html`, read('insights/costs-investors-forget-before-yield.html'))), ['insights']);
  // A draft counts the same as archived.
  const d = mkdtempSync(join(tmpdir(), 'ck-ins-'));
  writeFileSync(join(d, 'x.json'), JSON.stringify({ slug: 'costs-investors-forget-before-yield', status: 'draft' }));
  assert.deepEqual(fails(checkReadiness(dist, { indexable, insightsDir: d })), ['insights']);
  rmSync(d, { recursive: true, force: true });
});

test('meta: a title over 60 characters, or a description under 70 or over 160, fails', () => {
  const t = 'About · Sharjeel Hashmat';
  assert.deepEqual(seeded(replaceIn('about.html', `<title>${t}</title>`, `<title>${'x'.repeat(61)}</title>`)), ['meta']);
  assert.deepEqual(seeded(replaceIn('about.html', `<title>${t}</title>`, `<title>${'x'.repeat(60)}</title>`)), []);
  for (const n of [69, 161]) {
    assert.deepEqual(seeded(({ read, write }) => write('about.html', read('about.html').replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${'d'.repeat(n)}">`))), ['meta'], String(n));
  }
});

test('privacy: missing retention periods warn now, fail once PRIVACY_RETENTION_REQUIRED is true, pass when present', () => {
  const r = checkReadiness(dist, { indexable, privacyRequired: false }).filter((x) => x.rule === 'privacy');
  assert.equal(r.length, 1);
  assert.equal(r[0].level, 'WARN');
  assert.deepEqual(fails(checkReadiness(dist, { indexable, privacyRequired: true })), ['privacy']);
  const ok = replaceIn('privacy.html', '</main>', '<p>Kept 30 days, 24 months and 12 months.</p></main>');
  assert.deepEqual(seeded(ok, { privacyRequired: true }), []);
  assert.deepEqual(seeded(replaceIn('privacy.html', '</main>', '<p>Kept 30 days and 730 days.</p></main>'), { privacyRequired: true }), ['privacy']);
});

test('noindex: a non-indexable build with a sitemap, a Sitemap line, a page without noindex or no X-Robots-Tag fails', () => {
  if (indexable) return;
  assert.deepEqual(seeded(({ write }) => write('sitemap-index.xml', '<sitemapindex/>')), ['noindex']);
  assert.deepEqual(seeded(({ read, write }) => write('robots.txt', `${read('robots.txt')}\nSitemap: https://www.sharjeelhashmat.com/sitemap-index.xml\n`)), ['noindex']);
  assert.deepEqual(seeded(replaceIn('about.html', '<meta name="robots" content="noindex,nofollow">', '<meta name="robots" content="index,follow">')), ['noindex']);
  assert.deepEqual(seeded(replaceIn('_headers', '  X-Robots-Tag: noindex\n', '')), ['noindex']);
  // The same build checked as public: these rules do not apply.
  assert.ok(!fails(checkReadiness(dist, { indexable: true })).includes('noindex'));
});

test('wording: "Book a call", "Broker", "Real Estate Consultant", a Gmail address or "Royals Field" on a page fails', () => {
  for (const w of ['Book a call', 'Broker', 'brokers', 'Real Estate Consultant', 'someone@gmail.com', 'Royals Field']) {
    assert.deepEqual(seeded(replaceIn('faq.html', '</main>', `<p>${w}</p></main>`)), ['wording'], w);
  }
});

test('whatsapp: an extra WhatsApp link on /new-launches fails; the hidden form fallback does not count', () => {
  const wa = '<a href="https://wa.me/971555414468?text=Hi">WhatsApp</a>';
  assert.deepEqual(seeded(replaceIn('new-launches.html', '<h2 class="nl-h2" id="ask"', `${wa}<h2 class="nl-h2" id="ask"`)), ['whatsapp']);
  assert.match(readFileSync(join(dist, 'new-launches.html'), 'utf8'), /id="lead-alert-tpl" hidden>[\s\S]*?wa\.me/);
});
