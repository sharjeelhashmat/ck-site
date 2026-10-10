// Package B (owner-approved 2026-10-10): mandatory mobile with country code, validation, Turnstile, attribution, _headers.
// Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { toE164, dialCodes } from '../src/lib/phone.mjs';
import { attributionFields } from '../src/lib/attribution.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const read = (p) => readFileSync(join(dist, p), 'utf8');
const formPages = readdirSync(dist).filter((f) => f.endsWith('.html') && read(f).includes('id="lead-form"'));

test('the enquiry form exists on /contact and /sell', () => {
  assert.deepEqual(formPages.sort(), ['contact.html', 'sell.html']);
});

test('form: mobile number is required, with an all-countries code select defaulting to United Arab Emirates +971', () => {
  for (const f of formPages) {
    const h = read(f);
    assert.match(h, /<label for="f-phone">Mobile number \(with country code\)<\/label>/, `${f}: label`);
    assert.doesNotMatch(h, /Phone or WhatsApp \(optional\)/, `${f}: old optional label`);
    const sel = h.match(/<select id="f-phone-cc" name="phone_country" aria-label="Country code" required>([\s\S]*?)<\/select>/);
    assert.ok(sel, `${f}: required country-code select`);
    assert.ok((sel[1].match(/<option /g) ?? []).length >= 240, `${f}: all countries listed`);
    const options = [...sel[1].matchAll(/<option value="([A-Z]{2})" data-dial="(\d+)"( selected)?>([^<]*)<\/option>/g)];
    assert.ok(options.length >= 240, `${f}: every option parsed`);
    assert.deepEqual([options[0][1], options[0][2], options[0][3], options[0][4]], ['AE', '971', ' selected', 'United Arab Emirates (+971)'], `${f}: UAE first and selected`);
    assert.equal((sel[1].match(/ selected/g) ?? []).length, 1, `${f}: exactly one default`);
    const rest = options.slice(1).map((o) => o[4].replace(/ \(\+\d+\)$/, ''));
    assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, 'en')), `${f}: the rest alphabetical`);
    for (const o of options) {
      assert.equal(o[4], `${o[4].replace(/ \(\+\d+\)$/, '')} (+${o[2]})`, `${f}: option text is "Name (+code)": ${o[4]}`);
      assert.doesNotMatch(o[4], /\p{Extended_Pictographic}|\p{Regional_Indicator}/u, `${f}: no emoji in ${o[4]}`);
    }
    assert.match(h, /<input id="f-phone" name="phone_national" type="tel"[^>]*\brequired\b[^>]*aria-describedby="f-phone-err"/, `${f}: required national number input`);
    assert.match(h, /<span class="err" id="f-phone-err" data-err="phone" role="alert">/, `${f}: accessible error slot`);
  }
});

test('validation: only a number valid for the chosen country becomes E.164; anything else is blocked (no submit)', () => {
  assert.equal(toE164('50 123 4567', 'AE'), '+971501234567');
  assert.equal(toE164('050 123 4567', 'AE'), '+971501234567');
  assert.equal(toE164('07911 123456', 'GB'), '+447911123456');
  assert.equal(toE164('+971 50 123 4567', 'AE'), '+971501234567', 'own +code matching the chosen country');
  for (const [n, cc] of [['', 'AE'], ['12', 'AE'], ['50 123', 'AE'], ['call me', 'AE'], ['+447911123456', 'AE'], ['501234567', 'GB'], ['501234567', ''], ['501234567', 'ZZ']]) {
    assert.equal(toE164(n, cc), null, `${JSON.stringify(n)} for ${cc || '(none)'} must be blocked`);
  }
  const all = dialCodes();
  assert.ok(all.length >= 240);
  assert.deepEqual(all[0], { cc: 'AE', name: 'United Arab Emirates', dial: '971' }, 'UAE first, no flag field');
});

test('form script: blocks submit on an invalid phone and sends the E.164 value in "phone"', () => {
  const src = readFileSync(join(root, 'src/components/LeadForm.astro'), 'utf8');
  assert.match(src, /const phone = toE164\(national, ccSel\.value\);/);
  assert.match(src, /if \(!national\) \{ phoneErr\('Enter your mobile number\.'\); bad = true; \}/);
  assert.match(src, /else if \(!phone\) \{ phoneErr\(/);
  assert.match(src, /if \(bad\) \{ say\('Please fix the highlighted fields\.', false\); return; \}/, 'returns before fetch');
  assert.match(src, /\n {8}phone,\n/, 'payload field "phone" carries the E.164 value');
  assert.match(src, /body\.error === 'invalid_phone'/, 'server-side rejection is shown on the phone field');
});

test('Turnstile: the managed widget container is present on every form page with the site key', () => {
  for (const f of formPages) {
    assert.match(read(f), /<div class="turnstile cf-turnstile" data-sitekey="0x4AAAAAAE9Ndhe9on1juQ_h"/, f);
    assert.match(read(f), /src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js"/, f);
  }
});

test('_headers: llms.txt and robots.txt are served as UTF-8 plain text, merged ahead of the generated CSP once', () => {
  assert.ok(existsSync(join(root, 'public/_headers')), 'site/public/_headers');
  const h = read('_headers');
  for (const p of ['/llms.txt', '/robots.txt']) {
    assert.match(h, new RegExp(`^${p.replace('.', '\\.')}\\n  Content-Type: text/plain; charset=utf-8$`, 'm'), p);
    assert.equal(h.split(`${p}\n  Content-Type:`).length - 1, 1, `${p} listed once`);
  }
  assert.match(h, /^\/\*\n  Content-Security-Policy: /m, 'generated CSP block still present');
  assert.equal(spawnSync('node', ['scripts/postbuild.mjs'], { cwd: root, encoding: 'utf8' }).status, 0);
  assert.equal(read('_headers'), h, 're-running postbuild does not duplicate the static rules');
});

test('attribution: first-touch UTMs from the landing URL survive navigation to /contact and reach the payload', () => {
  const html = read('index.html');
  const capture = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('ck_attr'));
  assert.ok(capture, 'first-touch capture script is on every page');
  for (const f of ['contact.html', 'about.html']) assert.ok(read(f).includes(capture), `${f}: same capture script`);

  const store = new Map();
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const visit = (url, referrer) => {
    const u = new URL(url);
    vm.runInNewContext(capture, { sessionStorage, URLSearchParams, URL, JSON,
      location: { search: u.search, pathname: u.pathname, hostname: u.hostname }, document: { referrer } });
  };
  visit('https://www.sharjeelhashmat.com/insights/a?utm_source=linkedin&utm_medium=social&utm_campaign=launch', 'https://www.linkedin.com/');
  visit('https://www.sharjeelhashmat.com/about', 'https://www.sharjeelhashmat.com/insights/a');
  visit('https://www.sharjeelhashmat.com/contact?utm_source=other', 'https://www.sharjeelhashmat.com/about');

  const payload = attributionFields(JSON.parse(sessionStorage.getItem('ck_attr')), '/contact', 'https://www.sharjeelhashmat.com/about');
  assert.deepEqual(payload, {
    utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'launch', utm_content: undefined, utm_term: undefined,
    landing_page: '/insights/a', referrer: 'https://www.linkedin.com/',
  }, 'first touch wins; later pages do not overwrite it');

  // Storage unavailable (private mode): capture must not throw, and the payload falls back to the current page.
  assert.doesNotThrow(() => vm.runInNewContext(capture, { sessionStorage: { getItem() { throw new Error('denied'); } }, URLSearchParams, URL, JSON, location: { search: '', pathname: '/', hostname: 'x' }, document: { referrer: '' } }));
  assert.deepEqual(attributionFields({}, '/contact', ''), { utm_source: undefined, utm_medium: undefined, utm_campaign: undefined, utm_content: undefined, utm_term: undefined, landing_page: '/contact', referrer: undefined });

  const src = readFileSync(join(root, 'src/components/LeadForm.astro'), 'utf8');
  assert.match(src, /sessionStorage\.getItem\('ck_attr'\)/, 'form reads the captured attribution');
  assert.match(src, /\.\.\.attributionFields\(attribution, location\.pathname, document\.referrer\)/, 'and sends it in the payload');
});

test('compact country code: the closed control shows only "+971" (aria-hidden) over an accessible native select', () => {
  for (const f of formPages) {
    const h = read(f);
    const ctl = h.match(/<div class="cc-control">([\s\S]*?)<\/select>\s*<\/div>/);
    assert.ok(ctl, `${f}: country-code control`);
    assert.match(ctl[1], /<span class="cc-display" id="f-phone-cc-display" aria-hidden="true"><span class="cc-code">\+971<\/span><svg class="cc-chevron"/, `${f}: display span shows +971 by default`);
    assert.match(ctl[1], /<select id="f-phone-cc" name="phone_country" aria-label="Country code" required>/, `${f}: select keeps its accessible name`);
    assert.doesNotMatch(ctl[1], /<select[^>]*(aria-hidden|tabindex="-1"|disabled)/, `${f}: select stays focusable and exposed`);
  }
  const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
  assert.match(css, /\.phone-row \{ display: grid; grid-template-columns: 6\.5rem minmax\(0, 1fr\);/, 'fixed-width code, number takes the rest');
  assert.doesNotMatch(css, /\.phone-row \{ grid-template-columns: 1fr; \}/, 'no stacking on narrow screens');
  assert.match(css, /\.field \.cc-control select \{ position: absolute; inset: 0;[^}]*opacity: 0;/, 'select layered over the display');
  assert.match(css, /\.cc-control:focus-within \.cc-display \{[^}]*outline: 3px solid/, 'visible focus ring');
  const src = readFileSync(join(root, 'src/components/LeadForm.astro'), 'utf8');
  assert.match(src, /ccSelect\?\.addEventListener\('change', showDial\);/, 'display updates on change');
});
