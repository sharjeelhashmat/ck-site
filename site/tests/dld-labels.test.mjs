// DLD area labels (owner 2026-11-21, label fix). DLD's old and new area names list maps Jebel Ali Village to the DLD
// area Jabal Ali First; Jumeirah Lake Towers is under Al Thanyah Fifth. So Jabal Ali First is never labelled Jumeirah
// Lake Towers: not in the label file the Worker and the sync read, not in any data file, not in any built page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leadCaptureDist } from './helpers/build-mode.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const LABEL = 'Jebel Ali Village, Al Furjan, Discovery Gardens';
// "Jabal Ali First" and "Jumeirah Lake Towers" close together, in either order, is the wrong pairing.
const PAIRED = /Jabal Ali First.{0,80}Jumeirah Lake Towers|Jumeirah Lake Towers.{0,80}Jabal Ali First/s;

test('the label file: Jabal Ali First is Jebel Ali Village, Al Furjan, Discovery Gardens, never Jumeirah Lake Towers', () => {
  const labels = JSON.parse(readFileSync(join(root, 'src/data/dld-area-labels.json'), 'utf8'));
  assert.equal(labels['Jabal Ali First'], LABEL);
  assert.ok(!/Jumeirah Lake Towers|\bJLT\b/i.test(labels['Jabal Ali First']));
});

test('no data file or source pairs Jabal Ali First with Jumeirah Lake Towers', () => {
  for (const f of walk(join(root, 'src')).filter((p) => /\.(json|astro|mjs|ts|md)$/.test(p))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), PAIRED, f);
  }
});

test('no built page pairs Jabal Ali First with Jumeirah Lake Towers; the November article shows the new label', () => {
  for (const dir of [join(root, 'dist'), leadCaptureDist().dir]) {
    for (const f of walk(dir).filter((p) => p.endsWith('.html'))) assert.doesNotMatch(readFileSync(f, 'utf8'), PAIRED, f);
    const article = readFileSync(join(dir, 'insights/dubai-2026-so-far-official-numbers.html'), 'utf8');
    assert.ok(article.includes(LABEL), `${dir}: the Q3 top 8 shows the new label`);
  }
});
