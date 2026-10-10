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
  assert.match(html(r.out, 'privacy.html'), /27 September 2026/);
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
  assert.match(priv, /27 September 2026/);
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

// Investor profile form (owner-approved 2026-10-10): Elsewhere in the UAE, advice, privacy note, actions, feedback.
// Reads the main build (dist/), like the other page tests.
import { MESSAGES, outcomeFor, otherAreaState, sendProfile, TIMEOUT_MS } from '../src/lib/profile-submit.mjs';
const page = () => readFileSync(join(root, 'dist/investor-profile.html'), 'utf8');

test('profile form: the eight areas, then "Elsewhere in the UAE" (other) and "Not sure yet" (advice), in that order', () => {
  const h = page();
  const values = [...h.matchAll(/<input type="checkbox" name="areas" value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values, ['downtown-dubai', 'dubai-marina', 'dubai-hills', 'dubai-creek-harbour', 'dubai-islands', 'palm-jumeirah', 'palm-jebel-ali', 'dubai-maritime-city', 'other', 'advice']);
  assert.match(h, /value="other" aria-controls="p-other-wrap"[^>]*><span>Elsewhere in the UAE<\/span>/);
  assert.match(h, /value="advice"[^>]*><span>Not sure yet – I’d like your advice<\/span>/);
  // When the Worker carries the extra values (PR "staging investor profiles; Other area"), the two lists must agree.
  const w = existsSync(join(root, '../worker/src/profile.ts')) ? read('../worker/src/profile.ts') : '';
  const extras = w.match(/AREA_EXTRAS\s*=\s*\[([^\]]*)\]/);
  if (extras) assert.deepEqual([...extras[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), ['other', 'advice']);
});

test('profile form: the "Which area or community?" field is hidden and not required until "other" is ticked; 80 characters max', () => {
  const h = page();
  assert.match(h, /<div class="field other-area" id="p-other-wrap" hidden>/);
  const input = h.match(/<input id="p-other"[^>]*>/)?.[0] ?? '';
  assert.match(input, /name="other_area"/);
  assert.match(input, /maxlength="80"/);
  assert.match(input, /placeholder="e\.g\. JVC, Yas Island, Al Marjan Island"/);
  assert.match(input, /aria-describedby="p-other-hint p-other-err"/);
  assert.doesNotMatch(input, /\srequired/);
  assert.match(h, /<label for="p-other">Which area or community\?<\/label>/);
  assert.match(h, /<span class="hint" id="p-other-hint">Any area or emirate in the UAE\.<\/span>/);
  assert.deepEqual(otherAreaState(true), { hidden: false, required: true, clear: false });
  assert.deepEqual(otherAreaState(false), { hidden: true, required: false, clear: true });
});

test('profile form: privacy note, WhatsApp ghost button and "Skip for now"; the old one-line footer is gone', () => {
  const h = page();
  assert.match(h, /<p class="profile-privacy">Your answers are stored with your enquiry and used only to tailor my recommendation to you\. See how your data is handled in the <a href="\/privacy">Privacy Policy<\/a>\.<\/p>/);
  const actions = h.match(/<div class="profile-actions">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.match(actions, /<button class="btn" type="submit" id="profile-submit">Send profile<\/button>/);
  assert.match(actions, /<a class="btn btn--ghost" href="https:\/\/wa\.me\/[^"]+" target="_blank" rel="noopener">Prefer to talk\? Message me on WhatsApp<\/a>/);
  assert.match(actions, /<a class="profile-skip" href="\/">Skip for now<\/a>/);
  assert.doesNotMatch(h, /Stored with your enquiry and used only to match properties to you/);
  assert.ok(h.indexOf('class="profile-actions"') < h.indexOf('class="profile-privacy"'), 'actions row above the privacy note');
});

test('profile feedback: each answer maps to exactly one visible outcome; failures re-enable Send', async () => {
  assert.deepEqual(outcomeFor(200, { ok: true }), { kind: 'success', message: 'Thank you. Your profile has been added to your enquiry.', enableSend: false });
  assert.deepEqual(outcomeFor(400, { ok: false, error: 'invalid_other_area' }), { kind: 'other_area', message: 'Please tell me which area, or untick Elsewhere in the UAE.', enableSend: true });
  const failMsg = 'Your profile could not be saved. Your enquiry has still been received, and I will reply within 24 hours.';
  for (const [s, b] of [[403, { error: 'not_allowed' }], [404, { error: 'invalid_link' }], [410, { error: 'expired' }], [400, { error: 'invalid_input', field: 'objective' }], [429, {}], [500, {}], [200, { ok: false }], [502, null]]) {
    assert.deepEqual(outcomeFor(s, b), { kind: 'failure', message: failMsg, enableSend: true }, `${s} ${JSON.stringify(b)}`);
  }
  assert.equal((await sendProfile('u', {}, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } })).kind, 'failure');
  const hang = (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
  assert.equal((await sendProfile('u', {}, { fetchImpl: hang, timeoutMs: 50 })).kind, 'failure');
  assert.equal(TIMEOUT_MS, 15000);
  const tpl = page().match(/<template id="profile-alert-tpl">([\s\S]*?)<\/template>/)?.[1] ?? '';
  assert.ok(tpl.replace(/<[^>]+>/g, '').startsWith(MESSAGES.failure), 'failure panel text');
  assert.match(tpl, /<a href="https:\/\/wa\.me\/[^"]+" target="_blank" rel="noopener">Message me on WhatsApp<\/a>/);
  assert.match(page(), /<div class="profile-alert" id="profile-alert" role="alert"><\/div>/);
});
