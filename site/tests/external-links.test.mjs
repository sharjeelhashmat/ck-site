// External links (owner decisions 2026-11-06: "keep my social profile links only", "remove source links only"). The built
// site links outside sharjeelhashmat.com only to the owner's three social profiles; every source is named as plain text
// with its URL kept as data. scripts/postbuild.mjs fails the build on any other external <a href>; this file checks the
// built pages, the browser-rendered source lines and the validators.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOCIAL_PROFILE_URLS, WHATSAPP_OWNER_RE, disallowedExternalHrefs, externalHrefs } from '../src/lib/links.mjs';
import { checkArticle, checkClaim } from '../src/lib/intel.mjs';
import { renderChange, renderGuideCard, renderLaunchAbuDhabi, renderLaunchDubai, renderTop, renderYtd } from '../src/lib/market.mjs';
import { BUILD, leadCaptureDist } from './helpers/build-mode.mjs';
import { claim, validArticle } from './helpers/fixtures.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const pages = (d) => walk(d).filter((f) => f.endsWith('.html'));

test('the allowlist is exactly the three social profile URLs the footer uses', () => {
  // site.ts imports golive without an extension (Astro resolves it), so its three profile URLs are read from the source.
  const site = readFileSync(join(root, 'src/lib/site.ts'), 'utf8');
  const SITE = Object.fromEntries(['linkedin', 'instagram', 'facebook'].map((k) => [k, site.match(new RegExp(`\\b${k}: '([^']+)'`))[1]]));
  assert.deepEqual([...SOCIAL_PROFILE_URLS], [SITE.linkedin, SITE.instagram, SITE.facebook]);
  const footer = readFileSync(join(root, 'src/components/Footer.astro'), 'utf8');
  assert.match(footer, /href=\{s\.href\} target="_blank" rel="noopener"/, 'the footer links stay exactly as they are');
});

test('externalHrefs: absolute and protocol-relative links to other hosts; own host, paths, anchors, tel: and mailto: are not external', () => {
  const h = '<a href="https://x.example/a">a</a><a href="//cdn.example/b">b</a><a class="k" href=\'http://y.example\'>c</a>'
    + '<a href="/areas">d</a><a href="#src-1">e</a><a href="tel:+971555414468">f</a><a href="mailto:hello@sharjeelhashmat.com">g</a>'
    + '<a href="https://www.sharjeelhashmat.com/about">h</a><a href="https://sharjeelhashmat.com/">i</a><link href="https://fonts.example/x">';
  assert.deepEqual(externalHrefs(h), ['https://x.example/a', '//cdn.example/b', 'http://y.example']);
  assert.deepEqual(disallowedExternalHrefs(`<a href="${SOCIAL_PROFILE_URLS[0]}">in</a><a href="https://www.linkedin.com/in/someone-else">x</a>`), ['https://www.linkedin.com/in/someone-else'], 'exact URLs, not hosts');
  assert.deepEqual(disallowedExternalHrefs('<a href="https://wa.me/971555414468?text=Hi">w</a>'), ['https://wa.me/971555414468?text=Hi'], 'no WhatsApp without lead capture');
  assert.deepEqual(disallowedExternalHrefs('<a href="https://wa.me/971555414468?text=Hi">w</a>', { whatsapp: true }), []);
  assert.deepEqual(disallowedExternalHrefs('<a href="https://wa.me/447000000000?text=Hi">w</a>', { whatsapp: true }), ['https://wa.me/447000000000?text=Hi'], 'only the owner\'s number');
});

test('guard: no built page links outside sharjeelhashmat.com except the three social profiles', () => {
  const files = pages(dist);
  assert.ok(files.length > 30, `${files.length} pages`);
  const bad = files.flatMap((f) => disallowedExternalHrefs(readFileSync(f, 'utf8'), { whatsapp: BUILD.leadCapture }).map((h) => `${f.slice(dist.length)}: ${h}`));
  assert.deepEqual(bad, []);
  // In the soft-launch build under test the only external links are exactly the three profiles, on every page.
  if (!BUILD.leadCapture) {
    for (const f of files) {
      const ext = [...new Set(externalHrefs(readFileSync(f, 'utf8')))];
      assert.deepEqual(ext.sort(), [...SOCIAL_PROFILE_URLS].sort(), `${f.slice(dist.length)}: ${ext.join(', ')}`);
    }
  }
});

test('guard: no browser script builds an external link (the /areas, guide and /new-launches source lines)', () => {
  for (const f of walk(join(dist, '_astro')).filter((p) => p.endsWith('.js'))) {
    const js = readFileSync(f, 'utf8');
    assert.doesNotMatch(js, /<a\s[^>]*href=\\?["'](?:https?:)?\/\//, `${f}: hard-coded external link`);
    assert.doesNotMatch(js, /target=\\?["']_blank/, `${f}: a link opening a new tab`);
  }
});

test('guard: the lead-capture build allows only the social profiles and WhatsApp to the owner\'s number', () => {
  const { dir } = leadCaptureDist();
  const bad = pages(dir).flatMap((f) => disallowedExternalHrefs(readFileSync(f, 'utf8'), { whatsapp: true }).map((h) => `${f.slice(dir.length)}: ${h}`));
  assert.deepEqual(bad, []);
  const wa = pages(dir).flatMap((f) => externalHrefs(readFileSync(f, 'utf8'))).filter((h) => !SOCIAL_PROFILE_URLS.includes(h));
  assert.ok(wa.length > 0 && wa.every((h) => WHATSAPP_OWNER_RE.test(h)), 'the only other external links are WhatsApp chats');
});

test('the build fails on an external link (scripts/postbuild.mjs)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ck-links-'));
  const base = '<html><head><title>x</title></head><body><main data-worker="https://ck-lead-worker.sharjeelhashmat.workers.dev">';
  const run = (body) => {
    writeFileSync(join(tmp, 'index.html'), `${base}${body}</main></body></html>`);
    return spawnSync(process.execPath, [join(root, 'scripts/postbuild.mjs'), tmp], { encoding: 'utf8' });
  };
  const ok = run(SOCIAL_PROFILE_URLS.map((u) => `<a href="${u}">s</a>`).join('') + '<a href="tel:+971555414468">t</a><a href="/areas">a</a>');
  assert.equal(ok.status, 0, ok.stderr);
  const bad = run('<a href="https://adrec.gov.ae/en" target="_blank" rel="noopener">ADREC</a>');
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /external links other than the owner's social profiles:\n- \/?index\.html: https:\/\/adrec\.gov\.ae\/en/);
  const wa = run('<a href="https://wa.me/971555414468?text=Hi">w</a>');
  assert.notEqual(wa.status, 0, 'WhatsApp is refused on a build without the enquiry form');
});

// ---------- source names: same text, no link ----------

test('source lines rendered in the browser name the source and never link it', () => {
  const ytd = { sales_bn: 391.7, total_bn: 591.6, mortgages_bn: 154.7, as_of: '2026-10-09' };
  const area = { rank: 1, area: 'Saadiyat Island', label: null, value_bn: 13.3, share_pct: 18.9, change_pct: 63 };
  const ad = { period: '2026-H1', published: '2026-08-18', source_url: 'https://adrec.gov.ae/report.pdf', areas: [area] };
  const out = [
    renderYtd('dubai', ytd), renderYtd('abu_dhabi', { ...ytd, year: 2026 }), renderTop('abu_dhabi', ad), renderChange('abu_dhabi', ad),
    renderChange('dubai', { period: '2026-YTD09', areas: [{ ...area, change_pct: 10 }] }),
    renderGuideCard('abu_dhabi', { ...ad, area }), renderGuideCard('dubai', { period: '2026-YTD09', dldArea: 'Saadiyat', area }),
    renderLaunchDubai({ as_of: '2026-10-30', new_projects_90d: 3, source_url: 'https://data.dubai/en/l/467654' }, '2026-11-06'),
    renderLaunchAbuDhabi({ sales_value_bn: 86.1, transaction_value_bn: 117, mortgage_value_bn: 25.5, year: 2026, as_of: '2026-10-16', source_url: 'https://adrec.gov.ae/en' }),
  ];
  for (const h of out) {
    assert.ok(h.length > 50);
    assert.doesNotMatch(h, /<a\b|href=|https?:\/\//, h.slice(0, 120));
  }
  assert.match(out[0], /Source: Dubai Land Department, Real Estate Transactions open data via Data\.Dubai \(Open Data Licence\), 1 Jan to 9 Oct 2026\./);
  assert.match(out[3], /Source: Abu Dhabi Real Estate Centre \(ADREC\), H1 2026 market report \(published 18 Aug 2026\)\. Residential sales value\./);
  assert.match(out[7], /Source: Dubai Land Department, Real Estate Projects open data via Data\.Dubai \(Open Data Licence\), as of Oct 2026\./);
  assert.match(out[8], /Source: Abu Dhabi Real Estate Centre \(ADREC\), published year-to-date figures, as of 16 Oct 2026\./);
});

test('Insights: each source row keeps its name, tier and dates; the URL stays in the data and is not on the page', () => {
  const dir = join(root, 'src/data/insights');
  for (const a of readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))).filter((x) => x.status === 'published')) {
    const h = readFileSync(join(dist, 'insights', `${a.slug}.html`), 'utf8');
    a.sources.forEach((s, i) => {
      assert.match(s.url, /^https:\/\//, `${a.slug} source ${i + 1}: the URL is still stored`);
      const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(h, new RegExp(`<tr id="src-${i + 1}"[^>]*><td[^>]*>${i + 1}</td><td[^>]*>${esc(s.name)}</td><td[^>]*>${s.tier}</td><td[^>]*>${s.undated ? 'undated page' : s.publishedOn}</td><td[^>]*>${s.verifiedOn}</td></tr>`), `${a.slug} source ${i + 1}`);
      assert.equal(h.includes(`href="${s.url.replace(/&/g, '&amp;')}"`), false, `${a.slug}: ${s.url} is not linked`);
    });
  }
});

test('validators: a source name that is a URL or a link is refused (the URL field is where it belongs)', () => {
  const art = (name) => validArticle('links', { sources: [{ name, tier: 1, url: 'https://example.com/a', publishedOn: '2026-09-01', verifiedOn: '2026-09-20' }] });
  assert.deepEqual(checkArticle(art('Example Register'), '2026-09-21').errors, []);
  for (const name of ['https://example.com/a', 'See www.example.com', '<a href="/x">Register</a>', '[Register](https://example.com)']) {
    assert.ok(checkArticle(art(name), '2026-09-21').errors.some((e) => /name must be a name, not a URL or link/.test(e)), name);
  }
  assert.deepEqual(checkClaim(claim('price', 'price'), '2026-09-21').errors, []);
  assert.ok(checkClaim(claim('price', 'price', { sourceName: 'https://example.com/source' }), '2026-09-21').errors.some((e) => /sourceName must be a name/.test(e)));
  assert.ok(checkArticle(validArticle('links', { sources: [{ name: 'Register', tier: 1, publishedOn: '2026-09-01', verifiedOn: '2026-09-20' }] }), '2026-09-21').errors.some((e) => /missing url/.test(e)), 'the URL is still required as the record');
});
