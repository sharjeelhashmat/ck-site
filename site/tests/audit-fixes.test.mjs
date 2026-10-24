// Audit fixes (site half): B3 canonical URLs, B2 the Worker's 503, H10/H11 /areas, H12 Turnstile fallback, H13 form
// errors, H14 narrow-screen grids, H15 on-demand phone library and Turnstile, and the unused font weights.
// Run after `npm run build`. Browser behaviour (320/375/1280, Worker blocked or malformed, Turnstile blocked) is in
// tests/e2e/browser.e2e.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLIVE_TEST } from './helpers/golive.mjs';
import { canonicalUrl } from '../src/lib/seo.mjs';
import { FIELD_MESSAGES, MESSAGES, outcomeFor, sendLead, turnstileGate, validateLead } from '../src/lib/lead-submit.mjs';
import { CHOOSE_ONE, MESSAGES as PROFILE_MESSAGES, profileProblems } from '../src/lib/profile-submit.mjs';
import { turnstileLoader, TURNSTILE_SRC } from '../src/lib/turnstile.mjs';
import { decide, initAreasPage, visibility } from '../src/lib/areas-page.mjs';
import { dubaiRows, renderChange, renderTop, renderYtd } from '../src/lib/market.mjs';
import { toE164 } from '../src/lib/phone.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const ORIGIN = 'https://www.sharjeelhashmat.com';
const src = (p) => readFileSync(join(root, p), 'utf8');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const pages = (dir) => walk(dir).filter((f) => f.endsWith('.html')).map((f) => ({ rel: f.slice(dir.length + 1), html: readFileSync(f, 'utf8') }));
const canonicals = (h) => [...h.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
const ogUrls = (h) => [...h.matchAll(/<meta property="og:url" content="([^"]*)"/g)].map((m) => m[1]);
const isNoindex = (h) => /<meta name="robots" content="noindex/.test(h);

// ---------- B3. Canonical and og:url ----------

test('B3: canonicalUrl drops ".html" and "/index"; the home page is origin + "/"', () => {
  for (const [p, want] of [
    ['/', `${ORIGIN}/`], ['', `${ORIGIN}/`], ['/index', `${ORIGIN}/`], ['/index.html', `${ORIGIN}/`],
    ['/about.html', `${ORIGIN}/about`], ['/about', `${ORIGIN}/about`], ['/areas/index.html', `${ORIGIN}/areas`],
    ['/areas/', `${ORIGIN}/areas`], ['/areas/dubai-hills.html', `${ORIGIN}/areas/dubai-hills`], ['/reindex.html', `${ORIGIN}/reindex`],
  ]) assert.equal(canonicalUrl(ORIGIN, p), want, p);
});

const checkCanonicals = (dir) => {
  for (const { rel, html } of pages(dir)) {
    for (const u of [...canonicals(html), ...ogUrls(html)]) {
      assert.doesNotMatch(u, /\.html$|\/index$/, `${rel}: ${u}`);
      assert.ok(u.startsWith(`${ORIGIN}/`), `${rel}: ${u}`);
    }
    if (isNoindex(html) || rel === '404.html') {
      assert.deepEqual([canonicals(html), ogUrls(html)], [[], []], `${rel}: noindex page carries no canonical or og:url`);
    }
  }
};

test('B3: in this (noindex) build no page carries a canonical or og:url ending in .html or /index, and noindex pages carry none', () => {
  checkCanonicals(dist);
  const notFound = readFileSync(join(dist, '404.html'), 'utf8');
  assert.doesNotMatch(notFound, /rel="canonical"|property="og:url"/);
});

test('B3: public build: canonicals are clean, noindex and 404 pages have none, and the sitemap is exactly the canonical set', () => {
  const out = mkdtempSync(join(tmpdir(), 'ck-canonical-'));
  const r = spawnSync('npx', ['astro', 'build', '--outDir', out], { cwd: root, env: { ...process.env, PUBLIC_INDEXABLE: 'true', GOLIVE_OVERRIDES: GOLIVE_TEST }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  checkCanonicals(out);
  const indexable = pages(out).filter((p) => !isNoindex(p.html));
  assert.ok(indexable.length > 10, 'the public build has indexable pages');
  const canon = new Set();
  for (const { rel, html } of indexable) {
    const [c, ...more] = canonicals(html);
    assert.equal(more.length, 0, `${rel}: one canonical`);
    assert.deepEqual(ogUrls(html), [c], `${rel}: og:url equals the canonical`);
    assert.equal(c, canonicalUrl(ORIGIN, `/${rel}`), rel);
    canon.add(c);
  }
  assert.ok(canon.has(`${ORIGIN}/`), 'home is origin + "/"');
  assert.equal(canonicals(readFileSync(join(out, '404.html'), 'utf8')).length, 0);
  const sitemap = new Set(readdirSync(out).filter((f) => /^sitemap-\d+\.xml$/.test(f))
    .flatMap((f) => [...readFileSync(join(out, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])));
  assert.deepEqual([...sitemap].sort(), [...canon].sort());
});

// ---------- B2 (site). The Worker's 503 temporarily_unavailable ----------

test('B2: 503 {error: "temporarily_unavailable"} is the failure alert (retry, WhatsApp, email), Send re-enabled', async () => {
  const want = { kind: 'failure', message: MESSAGES.failure, enableSend: true, resetTurnstile: true };
  assert.deepEqual(outcomeFor(503, { ok: false, error: 'temporarily_unavailable' }), want);
  assert.deepEqual(outcomeFor(503, { error: 'temporarily_unavailable' }), want);
  const res = await sendLead('https://w.test/lead', {}, { fetchImpl: async () => Response.json({ ok: false, error: 'temporarily_unavailable' }, { status: 503 }) });
  assert.deepEqual(res, want);
  // The form shows the alert template (WhatsApp + email) for a failure outcome.
  assert.match(src('src/components/LeadForm.astro'), /\} else \{\n\s*showAlert\(\);\n\s*\}/);
  assert.match(MESSAGES.failure, /WhatsApp/);
});

// ---------- /areas: a small fake document for initAreasPage ----------

class El {
  constructor(tag, { id, cls = [], data = {}, hidden = false } = {}, children = []) {
    Object.assign(this, { tag, id, cls, dataset: { ...data }, hidden, children, attrs: {}, innerHTML: '', tabIndex: 0, listeners: [] });
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { this.listeners.push([type, fn]); }
  focus() {}
  getBoundingClientRect() { return { height: 68 }; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  querySelectorAll(sel) { return this.all().filter((e) => matches(e, sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function matches(el, sel) {
  return [...sel.matchAll(/\.([\w-]+)|#([\w-]+)|\[data-([\w-]+)="([^"]*)"\]|\[data-([\w-]+)\]/g)].every((m) => {
    if (m[1]) return el.cls.includes(m[1]);
    if (m[2]) return el.id === m[2];
    if (m[3]) return el.dataset[camel(m[3])] === m[4];
    return el.dataset[camel(m[5])] !== undefined;
  });
}
function areasDoc({ adStatic = true } = {}) {
  const slots = (names) => names.map((s) => new El('div', { data: { slot: s } }));
  const adPanel = new El('div', { cls: ['mk-panel'], data: { emirate: 'abu_dhabi' }, hidden: !adStatic }, slots(['ytd', 'top', 'change']));
  if (adStatic) adPanel.children[1].innerHTML = '<section>Abu Dhabi top areas</section>';
  const pills = ['dubai', 'abu_dhabi'].map((e) => new El('button', { cls: ['mk-pill'], data: { emirate: e } }));
  const body = new El('body', {}, [
    new El('header', { cls: ['site-nav'] }),
    new El('div', { id: 'mk-switch', hidden: true }, pills),
    new El('div', { id: 'mk-root' }, [
      new El('div', { cls: ['mk-panel'], data: { emirate: 'dubai' }, hidden: true }, slots(['ytd', 'top', 'change'])),
      adPanel,
      new El('p', { id: 'mk-ask', hidden: true }),
      new El('section', { cls: ['mk-guides'], data: { emirate: 'dubai' } }),
      new El('section', { cls: ['mk-guides'], data: { emirate: 'abu_dhabi' } }),
    ]),
  ]);
  const winListeners = [];
  return {
    body, pills, winListeners,
    querySelector: (s) => body.querySelector(s),
    querySelectorAll: (s) => body.querySelectorAll(s),
    getElementById: (id) => body.all().find((e) => e.id === id) ?? null,
    documentElement: { style: { setProperty() {} } },
    defaultView: { addEventListener: (t, fn) => winListeners.push([t, fn]) },
  };
}
const shown = (doc, sel) => !doc.querySelector(sel).hidden;
const NO_DUBAI = { dubai: { ytd: '', top: '', change: '' }, abu_dhabi: { ytd: '' } };
const DUBAI = { dubai: { ytd: '', top: '<section>Dubai top areas</section>', change: '' }, abu_dhabi: { ytd: '' } };

// ---------- H10. Dubai guides are never hidden without the switch ----------

test('H10: without the switch every guide list stays visible; with it, the selected emirate only', () => {
  for (const has of [{ dubai: false, abu_dhabi: true }, { dubai: true, abu_dhabi: false }, { dubai: false, abu_dhabi: false }]) {
    const v = visibility(decide(has));
    assert.equal(v.dubai.guides, true, JSON.stringify(has));
    assert.equal(v.abu_dhabi.guides, true, JSON.stringify(has));
  }
  const both = visibility(decide({ dubai: true, abu_dhabi: true }));
  assert.deepEqual(both, { dubai: { panel: true, guides: true }, abu_dhabi: { panel: false, guides: false } });

  // Dubai figures missing (Worker down or malformed), Abu Dhabi from the build: no switch, Dubai guides visible.
  const doc = areasDoc();
  const st = initAreasPage(doc, NO_DUBAI);
  assert.equal(st.switchVisible, false);
  assert.ok(!shown(doc, '#mk-switch'));
  assert.ok(shown(doc, '.mk-guides[data-emirate="dubai"]'), 'Dubai guides visible');
  assert.ok(shown(doc, '.mk-guides[data-emirate="abu_dhabi"]'));
  assert.ok(shown(doc, '.mk-panel[data-emirate="abu_dhabi"]') && !shown(doc, '.mk-panel[data-emirate="dubai"]'));
  // No figures at all: both guide lists, no panels.
  const none = areasDoc({ adStatic: false });
  initAreasPage(none, NO_DUBAI);
  assert.ok(shown(none, '.mk-guides[data-emirate="dubai"]') && shown(none, '.mk-guides[data-emirate="abu_dhabi"]'));
  assert.ok(!shown(none, '#mk-ask'));
});

// ---------- H11. /areas: static panel, .catch, row guards, idempotent init, escaping ----------

test('H11: the build-time Abu Dhabi panel is visible in the markup; the fetch chain has a .catch', () => {
  const h = readFileSync(join(dist, 'areas.html'), 'utf8');
  const tag = h.match(/<div class="mk-panel" data-emirate="abu_dhabi"[^>]*>/)[0];
  assert.match(tag, /data-static="yes"/, 'this build has ADREC areas');
  assert.doesNotMatch(tag, /\shidden/, 'not hidden until JS runs');
  assert.match(h.slice(h.indexOf(tag)), /<article class="mk-card">/);
  assert.match(h.match(/<div class="mk-panel" data-emirate="dubai"[^>]*>/)[0], /\shidden/, 'the Dubai panel waits for its data');
  const page = src('src/pages/areas/index.astro');
  assert.match(page, /\.catch\(\(\) => NONE\)\n\s*\.then\(\(html\) => initAreasPage\(document, html\)\);/);
});

test('H11: dubaiRows drops malformed rows; nothing renders as NaN or undefined', () => {
  const good = { rank: 1, area_en: 'Business Bay', label: null, value_bn: 8.04, share_pct: 4.4, change_pct: -41, prior_zero: false };
  const bad = [
    null, 'x', { ...good, rank: '2' }, { ...good, rank: 0 }, { ...good, rank: 1.5 }, { ...good, area_en: '' }, { ...good, area_en: 7 },
    { ...good, value_bn: '8.04' }, { ...good, value_bn: NaN }, { ...good, value_bn: 0 }, { ...good, share_pct: undefined },
    { ...good, share_pct: 'x' }, { ...good, share_pct: Infinity }, { ...good, change_pct: '12' }, { ...good, change_pct: NaN },
  ];
  const rows = dubaiRows({ dubai: { top8: [good, ...bad, { ...good, rank: 2, area_en: 'Marsa Dubai', label: 'Dubai Marina', change_pct: undefined, prior_zero: 'yes' }] } });
  assert.deepEqual(rows, [
    { rank: 1, area: 'Business Bay', label: null, value_bn: 8.04, share_pct: 4.4, change_pct: -41, prior_zero: false },
    { rank: 2, area: 'Marsa Dubai', label: 'Dubai Marina', value_bn: 8.04, share_pct: 4.4, change_pct: null, prior_zero: false },
  ]);
  assert.deepEqual(dubaiRows({ dubai: { top8: 'nope' } }), []);
  assert.deepEqual(dubaiRows(null), []);
  const d = { period: '2026-H1', areas: rows };
  for (const html of [renderTop('dubai', d), renderChange('dubai', d)]) {
    assert.ok(html.length > 100);
    assert.doesNotMatch(html, /NaN|undefined|null/);
  }
  // Only malformed rows: nothing to show, not a broken section.
  assert.equal(renderTop('dubai', { period: '2026-H1', areas: dubaiRows({ dubai: { top8: bad } }) }), '');
  // Year to date: a numeric string or NaN is not a figure.
  for (const ytd of [{ sales_bn: '391.7', total_bn: 591.6, mortgages_bn: 154.7, as_of: '2026-10-09' }, { sales_bn: 391.7, total_bn: NaN, mortgages_bn: 154.7, as_of: '2026-10-09' }]) {
    assert.equal(renderYtd('dubai', ytd), '');
  }
});

test('H11: rank and year are escaped in the rendered HTML', () => {
  const top = renderTop('dubai', { period: '2026-H1', areas: [{ rank: '<img src=x onerror=1>', area: 'A', value_bn: 1, share_pct: 1, change_pct: 1 }] });
  assert.match(top, /#&lt;img src=x onerror=1&gt;/);
  assert.doesNotMatch(top, /<img/);
  const ytd = renderYtd('abu_dhabi', { sales_bn: 1, total_bn: 2, mortgages_bn: 3, as_of: '2026-10-16', year: '<b>2026</b>' });
  assert.match(ytd, /&lt;b&gt;2026&lt;\/b&gt; so far/);
  assert.doesNotMatch(ytd, /<b>/);
  assert.doesNotMatch(ytd, /&amp;lt;/, 'escaped once, not twice');
});

test('H11: initAreasPage is safe to call twice (no duplicate listeners or DOM)', () => {
  const doc = areasDoc();
  initAreasPage(doc, DUBAI);
  initAreasPage(doc, DUBAI);
  const st = initAreasPage(doc, DUBAI);
  assert.equal(st.switchVisible, true);
  for (const p of doc.pills) {
    assert.deepEqual(p.listeners.map(([t]) => t).sort(), ['click', 'keydown'], 'one click and one keydown per pill');
  }
  assert.equal(doc.winListeners.length, 1, 'one resize handler');
  assert.equal(doc.querySelector('.mk-panel[data-emirate="dubai"]').querySelector('[data-slot="top"]').innerHTML, '<section>Dubai top areas</section>', 'replaced, not appended');
  // The switch still works after repeated init: Abu Dhabi, then back to Dubai with the keyboard.
  doc.pills[1].listeners.find(([t]) => t === 'click')[1]();
  assert.ok(shown(doc, '.mk-panel[data-emirate="abu_dhabi"]') && !shown(doc, '.mk-panel[data-emirate="dubai"]'));
  assert.ok(shown(doc, '.mk-guides[data-emirate="abu_dhabi"]') && !shown(doc, '.mk-guides[data-emirate="dubai"]'));
  assert.equal(doc.pills[1].getAttribute('aria-checked'), 'true');
  doc.pills[1].listeners.find(([t]) => t === 'keydown')[1]({ key: 'ArrowLeft', preventDefault() {} });
  assert.equal(doc.pills[0].getAttribute('aria-checked'), 'true');
  assert.ok(shown(doc, '.mk-guides[data-emirate="dubai"]'));
  // A later call with less data falls back cleanly: the switch goes, every guide list shows.
  const less = areasDoc();
  initAreasPage(less, DUBAI);
  less.querySelector('.mk-panel[data-emirate="dubai"]').querySelector('[data-slot="top"]').innerHTML = '';
  initAreasPage(less, NO_DUBAI);
  assert.ok(!shown(less, '#mk-switch'));
  assert.ok(shown(less, '.mk-guides[data-emirate="dubai"]') && shown(less, '.mk-guides[data-emirate="abu_dhabi"]'));
});

// ---------- H12. Turnstile never loaded -> the WhatsApp + email alert ----------

function fakeScriptEnv({ existing = false } = {}) {
  const scripts = [];
  const mk = (src) => ({ src, removed: false, handlers: {}, addEventListener(t, fn) { (this.handlers[t] ??= []).push(fn); }, remove() { this.removed = true; scripts.splice(scripts.indexOf(this), 1); }, fire(t) { (this.handlers[t] ?? []).forEach((f) => f()); } });
  if (existing) scripts.push(mk(`${TURNSTILE_SRC}?render=explicit`));
  const doc = {
    querySelector: (sel) => (sel === `script[src^="${TURNSTILE_SRC}"]` ? scripts[0] ?? null : null),
    createElement: () => mk(''),
    head: { appendChild: (s) => scripts.push(s) },
  };
  return { scripts, doc, win: {} };
}

test('H12: the Turnstile loader rejects when the script fails or times out, and tries again next time', async () => {
  const env = fakeScriptEnv();
  let t = 0;
  const load = turnstileLoader({ win: env.win, doc: env.doc, timeoutMs: 1000, pollMs: 1, now: () => t });
  const first = load();
  assert.equal(env.scripts.length, 1);
  assert.equal(env.scripts[0].src, `${TURNSTILE_SRC}?render=explicit`);
  env.scripts[0].fire('error');
  await assert.rejects(first);
  assert.equal(env.scripts.length, 0, 'a failed script of ours is removed');
  // Timeout.
  const second = load();
  assert.equal(env.scripts.length, 1, 'tried again');
  t = 2000;
  await assert.rejects(second);
  // Success, through a script already in the page (the newsletter's).
  const other = fakeScriptEnv({ existing: true });
  const load2 = turnstileLoader({ win: other.win, doc: other.doc, timeoutMs: 1000, pollMs: 1, now: () => 0 });
  const p = load2();
  other.win.turnstile = { render() { return 'w1'; } };
  assert.equal(await p, other.win.turnstile);
  assert.equal(other.scripts.length, 1, 'no second script');
  assert.equal(await load2(), other.win.turnstile);
});

test('H12: Send shows the fallback alert when the check never loaded or errored, waits only for a token in progress', () => {
  assert.equal(turnstileGate({ loaded: false }), 'fallback');
  assert.equal(turnstileGate({ loaded: false, token: 'tok' }), 'fallback');
  assert.equal(turnstileGate({ loaded: true, errored: true, token: '' }), 'fallback');
  assert.equal(turnstileGate({ loaded: true, errored: true, token: 'tok' }), 'send');
  assert.equal(turnstileGate({ loaded: true, token: '' }), 'wait');
  assert.equal(turnstileGate({ loaded: true, token: 'tok' }), 'send');
  const js = src('src/components/LeadForm.astro');
  assert.match(js, /try \{ ts = await ensureWidget\(\); \} catch \{ ts = null; \}/);
  assert.match(js, /if \(gate === 'fallback'\) showAlert\(\);/);
  assert.match(js, /'error-callback': \(\) => \{ widgetErrored = true; \}/);
  // The alert (with WhatsApp) is on every form page, including launch mode.
  for (const f of ['contact.html', 'sell.html', 'new-launches.html']) {
    const h = readFileSync(join(dist, f), 'utf8');
    assert.match(h.match(/<div id="lead-alert-tpl" hidden>([\s\S]*?)<\/div>/)[1], /wa\.me[\s\S]*mailto:/, f);
  }
});

// ---------- H13. Form errors ----------

const formErrors = (h, formId) => {
  const form = h.match(new RegExp(`<form[^>]*id="${formId}"[\\s\\S]*?</form>`))[0];
  return { form, spans: [...form.matchAll(/<span class="err[^"]*"[^>]*>/g)].map((m) => m[0]) };
};

test('H13: every error span has an id, no per-field role="alert", and its control points at it with aria-describedby', () => {
  const cases = [['contact.html', 'lead-form'], ['sell.html', 'lead-form'], ['new-launches.html', 'lead-form'], ['investor-profile.html', 'profile-form']];
  for (const [f, id] of cases) {
    const { form, spans } = formErrors(readFileSync(join(dist, f), 'utf8'), id);
    assert.ok(spans.length >= 4, f);
    for (const s of spans) {
      const sid = s.match(/\bid="([^"]+)"/)?.[1];
      assert.ok(sid, `${f}: ${s} has an id`);
      const field = s.match(/data-err="([^"]+)"/)[1];
      if (field === 'turnstile') continue; // form-level message (no control), announced as an alert
      assert.doesNotMatch(s, /role="alert"/, `${f}: ${field}`);
      const controls = [...form.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((c) => new RegExp(`aria-describedby="[^"]*\\b${sid}\\b`).test(c));
      assert.ok(controls.length >= 1, `${f}: a control is described by ${sid}`);
    }
  }
  for (const f of ['contact.html', 'sell.html']) {
    assert.match(readFileSync(join(dist, f), 'utf8'), /<select id="f-country" name="country" autocomplete="country">/, f);
  }
});

test('H13: problems come back in page order (first gets focus); aria-invalid is set and cleared by the scripts', () => {
  const all = validateLead('general', { name: '', email: 'x', national: '', country: 'AE', choice: '', message: '', consent: false }, toE164);
  assert.deepEqual(all.problems.map(([k]) => k), ['name', 'email', 'phone', 'preferred_contact', 'consent_contact']);
  assert.deepEqual(all.problems.map(([, m]) => m), [FIELD_MESSAGES.name, FIELD_MESSAGES.email, FIELD_MESSAGES.phoneMissing, FIELD_MESSAGES.preferred_contact, FIELD_MESSAGES.consent_contact]);
  const ok = validateLead('sell', { name: "Anne-Marie O'Neil", email: 'a@b.co', national: '050 123 4567', country: 'AE', choice: 'whatsapp', message: 'Hi', consent: true, sellParts: [['Location', 'JVC']] }, toE164);
  assert.deepEqual(ok, { problems: [], phone: '+971501234567', message: 'Preferred contact: WhatsApp | Location: JVC || Hi' });
  assert.deepEqual(profileProblems({ objective: '', property_type: 'apartment', risk_tolerance: '', holding_period: 'x' }, true, '  '),
    [['objective', CHOOSE_ONE], ['risk_tolerance', CHOOSE_ONE], ['other_area', PROFILE_MESSAGES.otherArea]]);
  assert.deepEqual(profileProblems({ objective: 'a', property_type: 'b', risk_tolerance: 'c', holding_period: 'd' }, false, ''), []);
  const lead = src('src/components/LeadForm.astro');
  assert.match(lead, /for \(const c of controls\(field\)\) c\.setAttribute\('aria-invalid', 'true'\);/);
  assert.match(lead, /for \(const c of controls\(field\)\) c\.removeAttribute\('aria-invalid'\);/);
  assert.match(lead, /focusField\(problems\[0\]\[0\]\);/);
  assert.match(lead, /form\.addEventListener\('input', recheck\);/);
  const profile = src('src/pages/investor-profile.astro');
  assert.match(profile, /control\(f\)\?\.setAttribute\('aria-invalid', 'true'\);/);
  assert.match(profile, /control\(f\)\?\.removeAttribute\('aria-invalid'\);/);
  assert.match(profile, /control\(problems\[0\]\[0\]\)\?\.focus\(\);/);
});

test('H13: the invalid border uses the existing --err token; no colour token changed', () => {
  const css = src('src/styles/global.css');
  assert.match(css, /\.field input\[aria-invalid='true'\], \.field select\[aria-invalid='true'\], \.field textarea\[aria-invalid='true'\] \{ border-color: var\(--err\); \}/);
  assert.match(css, /\.check input\[type='checkbox'\]\[aria-invalid='true'\] \{ border-color: var\(--err\); \}/);
  assert.match(src('src/components/LeadForm.astro'), /\.pref \.pill input\[aria-invalid='true'\] \+ span \{ border-color: var\(--err\); \}/);
  assert.match(css, /--err: #a12a2a;/);
});

// ---------- H14. Grids never overflow a narrow screen ----------

test('H14: every auto-fit / auto-fill grid uses minmax(min(X, 100%), 1fr) with its original X', () => {
  const files = walk(join(root, 'src')).filter((f) => /\.(css|astro)$/.test(f));
  const found = [];
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/repeat\(\s*auto-(?:fit|fill)\s*,\s*(minmax\([^;"]*?\))\s*\)/g)) found.push([f.slice(root.length), m[1].replace(/\s+/g, '')]);
  }
  assert.ok(found.length >= 7, `${found.length} grids`); // .grid--4 was unused and removed (audit item 27)
  for (const [f, mm] of found) assert.match(mm, /^minmax\(min\(\d+(\.\d+)?rem,100%\),1fr\)$/, `${f}: ${mm}`);
  const css = src('src/styles/global.css');
  for (const [sel, x] of [['.grid--2', 17], ['.grid--3', 15], ['.split', 19], ['.list-plain', 10], ['.fields', 14]]) {
    assert.match(css, new RegExp(`${sel.replace('.', '\\.')} \\{[^}]*repeat\\(auto-fit, minmax\\(min\\(${x}rem, 100%\\), 1fr\\)\\)`), sel);
  }
  assert.match(src('src/styles/market.css'), /\.lw-grid \{[^}]*minmax\(min\(16rem, 100%\), 1fr\)/);
});

// ---------- H15. Phone library and Turnstile on demand ----------

test('H15: /contact loads neither libphonenumber nor Turnstile with the page', () => {
  const h = readFileSync(join(dist, 'contact.html'), 'utf8');
  assert.doesNotMatch(h, /<script[^>]*src="https:\/\/challenges\.cloudflare\.com/);
  const entry = [...h.matchAll(/<script type="module" src="(\/_astro\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(entry.length, 1);
  const js = readFileSync(join(dist, entry[0]), 'utf8');
  assert.ok(js.length < 30000, `entry is ${js.length} bytes`);
  assert.doesNotMatch(js, /^import\s.*phone\./m, 'no static import of the phone chunk');
  assert.match(js, /import\("\.\/phone\.[\w-]+\.js"\)/, 'dynamic import of the phone chunk');
  const phone = readdirSync(join(dist, '_astro')).find((f) => /^phone\.[\w-]+\.js$/.test(f));
  assert.ok(readFileSync(join(dist, '_astro', phone), 'utf8').length > 50000, 'the phone chunk holds the metadata');
  assert.doesNotMatch(h, /rel="modulepreload"[^>]*phone\./);
  const lead = src('src/components/LeadForm.astro');
  assert.match(lead, /import\('\.\.\/lib\/phone\.mjs'\)/);
  assert.doesNotMatch(lead.slice(lead.indexOf('<script>')), /import \{[^}]*\} from '\.\.\/lib\/phone\.mjs'/);
  assert.match(lead, /addEventListener\('input', \(\) => \{ loadPhone\(\)/);
});

// ---------- Cleanup ----------

test('cleanup: only the Cormorant weights in use (400 and 400 italic) are imported', () => {
  const css = src('src/styles/global.css');
  assert.doesNotMatch(css, /cormorant-garamond\/(300|500)/);
  assert.match(css, /@import '@fontsource\/cormorant-garamond\/400\.css';/);
  assert.match(css, /@import '@fontsource\/cormorant-garamond\/400-italic\.css';/);
});
