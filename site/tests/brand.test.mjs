// Brand v3.0 (Notion 1c v5.0, 2026-10-10): Ink/Ivory/Brass tokens, "Property Consultant" title, Navigator logo, icons, share image.
// Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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

test('logo: header and footer use the Navigator logo file with alt and explicit size; the old mark is gone', () => {
  const img = /<img class="logo" src="\/logo-horizontal-ink\.svg" alt="Sharjeel Hashmat" width="\d+" height="\d+"/;
  for (const f of htmlFiles) {
    const h = readFileSync(f, 'utf8');
    const header = h.match(/<header class="site-nav"[^>]*>.*?<\/header>/s)?.[0] ?? '';
    const footer = h.match(/<footer class="site-footer"[^>]*>.*?<\/footer>/s)?.[0] ?? '';
    assert.match(header, img, `${f}: header logo`);
    assert.match(footer, img, `${f}: footer logo`);
    assert.doesNotMatch(h, /viewBox="0 0 34 34"/, `${f}: old Compass Key mark`);
  }
  assert.equal(existsSync(join(root, 'src/components/Mark.astro')), false, 'old mark component removed');
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

test('Brass is text only on Ink: every `color: var(--gold)` rule is scoped to the dark band', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, , body]) => /(^|[;\s])color:\s*var\(--gold\)/.test(body));
  assert.ok(rules.length > 0);
  for (const [, sel] of rules) for (const s of sel.split(',')) assert.match(s.trim(), /^\.band--navy\b/, `Brass text outside the Ink band: ${s.trim()}`);
});

test('brand assets are the approved Brand Package v3.0 files, byte for byte', () => {
  const approved = {
    'apple-touch-icon.png': '265c8d943885ae0fd28082939a7e38dddb23fdf25fe551cfb399799864b9c1a1',
    'favicon.ico': '47f1ef40ead664ba2faa2939a1c17734d18ded8d450bd27f5eb97f6f3fd0edea',
    'icon-192.png': '399b76451ff7df7c48857824943ceabfb365c6b1f9298464a8726af69b42e194',
    'icon-32.png': '93d9b1adfdd201df57e286d706e929e99859e42bee6b1cf1e4877663ae5feffe',
    'icon-48.png': 'f7dcc159d8b3c4f0b8e1345a0cf83374105f386fdffae371637323997dece261',
    'icon-512.png': 'b80849ae58c731d2dd50e8da851c1daebc6b87395a4218f575ca9c161b191054',
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
