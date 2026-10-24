// Owner rule 2026-10-24: no em dash anywhere (audit item 40). The scanner and its one legal.ts switch live in
// tests/helpers/no-em-dash.mjs; the Worker's vitest runs the same scanner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EM_DASH, findEmDashes, LEGAL, LEGAL_EMDASH_ALLOWED, REPO } from './helpers/no-em-dash.mjs';

test('40: no em dash in site/src, site/public, site/docs, worker/src, worker/templates or worker/scripts', () => {
  assert.deepEqual(findEmDashes(), []);
});

test('40: legal.ts is the only exception, through LEGAL_EMDASH_ALLOWED, and the scanner would catch it otherwise', () => {
  assert.equal(typeof LEGAL_EMDASH_ALLOWED, 'boolean');
  const legal = readFileSync(join(REPO, LEGAL), 'utf8');
  if (LEGAL_EMDASH_ALLOWED && legal.includes(EM_DASH)) {
    assert.ok(findEmDashes(REPO, false).every((h) => h.startsWith(`${LEGAL}:`)), 'only legal.ts is skipped');
    assert.ok(findEmDashes(REPO, false).length > 0, 'the scanner sees legal.ts once the switch is off');
  }
});

test('40: the built pages carry no em dash outside the Privacy and Terms pages', () => {
  const dist = join(REPO, 'site/dist');
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  for (const f of walk(dist).filter((x) => /\.(html|txt|xml)$/.test(x))) {
    if (LEGAL_EMDASH_ALLOWED && /[/\\](privacy|terms)\.html$/.test(f)) continue;
    assert.ok(!readFileSync(f, 'utf8').includes(EM_DASH), f);
  }
});
