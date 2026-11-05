// Brand v3.0 (Notion 1c v5.0, 2026-10-10): "Property Consultant" title, Navigator logo, icons, share image. Colours: Rules 1c
// v6.0 (owner "EXECUTE v2 colours, background C", 2026-11-05): Deep Navy, Night, Sky, Mist, Ivory, Slate.
// Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { BUILD, PERSON_IDS, leadCaptureDist } from './helpers/build-mode.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));
const textFiles = walk(dist).filter((f) => /\.(html|txt|xml|js|json|css)$/.test(f));
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

// Retired by Rules 1c v6.0: Ink, Brass, Brass Deep, Slate (v5) and Slate Light, and the v5 tints Line and Brass tint. Written in
// two parts so that a search of site/ for a retired colour finds nothing, this file included. Ivory #F3F0E7 is kept.
const RETIRED = [['#1425', '2F'], ['#C6A2', '72'], ['#7E60', '34'], ['#6279', '82'], ['#8FA3', 'AB'], ['#CFD2', 'CE'], ['#ECE4', 'D5']].map(([a, b]) => a + b);
// The v6.0 palette (lower case, as in global.css).
const PALETTE = { navy: '#0c3b6e', night: '#071e38', sky: '#5b9bd5', mist: '#eef4fb', ivory: '#f3f0e7', slate: '#6b7a90' };

test('title: no "Real Estate Consultant" anywhere in the build, and "Property Consultant" is shown', () => {
  for (const f of textFiles) assert.doesNotMatch(readFileSync(f, 'utf8'), /real estate consultant/i, f);
  const home = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.match(home, /<title>Sharjeel Hashmat, Property Consultant · UAE<\/title>/);
  for (const f of htmlFiles) assert.match(readFileSync(f, 'utf8'), /<span>Property Consultant · UAE<\/span>/, `${f}: footer title line`);
  assert.match(readFileSync(join(dist, 'llms.txt'), 'utf8'), /Title: Property Consultant · UAE/);
});

test('JSON-LD: a Person with jobTitle "Property Consultant · UAE" on every page (audit item 16)', () => {
  for (const f of htmlFiles) {
    const m = readFileSync(f, 'utf8').match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    assert.ok(m, `${f}: JSON-LD`);
    const ld = JSON.parse(m[1]);
    const person = ld['@graph'] ? ld['@graph'].find((n) => n['@type'] === 'Person') : ld;
    assert.equal(person['@type'], 'Person', f);
    assert.equal(person.jobTitle, 'Property Consultant · UAE', f);
    assert.equal(person.url, 'https://www.sharjeelhashmat.com/', f);
    assert.deepEqual(person.sameAs, ['https://www.instagram.com/sharjeelhashmat', 'https://www.linkedin.com/in/sharjeel-hashmat-16944322'], f);
    // No agency address in either test mode: no agency node, so no ORN. The BRN and permit only as this build's
    // go-live values put them on the Person (none with the committed empty values).
    assert.doesNotMatch(m[1], /RealEstateAgent|"ORN"/, f);
    assert.deepEqual((person.identifier ?? []).map((i) => [i.name, i.value]), PERSON_IDS, f);
    if (!PERSON_IDS.length) assert.doesNotMatch(m[1], /"BRN"/, f);
  }
});

test('icons: no favicon.svg; ico, 32, 48 and apple-touch links; theme-color is Night (the header colour)', () => {
  assert.equal(existsSync(join(dist, 'favicon.svg')), false, 'favicon.svg is gone');
  for (const p of ['favicon.ico', 'icon-32.png', 'icon-48.png', 'apple-touch-icon.png']) assert.ok(existsSync(join(dist, p)), p);
  for (const f of htmlFiles) {
    const h = readFileSync(f, 'utf8');
    assert.doesNotMatch(h, /favicon\.svg/, `${f}: favicon.svg reference`);
    assert.match(h, /<link rel="icon" href="\/favicon\.ico" sizes="32x32">/, `${f}: ico`);
    assert.match(h, /<link rel="icon" type="image\/png" sizes="32x32" href="\/icon-32\.png">/, `${f}: 32`);
    assert.match(h, /<link rel="icon" type="image\/png" sizes="48x48" href="\/icon-48\.png">/, `${f}: 48`);
    assert.match(h, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/, `${f}: apple-touch`);
    assert.match(h, /<meta name="theme-color" content="#071E38">/, `${f}: theme-color`);
  }
});

test('logo: header and footer use the ivory web lockup with alt and explicit size; the old mark is gone', () => {
  const img = /<img class="logo" src="\/logo-web-ivory\.svg" alt="Sharjeel Hashmat" width="\d+" height="\d+"/;
  for (const f of htmlFiles) {
    const h = readFileSync(f, 'utf8');
    const header = h.match(/<header class="site-nav"[^>]*>.*?<\/header>/s)?.[0] ?? '';
    const footer = h.match(/<footer class="site-footer"[^>]*>.*?<\/footer>/s)?.[0] ?? '';
    assert.match(header, img, `${f}: header logo`);
    assert.match(footer, img, `${f}: footer logo`);
    assert.doesNotMatch(h, /viewBox="0 0 34 34"/, `${f}: old Compass Key mark`);
  }
  assert.equal(existsSync(join(root, 'src/components/Mark.astro')), false, 'old mark component removed');
  assert.doesNotMatch(css, /--logo-h/, 'the v3.0 negative-margin crop is gone');
});

// The web lockups are the approved horizontal logos with five edits (tagline and metadata removed, wordmark and rule moved
// up, cropped to viewBox "205 225 2480 510"), then run through svgo --multipass (audit item 20: 25 KB to 9.4 KB each; the
// rendering differs only in anti-aliasing at 300 dpi). Their bytes are pinned with the other brand files below.
test('web logo lockups: the cropped horizontal logo, optimised, with no tagline or metadata', () => {
  for (const v of ['ink', 'ivory']) {
    const web = readFileSync(join(root, `public/logo-web-${v}.svg`), 'utf8');
    assert.match(web, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="2480" height="510" viewBox="205 225 2480 510">/);
    assert.doesNotMatch(web, /translate\(861\.55 640|<metadata|c2pa/, `logo-web-${v}.svg: tagline and metadata removed`);
    assert.ok(web.length < 12_000, `logo-web-${v}.svg is optimised (${web.length} bytes)`);
    assert.equal(readFileSync(join(dist, `logo-web-${v}.svg`), 'utf8'), web, `dist/logo-web-${v}.svg`);
  }
});

test('share image: /og.png at 1200x630, declared in og and twitter tags', () => {
  const png = readFileSync(join(dist, 'og.png'));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  assert.ok(png.length < 150 * 1024, `og.png is under 150 KB (${png.length} bytes)`);
  for (const f of htmlFiles) {
    const h = readFileSync(f, 'utf8');
    assert.match(h, /<meta property="og:image" content="https:\/\/www\.sharjeelhashmat\.com\/og\.png">/, `${f}: og:image`);
    assert.match(h, /<meta property="og:image:width" content="1200">/, `${f}: og:image:width`);
    assert.match(h, /<meta property="og:image:height" content="630">/, `${f}: og:image:height`);
    assert.match(h, /<meta name="twitter:image" content="https:\/\/www\.sharjeelhashmat\.com\/og\.png">/, `${f}: twitter:image`);
    assert.match(h, /<meta property="og:image:alt" content="Sharjeel Hashmat, Property Consultant · UAE">/, `${f}: og:image:alt`);
  }
});

// Every text file under site/ except node_modules, the build output, docs/ (history and screenshot folders) and caches.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'docs', '.astro', 'lhci', '.lighthouseci']);
const walkSite = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (SKIP_DIRS.has(e.name) ? [] : walkSite(join(d, e.name))) : [join(d, e.name)]));
const siteTextFiles = () => walkSite(root)
  .filter((f) => /\.(astro|css|ts|mts|mjs|js|cjs|json|jsonc|svg|html|txt|md|xml|webmanifest)$|[\\/]_(headers|redirects)$/.test(f));

test('tokens: no retired colour anywhere in site/ (outside docs/) or in the build; palette values are the v6.0 ones', () => {
  const files = siteTextFiles();
  assert.ok(files.some((f) => f.endsWith('global.css')) && files.some((f) => f.endsWith('logo-web-ink.svg')), 'the scan covers src/ and public/');
  for (const hex of RETIRED) {
    const re = new RegExp(hex + '(?![0-9a-f])', 'i');
    for (const f of [...files, ...textFiles]) assert.doesNotMatch(readFileSync(f, 'utf8'), re, `${f}: ${hex}`);
  }
  for (const [name, value] of Object.entries(PALETTE)) assert.match(css, new RegExp(`--${name}: ${value};`), `--${name}`);
  // Tokens are named by role; the v5 names (which now mislead) are gone everywhere in src/.
  for (const f of files.filter((x) => /[\\/]src[\\/]/.test(x))) {
    // A use (var(--x)) or a definition (--x:); class names such as way--ink are not tokens.
    assert.doesNotMatch(readFileSync(f, 'utf8'), /var\(\s*--(ink|gold|brass-deep|slate-light|muted|navy-deep|brass-tint|cloud)\s*[,)]|(^|[\s;{])--(ink|gold|brass-deep|slate-light|muted|navy-deep|brass-tint|cloud)\s*:/m, `${f}: retired token name`);
  }
});

// Night surfaces: header, hero, the Night "four ways" cards, the dark band, the footer and the footer newsletter.
// Sky is text only inside them (2.6:1 on Ivory; 5.67:1 on Night).
const NIGHT_SURFACE = /^(\.band--navy|\.hero|\.site-nav|\.site-footer|(\.card)?\.way--ink|\.nl--footer)\b/;
const styleSources = () => [
  ['global.css', css],
  ['market.css', readFileSync(join(root, 'src/styles/market.css'), 'utf8')],
  ...walk(join(root, 'src')).filter((f) => f.endsWith('.astro')).map((f) => [f, (readFileSync(f, 'utf8').match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? []).join('\n')]),
];
test('Sky is text only on Night: every `color: var(--sky)` rule is scoped to a Night surface, and no inline style sets it', () => {
  let n = 0;
  for (const [file, text] of styleSources()) {
    for (const [, sel, body] of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/(^|[;\s])color:\s*var\(--sky\)/.test(body)) continue;
      n++;
      for (const s of sel.split(',')) assert.match(s.trim(), NIGHT_SURFACE, `${file}: Sky text outside a Night surface: ${s.trim()}`);
    }
  }
  assert.ok(n > 0);
  for (const f of walk(join(root, 'src')).filter((p) => /\.(astro|mjs|ts)$/.test(p))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /style="[^"]*(?<![-\w])color:\s*var\(--sky\)/, `${f}: inline Sky text`);
  }
});

// WCAG 2.x contrast from the token values in global.css (Rules 1c v6.0 pairs).
const hexOf = (name) => css.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))[1];
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [x, y] = [lum(hexOf(a)), lum(hexOf(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('contrast: Night on Ivory 14.7, Deep Navy on Ivory 9.9, Mist on Night 15.2, Sky on Night 5.67; Sky and Slate below 4.5 on Ivory', () => {
  const r = (a, b, d = 1) => Number(contrast(a, b).toFixed(d));
  assert.equal(r('night', 'ivory'), 14.7);
  assert.equal(r('navy', 'ivory'), 9.9);
  assert.equal(r('mist', 'night'), 15.2);
  assert.equal(r('sky', 'night', 2), 5.67);
  // Why Sky is never text on Ivory and Slate only at 24px+ or 19px bold.
  assert.equal(r('sky', 'ivory'), 2.6);
  assert.equal(r('slate', 'ivory'), 3.8);
  // Pairs the site uses beyond those: white cards, buttons on light and on Night.
  for (const [a, b] of [['night', 'paper'], ['navy', 'paper'], ['mist', 'navy'], ['night', 'sky'], ['navy', 'sky-tint'], ['night', 'band']]) {
    assert.ok(contrast(a, b) >= 4.5, `${a} on ${b}: ${contrast(a, b).toFixed(2)}`);
  }
  // Deep Navy is not a button colour on Night (1.5:1): on Night the primary button is the Sky accent.
  assert.ok(contrast('navy', 'night') < 3);
  assert.match(css, /\.hero \.btn, \.band--navy \.btn, \.site-footer \.btn \{ background: var\(--sky\); border-color: var\(--sky\); color: var\(--night\); \}/);
  assert.match(css, /\.btn \{[^}]*border: 1\.5px solid var\(--navy\); background: var\(--navy\); color: var\(--mist\);/);
});

test('no hex colour outside the token block: global.css, components, layouts and pages', () => {
  const outside = css.replace(/:root\s*\{[^}]*\}/, '');
  assert.doesNotMatch(outside, /#[0-9a-f]{3,8}\b/i, 'global.css outside :root');
  // In components and pages a hex colour can only appear in a style declaration or an SVG paint attribute.
  const colour = /(?:color|background|border|outline|fill|stroke|shadow)[^;{}"]*#[0-9a-f]{3,8}\b|(?:fill|stroke|stop-color)="#[0-9a-f]{3,8}"/i;
  for (const f of walk(join(root, 'src')).filter((p) => /\.astro$/.test(p))) {
    const t = readFileSync(f, 'utf8').replace('<meta name="theme-color" content="#071E38" />', '');
    assert.doesNotMatch(t, colour, `${f}: hex colour`);
  }
});

const page = (p, dir = dist) => readFileSync(join(dir, p), 'utf8');
// The nav WhatsApp link and the linked "four ways" cards exist only with lead capture (golive.ts LEAD_CAPTURE): checked on a
// lead-capture build (site/dist when it has it); soft launch (site/dist otherwise) has neither.
const LEAD = leadCaptureDist().dir;
const leadHtmlFiles = walk(LEAD).filter((f) => f.endsWith('.html'));
const navOf = (h) => h.match(/<nav class="site-menu"[^>]*>.*?<\/nav>/s)?.[0] ?? '';
const linksIn = (html, cls) => [...(html.match(new RegExp(`<div class="${cls}"[^>]*>(.*?)</div>`, 's'))?.[1] ?? '').matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);

test('nav: one Primary nav with the segmented, pill and plain groups plus WhatsApp (soft launch: no WhatsApp)', () => {
  for (const f of [...new Set([...htmlFiles, ...leadHtmlFiles])]) {
    const lead = f.startsWith(LEAD + '/') || BUILD.leadCapture;
    const nav = navOf(readFileSync(f, 'utf8'));
    assert.ok(nav, `${f}: primary nav`);
    assert.deepEqual(linksIn(nav, 'nav-seg'), [['/buy', 'Buy'], ['/invest', 'Invest'], ['/sell', 'Sell']], `${f}: segmented group`);
    assert.deepEqual(linksIn(nav, 'nav-pills'), [['/areas', 'Areas'], ['/new-launches', 'New Launches'], ['/insights', 'Insights']], `${f}: pill group`);
    assert.deepEqual(linksIn(nav, 'nav-plain'), [['/about', 'About'], ['/contact', 'Contact']], `${f}: plain group`);
    if (lead) assert.match(nav, /<a class="nav-wa" href="https:\/\/wa\.me\/[^"]+" target="_blank" rel="noopener">WhatsApp<\/a>/, `${f}: WhatsApp`);
    else assert.doesNotMatch(nav, /nav-wa|wa\.me|WhatsApp/, `${f}: soft launch, no WhatsApp in the nav`);
    assert.match(readFileSync(f, 'utf8'), /aria-controls="site-menu"/, `${f}: menu button controls the nav`);
  }
});

test('nav: at most one aria-current link per page, and Buy/Invest/Sell mark their own segment', () => {
  for (const f of htmlFiles) assert.ok((readFileSync(f, 'utf8').match(/aria-current="page"/g) ?? []).length <= 1, `${f}: aria-current count`);
  for (const [file, href] of [['buy.html', '/buy'], ['invest.html', '/invest'], ['sell.html', '/sell']]) {
    const nav = navOf(page(file));
    const seg = nav.match(/<div class="nav-seg"[^>]*>(.*?)<\/div>/s)[1];
    assert.match(seg, new RegExp(`<a href="${href}" aria-current="page">`), `${file}: own segment current`);
    assert.equal((page(file).match(/aria-current="page"/g) ?? []).length, 1, `${file}: exactly one`);
  }
  assert.equal((page('index.html').match(/aria-current="page"/g) ?? []).length, 0, 'home: no segment active');
  assert.match(navOf(page('areas.html')), /<a href="\/areas" aria-current="page">/, 'areas: own pill current');
});

test('trust strip: four chips, none of them links', () => {
  const trust = page('index.html').match(/<div class="wrap trust"[^>]*>(.*?)<\/div>/s)?.[1] ?? '';
  assert.deepEqual([...trust.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]), ['UAE Real Estate', 'Buyer Representation', 'Investment Analysis', 'International Clients']);
  assert.doesNotMatch(trust, /<a\b|href=|tabindex|role="button"/);
});

test('four ways cards: number, label, aria-hidden icon and the unchanged description, checkerboard Ink 2 and 3', () => {
  const site = readFileSync(join(root, 'src/lib/site.ts'), 'utf8');
  const blurb = (k) => site.match(new RegExp(`^  ${k}: (['"])(.*)\\1,$`, 'm'))[2].replace(/'/g, '&#39;');
  const want = [['buy', '01', 'For homebuyers', ''], ['invest', '02', 'For investors', ' way--ink'], ['sell', '03', 'For owners', ' way--ink'], ['abroad', '04', 'For overseas buyers', '']];
  // Lead capture: each card links to the enquiry form with its intent and ends with the arrow.
  const linked = [...page('index.html', LEAD).matchAll(/<a class="card way( way--ink)?" href="\/contact\?intent=(\w+)"[^>]*>(.*?)<\/a>/gs)];
  assert.equal(linked.length, 4);
  linked.forEach(([, ink = '', intent, body], k) => {
    assert.equal(intent, want[k][0]);
    assert.match(body, /<span class="way-arrow" aria-hidden="true">→<\/span>/, `${intent}: arrow`);
    checkCard(ink, intent, body, k);
  });
  // Soft launch: the same cards as plain blocks (no link, no arrow), same text and classes.
  if (!BUILD.leadCapture) {
    const home = page('index.html');
    assert.doesNotMatch(home, /<a class="card way|way-arrow|href="\/contact\?intent=/, 'soft launch: cards are not links');
    const plain = [...home.matchAll(/<div class="card way( way--ink)?"[^>]*>(.*?<p class="way-text">.*?<\/p>)\s*<\/div>/gs)];
    assert.equal(plain.length, 4);
    plain.forEach(([, ink = '', body], k) => checkCard(ink, want[k][0], body, k));
  }
  function checkCard(ink, intent, body, k) {
    const [i, n, label, tone] = want[k];
    assert.equal(intent, i); assert.equal(ink, tone, `${i}: tone`);
    assert.match(body, new RegExp(`<span class="way-num" aria-hidden="true">${n}</span>`), `${i}: number`);
    assert.match(body, /<svg class="way-icon" viewBox="0 0 32 32"[^>]*aria-hidden="true"/, `${i}: icon`);
    assert.match(body, new RegExp(`<p class="way-label">${label}</p>`), `${i}: label`);
    const text = body.match(/<p class="way-text">(.*?)<\/p>/s)[1];
    assert.equal(text, blurb(i).replace(/&#39;/g, '&#39;'), `${i}: description unchanged`);
  }
});

test('footer social row: exactly LinkedIn, Instagram, Facebook, opening safely in a new tab', () => {
  const want = [
    ['https://www.linkedin.com/in/sharjeel-hashmat-16944322', 'LinkedIn'],
    ['https://www.instagram.com/sharjeelhashmat', 'Instagram'],
    ['https://www.facebook.com/profile.php?id=61593982841274', 'Facebook'],
  ];
  for (const f of htmlFiles) {
    const footer = readFileSync(f, 'utf8').match(/<footer class="site-footer"[^>]*>.*?<\/footer>/s)?.[0] ?? '';
    const row = footer.match(/<div class="social"[^>]*>(.*?)<\/div>/s)?.[1] ?? '';
    assert.match(row, /<span class="social-label"[^>]*>Follow<\/span>/, `${f}: label`);
    const links = [...row.matchAll(/<a href="([^"]+)" target="_blank" rel="noopener" aria-label="Sharjeel Hashmat on (\w+)"[^>]*>(\w+)<\/a>/g)];
    assert.deepEqual(links.map((m) => [m[1], m[3]]), want, `${f}: social links`);
    links.forEach((m) => assert.equal(m[2], m[3], `${f}: accessible name`));
    assert.equal((row.match(/<a\b/g) ?? []).length, 3, `${f}: no other links`);
  }
});

// The tab icons are the Brand Package v3.0 squares with rounded corners (owner-approved 2026-10-10): the corners were
// masked out with the approved method (8x supersampled rounded rectangle, radius 22%), artwork unchanged.
// apple-touch-icon.png stays the original square (iOS rounds it itself).
// Colours v2 (Rules 1c v6.0): the same artwork recoloured. SVGs: hex values swapped. PNG and ICO: one affine colour map fitted
// exactly on Ink to Night, Ivory to Mist, Brass to Sky, Slate to Slate (alpha and pixels' positions unchanged).
test('brand assets are the approved Brand Package files in the v6.0 colours (tab icons with the approved rounded corners), byte for byte', () => {
  const approved = {
    'apple-touch-icon.png': 'f40bd7886ee4eb3cafe076ae300adc75adde6e03405a869052fd07357fe3814b',
    'favicon.ico': 'ff6709adcc0980a1c7f4f9c4bd027b9d091bf033de7cf678de90669151ad2afd',
    'icon-192.png': '0be2bd5d21cd1f7d1cd975d7d43e79d94d6851582b2d3680e76e6b963d9b1fc1',
    'icon-32.png': 'b0e489daeb2cb1161f8e730b942bf44a4b08d318e3130a390daabc657b1af656',
    'icon-48.png': '1e6b2c11b58300a82b6b7a08dda0b367458fc9f6858a358a380affb82726960f',
    'icon-512.png': 'd84a15f372421d319152ad26dfaccbaf5c991011eb5fdd56879f72d815e9e930',
    'logo-horizontal-ink.svg': '6155d471b74cfb1ad58bc983e6750e77b7a6f7ecb022cda66383568fbd0b29ec',
    'logo-horizontal-ivory.svg': '1b75eaa562c3dda6cae1869d3051e366875b9a2f532834c8e2e2a29c37b68f1f',
    'logo-web-ink.svg': '480c3b5e912b7c5e5ae531f9e1ecccfae343627786d07d8ce1bdd6346f34dae1',
    'logo-web-ivory.svg': '6dc98d81e4f20822e0897be9062bc3d67f971ba733058beddcff650e9a975bd6',
    // 256-colour palette PNG, 1200x630, about 88 KB (audit item 20); recoloured palette entry by palette entry.
    'og.png': '813e559b33044e03c7c2e424e1f064b4ddfb3c8055add3df7f4ad4032b598f9a',
  };
  for (const [file, sha] of Object.entries(approved)) {
    for (const dir of [join(root, 'public'), dist]) {
      assert.equal(createHash('sha256').update(readFileSync(join(dir, file))).digest('hex'), sha, `${dir}/${file}`);
    }
  }
});

// Mobile menu focus (owner-approved 2026-10-10): focus stays inside the open menu.
import { pageBehind, wrapFocus } from '../src/lib/menu-focus.mjs';

test('menu focus: open goes to Buy, Tab x9 from Buy cycles back to the button, Shift+Tab wraps the other way', () => {
  const button = 'button';
  const items = ['Buy', 'Invest', 'Sell', 'Areas', 'New Launches', 'Insights', 'About', 'Contact', 'WhatsApp'];
  const order = [button, ...items]; // DOM order: the button sits directly before the menu
  const step = (active, shift) => wrapFocus({ shift, active, button, items }) ?? order[order.indexOf(active) + (shift ? -1 : 1)];
  assert.equal(step(button, false), 'Buy', 'Tab from the button enters the menu at Buy');
  let at = 'Buy';
  const path = [];
  for (let i = 0; i < 9; i++) { at = step(at, false); path.push(at); }
  assert.deepEqual(path, [...items.slice(1), button], 'Tab x9 from Buy ends on the button');
  assert.equal(step('WhatsApp', false), button, 'Tab from WhatsApp moves to the button');
  assert.equal(step(button, true), 'WhatsApp', 'Shift+Tab from the button moves to WhatsApp');
  assert.equal(step('Buy', true), button, 'Shift+Tab from Buy moves to the button');
  assert.equal(wrapFocus({ shift: false, active: 'page-link', button, items }), 'Buy', 'focus outside the cycle is brought back in');
});

test('menu focus: only the page behind becomes inert, and pre-existing inert is left alone', () => {
  const el = (name, inert = false) => ({ name, hasAttribute: (a) => a === 'inert' && inert });
  const header = el('header');
  const kids = [el('skip'), header, el('main'), el('fabs'), el('footer'), el('already', true)];
  assert.deepEqual(pageBehind(kids, header).map((e) => e.name), ['skip', 'main', 'fabs', 'footer']);
});

test('menu focus: the built header script handles Escape, Tab, inert and aria-expanded; desktop is unchanged', () => {
  // Astro inlines a small script into the page and bundles a larger one into _astro/; look in both.
  const h = readFileSync(join(dist, 'index.html'), 'utf8');
  const js = h + readdirSync(join(dist, '_astro')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dist, '_astro', f), 'utf8')).join('\n');
  for (const needle of ['Escape', 'inert', 'aria-expanded', 'min-width: 75rem']) assert.ok(js.includes(needle), needle);
  assert.match(h, /<button class="menu-btn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="site-menu" id="menu-btn">/);
  assert.ok(h.indexOf('id="menu-btn"') < h.indexOf('id="site-menu"'), 'the button precedes the menu');
  assert.doesNotMatch(h.replace(/<script[\s\S]*?<\/script>/g, ''), /\sinert(=|\s|>)/, 'nothing is inert in the served markup');
});

// Corners (Rules 1c v5.8): the five --radius-* tokens and 0 only; no pill-shaped button. The full rule set, the token
// values and --radius-full's three uses are in tests/design-rules.test.mjs.
const builtCss = () => readdirSync(join(dist, '_astro')).filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dist, '_astro', f), 'utf8')).join('\n');

test('radius tokens exist, and no other border-radius is used anywhere in site/src (only the five tokens and 0)', () => {
  for (const [n, v] of [['sm', '8px'], ['md', '12px'], ['lg', '16px'], ['xl', '24px'], ['full', '9999px']]) assert.match(css, new RegExp(`--radius-${n}: ${v};`));
  assert.doesNotMatch(css, /--r-(pill|field|card)\b/, 'the old tokens are gone');
  for (const f of walk(join(root, 'src')).filter((p) => /\.(astro|css|mjs|ts)$/.test(p))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;}"]+)/g)) {
      const v = m[1].trim();
      assert.match(v, /^(?:(?:var\(--radius-(?:sm|md|lg|xl|full)\)|0)(?:\s+|$))+$/, `${f}: border-radius ${v}`);
    }
  }
});

test('built CSS: buttons, fields, the country-code box, cards and checkboxes resolve to the right token', () => {
  const c = builtCss();
  const rule = (sel) => [...c.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, , b]) => b).join(';');
  const radius = (sel) => (rule(sel).match(/border-radius:([^;]+)/) ?? [])[1]?.trim();
  assert.equal(radius('.btn'), 'var(--radius-md)', '.btn (a.btn, button.btn, .btn--ghost)');
  assert.equal(radius('.skip'), 'var(--radius-md)', 'skip link');
  for (const sel of ['.site-nav .nav-seg', '.site-nav .nav-seg a', '.site-nav .nav-pills a', '.site-nav .nav-wa', '.menu-btn', '.mk-pill']) assert.equal(radius(sel), 'var(--radius-md)', sel);
  for (const sel of ['.field input', '.field select', '.field textarea']) assert.equal(radius(sel), 'var(--radius-sm)', sel);
  assert.equal(radius('.cc-display'), 'var(--radius-sm)', 'country-code box');
  assert.equal(radius('.field .cc-control select'), 'var(--radius-sm)', 'country-code select');
  for (const sel of ['.verdict', '.badge', '.mk-chip']) assert.equal(radius(sel), 'var(--radius-sm)', sel);
  assert.equal(radius('.card'), 'var(--radius-lg)', '.card');
  assert.equal(radius('.card.way'), 'var(--radius-lg)', 'four ways cards');
  assert.equal(radius('.stale-banner'), 'var(--radius-lg)', 'stale banner');
  assert.match(rule('.card.way'), /overflow:hidden/, 'Sky bar clipped to the rounded corner');
  assert.equal(radius(".check input[type=checkbox]"), 'var(--radius-sm)', 'checkboxes');
  assert.equal(radius('.steps li'), 'var(--radius-sm)', 'sell process steps (tags)');
  // --radius-full only on the floating WhatsApp button; the back-to-top button is a button (md).
  assert.equal(radius('.fab--wa'), 'var(--radius-full)', 'WhatsApp button stays round');
  assert.equal(radius('.fab--top'), 'var(--radius-md)', 'back to top');
  assert.doesNotMatch(c, /--r-(pill|field|card)\b|border-radius:(999px|50%)/, 'no pill or circle radius left in the built CSS');
});

// Minimal PNG reader (8-bit RGBA, non-interlaced) so the icon checks run in CI without image libraries.
function readPng(buf) {
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let off = 8, w = 0, h = 0, depth = 0, type = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), kind = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; }
    if (kind === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  assert.deepEqual([depth, type], [8, 6], 'RGBA, 8 bits per channel');
  const raw = inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      px[y * stride + x] = (line[x] + pred) & 255;
    }
  }
  return { w, h, alpha: (x, y) => px[(y * w + x) * 4 + 3] };
}
const roundedOk = (png, size, label) => {
  assert.deepEqual([png.w, png.h], [size, size], `${label}: size`);
  for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) assert.equal(png.alpha(x, y), 0, `${label}: corner ${x},${y} transparent`);
  assert.equal(png.alpha(size >> 1, size >> 1), 255, `${label}: centre opaque`);
};

test('tab icons: rounded (transparent corners, opaque centre, exact sizes); favicon.ico holds 16, 32 and 48; apple-touch stays square', () => {
  for (const [f, size] of [['icon-32.png', 32], ['icon-48.png', 48], ['icon-192.png', 192], ['icon-512.png', 512]]) {
    roundedOk(readPng(readFileSync(join(root, 'public', f))), size, f);
  }
  const ico = readFileSync(join(root, 'public/favicon.ico'));
  const n = ico.readUInt16LE(4), sizes = [];
  for (let i = 0; i < n; i++) {
    const e = 6 + 16 * i, w = ico[e] || 256, len = ico.readUInt32LE(e + 8), at = ico.readUInt32LE(e + 12);
    sizes.push(w);
    roundedOk(readPng(ico.subarray(at, at + len)), w, `favicon.ico ${w}`);
  }
  assert.deepEqual(sizes.sort((a, b) => a - b), [16, 32, 48]);
  const apple = readFileSync(join(root, 'public/apple-touch-icon.png'));
  assert.equal(apple[25], 2, 'apple-touch-icon is RGB (no alpha): square, iOS rounds it');
  assert.equal(existsSync(join(root, 'public/site.webmanifest')) || existsSync(join(root, 'public/manifest.webmanifest')), false, 'no web manifest (nothing marked maskable)');
});
