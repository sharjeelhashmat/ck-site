// PR 5: Rules 1c v5.8 (the Sharjeel Hashmat Design System tokens) across site/: faces and weights, the type scale,
// Cormorant never below 22px, the nine spacing steps, the five corner tokens, and only the Guide's @fontsource files.
// The checker is tests/helpers/design-rules.mjs. Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FONTSOURCE_ALLOWED, FONT_FILE_ALLOWED, FS, RADIUS, SPACE, UA_BOLD_UNCOVERED,
  blocks, declarations, fontOf, fontsourceRefs, headingClasses, markupCss, serifClasses, violations,
} from './helpers/design-rules.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const srcFiles = [...walk(join(root, 'src')), ...walk(join(root, 'public'))];
const rel = (f) => relative(root, f);
const read = (f) => readFileSync(f, 'utf8');

// Every stylesheet the site authors: .css files, and the <style> blocks and style attributes of .astro files.
const sources = srcFiles.filter((f) => /\.(css|astro)$/.test(f)).map((f) => ({ file: rel(f), css: f.endsWith('.astro') ? markupCss(read(f)) : read(f) }));
const hClasses = srcFiles.filter((f) => /\.(astro|m?js|ts)$/.test(f)).flatMap((f) => headingClasses(read(f)));
const serif = serifClasses(sources.flatMap((s) => blocks(s.css)), hClasses);
const globalCss = read(join(root, 'src/styles/global.css'));
const rootVars = Object.fromEntries(declarations(blocks(globalCss).find((b) => b.selector === ':root').body).filter(([k]) => k.startsWith('--')));

test('rules: the checker catches every kind of break (self-test)', () => {
  const v = (css) => violations(css);
  // Weights
  assert.deepEqual(v('.kicker { font-weight: 600; }'), ['.kicker: Inter at 600']);
  assert.deepEqual(v('.x::after { font-family: var(--sans); font-weight: 300; }'), ['.x::after: Inter at 300']);
  assert.deepEqual(v('.x { font-weight: bold; }'), ['.x: Inter at 700']);
  assert.deepEqual(v('.x { font-weight: bolder; }'), ['.x: font-weight bolder']);
  assert.deepEqual(v('.lbl { text-transform: uppercase; font-weight: 500; }'), ['.lbl: a label (capitals) at 500; labels are 400']);
  assert.deepEqual(v('h2 { font-family: var(--serif); font-weight: 400; }'), ['h2: Cormorant normal at 400']);
  assert.deepEqual(v('.s { font-family: var(--serif); }'), ['.s: Cormorant set without its weight (600, or 400 italic)']);
  assert.deepEqual(v('.card h3 { font-weight: 500; }'), ['.card h3: Cormorant normal at 500'], 'h1 to h3 are Cormorant');
  assert.deepEqual(v('.q { font-family: var(--serif); font-style: italic; font-weight: 600; }'), ['.q: Cormorant italic at 600']);
  assert.deepEqual(v('.a { font-family: var(--serif); font-weight: 600; } .b .a { font-weight: 400; }'), ['.b .a: Cormorant normal at 400']);
  assert.deepEqual(v('@media (min-width: 1px) { .x { font-weight: 600 !important; } }'), ['.x: Inter at 600']);
  assert.deepEqual(v('.x { font: 400 1rem var(--sans); }'), ['.x: font shorthand (write font-family, font-weight, font-size and line-height)']);
  // Type scale and the 22px floor
  assert.deepEqual(v('.x { font-size: .85rem; }'), ['.x: font-size .85rem (only a --fs-* step, or a clamp() between two)']);
  assert.deepEqual(v('.x { font-size: clamp(1rem, 2vw, 2rem); }'), ['.x: font-size clamp(1rem, 2vw, 2rem) (only a --fs-* step, or a clamp() between two)']);
  assert.deepEqual(v('.f { font-family: var(--serif); font-weight: 600; font-size: var(--fs-body); }'), ['.f: Cormorant at var(--fs-body), below 22px']);
  assert.deepEqual(v('.f { font-family: var(--serif); font-weight: 600; font-size: var(--fs-tagline); }'), ['.f: the tagline step is Cormorant Italic']);
  assert.deepEqual(v('h3 { font-size: var(--fs-small); }'), ['h3: Cormorant at var(--fs-small), below 22px']);
  assert.deepEqual(v('.x { font-size: var(--fs-heading); }'), ['.x: Inter at var(--fs-heading), a Cormorant step']);
  assert.deepEqual(violations('.mk-area { font-size: var(--fs-small); }', new Set(['mk-area'])), ['.mk-area: Cormorant at var(--fs-small), below 22px'], 'a class used on an h3');
  // Spacing
  assert.deepEqual(v('.x { margin: 0 auto 1.25rem; }'), ['.x: margin 0 auto 1.25rem (only 0, auto and the --space-* steps)']);
  assert.deepEqual(v('.x { gap: 10px; }'), ['.x: gap 10px (only 0, auto and the --space-* steps)']);
  assert.deepEqual(v('.x { padding-inline: var(--space-5); }'), ['.x: padding-inline var(--space-5) (only 0, auto and the --space-* steps)']);
  assert.deepEqual(v('.x { scroll-margin-top: 6rem; }'), ['.x: scroll-margin-top 6rem (only 0, auto and the --space-* steps)']);
  // Corners
  assert.deepEqual(v('.btn { border-radius: 999px; }'), ['.btn: border-radius 999px (only 0 and the --radius-* tokens)']);
  assert.deepEqual(v('.d { border-radius: 50%; }'), ['.d: border-radius 50% (only 0 and the --radius-* tokens)']);
  assert.deepEqual(v('.btn { border-radius: var(--radius-full); }'), ['.btn: --radius-full is only for avatars, the headshot frame and the WhatsApp button']);
  assert.deepEqual(v('.x { border-radius: var(--r-pill); }'), ['removed radius token --r-pill', '.x: border-radius var(--r-pill) (only 0 and the --radius-* tokens)']);
  // Allowed combinations pass.
  assert.deepEqual(v([
    'body { font-family: var(--sans); font-weight: 400; font-size: var(--fs-body); }', '.lbl { text-transform: uppercase; font-weight: 400; font-size: var(--fs-label); }',
    'h1, h2, h3 { font-family: var(--serif); font-weight: 600; font-size: var(--fs-heading); }', 'h1 em { font-style: italic; font-weight: 400; }',
    'h1 { font-size: clamp(var(--fs-display-lg), 2.125rem + 2.5vw, var(--fs-display-xl)); }',
    '.q { font-family: var(--serif); font-style: italic; font-weight: 400; font-size: var(--fs-tagline); }',
    '.n { font-family: var(--sans); font-weight: 500; font-size: var(--fs-stat); }', '@font-face { font-family: Inter; font-weight: 100 900; }',
    '.x { margin: 0 auto var(--space-4); padding: var(--space-24) !important; gap: var(--space-1) var(--space-12); }',
    '.c { border-radius: var(--radius-lg); } .m { border-radius: 0 0 var(--radius-lg) var(--radius-lg); } .fab--wa { border-radius: var(--radius-full); }',
  ].join('\n')), []);
  assert.equal(markupCss('<h2 style="font-family:var(--sans);font-weight:600">x</h2>'), 'h2 { font-family:var(--sans);font-weight:600 }');
  assert.deepEqual(headingClasses('<h3 class="mk-area x">a</h3><p class="lede">b</p>'), ['mk-area', 'x']);
});

test('rules: the tokens are defined once in global.css with the Rules 1c v5.8 values, and the --r-* tokens are gone', () => {
  for (const [n, px] of Object.entries(SPACE)) assert.equal(rootVars[`--space-${n}`], `${px}px`, `--space-${n}`);
  assert.deepEqual(Object.keys(rootVars).filter((k) => k.startsWith('--space-')).sort(), Object.keys(SPACE).map((n) => `--space-${n}`).sort(), 'nine steps only');
  for (const [n, px] of Object.entries(RADIUS)) assert.equal(rootVars[`--radius-${n}`], px, `--radius-${n}`);
  assert.deepEqual(Object.keys(rootVars).filter((k) => k.startsWith('--radius-')).sort(), Object.keys(RADIUS).map((n) => `--radius-${n}`).sort(), 'five corners only');
  for (const [n, px] of Object.entries(FS)) assert.equal(parseFloat(rootVars[`--fs-${n}`]) * 16, px, `--fs-${n}`);
  const lh = { 'display-xl': 68, 'display-lg': 52, heading: 36, tagline: 32, label: 16, body: 28, data: 24, stat: 52, small: 20 };
  for (const [n, px] of Object.entries(lh)) assert.equal(parseFloat(rootVars[`--lh-${n}`]) * 16, px, `--lh-${n}`);
  const ls = { 'display-xl': '-0.01em', label: '.18em', body: '-0.011em', data: '-0.011em', stat: '-0.022em', small: '-0.006em' };
  for (const [n, v] of Object.entries(ls)) assert.equal(rootVars[`--ls-${n}`], v, `--ls-${n}`);
  for (const s of sources) assert.doesNotMatch(s.css, /--r-(pill|field|card)\b/, s.file);
});

test('rules: no stylesheet in site/src or site/public breaks Rules 1c v5.8', () => {
  const bad = sources.flatMap((s) => violations(s.css, serif).map((v) => `${s.file}: ${v}`));
  assert.deepEqual(bad, []);
});

test('rules: no script sets a font, a margin, a padding, a gap or a radius (it would bypass the CSS check)', () => {
  for (const f of srcFiles.filter((x) => /\.(m?js|ts)$/.test(x))) {
    assert.doesNotMatch(read(f), /fontWeight|fontSize|font-weight|font-size|[^-]margin:|padding:|[^-]gap:|border-radius|borderRadius/, rel(f));
  }
});

test('rules: h1 to h3 are Cormorant 600 on the scale, the italic inside them stays 400, browser-bold elements are 500 or 400', () => {
  const g = blocks(globalCss);
  const rule = (sel) => g.filter((b) => b.selector.split(',').map((s) => s.trim()).join(', ') === sel).map((b) => fontOf(b.body));
  const base = rule('h1, h2, h3')[0];
  assert.deepEqual([base.family, base.weight, base.size], ['serif', '600', 'var(--fs-heading)']);
  assert.match(rule('h1')[0].size, /^clamp\(var\(--fs-display-lg\), .*, var\(--fs-display-xl\)\)$/);
  assert.match(rule('h2')[0].size, /^clamp\(var\(--fs-heading\), .*, var\(--fs-display-lg\)\)$/);
  assert.deepEqual([rule('h1 em, h2 em')[0].style, rule('h1 em, h2 em')[0].weight], ['italic', '400']);
  assert.equal(rule('b, strong')[0].weight, '500');
  assert.equal(rule('th')[0].weight, '400');
  for (const f of walk(dist).filter((x) => x.endsWith('.html'))) assert.doesNotMatch(read(f), UA_BOLD_UNCOVERED, `${rel(f)}: a browser-bold element the reset does not cover`);
});

test('rules: big figures are Inter 500 (stat or data), lining and tabular', () => {
  const all = sources.flatMap((s) => blocks(s.css));
  for (const sel of ['.way-num', '.stat', '.mk-tile-value', '.mk-value', '.mk-lead']) {
    const b = all.find((x) => x.selector === sel);
    assert.ok(b, sel);
    const f = fontOf(b.body);
    assert.deepEqual([f.family, f.weight], ['sans', '500'], sel);
    assert.match(f.size, /^var\(--fs-(stat|data)\)$/, sel);
  }
  assert.match(globalCss, /\.way-num \{[^}]*font-variant-numeric: lining-nums tabular-nums;/);
  assert.match(read(join(root, 'src/styles/market.css')), /\.mk-value, \.mk-tile-value, \.mk-lead, \.mk-rank \{ font-variant-numeric: lining-nums tabular-nums; \}/);
});

test('rules: only the Guide\'s @fontsource files are imported', () => {
  const refs = srcFiles.filter((f) => /\.(css|astro|m?js|ts)$/.test(f)).flatMap((f) => fontsourceRefs(read(f)).map((r) => ({ f: rel(f), r })));
  assert.deepEqual(refs.filter(({ r }) => !FONTSOURCE_ALLOWED.includes(r)).map(({ f, r }) => `${f}: ${r}`), []);
  for (const r of ['@fontsource-variable/inter', '@fontsource/cormorant-garamond/600.css', '@fontsource/cormorant-garamond/400-italic.css']) {
    assert.ok(refs.some((x) => x.r === r), `${r} is imported`);
  }
});

test('rules: the build ships only Cormorant 600 normal, Cormorant 400 italic and the Inter variable files', () => {
  const fonts = walk(join(dist, '_astro')).filter((f) => /\.(woff2?|ttf|otf)$/.test(f)).map((f) => f.split(/[/\\]/).pop());
  assert.ok(fonts.length > 0);
  assert.deepEqual(fonts.filter((f) => !FONT_FILE_ALLOWED.test(f)), []);
  assert.ok(fonts.some((f) => /^cormorant-garamond-latin-600-normal\./.test(f)) && fonts.some((f) => /^cormorant-garamond-latin-400-italic\./.test(f)));
});

test('rules: the built CSS and inline styles keep the same rules (catches anything the source scan could miss)', () => {
  const css = walk(dist).filter((f) => f.endsWith('.css')).map(read);
  const html = walk(dist).filter((f) => f.endsWith('.html')).map(read);
  const all = [...css, ...html.map(markupCss)].join('\n');
  assert.deepEqual(violations(all, serifClasses(blocks(all), html.flatMap(headingClasses))), []);
});

test('rules: the Design System preview\'s sample button text appears nowhere in the site or the build', () => {
  for (const f of [...srcFiles, ...walk(dist)].filter((x) => /\.(astro|m?js|ts|css|html|txt|xml|json|md)$/.test(x))) {
    assert.doesNotMatch(read(f), /Request the Compass Key Brief/i, rel(f));
  }
});
