// /new-launches indexing (audit M2, PR 2b item 1): noindex unless LAUNCH_CARDS_ALLOWED (agency, BRN and advertiser
// permit in golive.ts); with them it follows the site-wide switch and enters the sitemap. Builds its own copies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLIVE_TEST } from './helpers/golive.mjs';
import { checkReadiness } from '../scripts/readiness.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const ROBOTS = /<meta name="robots" content="([^"]*)">/;

function build(env) {
  const out = mkdtempSync(join(tmpdir(), 'ck-nl-'));
  const r = spawnSync('npx', ['astro', 'build', '--outDir', out], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (r.status === 0) {
    const p = spawnSync(process.execPath, ['scripts/postbuild.mjs', out], { cwd: root, encoding: 'utf8' });
    assert.equal(p.status, 0, p.stdout + p.stderr);
  }
  return { out, status: r.status, log: r.stdout + r.stderr };
}
const page = (out) => readFileSync(join(out, 'new-launches.html'), 'utf8');

test('public build with the agency, BRN and permit: /new-launches is index,follow, canonical, in the sitemap; readiness passes', () => {
  const { out, status, log } = build({ PUBLIC_INDEXABLE: 'true', GOLIVE_OVERRIDES: GOLIVE_TEST });
  assert.equal(status, 0, log);
  const h = page(out);
  assert.equal(h.match(ROBOTS)[1], 'index,follow,max-image-preview:large');
  assert.match(h, /<link rel="canonical" href="https:\/\/www\.sharjeelhashmat\.com\/new-launches">/);
  assert.match(readFileSync(join(out, 'sitemap-0.xml'), 'utf8'), /<loc>https:\/\/www\.sharjeelhashmat\.com\/new-launches<\/loc>/);
  assert.doesNotMatch(readFileSync(join(out, 'sitemap-0.xml'), 'utf8'), /\/investor-profile</, '/investor-profile stays out');
  assert.deepEqual(checkReadiness(out, { indexable: true }).filter((x) => x.level === 'FAIL'), []);
});

test('public build without the three values is refused, so /new-launches can never be public without them', () => {
  for (const o of [{ indexing: true }, { indexing: true, agencyName: 'Example Agency', agencyBrn: 'TEST-BRN' }]) {
    const { out, status, log } = build({ PUBLIC_INDEXABLE: 'true', GOLIVE_OVERRIDES: JSON.stringify(o) });
    assert.notEqual(status, 0, JSON.stringify(o));
    assert.match(log, /PUBLIC_INDEXABLE=true requires golive\.ts: .*advertiserPermitNo/);
    assert.equal(existsSync(join(out, 'new-launches.html')), false);
  }
});

test('non-indexable builds: /new-launches is noindex with or without the values, and there is no sitemap', () => {
  const real = readFileSync(join(root, 'dist', 'new-launches.html'), 'utf8');
  if (process.env.PUBLIC_INDEXABLE !== 'true') assert.equal(real.match(ROBOTS)[1], 'noindex,nofollow');
  const { out, status, log } = build({ PUBLIC_INDEXABLE: 'false', GOLIVE_OVERRIDES: GOLIVE_TEST });
  assert.equal(status, 0, log);
  assert.equal(page(out).match(ROBOTS)[1], 'noindex,nofollow');
  assert.doesNotMatch(page(out), /rel="canonical"/);
  assert.equal(existsSync(join(out, 'sitemap-index.xml')), false);
  assert.deepEqual(checkReadiness(out, { indexable: false }).filter((x) => x.level === 'FAIL'), []);
});
