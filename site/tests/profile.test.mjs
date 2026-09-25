// Investor profile (step 2): switch, page, and agreement with the Worker proposal. Build tests write to their own outDir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

function build(flag) {
  const out = mkdtempSync(join(tmpdir(), 'ck-profile-out-'));
  const r = spawnSync('npx', ['astro', 'build', '--outDir', out], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, PUBLIC_PROFILE_ENABLED: flag, PUBLIC_INDEXABLE: 'true', PUBLIC_BRN: 'TEST-BRN' },
  });
  return { out, status: r.status, log: r.stdout + r.stderr };
}
const html = (out, p) => readFileSync(join(out, p), 'utf8');

test('the profile switch is ON by default (Worker route deployed, owner approved 2026-09-21)', () => {
  assert.match(read('src/lib/profile.ts'), /const PROFILE_DEFAULT = true;/);
});

test('switch OFF: no link after an enquiry, no Privacy line, page still built but noindex and out of the sitemap', () => {
  const r = build('false');
  assert.equal(r.status, 0, r.log);
  assert.doesNotMatch(html(r.out, 'contact.html'), /id="lead-next"|data-profile=/);
  assert.doesNotMatch(html(r.out, 'privacy.html'), /investor profile/i);
  assert.match(html(r.out, 'privacy.html'), /20 September 2026/);
  assert.match(html(r.out, 'investor-profile.html'), /<meta name="robots" content="noindex,nofollow">/);
  assert.ok(!/investor-profile/.test(readFileSync(join(r.out, 'sitemap-0.xml'), 'utf8')));
});

test('switch ON: link after an enquiry for buy, invest and abroad only; Privacy line and date appear', () => {
  const r = build('true');
  assert.equal(r.status, 0, r.log);
  const contact = html(r.out, 'contact.html');
  assert.match(contact, /data-profile="buy,invest,abroad"/);
  assert.match(contact, /id="lead-next"/);
  const priv = html(r.out, 'privacy.html');
  assert.match(priv, /optional investor profile/);
  assert.match(priv, /never published or sent to social media or advertising tools/);
  assert.match(priv, /21 September 2026/);
  assert.match(html(r.out, 'investor-profile.html'), /<meta name="robots" content="noindex,nofollow">/);
  assert.ok(!/investor-profile/.test(readFileSync(join(r.out, 'sitemap-0.xml'), 'utf8')));
});

test('the profile page renders every option and every area name (no blank labels)', () => {
  const r = build('false');
  assert.equal(r.status, 0, r.log);
  const page = html(r.out, 'investor-profile.html');
  for (const n of ['Downtown Dubai', 'Dubai Marina', 'Palm Jumeirah', 'Rental income', 'A mix of both', 'Under 2 years', '10 years or more', 'No preference']) assert.match(page, new RegExp(n), n);
  assert.doesNotMatch(page, /<label class="check"><input[^>]*><span><\/span>|<option value="[^"]+"><\/option>/);
});

test('the profile page asks the five fields, posts only to the Worker, and keeps the lead id out of storage', () => {
  const page = read('src/pages/investor-profile.astro');
  for (const n of ['objective', 'property_type', 'risk_tolerance', 'holding_period', 'areas']) assert.match(page, new RegExp(`name="${n}"`), n);
  assert.match(page, /\/profile`/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|document\.cookie/);
});

test('site options match the Worker proposal exactly (values, order and area slugs)', () => {
  const worker = existsSync(join(root, '../worker/src/profile.ts')) ? '../worker/src/profile.ts' : 'docs/proposals/investor-profile-step2/profile.ts.proposed';
  const w = read(worker);
  const list = (src, name) => [...src.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const s = read('src/lib/profile.ts');
  const siteVals = (key) => [...s.match(new RegExp(`${key}: \\[([\\s\\S]*?)\\],\\n`))[1].matchAll(/value: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(siteVals('objective'), list(w, 'OBJECTIVES'));
  assert.deepEqual(siteVals('property_type'), list(w, 'PROPERTY_TYPES'));
  assert.deepEqual(siteVals('risk_tolerance'), list(w, 'RISK_TOLERANCES'));
  assert.deepEqual(siteVals('holding_period'), list(w, 'HOLDING_PERIODS'));
  const areas = [...read('src/lib/areas.ts').matchAll(/^\s+slug: '([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual([...areas].sort(), [...list(w, 'AREA_SLUGS')].sort());
});
