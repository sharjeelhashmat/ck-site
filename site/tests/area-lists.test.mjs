// No fixed area list outside /areas (owner decision, Sept 2026, Queue row 'Remove "Where I operate" area-list widget'): a
// fixed list of areas reads as a limited service area and contradicts UAE-wide positioning. Area guides are listed only on
// /areas. Checked on site/dist and on a lead-capture build (the gated pages), after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leadCaptureDist } from './helpers/build-mode.mjs';
import { decodeEntities, stripScripts, stripStyles, stripTags } from '../scripts/html-text.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const text = (h) => decodeEntities(stripTags(stripStyles(stripScripts(h, ' '), ' '), ' ')).replace(/\s+/g, ' ');
const LABELS = /\b(areas I cover|areas we cover|where I operate|where we operate|areas I serve|areas we serve|my areas|service areas?)\b/i;

/** Pages outside /areas: [path relative to the build, html]. /areas.html and /areas/<slug>.html are where guides live. */
const pagesOutsideAreas = (dir) => walk(dir).filter((f) => f.endsWith('.html')).map((f) => [relative(dir, f).split(sep).join('/'), readFileSync(f, 'utf8')])
  .filter(([p]) => p !== 'areas.html' && !p.startsWith('areas/'));

function check(dir) {
  const pages = pagesOutsideAreas(dir);
  assert.ok(pages.length > 10, `${dir}: ${pages.length} pages checked`);
  for (const [p, h] of pages) {
    const body = h.slice(h.indexOf('<body'));
    assert.doesNotMatch(text(body), LABELS, `${p}: a fixed area-list label`);
    // A list of area guides: links to two or more different /areas/<slug> pages.
    const guides = [...new Set([...body.matchAll(/href="\/areas\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
    assert.ok(guides.length < 2, `${p}: links to ${guides.length} area guides (${guides.join(', ')}); guides are listed only on /areas`);
  }
}

test('no fixed area list on any page outside /areas (soft-launch build)', () => check(join(root, 'dist')));

test('no fixed area list on any page outside /areas (lead-capture build, gated pages included)', () => check(leadCaptureDist().dir));

test('/buy: the "Areas I cover" card is gone; the rest of the page is unchanged', () => {
  const h = readFileSync(join(root, 'dist', 'buy.html'), 'utf8');
  const t = text(h.slice(h.indexOf('<main'), h.indexOf('</main>')));
  assert.doesNotMatch(t, /Areas I cover/);
  for (const piece of ['Find the right property.', 'Ready Properties', 'Off-Plan Properties', 'Buying in the UAE from abroad']) assert.ok(t.includes(piece), piece);
  assert.doesNotMatch(readFileSync(join(root, 'src/pages/buy.astro'), 'utf8'), /lib\/areas|AREAS/);
  assert.doesNotMatch(readFileSync(join(root, 'src/styles/global.css'), 'utf8'), /\.list-plain\b/, 'its style went with it');
});

test('the guard catches a list: two guide links or a label outside /areas fail', () => {
  const fake = '<body><p>Areas I cover</p></body>';
  assert.match(text(fake), LABELS);
  const two = '<body><a href="/areas/dubai-marina">a</a><a href="/areas/business-bay">b</a></body>';
  assert.equal(new Set([...two.matchAll(/href="\/areas\/([a-z0-9-]+)"/g)].map((m) => m[1])).size, 2);
  assert.doesNotMatch(text('<body><p>UAE-wide, with area guides published for major districts under Areas.</p></body>'), LABELS, 'the FAQ answer is not a list');
});
