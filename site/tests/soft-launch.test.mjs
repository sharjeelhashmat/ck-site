// Soft launch guard (Rules v5.9 section 8d, owner 2026-11-05). Run after `npm run build`.
// With golive.ts softLaunch true (LEAD_CAPTURE false) the built site must have no lead capture, no legal pages and no
// agency: no <form>, no wa.me link, no Turnstile script or widget, no form script, no link to /privacy or /terms, no
// call-to-action button to /contact or #ask, no agency name, ORN, BRN, advertiser permit, Media Council or Trakheesi text,
// and no Privacy, Terms or Investor Profile page (not built, not in the sitemap). The guard is run on a lead-capture build
// too, where it must find each kind of problem, so it can never pass by matching nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD, leadCaptureDist } from './helpers/build-mode.mjs';
import { goLiveMissing, GOLIVE, LEAD_CAPTURE } from '../src/lib/golive.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const rel = (d, f) => relative(d, f).split(sep).join('/');
const textOf = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// Names are assembled from parts so a repository search for them stays empty (as tests/site.test.mjs does).
const AGENCY_NAMES = [new RegExp('alk' + 'ira', 'i'), new RegExp('roy' + 'als', 'i')];
// Agency and permit text. "Permit <number>" needs a digit, so the area guides' "holiday home permit from Dubai's
// Department of Economy" (owner-approved copy about short-stay letting) is not a match.
const AGENCY_TEXT = [
  ['ORN', /\bORN\b/],
  ['BRN', /\bBRN\b/],
  ['advertiser permit', /advertiser permit/i],
  ['Media Council', /media council/i],
  ['Trakheesi', /trakheesi/i],
  ['Permit <number>', /\bpermit(?:\s+(?:no\.?|number))?\s*:?\s+[A-Z0-9-]*\d/i],
  ['agency name', AGENCY_NAMES[0]],
  ['previous agency name', AGENCY_NAMES[1]],
];

/** Every soft-launch problem in a built site, as "<file>: <what>". */
export function softLaunchProblems(dir) {
  const out = [];
  const files = walk(dir);
  const pages = files.filter((f) => f.endsWith('.html'));
  const js = new Map(files.filter((f) => f.endsWith('.js')).map((f) => ['/' + rel(dir, f), readFileSync(f, 'utf8')]));
  for (const f of pages) {
    const h = readFileSync(f, 'utf8');
    const r = rel(dir, f);
    if (/<form\b/i.test(h)) out.push(`${r}: a <form> element`);
    if (/wa\.me\/|api\.whatsapp\.com|wa\.link\//i.test(h)) out.push(`${r}: a WhatsApp link`);
    if (/challenges\.cloudflare\.com|data-sitekey=|class="(turnstile|nl-turnstile)"/.test(h)) out.push(`${r}: Turnstile`);
    if (/ck_attr|data-newsletter|id="lead-form"|id="profile-form"/.test(h)) out.push(`${r}: a form script or form markup`);
    if (/href="(https:\/\/www\.sharjeelhashmat\.com)?\/(privacy|terms)(\.html)?["#?]/.test(h)) out.push(`${r}: a link to /privacy or /terms`);
    if (/href="(https:\/\/www\.sharjeelhashmat\.com)?\/investor-profile/.test(h)) out.push(`${r}: a link to /investor-profile`);
    // The 404 page's "Contact" button is navigation, kept on purpose (owner 2026-11-05); every other button to /contact or
    // #ask asks the visitor to enquire.
    const ctas = [...h.matchAll(/<a class="btn[^"]*" href="(\/contact[^"]*|#ask)"[^>]*>([^<]*)<\/a>/g)].filter((m) => !(r === '404.html' && m[1] === '/contact' && m[2] === 'Contact'));
    if (ctas.length || /href="\/contact\?intent=/.test(h)) out.push(`${r}: a call to action to enquire`);
    if (/Request the Compass Key Brief/i.test(h)) out.push(`${r}: the Design System sample button`);
    // Scripts the page loads: none may carry Turnstile or post to the lead Worker's form routes.
    for (const m of h.matchAll(/<script[^>]*\bsrc="(\/_astro\/[^"]+)"/g)) {
      const s = js.get(m[1]) ?? '';
      if (/challenges\.cloudflare\.com|\/api\/newsletter\/subscribe|\/lead`|\/profile`/.test(s)) out.push(`${r}: loads form script ${m[1]}`);
    }
    // Agency, ORN, BRN and permit: in the visible text, the attributes and the JSON-LD.
    const t = `${textOf(h)} ${h.match(/<head>[\s\S]*<\/head>/)?.[0] ?? ''}`;
    for (const [label, re] of AGENCY_TEXT) if (re.test(t)) out.push(`${r}: ${label}`);
    for (const m of h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
      const ld = JSON.stringify(JSON.parse(m[1]));
      if (/RealEstateAgent|"worksFor"|"identifier"/.test(ld)) out.push(`${r}: agency, BRN or permit in the JSON-LD`);
    }
  }
  for (const p of ['privacy.html', 'terms.html', 'investor-profile.html']) if (existsSync(join(dir, p))) out.push(`${p}: built`);
  for (const f of files.filter((x) => /sitemap.*\.xml$/.test(x))) {
    if (/\/(privacy|terms|investor-profile)</.test(readFileSync(f, 'utf8'))) out.push(`${rel(dir, f)}: lists a page that is not built`);
  }
  for (const f of files.filter((x) => /\.(txt|xml)$/.test(x))) {
    const t = readFileSync(f, 'utf8');
    for (const re of AGENCY_NAMES) if (re.test(t)) out.push(`${rel(dir, f)}: agency name`);
  }
  return out;
}

test('golive.ts: soft launch is the committed state, lead capture follows it, and a public build needs only indexing', () => {
  assert.equal(LEAD_CAPTURE, !GOLIVE.softLaunch);
  assert.deepEqual(goLiveMissing({ ...GOLIVE, softLaunch: true, indexing: true }), []);
  assert.deepEqual(goLiveMissing({ ...GOLIVE, softLaunch: true, indexing: false }), ['indexing']);
  // Outside soft launch the full list is unchanged.
  const empty = { agencyName: '', agencyOrn: '', agencyAddress: '', brokerBrn: '', advertiserPermitNo: '', abuDhabiLicensed: false };
  assert.deepEqual(goLiveMissing({ ...empty, indexing: false, softLaunch: false }), ['indexing', 'agencyName', 'agencyOrn', 'brokerBrn', 'advertiserPermitNo']);
  assert.deepEqual(goLiveMissing({ ...empty, indexing: true, softLaunch: false, agencyName: 'A', agencyOrn: '1', brokerBrn: '2', advertiserPermitNo: '3' }), []);
  // The committed values (agency empty, softLaunch and indexing true): tests/finish-all.test.mjs "B: golive.ts ships ...".
});

test('soft launch guard: the build under test has no lead capture, no legal pages and no agency (or, with lead capture, skips)', () => {
  if (BUILD.leadCapture) return;
  assert.deepEqual(softLaunchProblems(dist), []);
});

test('soft launch guard: the same check finds every kind of problem in a lead-capture build, so it cannot pass vacuously', () => {
  const found = softLaunchProblems(leadCaptureDist().dir).join('\n');
  for (const want of ['contact.html: a <form> element', 'index.html: a WhatsApp link', 'contact.html: Turnstile', 'contact.html: a form script or form markup',
    'index.html: a link to /privacy or /terms', 'index.html: a call to action to enquire', 'contact.html: loads form script', 'privacy.html: built', 'terms.html: built', 'investor-profile.html: built']) {
    assert.ok(found.includes(want), `the guard must report "${want}"`);
  }
});

test('soft launch guard: agency, ORN, BRN, permit, Media Council and Trakheesi text is caught; the holiday home permit copy is not', () => {
  const probe = (s) => AGENCY_TEXT.filter(([, re]) => re.test(s)).map(([l]) => l);
  assert.deepEqual(probe('Working with Example Agency · ORN 12345 · BRN 67890'), ['ORN', 'BRN']);
  assert.deepEqual(probe('UAE Media Council advertiser permit 123'), ['advertiser permit', 'Media Council', 'Permit <number>']);
  assert.deepEqual(probe('Permit 71234 and its QR code'), ['Permit <number>']);
  assert.deepEqual(probe('Permit no. TEST-1'), ['Permit <number>']);
  assert.deepEqual(probe('its Trakheesi number'), ['Trakheesi']);
  assert.deepEqual(probe('ALK' + 'IRA Real Estate'), ['agency name']);
  assert.deepEqual(probe('ROY' + 'ALS Field'), ['previous agency name']);
  assert.deepEqual(probe("Short-stay letting needs a holiday home permit from Dubai's Department of Economy and Tourism."), []);
  assert.deepEqual(probe('Corner unit, born and raised, Bornholm'), [], 'whole words only');
});

test('soft launch: Privacy, Terms and the Investor Profile are not built and not in the sitemap; robots and noindex follow the mode', () => {
  if (BUILD.leadCapture) return;
  for (const p of ['privacy.html', 'terms.html', 'investor-profile.html']) assert.equal(existsSync(join(dist, p)), false, p);
  const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
  const headers = readFileSync(join(dist, '_headers'), 'utf8');
  const pages = walk(dist).filter((f) => f.endsWith('.html'));
  if (BUILD.indexable) {
    // Public: robots Allow with the sitemap, no X-Robots-Tag, the home page index,follow, the sitemap without gated pages.
    assert.equal(robots, 'User-agent: *\nAllow: /\n\nSitemap: https://www.sharjeelhashmat.com/sitemap-index.xml\n');
    assert.doesNotMatch(headers, /X-Robots-Tag/i);
    assert.match(readFileSync(join(dist, 'index.html'), 'utf8'), /<meta name="robots" content="index,follow,max-image-preview:large">/);
    const sitemap = readFileSync(join(dist, 'sitemap-0.xml'), 'utf8');
    assert.doesNotMatch(sitemap, /\/(privacy|terms|investor-profile)</);
    for (const p of ['/about', '/contact', '/faq', '/areas', '/buy', '/invest', '/sell', '/investment-approach']) assert.match(sitemap, new RegExp(`${p}<`), p);
    // Only the pages that are noindex by their own content rule (thin, data-gated, 404) carry noindex.
    const noindex = pages.filter((f) => /content="noindex/.test(readFileSync(f, 'utf8'))).map((f) => rel(dist, f)).sort();
    // (/insights and its articles until three are published, decision 5; /projects and its trackers until one is current.)
    for (const f of noindex) assert.match(f, /^(404|new-launches|insights|opportunities|projects)(\.html$|\/)/, `${f}: unexpected noindex on the public build`);
    assert.ok(!noindex.some((f) => /^(index|about|contact|faq|buy|invest|sell|investment-approach|areas)\.html$/.test(f)), 'core pages are indexable');
  } else {
    assert.equal(robots, 'User-agent: *\nAllow: /\n');
    assert.match(headers, /^ {2}X-Robots-Tag: noindex$/m);
    for (const f of pages) assert.match(readFileSync(f, 'utf8'), /<meta name="robots" content="noindex,nofollow">/, f);
    assert.deepEqual(readdirSync(dist).filter((f) => /sitemap/.test(f)), []);
  }
});

test('soft launch: /contact and the footer keep the phone and email as plain tel: and mailto: links', () => {
  if (BUILD.leadCapture) return;
  const tel = '<a href="tel:+971555414468">+971 55 541 4468</a>';
  const mail = '<a href="mailto:hello@sharjeelhashmat.com">hello@sharjeelhashmat.com</a>';
  const contact = readFileSync(join(dist, 'contact.html'), 'utf8');
  const main = contact.match(/<main id="main">([\s\S]*?)<\/main>/)[1];
  assert.ok(main.includes(tel) && main.includes(mail), '/contact main');
  for (const f of walk(dist).filter((x) => x.endsWith('.html'))) {
    const footer = readFileSync(f, 'utf8').match(/<footer class="site-footer"[\s\S]*<\/footer>/)?.[0] ?? '';
    assert.ok(footer.includes(tel) && footer.includes(mail), `${f}: footer`);
    assert.match(footer, /<a href="\/faq">FAQ<\/a>/, `${f}: footer FAQ`);
  }
});
