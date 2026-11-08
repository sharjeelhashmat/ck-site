// "Buying in the UAE from abroad" (owner 2026-11-08, option B): one shared component (components/AbroadSteps.astro) on
// every page that carries the section, so they stay identical. Run after `npm run build`. The 320px and chip checks in a
// browser are in tests/e2e/abroad.e2e.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeEntities, stripScripts, stripStyles, stripTags } from '../scripts/html-text.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const text = (h) => decodeEntities(stripTags(stripStyles(stripScripts(h, ' '), ' '), ' ')).replace(/\s+/g, ' ').trim();
const read = (p) => readFileSync(join(dist, p), 'utf8');

const STEPS = ['Briefing', 'Virtual shortlist', 'Remote viewings', 'Due diligence', 'Negotiation', 'Transaction coordination', 'Handover or leasing'];
const LEAD = "You don't need to be in the UAE to buy well here.";
const NOTE = 'Managed on your behalf from wherever you are.';

/** The section body as built: from the component's root to the end of its closing line. */
function section(h) {
  const i = h.indexOf('<div class="abroad"');
  assert.ok(i >= 0, 'the AbroadSteps component');
  return h.slice(i, h.indexOf('</p>', h.indexOf('class="abroad-note"', i)) + 4);
}
/** The body without the page's own heading (the slot): lead, list, note. */
const body = (h) => { const s = section(h); return s.slice(s.indexOf('<p class="abroad-lead"')); };

test('every page with the section uses the one component, and its body is byte for byte the same', () => {
  const pages = walk(dist).filter((f) => f.endsWith('.html')).map((f) => [relative(dist, f).split(sep).join('/'), readFileSync(f, 'utf8')])
    .filter(([, h]) => /Buying in the UAE/.test(h) || /data-abroad-steps/.test(h));
  assert.deepEqual(pages.map(([p]) => p).sort(), ['buy.html', 'index.html'], 'the section is on /buy and the homepage');
  const bodies = pages.map(([, h]) => body(h).replace(/ data-astro-cid-\w+/g, ''));
  assert.equal(bodies[0], bodies[1], 'identical body');
  for (const [p, h] of pages) assert.equal((h.match(/data-abroad-steps/g) ?? []).length, 1, `${p}: one instance`);
});

test('the body: the lead line, an ordered list of the 7 steps in order as numbered chips, the closing line; no arrows', () => {
  for (const p of ['buy.html', 'index.html']) {
    const s = section(read(p));
    assert.ok(decodeEntities(s).includes(`<p class="abroad-lead">${LEAD}</p>`), `${p}: lead line`);
    const ol = s.slice(s.indexOf('<ol'), s.indexOf('</ol>') + 5);
    assert.match(ol, /^<ol class="abroad-steps" role="list">/, `${p}: a semantic ordered list`);
    const items = [...ol.matchAll(/<li class="abroad-step"><span class="abroad-num" aria-hidden="true">(\d)<\/span>([^<]+)<\/li>/g)].map((m) => [Number(m[1]), m[2]]);
    assert.deepEqual(items, STEPS.map((x, i) => [i + 1, x]), `${p}: 7 steps, numbered, in order`);
    assert.equal((ol.match(/<li\b/g) ?? []).length, 7);
    assert.ok(s.includes(`<p class="abroad-note">${NOTE}</p>`), `${p}: closing line`);
    assert.doesNotMatch(s, /\u2192|-&gt;|&rarr;/, `${p}: the arrows are gone`);
    // The same words, split: nothing added beyond the lead line, the steps and the closing line.
    assert.equal(text(s.slice(s.indexOf('<p class="abroad-lead"'))), [LEAD, ...STEPS.map((x, i) => `${i + 1} ${x}`), NOTE].join(' '), `${p}: words`);
  }
});

test('each page keeps its own heading; the section is centred at the homepage paragraph width', () => {
  assert.match(section(read('index.html')), /^<div class="abroad" data-abroad-steps>\s*<p class="eyebrow both">For international clients<\/p>\s*<h2>Buying in the UAE <em>from abroad\.<\/em><\/h2>/);
  assert.match(section(read('buy.html')), /^<div class="abroad" data-abroad-steps>\s*<h2 style="font-size:var\(--fs-heading\);line-height:var\(--lh-heading\)">Buying in the UAE from abroad<\/h2>/);
  const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
  const rule = (sel) => { const at = css.indexOf(`${sel} {`); assert.ok(at >= 0, sel); return css.slice(at, css.indexOf('}', at)); };
  assert.match(rule('.abroad'), /max-width: 43rem;.*text-align: center;/, '46rem .narrow less its 1.5rem padding each side');
  assert.match(rule('.abroad-steps'), /list-style: none;.*display: flex; flex-wrap: wrap; justify-content: center;/);
  const chip = rule('.abroad-step');
  for (const d of ['background: var(--paper);', 'border: 1px solid var(--chip-line);', 'border-radius: var(--radius-xl);', 'font-family: var(--sans);', 'font-size: clamp(var(--fs-label), 0.8125rem, var(--fs-small));']) assert.ok(chip.includes(d), d);
  assert.match(rule('.abroad-num'), /color: var\(--brass-deep\); font-weight: 500;/);
  assert.match(css, /--chip-line: #e3ddcf;/);
});
