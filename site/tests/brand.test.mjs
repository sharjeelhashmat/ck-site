// Brand v3.0 (Notion 1c v5.0, 2026-10-10): Ink/Ivory/Brass tokens, "Property Consultant" title, Navigator logo, icons, share image.
// Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));
const textFiles = walk(dist).filter((f) => /\.(html|txt|xml|js|json|css)$/.test(f));
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

const RETIRED = ['#0C3B6E', '#071E38', '#5B9BD5', '#C8922A', '#E8B44A', '#A8CBEC', '#F0F0F0', '#F7F5F0', '#E9C987', '#D8E2EE'];

test('title: no "Real Estate Consultant" anywhere in the build, and "Property Consultant" is shown', () => {
  for (const f of textFiles) assert.doesNotMatch(readFileSync(f, 'utf8'), /real estate consultant/i, f);
  const home = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.match(home, /<title>Sharjeel Hashmat — Property Consultant<\/title>/);
  for (const f of htmlFiles) assert.match(readFileSync(f, 'utf8'), /<span>Property Consultant · UAE<\/span>/, `${f}: footer title line`);
  assert.match(readFileSync(join(dist, 'llms.txt'), 'utf8'), /Title: Property Consultant · UAE/);
});

test('JSON-LD jobTitle is "Property Consultant" on every page', () => {
  for (const f of htmlFiles) {
    const m = readFileSync(f, 'utf8').match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    assert.ok(m, `${f}: JSON-LD`);
    assert.equal(JSON.parse(m[1]).jobTitle, 'Property Consultant', f);
  }
});

test('icons: no favicon.svg; ico, 32, 48 and apple-touch links; theme-color is Ink', () => {
  assert.equal(existsSync(join(dist, 'favicon.svg')), false, 'favicon.svg is gone');
  for (const p of ['favicon.ico', 'icon-32.png', 'icon-48.png', 'apple-touch-icon.png']) assert.ok(existsSync(join(dist, p)), p);
  for (const f of htmlFiles) {
    const h = readFileSync(f, 'utf8');
    assert.doesNotMatch(h, /favicon\.svg/, `${f}: favicon.svg reference`);
    assert.match(h, /<link rel="icon" href="\/favicon\.ico" sizes="32x32">/, `${f}: ico`);
    assert.match(h, /<link rel="icon" type="image\/png" sizes="32x32" href="\/icon-32\.png">/, `${f}: 32`);
    assert.match(h, /<link rel="icon" type="image\/png" sizes="48x48" href="\/icon-48\.png">/, `${f}: 48`);
    assert.match(h, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/, `${f}: apple-touch`);
    assert.match(h, /<meta name="theme-color" content="#14252F">/, `${f}: theme-color`);
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

test('web logo lockups are the approved horizontal logos with exactly the five specified edits', () => {
  for (const v of ['ink', 'ivory']) {
    const src = readFileSync(join(root, `public/logo-horizontal-${v}.svg`), 'utf8');
    const expected = src
      .replace(/<metadata>.*?<\/metadata>/s, '')
      .replace(' xmlns:c2pa="http://c2pa.org/manifest"', '')
      .replace(/<path transform="translate\(861\.55 640\.00\)"[^>]*\/>/, '')
      .replace('<path transform="translate(861.55 465.00)"', '<path transform="translate(861.55 513.00)"')
      .replace('<rect x="861.55" y="530.00"', '<rect x="861.55" y="578.00"')
      .replace('width="2880" height="960" viewBox="0 0 2880 960"', 'width="2480" height="510" viewBox="205 225 2480 510"');
    const web = readFileSync(join(root, `public/logo-web-${v}.svg`), 'utf8');
    assert.equal(web, expected, `logo-web-${v}.svg`);
    assert.match(web, /viewBox="205 225 2480 510"/);
    assert.doesNotMatch(web, /translate\(861\.55 640\.00\)|<metadata|c2pa/, `logo-web-${v}.svg: tagline and metadata removed`);
    assert.equal(readFileSync(join(dist, `logo-web-${v}.svg`), 'utf8'), web, `dist/logo-web-${v}.svg`);
  }
});

test('share image: /og.png at 1200x630, declared in og and twitter tags', () => {
  const png = readFileSync(join(dist, 'og.png'));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  for (const f of htmlFiles) {
    const h = readFileSync(f, 'utf8');
    assert.match(h, /<meta property="og:image" content="https:\/\/www\.sharjeelhashmat\.com\/og\.png">/, `${f}: og:image`);
    assert.match(h, /<meta property="og:image:width" content="1200">/, `${f}: og:image:width`);
    assert.match(h, /<meta property="og:image:height" content="630">/, `${f}: og:image:height`);
    assert.match(h, /<meta name="twitter:image" content="https:\/\/www\.sharjeelhashmat\.com\/og\.png">/, `${f}: twitter:image`);
  }
});

test('tokens: no retired hex in global.css or anywhere in the build; palette values are the v3.0 ones', () => {
  for (const hex of RETIRED) {
    assert.doesNotMatch(css, new RegExp(hex, 'i'), `global.css: ${hex}`);
    for (const f of textFiles) assert.doesNotMatch(readFileSync(f, 'utf8'), new RegExp(hex + '(?![0-9a-f])', 'i'), `${f}: ${hex}`);
  }
  for (const [name, value] of [['ink', '#14252f'], ['ivory', '#f3f0e7'], ['gold', '#c6a272'], ['brass-deep', '#7e6034'], ['sky', '#627982'], ['slate-light', '#8fa3ab']]) {
    assert.match(css, new RegExp(`--${name}: ${value};`), `--${name}`);
  }
});

// Brand v3.1 adds Ink surfaces (header, hero, Ink cards, footer); Brass text is allowed only inside them.
const INK_SURFACE = /^(\.band--navy|\.hero|\.site-nav|\.site-footer|(\.card)?\.way--ink)\b/;
test('Brass is text only on Ink: every `color: var(--gold)` rule is scoped to an Ink surface', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, , body]) => /(^|[;\s])color:\s*var\(--gold\)/.test(body));
  assert.ok(rules.length > 0);
  for (const [, sel] of rules) for (const s of sel.split(',')) assert.match(s.trim(), INK_SURFACE, `Brass text outside an Ink surface: ${s.trim()}`);
});

test('no hex colour outside the token block: global.css, components, layouts and pages', () => {
  const outside = css.replace(/:root\s*\{[^}]*\}/, '');
  assert.doesNotMatch(outside, /#[0-9a-f]{3,8}\b/i, 'global.css outside :root');
  // In components and pages a hex colour can only appear in a style declaration or an SVG paint attribute.
  const colour = /(?:color|background|border|outline|fill|stroke|shadow)[^;{}"]*#[0-9a-f]{3,8}\b|(?:fill|stroke|stop-color)="#[0-9a-f]{3,8}"/i;
  for (const f of walk(join(root, 'src')).filter((p) => /\.astro$/.test(p))) {
    const t = readFileSync(f, 'utf8').replace('<meta name="theme-color" content="#14252F" />', '');
    assert.doesNotMatch(t, colour, `${f}: hex colour`);
  }
});

const page = (p) => readFileSync(join(dist, p), 'utf8');
const navOf = (h) => h.match(/<nav class="site-menu"[^>]*>.*?<\/nav>/s)?.[0] ?? '';
const linksIn = (html, cls) => [...(html.match(new RegExp(`<div class="${cls}"[^>]*>(.*?)</div>`, 's'))?.[1] ?? '').matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);

test('nav: one Primary nav with the segmented, pill and plain groups plus WhatsApp', () => {
  for (const f of htmlFiles) {
    const nav = navOf(readFileSync(f, 'utf8'));
    assert.ok(nav, `${f}: primary nav`);
    assert.deepEqual(linksIn(nav, 'nav-seg'), [['/buy', 'Buy'], ['/invest', 'Invest'], ['/sell', 'Sell']], `${f}: segmented group`);
    assert.deepEqual(linksIn(nav, 'nav-pills'), [['/areas', 'Areas'], ['/new-launches', 'New Launches'], ['/insights', 'Insights']], `${f}: pill group`);
    assert.deepEqual(linksIn(nav, 'nav-plain'), [['/about', 'About'], ['/contact', 'Contact']], `${f}: plain group`);
    assert.match(nav, /<a class="nav-wa" href="https:\/\/wa\.me\/[^"]+" target="_blank" rel="noopener">WhatsApp<\/a>/, `${f}: WhatsApp`);
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
  const cards = [...page('index.html').matchAll(/<a class="card way( way--ink)?" href="\/contact\?intent=(\w+)"[^>]*>(.*?)<\/a>/gs)];
  assert.equal(cards.length, 4);
  const want = [['buy', '01', 'For homebuyers', ''], ['invest', '02', 'For investors', ' way--ink'], ['sell', '03', 'For owners', ' way--ink'], ['abroad', '04', 'For overseas buyers', '']];
  cards.forEach(([, ink = '', intent, body], k) => {
    const [i, n, label, tone] = want[k];
    assert.equal(intent, i); assert.equal(ink, tone, `${i}: tone`);
    assert.match(body, new RegExp(`<span class="way-num" aria-hidden="true">${n}</span>`), `${i}: number`);
    assert.match(body, /<svg class="way-icon" viewBox="0 0 32 32"[^>]*aria-hidden="true"/, `${i}: icon`);
    assert.match(body, new RegExp(`<p class="way-label">${label}</p>`), `${i}: label`);
    const text = body.match(/<p class="way-text">(.*?)<\/p>/s)[1];
    assert.equal(text, blurb(i).replace(/&#39;/g, '&#39;'), `${i}: description unchanged`);
  });
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
test('brand assets are the approved Brand Package v3.0 files (tab icons with the approved rounded corners), byte for byte', () => {
  const approved = {
    'apple-touch-icon.png': '265c8d943885ae0fd28082939a7e38dddb23fdf25fe551cfb399799864b9c1a1',
    'favicon.ico': 'fb42ac20ead8a95d81002f7209c50ed3fe348b55a91f81eb8856948bb080efdd',
    'icon-192.png': 'e4b20e1e81459ba853862ba685b96d7f05aabc0b4aad400944c33aea723743fc',
    'icon-32.png': '0c5505bc277091398a236931a61ab933f62c9f6458aec8c17769b5fc9b6301d6',
    'icon-48.png': 'b4ed4eb5f2bfa22875cab5cefbc08062a1f68f12a38b8c9c8f7d3075e76ce562',
    'icon-512.png': 'd71ab9b4bf05000fe6ad2f93770b2d42148ce1e2d6b1494746a4c31934061911',
    'logo-horizontal-ink.svg': 'f7f4530cc2bfc7b16c828ba4aec0dec03a02e1303d12469bed849a86662b0b55',
    'logo-horizontal-ivory.svg': '2162b5c1c6c33bedd447d7cb83a833deb8f91392cbb8e763a0ba64f2526a06b0',
    'og.png': '60c8b85d3ba4936bb149c9a45bd5e1e2958e4ae4be5b087eeba434f88e1e0220',
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

// Rounded edges everywhere (owner-approved 2026-10-10).
const builtCss = () => readdirSync(join(dist, '_astro')).filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dist, '_astro', f), 'utf8')).join('\n');

test('radius tokens exist, and no other border-radius is used anywhere in site/src (only the tokens, 4px and 50%)', () => {
  assert.match(css, /--r-pill: 999px;/);
  assert.match(css, /--r-field: 10px;/);
  assert.match(css, /--r-card: 14px;/);
  for (const f of walk(join(root, 'src')).filter((p) => /\.(astro|css|mjs|ts)$/.test(p))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;}"]+)/g)) {
      const v = m[1].trim();
      assert.match(v, /^(?:(?:var\(--r-(?:pill|field|card)\)|4px|50%|0)(?:\s+|$))+$/, `${f}: border-radius ${v}`);
    }
  }
});

test('built CSS: buttons, fields, the country-code box, cards and checkboxes resolve to the right token', () => {
  const c = builtCss();
  const rule = (sel) => [...c.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, , b]) => b).join(';');
  const radius = (sel) => (rule(sel).match(/border-radius:([^;]+)/) ?? [])[1]?.trim();
  assert.equal(radius('.btn'), 'var(--r-pill)', '.btn (a.btn, button.btn, .btn--ghost)');
  assert.equal(radius('.skip'), 'var(--r-pill)', 'skip link');
  for (const sel of ['.field input', '.field select', '.field textarea']) assert.equal(radius(sel), 'var(--r-field)', sel);
  assert.equal(radius('.cc-display'), 'var(--r-field)', 'country-code box');
  assert.equal(radius('.field .cc-control select'), 'var(--r-field)', 'country-code select');
  assert.equal(radius('.card'), 'var(--r-card)', '.card');
  assert.equal(radius('.card.way'), 'var(--r-card)', 'four ways cards');
  assert.match(rule('.card.way'), /overflow:hidden/, 'Brass bar clipped to the rounded corner');
  assert.equal(radius(".check input[type=checkbox]"), '4px', 'checkboxes');
  assert.equal(radius('.steps li'), 'var(--r-card)', 'sell process steps');
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
