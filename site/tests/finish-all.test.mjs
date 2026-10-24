// Finish-all (owner instructions 2026-10-11 to 2026-10-16): go-live settings (B), newsletter fix (C), FAQ link (D),
// /areas (E), the 16 area guides (F) and the /new-launches panel and cards (A). Run after `npm run build`.
// Browser behaviour (the switch, sticky bar, 360px layout, newsletter success) is in tests/e2e/browser.e2e.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLIVE_TEST } from './helpers/golive.mjs';
import {
  checkAdrecAreas, checkLaunchReviews, dubaiRows, formatChange, fmtDate, fmtMonth, isHalfYear, periodLabel, priorPeriodId, rankByChange,
  renderChange, renderGuideCard, renderLaunchPanel, renderTop, renderYtd,
} from '../src/lib/market.mjs';
import { decide } from '../src/lib/areas-page.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const read = (p) => readFileSync(join(dist, p), 'utf8');
const src = (p) => readFileSync(join(root, p), 'utf8');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));
const main = (p) => read(p).match(/<main id="main">([\s\S]*?)<\/main>/)[1];
const text = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').replace(/ ([,.;:)])/g, '$1');
const GUIDES = JSON.parse(src('src/data/area-guides.json')).guides;
const ADREC = JSON.parse(src('src/data/adrec-areas.json'));

// ---------- B. Go-live settings ----------
test('B: golive.ts ships with every value empty or false', () => {
  const g = src('src/lib/golive.ts').match(/const COMMITTED: GoLive = \{([\s\S]*?)\};/)[1];
  for (const k of ['agencyName', 'agencyBrn', 'brokerCardNo', 'advertiserPermitNo']) assert.match(g, new RegExp(`\\b${k}: '',`), k);
  for (const k of ['abuDhabiLicensed', 'indexing']) assert.match(g, new RegExp(`\\b${k}: false,`), k);
});

test('B: with GOLIVE empty, no page shows an agency, BRN, card or permit line, and every page is noindex', () => {
  for (const f of htmlFiles) {
    const h = read(f.slice(dist.length + 1));
    assert.doesNotMatch(h, /Working with|RERA card|advertiser permit|<p class="disclosure">/, f);
    assert.doesNotMatch(h, /"identifier"|"worksFor"/, `${f}: JSON-LD`);
    assert.match(h, /<meta name="robots" content="noindex,nofollow">/, f);
  }
  assert.match(read('robots.txt'), /^User-agent: \*\nAllow: \/\n$/);
});

test('B: a full GOLIVE public build shows each value where it belongs; GOLIVE without the deploy switch stays noindex', () => {
  const env = (indexable) => ({ ...process.env, PUBLIC_INDEXABLE: indexable, GOLIVE_OVERRIDES: JSON.stringify({ ...JSON.parse(GOLIVE_TEST), brokerCardNo: 'TEST-CARD', agencyAddress: 'Office 1, Example Tower, Dubai' }) });
  const out = mkdtempSync(join(tmpdir(), 'ck-golive-'));
  const r = spawnSync('npx', ['astro', 'build', '--outDir', out], { cwd: root, env: env('true'), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const page = (p) => readFileSync(join(out, p), 'utf8');
  const footer = page('index.html').match(/<footer[\s\S]*<\/footer>/)[0];
  assert.match(footer, /<p class="disclosure">Working with Example Agency · BRN TEST-BRN · RERA card TEST-CARD · UAE Media Council advertiser permit TEST-PERMIT<\/p>/);
  assert.match(page('about.html'), /Working with Example Agency · BRN TEST-BRN · RERA card TEST-CARD<\/p>/);
  // Audit item 16: Person and the agency in an @graph, linked by @id; the BRN on the agency, card and permit on the person.
  const ld = JSON.parse(page('index.html').match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  const [person, agency] = ld['@graph'];
  assert.equal(person['@type'], 'Person');
  assert.deepEqual(person.worksFor, { '@id': 'https://www.sharjeelhashmat.com/#agency' });
  assert.deepEqual(person.identifier.map((i) => [i.name, i.value]), [['RERA card', 'TEST-CARD'], ['UAE Media Council advertiser permit', 'TEST-PERMIT']]);
  assert.deepEqual(agency, {
    '@type': 'RealEstateAgent', '@id': 'https://www.sharjeelhashmat.com/#agency', name: 'Example Agency',
    identifier: [{ '@type': 'PropertyValue', name: 'BRN', value: 'TEST-BRN' }],
    address: { '@type': 'PostalAddress', streetAddress: 'Office 1, Example Tower, Dubai', addressCountry: 'AE' },
    areaServed: 'United Arab Emirates',
  });
  assert.match(page('areas/hudayriyat-island.html'), /<meta name="robots" content="index,follow/);
  assert.match(page('robots.txt'), /Allow: \/\n\nSitemap: https:\/\/www\.sharjeelhashmat\.com\/sitemap-index\.xml/);
  assert.doesNotMatch(page('index.html'), /\bbroker\b/i);

  const staging = mkdtempSync(join(tmpdir(), 'ck-golive-staging-'));
  const s = spawnSync('npx', ['astro', 'build', '--outDir', staging], { cwd: root, env: env('false'), encoding: 'utf8' });
  assert.equal(s.status, 0, s.stdout + s.stderr);
  assert.match(readFileSync(join(staging, 'index.html'), 'utf8'), /<meta name="robots" content="noindex,nofollow">/);
  assert.equal(readFileSync(join(staging, 'robots.txt'), 'utf8'), 'User-agent: *\nAllow: /\n');
});

test('A.9/B: launch cards need permit number, QR, agency and BRN; Abu Dhabi refused unless licensed; hidden until GOLIVE allows', () => {
  const ok = { emirate: 'dubai', project: 'P', area: 'A', note: 'N', permit_number: '1', permit_qr: '/permits/qr-1.png', agency_name: 'X', agency_brn: '2' };
  assert.deepEqual(checkLaunchReviews([], { abuDhabiLicensed: false }), []);
  assert.deepEqual(checkLaunchReviews([ok], { abuDhabiLicensed: false }), []);
  for (const k of ['permit_number', 'permit_qr', 'agency_name', 'agency_brn']) {
    assert.match(checkLaunchReviews([{ ...ok, [k]: '' }], { abuDhabiLicensed: false }).join(), new RegExp(`${k} is required`), k);
  }
  assert.match(checkLaunchReviews([{ ...ok, emirate: 'abu_dhabi' }], { abuDhabiLicensed: false }).join(), /refused while GOLIVE\.abuDhabiLicensed is false/);
  // Audit item 19: the QR is a self-hosted /permits/*.png|svg file, nothing else.
  assert.deepEqual(checkLaunchReviews([{ ...ok, permit_qr: '/permits/qr-1.svg' }], { abuDhabiLicensed: false }), []);
  for (const bad of ['/qr.png', 'https://example.com/permits/qr.png', '/permits/qr.jpg', '/permits/../x.png', '/permits/sub/qr.png', '//cdn.example/permits/qr.png']) {
    assert.match(checkLaunchReviews([{ ...ok, permit_qr: bad }], { abuDhabiLicensed: false }).join(), /self-hosted \/permits\//, bad);
  }
  assert.deepEqual(checkLaunchReviews([{ ...ok, emirate: 'abu_dhabi' }], { abuDhabiLicensed: true }), []);
  assert.deepEqual(JSON.parse(src('src/data/launch-reviews.json')), [], 'launch-reviews.json ships empty');
  const page = src('src/pages/new-launches.astro');
  assert.match(page, /if \(reviewProblems\.length\) throw new Error/, 'a bad item fails the build');
  assert.match(page, /LAUNCH_CARDS_ALLOWED \? \(reviews as Review\[\]\)\.slice\(0, 5\) : \[\]/, 'at most five, only when GOLIVE allows');
  assert.match(src('src/lib/golive.ts'), /LAUNCH_CARDS_ALLOWED = Boolean\(GOLIVE\.agencyName && GOLIVE\.agencyBrn && GOLIVE\.advertiserPermitNo\)/);
  assert.doesNotMatch(main('new-launches.html'), /Launches I'm watching|Launches I&#39;m watching/);
});

// ---------- C. Newsletter security check ----------
test('C: only newsletter forms are bound (data-newsletter); no other element shares the nl-form class, with or without a lead form', () => {
  let withLead = 0;
  for (const f of htmlFiles) {
    const h = readFileSync(f, 'utf8');
    if (h.includes('id="lead-form"')) withLead++;
    const nl = [...h.matchAll(/class="nl-form"/g)].length;
    const bound = [...h.matchAll(/<form class="nl-form" data-newsletter /g)].length;
    assert.ok(nl >= 1, `${f}: newsletter form`);
    assert.equal(nl, bound, `${f}: every .nl-form is a newsletter <form data-newsletter>`);
  }
  assert.ok(withLead >= 3, 'pages with a lead form are covered');
  assert.doesNotMatch(src('src/pages/new-launches.astro'), /class="nl-form"/, 'the launch form wrapper no longer borrows the newsletter class');
  const nl = src('src/components/NewsletterSignup.astro');
  assert.match(nl, /document\.querySelectorAll<HTMLFormElement>\('form\[data-newsletter\]'\)/);
  assert.match(nl, /\.catch\(\(e: unknown\) => \{ loading = null; throw e; \}\)/, 'a failed load is not remembered');
  assert.match(nl, /\.catch\(\(e: unknown\) => \{ widget = null; throw e; \}\)/, 'a failed render is not remembered');
  assert.match(nl, /if \(w\.turnstile\) \{ done = true; resolve\(w\.turnstile\)/, 'an already-loaded api.js is detected');
  assert.match(nl, /data-sitekey=\{SITE\.turnstileSiteKey\}/, 'same Turnstile key');
});

// ---------- D. FAQ link ----------
test('D: "website\'s forms" links to /contact in the visible FAQ; the JSON-LD keeps the identical plain words', () => {
  const h = read('faq.html');
  assert.match(h, /Enquiries sent through the <a href="\/contact">website&#39;s forms<\/a> are answered within 24 hours/);
  const ld = JSON.parse(h.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"FAQPage"[\s\S]*?)<\/script>/)[1]);
  const q = ld.mainEntity.find((x) => x.name === 'How quickly do you respond to enquiries?');
  assert.equal(q.acceptedAnswer.text, "Enquiries sent through the website's forms are answered within 24 hours, by the contact method you choose.");
});

// ---------- E. /areas ----------
test('E: period labels, prior period and the half-year rule', () => {
  assert.equal(periodLabel('2026-H1'), 'Jan to Jun 2026');
  assert.equal(periodLabel('2026-H2'), 'Jul to Dec 2026');
  assert.equal(periodLabel('2026-Q3'), 'Jul to Sep 2026');
  assert.equal(priorPeriodId('2026-H1'), '2025-H1');
  assert.equal(periodLabel(priorPeriodId('2026-Q3')), 'Jul to Sep 2025');
  assert.equal(isHalfYear('2026-H2'), true);
  assert.equal(isHalfYear('2026-Q3'), false);
  assert.equal(fmtDate('2026-10-09'), '9 Oct 2026');
});

test('E: change formatting: +N%, true-minus −N%, change n/p, new this year, ≈N× at +200% and above, ADREC text as given', () => {
  assert.equal(formatChange({ change_pct: 16.4 }).text, '+16%');
  assert.equal(formatChange({ change_pct: -14.2 }).text, '−14%');
  assert.equal(formatChange({ change_pct: -14.2 }).text.charCodeAt(0), 0x2212);
  assert.equal(formatChange({ change_pct: null }).text, 'change n/p');
  assert.equal(formatChange({ change_pct: null, prior_zero: true }).text, 'new this year');
  assert.equal(formatChange({ change_pct: 199 }).text, '+199%');
  assert.equal(formatChange({ change_pct: 200 }).text, '≈3×');
  assert.equal(formatChange({ change_pct: 1407 }).text, '≈15×');
  assert.equal(formatChange({ change_text: '≈8×' }).text, '≈8×');
  assert.equal(formatChange({ change_pct: -41 }).dir, 'fall');
  assert.equal(formatChange({ change_pct: 63 }).dir, 'rise');
});

// The owner's expected Dubai output for 2026-H1 (data to 2026-10-09), used as a fixture.
const EXPECTED_DUBAI = {
  period: '2026-H1', prior_period: '2025-H1',
  dubai: {
    ytd: { sales_bn: 391.7, total_bn: 591.6, mortgages_bn: 154.7, as_of: '2026-10-09' }, total_res_bn: 182.9, as_of: '2026-10-09',
    top8: [
      ['Al Yelayiss 1', null, 11.07, 6.1, 1407], ['Madinat Al Mataar', 'Dubai South', 10.92, 6.0, 16], ['Palm Deira', 'Dubai Islands', 10.16, 5.6, 80],
      ['Hadaeq Sheikh Mohammed Bin Rashid', 'Dubai Hills Estate', 8.51, 4.7, -14], ['Wadi Al Safa 3', 'Majan', 8.31, 4.5, 33], ['Business Bay', null, 8.04, 4.4, -41],
      ['Marsa Dubai', 'Dubai Marina, Dubai Harbour', 7.08, 3.9, -58], ['Wadi Al Safa 5', 'Dubailand Residence Complex', 6.99, 3.8, -40],
    ].map(([area_en, label, value_bn, share_pct, change_pct], i) => ({ rank: i + 1, area_en, label, value_bn, share_pct, change_pct, prior_zero: false, offplan_pct: 50 })),
  },
};

test('E: Dubai top 8 cards from the expected output: rank, name + label, AED x.xbn, share, change, Brass bar', () => {
  const html = renderTop('dubai', { period: '2026-H1', areas: dubaiRows(EXPECTED_DUBAI) });
  const t = text(html);
  assert.match(t, /Top areas by sales value · Dubai/);
  assert.match(html, /<p class="mk-chip">Jan to Jun 2026 vs Jan to Jun 2025<\/p>/);
  assert.match(t, /Both emirates show Jan to Jun 2026: the latest period ADREC publishes by area, so Dubai and Abu Dhabi stay comparable\. Both move to a newer period together as soon as ADREC publishes it\./);
  assert.equal([...html.matchAll(/<article class="mk-card">/g)].length, 8);
  assert.match(t, /#1 Al Yelayiss 1 AED 11\.1bn 6\.1% of total ≈15×/);
  assert.match(t, /#2 Madinat Al Mataar Dubai South AED 10\.9bn 6\.0% of total \+16%/);
  assert.match(t, /#4 Hadaeq Sheikh Mohammed Bin Rashid Dubai Hills Estate AED 8\.5bn 4\.7% of total −14%/);
  assert.match(html, /<span class="mk-change mk-fall">−14%<\/span>/);
  assert.match(html, /<span style="width:100%"><\/span>/);
  assert.match(html, /<span style="width:63%"><\/span>/); // 6.99 / 11.07
});

test('E: change table ranks by change (≈N× above percentages), rises Ink, falls Brass Deep; Dubai has no n/p note', () => {
  const html = renderChange('dubai', { period: '2026-H1', areas: dubaiRows(EXPECTED_DUBAI) });
  const order = [...html.matchAll(/<span class="mk-tarea">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(order, ['Al Yelayiss 1', 'Palm Deira', 'Wadi Al Safa 3', 'Madinat Al Mataar', 'Hadaeq Sheikh Mohammed Bin Rashid', 'Wadi Al Safa 5', 'Business Bay', 'Marsa Dubai']);
  assert.match(html, /<th scope="col" class="mk-num">#<\/th><th scope="col">Area<\/th><th scope="col" class="mk-num">Sales value<\/th><th scope="col" class="mk-num">Change<\/th>/);
  assert.doesNotMatch(html, /not published/);
  assert.match(text(html), /Source: Dubai Land Department, Real Estate Transactions open data via Data\.Dubai \(Open Data Licence\)\. Residential sales value\. Area names as registered by DLD\./);
  const css = src('src/styles/market.css');
  assert.match(css, /\.mk-rise \{ color: var\(--ink\); \}/);
  assert.match(css, /\.mk-fall \{ color: var\(--brass-deep\); \}/);
});

test('E: Abu Dhabi: ≈N× text ranks first, n/p areas are left out with the note, source line names the report', () => {
  const areas = [
    { rank: 1, area: 'Hudayriyat Island', value_bn: 19, share_pct: 27, change_text: '≈8×', guide: 'hudayriyat-island' },
    { rank: 2, area: 'Saadiyat Island', value_bn: 13.3, share_pct: 18.9, change_pct: 63, guide: 'saadiyat-island' },
    { rank: 3, area: 'Al Ramhan Island', value_bn: 2.9, share_pct: 4.1, change_pct: null, guide: 'ramhan-island' },
    { rank: 4, area: 'Zayed City', value_bn: 1.9, share_pct: 2.7, change_pct: null, guide: 'zayed-city' },
  ];
  const d = { period: '2026-H1', published: '2026-08-18', total_res_bn: 70.4, source_url: 'https://adrec.gov.ae/en/news/x', areas };
  const html = renderChange('abu_dhabi', d);
  assert.deepEqual([...html.matchAll(/<span class="mk-tarea">([^<]+)<\/span>/g)].map((m) => m[1]), ['Hudayriyat Island', 'Saadiyat Island']);
  assert.match(text(html), /ADREC did not publish a year-on-year change for 2 of the top areas \(n\/p = not published\)\. They are left out of this ranking rather than estimated\./);
  assert.match(text(html), /Source: Abu Dhabi Real Estate Centre \(ADREC\), H1 2026 market report \(published 18 Aug 2026\)\. Residential sales value\./);
  assert.match(text(renderTop('abu_dhabi', d)), /#3 Al Ramhan Island AED 2\.9bn 4\.1% of total change n\/p/);
  assert.equal(rankByChange(areas).length, 2);
  // A file that is odd-sized, or points at a guide that does not exist, fails the build.
  assert.match(checkAdrecAreas({ ...d, areas: areas.slice(0, 3) }, ['hudayriyat-island', 'saadiyat-island', 'ramhan-island']).join(), /even/);
  assert.match(checkAdrecAreas({ ...d, areas: [{ ...areas[0], guide: 'nope' }, areas[1]] }, ['saadiyat-island']).join(), /guide nope/);
});

test('E: year-to-date tiles and source lines, one decimal; nothing renders without data', () => {
  const t = text(renderYtd('dubai', EXPECTED_DUBAI.dubai.ytd));
  assert.match(t, /2026 so far · Dubai AED 391\.7bn sales, 2026 to date AED 591\.6bn total transactions, 2026 to date AED 154\.7bn mortgages, 2026 to date/);
  assert.match(t, /Source: Dubai Land Department, Real Estate Transactions open data via Data\.Dubai \(Open Data Licence\), 1 Jan to 9 Oct 2026\./);
  assert.match(renderYtd('dubai', EXPECTED_DUBAI.dubai.ytd), /href="https:\/\/data\.dubai\/en\/l\/470061"/);
  const ad = text(renderYtd('abu_dhabi', { sales_bn: 86.1, total_bn: 117, mortgages_bn: 25.5, as_of: '2026-10-16', year: 2026 }));
  assert.match(ad, /2026 so far · Abu Dhabi AED 86\.1bn sales, 2026 to date AED 117\.0bn total transactions/);
  assert.match(ad, /Source: Abu Dhabi Real Estate Centre \(ADREC\), published year-to-date figures, as of 16 Oct 2026\./);
  for (const empty of [renderYtd('dubai', null), renderTop('dubai', { period: '2026-H1', areas: [] }), renderChange('abu_dhabi', { period: '2026-H1', areas: [] }), renderLaunchPanel({ dubai: null, abu_dhabi: null }), renderGuideCard('dubai', null)]) {
    assert.equal(empty, '');
  }
});

test('E: the switch shows only when both emirates have data; one emirate shows alone; none hides every figure', () => {
  assert.deepEqual(decide({ dubai: true, abu_dhabi: true }), { shown: ['dubai', 'abu_dhabi'], selected: 'dubai', switchVisible: true });
  assert.deepEqual(decide({ dubai: false, abu_dhabi: true }), { shown: ['abu_dhabi'], selected: 'abu_dhabi', switchVisible: false });
  assert.deepEqual(decide({ dubai: true, abu_dhabi: false }), { shown: ['dubai'], selected: 'dubai', switchVisible: false });
  assert.deepEqual(decide({ dubai: false, abu_dhabi: false }), { shown: [], selected: null, switchVisible: false });
});

test('E: /areas title, meta, eyebrow, H1, lede, closing line and switch markup are exact', () => {
  const h = read('areas.html');
  assert.match(h, /<title>Areas: Dubai and Abu Dhabi · Sharjeel Hashmat<\/title>/);
  assert.match(h, /<meta name="description" content="Where Dubai and Abu Dhabi property money is going: top areas by residential sales value, change against last year, and area guides\. From official records\.">/);
  const m = main('areas.html');
  assert.match(m, /<p class="eyebrow"[^>]*>Areas<\/p>/);
  assert.match(m, /Where to buy <em[^>]*>matters as much as what\.<\/em>/);
  assert.match(text(m), /Where the money is going, and how each area is moving against last year\. Dubai and Abu Dhabi measured the same way, from official records\. What it means for a specific unit comes from me\./);
  assert.match(m, /Want to know what these numbers mean for a specific unit\? <a href="\/contact"[^>]*>Ask me\.<\/a>/);
  assert.match(m, /<span class="mk-switch-label" id="mk-switch-label"[^>]*>Show figures for<\/span>/);
  assert.match(m, /role="radiogroup" aria-labelledby="mk-switch-label"/);
  assert.equal([...m.matchAll(/role="radio"/g)].length, 2);
  // The switch and the closing line start hidden; the browser shows what has data. The build-time Abu Dhabi figures are
  // visible in the markup (audit H11, tests/audit-fixes.test.mjs).
  for (const id of ['mk-switch', 'mk-ask']) assert.match(m, new RegExp(`id="${id}"[^>]*hidden|hidden[^>]*id="${id}"`), id);
  // Area guides: 8 per emirate, in Part F order, each the guide H1 + one-liner.
  for (const e of ['dubai', 'abu_dhabi']) {
    const sec = m.match(new RegExp(`<section class="mk-guides" data-emirate="${e}"[\\s\\S]*?</section>`))[0];
    const hrefs = [...sec.matchAll(/href="\/areas\/([^"]+)"/g)].map((x) => x[1]);
    assert.deepEqual(hrefs, GUIDES.filter((g) => g.emirate === e).map((g) => g.slug));
  }
  assert.match(text(m), /Area guides · Dubai/);
  assert.match(text(m), /Area guides · Abu Dhabi/);
});

test('E: adrec-areas.json holds exactly the figures confirmed in ADREC\'s own H1 2026 report (Coordinator, 2026-10-16)', () => {
  assert.deepEqual(ADREC, {
    period: '2026-H1', published: '2026-08-18', total_res_bn: 70.4, prior_total_res_bn: 25.3,
    source_url: 'https://adrec.gov.ae/-/media/adrec/market-reports/marketreportslatest/adrec-h1-2026-spread-3.pdf',
    areas: [
      { rank: 1, area: 'Hudayriyat Island', value_bn: 19.0, share_pct: 27.0, change_text: '≈8×', guide: 'hudayriyat-island' },
      { rank: 2, area: 'Saadiyat Island', value_bn: 13.3, share_pct: 18.9, change_pct: 63, guide: 'saadiyat-island' },
      { rank: 3, area: 'Al Reem Island + Al Maryah Island', value_bn: 10.5, share_pct: 14.9, change_pct: 153, guide: 'al-reem-al-maryah-island' },
      { rank: 4, area: 'Yas Island', value_bn: 7.3, share_pct: 10.4, change_pct: 91, guide: 'yas-island' },
      { rank: 5, area: 'Al Ramhan Island', value_bn: 2.9, share_pct: 4.1, change_pct: null, guide: 'ramhan-island' },
      { rank: 6, area: 'Al Fahid Island', value_bn: 2.9, share_pct: 4.1, change_pct: null, guide: 'fahid-island' },
      { rank: 7, area: 'Ghadeer Al Tayr', value_bn: 2.4, share_pct: 3.4, change_pct: null, guide: 'ghadeer-al-tayr' },
      { rank: 8, area: 'Zayed City', value_bn: 1.9, share_pct: 2.7, change_pct: null, guide: 'zayed-city' },
    ],
  });
  assert.deepEqual(checkAdrecAreas(ADREC, GUIDES.filter((g) => g.emirate === 'abu_dhabi').map((g) => g.slug)), []);
  assert.match(checkAdrecAreas({ ...ADREC, areas: [{ ...ADREC.areas[0], share_pct: 25 }, ADREC.areas[1]] }, ['hudayriyat-island', 'saadiyat-island']).join(), /share_pct 25 does not match/);
  // Rendered at build time on /areas (Abu Dhabi panel): 8 cards, the change table, the n/p note and the report line.
  const m = main('areas.html');
  const panel = m.match(/<div class="mk-panel" data-emirate="abu_dhabi"[\s\S]*?<p class="mk-ask"/)[0];
  assert.equal([...panel.matchAll(/<article class="mk-card">/g)].length, 8);
  const t = text(panel);
  assert.match(t, /#1 Hudayriyat Island AED 19\.0bn 27\.0% of total ≈8×/);
  assert.match(t, /#5 Al Ramhan Island AED 2\.9bn 4\.1% of total change n\/p/);
  assert.match(t, /1 Hudayriyat Island AED 19\.0bn ≈8× 2 Al Reem Island \+ Al Maryah Island AED 10\.5bn \+153% 3 Yas Island AED 7\.3bn \+91% 4 Saadiyat Island AED 13\.3bn \+63%/);
  assert.match(t, /ADREC did not publish a year-on-year change for 4 of the top areas \(n\/p = not published\)\./);
  assert.match(t, /Source: Abu Dhabi Real Estate Centre \(ADREC\), H1 2026 market report \(published 18 Aug 2026\)\. Residential sales value\./);
  assert.match(panel, /href="https:\/\/adrec\.gov\.ae\/-\/media\/adrec\/market-reports\/marketreportslatest\/adrec-h1-2026-spread-3\.pdf"/);
  // And on each Abu Dhabi guide page.
  assert.match(text(main('areas/saadiyat-island.html')), /Jan to Jun 2026 vs Jan to Jun 2025 AED 13\.3bn residential sales value, Jan to Jun 2026 18\.9% of Abu Dhabi's total \+63% Source: Abu Dhabi Real Estate Centre \(ADREC\), H1 2026 market report \(published 18 Aug 2026\)\./);
  assert.match(text(main('areas/zayed-city.html')), /AED 1\.9bn residential sales value, Jan to Jun 2026 2\.7% of Abu Dhabi's total change n\/p/);
});

test('E: Rules 1c only: no #B3261E, no green, no Slate text on light in the market styles', () => {
  const css = src('src/styles/market.css');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'tokens only');
  assert.doesNotMatch(css, /var\(--(sky|ok|wa|err)\)|green/i);
  for (const f of walk(dist).filter((p) => /\.(html|css|js)$/.test(p))) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /#b3261e/i, f);
  }
});

// ---------- F. Area guides ----------
test('F: 16 guides in the approved order; every copy field has no digit except the proper noun "Pier 7"', () => {
  assert.deepEqual(GUIDES.map((g) => g.slug), [
    'downtown-dubai', 'dubai-marina', 'dubai-hills', 'dubai-creek-harbour', 'dubai-islands', 'palm-jumeirah', 'palm-jebel-ali', 'dubai-maritime-city',
    'hudayriyat-island', 'saadiyat-island', 'al-reem-al-maryah-island', 'yas-island', 'ramhan-island', 'fahid-island', 'ghadeer-al-tayr', 'zayed-city',
  ]);
  for (const g of GUIDES) {
    for (const t of [g.h1, g.one_liner, g.what_it_is, g.who_buys, ...g.things_to_consider, g.my_view]) {
      assert.doesNotMatch(t.replace(/\bPier 7\b/g, ''), /\d/, `${g.slug}: ${t.slice(0, 50)}`);
      assert.doesNotMatch(t, /[‘’“”]/, `${g.slug}: straight quotes as approved`);
    }
  }
  assert.deepEqual(Object.fromEntries(GUIDES.filter((g) => g.dld_area).map((g) => [g.slug, g.dld_area])), {
    'downtown-dubai': 'Burj Khalifa', 'dubai-marina': 'Marsa Dubai', 'dubai-hills': 'Hadaeq Sheikh Mohammed Bin Rashid', 'dubai-creek-harbour': 'Al Khairan First',
    'dubai-islands': 'Palm Deira', 'palm-jumeirah': 'Palm Jumeirah', 'palm-jebel-ali': 'Palm Jabal Ali', 'dubai-maritime-city': 'Madinat Dubai Almelaheyah',
  });
});

test('F: every guide page renders the exact approved copy in the template order, title and meta from the copy', () => {
  for (const g of GUIDES) {
    const h = read(`areas/${g.slug}.html`);
    const m = main(`areas/${g.slug}.html`);
    const t = text(m);
    assert.match(h, new RegExp(`<title>${g.h1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · Sharjeel Hashmat</title>`), g.slug);
    // The meta description is the one-liner, or its shorter meta_description when the one-liner is over 160 characters.
    assert.equal(h.match(/<meta name="description" content="([^"]*)">/)[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"'), g.meta_description ?? g.one_liner, g.slug);
    assert.ok(g.one_liner.length <= 160 || g.meta_description, `${g.slug}: one-liner over 160 characters needs meta_description`);
    const emirate = g.emirate === 'dubai' ? 'Dubai' : 'Abu Dhabi';
    const expected = [
      `Area guide · ${emirate}`, g.h1, g.one_liner,
      'What it is', g.what_it_is, 'Who buys here', g.who_buys, 'Things to consider', ...g.things_to_consider,
      'My view, October 2026', g.my_view, `Ask me about ${g.h1}.`,
    ];
    let at = 0;
    for (const piece of expected) {
      const i = t.indexOf(piece, at);
      assert.ok(i >= 0, `${g.slug}: missing or out of order: ${piece.slice(0, 60)}`);
      at = i + piece.length;
    }
    assert.match(m, new RegExp(`<p class="lede guide-close"[^>]*><a href="/contact"[^>]*>Ask me</a> about ${g.h1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.</p>`), g.slug);
    assert.match(m, new RegExp(`<p class="lede"[^>]*>`), g.slug);
    assert.equal([...m.matchAll(/<h2[ >]/g)].length, 4, `${g.slug}: four H2s`);
    assert.equal([...m.matchAll(/<li[ >]/g)].length, g.things_to_consider.length, `${g.slug}: bullets`);
  }
});

test('F: the live figures card: Dubai loads /market/area/<DLD area> for the /areas period; hidden when there is no data', () => {
  for (const g of GUIDES.filter((x) => x.emirate === 'dubai')) {
    const m = main(`areas/${g.slug}.html`);
    assert.match(m, new RegExp(`<div class="mk-guide-card" id="guide-figures" hidden data-worker="https://ck-lead-worker\\.sharjeelhashmat\\.workers\\.dev" data-area="${g.dld_area}" data-period="${ADREC.period}"`), g.slug);
  }
  for (const g of GUIDES.filter((x) => x.emirate === 'abu_dhabi')) {
    const listed = ADREC.areas.some((a) => a.guide === g.slug);
    assert.equal(main(`areas/${g.slug}.html`).includes('class="mk-guide-card"'), listed, g.slug);
  }
  const card = text(renderGuideCard('abu_dhabi', { period: '2026-H1', published: '2026-08-21', area: { rank: 2, area: 'Saadiyat Island', value_bn: 13.3, share_pct: 18.9, change_pct: 63 } }));
  assert.match(card, /Jan to Jun 2026 vs Jan to Jun 2025 AED 13\.3bn residential sales value, Jan to Jun 2026 18\.9% of Abu Dhabi's total \+63%/);
  const dubai = text(renderGuideCard('dubai', { period: '2026-H1', dldArea: 'Burj Khalifa', area: { rank: 9, area: 'Burj Khalifa', value_bn: 5.04, share_pct: 2.8, change_pct: -31 } }));
  assert.match(dubai, /AED 5\.0bn residential sales value, Jan to Jun 2026 2\.8% of Dubai's total −31%/);
  assert.match(dubai, /Residential sales value for the DLD area Burj Khalifa\./);
});

test('F: the old placeholder sections and the old "Ask Sharjeel about" line are gone everywhere', () => {
  for (const f of walk(dist).filter((p) => /\.(html|js|txt|xml)$/.test(p))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /Ask Sharjeel for current data on this|Ask Sharjeel about/, f);
  }
  // The six old section labels, on the area pages (the Terms page legitimately mentions "Sharjeel's View" of a property).
  for (const f of walk(join(dist, 'areas'))) {
    assert.doesNotMatch(text(readFileSync(f, 'utf8')), /Who Buys Here|Price Range|Rental Profile|Investment Case|Things to Consider|Sharjeel's View/, f);
  }
  assert.equal(GUIDES.length, 16);
  for (const g of GUIDES) assert.ok(existsSync(join(dist, 'areas', `${g.slug}.html`)), g.slug);
});

// ---------- A. /new-launches panel ----------
test('A.8: Launch activity panel: under the hero, hidden by default, both cards / one full-width card / hidden; exact wording', () => {
  const m = main('new-launches.html');
  assert.ok(m.indexOf('id="launch-activity"') > m.indexOf('Ask me about a launch →') && m.indexOf('id="launch-activity"') < m.indexOf('Why a launch needs a different check'));
  assert.match(m, /<section class="launch-activity"[^>]*id="launch-activity" hidden/);
  // Owner decision 2026-10-17: the figures update weekly, and the page says so (the as-of dates stay in the source lines).
  assert.match(text(m), /Updated weekly\. Want to know what they mean for a specific launch\? Ask me\./);
  for (const f of htmlFiles) assert.doesNotMatch(readFileSync(f, 'utf8'), /update automatically|updated daily/i, f);
  assert.match(m, /<a href="#ask"[^>]*>Ask me<\/a>\./);
  const dubai = { new_projects_90d: 12, top_areas_90d: [{ area_en: 'Palm Deira', label: 'Dubai Islands', count: 4 }, { area_en: 'Business Bay', label: null, count: 3 }], active_projects: 1, pipeline_units: 52000, as_of: '2026-10-16', source_url: 'https://data.dubai/en/l/467654' };
  const ad = { transaction_value_bn: 117.04, sales_value_bn: 86.1, mortgage_value_bn: 25.5, year: 2026, as_of: '2026-10-16', source_url: 'https://adrec.gov.ae/en' };
  const both = renderLaunchPanel({ dubai, abu_dhabi: ad }, '2026-10-17');
  assert.match(both, /class="mk-launch-grid"/);
  const t = text(both);
  assert.match(t, /Dubai 12 new projects registered in the 90 days to Oct 2026 Top areas Palm Deira Dubai Islands 4 Business Bay 3 1 active project 52,000 units across active projects/);
  assert.match(t, /Abu Dhabi AED 86\.1bn in sales, 2026 to date AED 117\.0bn total transactions AED 25\.5bn mortgages/);
  assert.match(t, /Source: Dubai Land Department, Real Estate Projects open data via Data\.Dubai \(Open Data Licence\), as of Oct 2026\./);
  assert.match(renderLaunchPanel({ dubai: null, abu_dhabi: ad }, '2026-10-17'), /mk-launch-grid mk-launch-grid--one/);
  assert.equal(renderLaunchPanel(null), '');
  // No project names or developer names reach the panel: the Worker sends area counts only.
  assert.doesNotMatch(src('src/lib/market.mjs'), /project_name|developer/);
});

test('A.8 freshness: the Dubai card shows the month its data is from, hides past 120 days, "new projects" only when > 0', () => {
  const ad = { transaction_value_bn: 117.04, sales_value_bn: 86.1, mortgage_value_bn: 25.5, year: 2026, as_of: '2026-10-17', source_url: 'https://adrec.gov.ae/en' };
  // The real case on 2026-10-17: the projects file was loaded in June, nothing started in the 90 days to its load date.
  const june = { new_projects_90d: 0, top_areas_90d: [], active_projects: 865, pipeline_units: 52000, as_of: '2026-06-20', source_url: 'https://data.dubai/en/l/467654' };
  const shown = text(renderLaunchPanel({ dubai: june, abu_dhabi: ad }, '2026-10-17')); // 119 days old
  assert.match(shown, /Dubai 865 active projects 52,000 units across active projects Source: Dubai Land Department, Real Estate Projects open data via Data\.Dubai \(Open Data Licence\), as of Jun 2026\./);
  assert.doesNotMatch(shown, /new project|17 Oct 2026 \.|20 Jun/);
  assert.match(text(renderLaunchPanel({ dubai: { ...june, as_of: '2026-06-19' }, abu_dhabi: ad }, '2026-10-17')), /^\s*Dubai /); // 120 days: shown
  // 121 days: no Dubai card, Abu Dhabi alone at full width (no empty column).
  const stale = renderLaunchPanel({ dubai: { ...june, as_of: '2026-06-18', new_projects_90d: 3 }, abu_dhabi: ad }, '2026-10-17');
  assert.match(stale, /^<div class="mk-launch-grid mk-launch-grid--one"><article class="mk-launch"><h3>Abu Dhabi<\/h3>/);
  assert.doesNotMatch(stale, /Dubai Land Department|<h3>Dubai/);
  assert.equal(renderLaunchPanel({ dubai: { ...june, as_of: '2026-06-18' }, abu_dhabi: null }, '2026-10-17'), '');
  // "new projects" appears only when there are some in the 90 days ending at the data's date.
  assert.match(text(renderLaunchPanel({ dubai: { ...june, new_projects_90d: 1 }, abu_dhabi: null }, '2026-10-17')), /^\s*Dubai 1 new project registered in the 90 days to Jun 2026 865 active projects/);
  // The month comes from the data, never a constant: the same card dated in March says Mar.
  assert.match(text(renderLaunchPanel({ dubai: { ...june, new_projects_90d: 2, as_of: '2026-03-31' }, abu_dhabi: null }, '2026-04-02')), /2 new projects registered in the 90 days to Mar 2026/);
  assert.equal(fmtMonth('2026-06-20'), 'Jun 2026');
  assert.equal(fmtMonth('bad'), '');
});

// ---------- Whole build ----------
test('build: the words EXAMPLE and MOCK are absent; "no data", "loading" and spinners never ship', () => {
  for (const f of walk(dist).filter((p) => /\.(html|js|css|txt|xml|json)$/.test(p))) {
    const raw = readFileSync(f, 'utf8');
    assert.doesNotMatch(raw, /EXAMPLE|MOCK/, f);
    if (f.endsWith('.html')) {
      const t = text(raw);
      assert.doesNotMatch(t, /\bmock\b|\bno data\b|\bloading\b/i, f);
      assert.doesNotMatch(raw, /spinner/i, f);
    }
  }
});
