// Reelly launch cards on the public site (owner 2026-11-19): built in code but OFF. No card, project page or WhatsApp
// link from Reelly is built while GOLIVE keeps launch cards off, and per project they need a Trakheesi permit number and
// QR, agency and ORN (lib/reelly-gate.mjs); the WhatsApp button also needs LEAD_CAPTURE. The renderer
// (lib/launch-cards.mjs) is shared with the private research tool (worker/reelly). Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leadCaptureDist } from './helpers/build-mode.mjs';
import { checkReellyLaunches, publicLaunches } from '../src/lib/reelly-gate.mjs';
import { esc, normaliseProject, renderLaunchCard, renderProjectDetail, safeUrl, summariseUnits, waHrefFor } from '../src/lib/launch-cards.mjs';
import { DEMO_PROJECTS, DEMO_UNITS } from '../src/lib/reelly-demo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const builds = () => [join(root, 'dist'), leadCaptureDist().dir];
const OFF = { abuDhabiLicensed: false };
const ITEM = { emirate: 'dubai', permit_number: '1234567890', permit_qr: '/permits/demo.png', agency_name: 'Agency', agency_orn: '12345', image: null, reelly: { id: 42, name: 'Project', min_price: 1000000, location: { district: 'Area', region: 'Dubai' } } };

test('the data file ships empty, and no public page or component imports the private demo data', () => {
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'src/data/reelly-launches.json'), 'utf8')), []);
  for (const f of walk(join(root, 'src')).filter((p) => /\.(astro|ts|mjs)$/.test(p) && !p.endsWith('reelly-demo.mjs'))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /(from|import)\s*\(?\s*['"][^'"]*reelly-demo/, f);
  }
});

test('soft launch and lead capture builds: no Reelly card, project page, WhatsApp link or Reelly reference is built', () => {
  for (const dir of builds()) {
    assert.ok(!existsSync(join(dir, 'new-launches')), `${dir}: no /new-launches/<id> pages`);
    for (const f of walk(dir).filter((p) => p.endsWith('.html'))) {
      const h = readFileSync(f, 'utf8');
      assert.doesNotMatch(h, /class="[^"]*\blc-(card|grid|project)\b/, `${f}: no launch card or project markup`);
      assert.doesNotMatch(h, /Demo data|Reelly|api-reelly|X-API-Key/i, `${f}: no Reelly text`);
    }
    // The soft-launch build has no WhatsApp link anywhere; the lead-capture build has the site's own, never one for a launch.
    for (const f of walk(dir).filter((p) => p.endsWith('.html'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /know more about/, `${f}: no launch WhatsApp link`);
  }
  const soft = join(root, 'dist');
  for (const f of walk(soft).filter((p) => p.endsWith('.html'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /wa\.me/, `${f}: no wa.me in soft launch`);
  // The sitemap (public build only) lists no launch page.
  for (const f of walk(soft).filter((p) => /sitemap.*\.xml$/.test(p))) assert.doesNotMatch(readFileSync(f, 'utf8'), /\/new-launches\//, f);
});

test('the gate: nothing while launch cards are off; every item needs its permit number and QR, agency and ORN', () => {
  assert.deepEqual(publicLaunches([], OFF, false), []);
  assert.deepEqual(publicLaunches([ITEM], OFF, false), [], 'off: a valid item is still not shown');
  const on = publicLaunches([ITEM], OFF, true);
  assert.equal(on.length, 1);
  assert.equal(on[0].view.name, 'Project');
  assert.deepEqual(on[0].compliance, { permit_number: '1234567890', permit_qr: '/permits/demo.png', agency_name: 'Agency', agency_orn: '12345' });
  for (const k of ['permit_number', 'permit_qr', 'agency_name', 'agency_orn']) {
    assert.throws(() => publicLaunches([{ ...ITEM, [k]: '' }], OFF, false), new RegExp(`${k} is required`), `${k}: refused even while off`);
  }
  assert.match(checkReellyLaunches([{ ...ITEM, permit_qr: 'https://cdn.example/qr.png' }], OFF).join(), /self-hosted/);
  assert.match(checkReellyLaunches([{ ...ITEM, emirate: 'abu_dhabi' }], OFF).join(), /Abu Dhabi items are refused/);
  assert.deepEqual(checkReellyLaunches([{ ...ITEM, emirate: 'abu_dhabi' }], { abuDhabiLicensed: true }), []);
  assert.match(checkReellyLaunches([{ ...ITEM, image: 'https://reelly.example/a.jpg' }], OFF).join(), /self-hosted \/launch-images/);
  assert.match(checkReellyLaunches([{ ...ITEM, reelly: {} }], OFF).join(), /reelly\.id/);
  assert.deepEqual(checkReellyLaunches('x', OFF), ['reelly-launches.json must be a list']);
});

test('the WhatsApp button and the permit block appear only when the caller passes them (public: LEAD_CAPTURE and the permit values)', () => {
  const v = normaliseProject(ITEM.reelly);
  const bare = renderProjectDetail(v, { waHref: null, compliance: null });
  assert.doesNotMatch(bare, /wa\.me|lw-permit/);
  const full = renderProjectDetail(v, { waHref: waHrefFor('971555414468', v.name), compliance: { permit_number: '1', permit_qr: '/permits/a.png', agency_name: 'A', agency_orn: '2' } });
  assert.match(full, /<a class="btn" href="https:\/\/wa\.me\/971555414468\?text=Hi%20Sharjeel%2C%20I&#39;d%20like%20to%20know%20more%20about%20Project\." rel="noopener" target="_blank">/);
  assert.match(full, /<div class="lw-permit"><img src="\/permits\/a\.png" alt="Permit 1 QR code"/);
  assert.match(full, /Source: Reelly, a third-party property data aggregator\. Its figures are tier 3 under Rules section 3 and are not confirmed by the developer\./);
});

test('the renderer escapes every value and uses only https links from the data', () => {
  assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  for (const bad of ['javascript:alert(1)', 'http://x.example/a.pdf', '/relative.png', 'data:image/png;base64,AA', ' ', null, 7]) assert.equal(safeUrl(bad), null, String(bad));
  assert.equal(safeUrl('https://cdn.example/a b.png'), 'https://cdn.example/a%20b.png');
  const evil = normaliseProject({ id: 1, name: '<script>alert(1)</script>', developer: '"><img src=x onerror=alert(1)>', cover_image: { url: 'javascript:alert(1)' }, marketing_brochure: 'javascript:x', floor_plans: [{ name: 'a', file: 'http://plain.example/a.pdf' }] });
  const card = renderLaunchCard(evil, { href: '/x' });
  const page = renderProjectDetail(evil, {});
  for (const h of [card, page]) {
    // Every real tag in the output (the text between "<" and the next ">"), lower-cased: no script tag, no event
    // handler and no image from the data; and no javascript: or http: URL anywhere.
    const tags = h.split('<').slice(1).map((t) => t.slice(0, t.indexOf('>')).toLowerCase());
    for (const t of tags) {
      assert.ok(!t.startsWith('script') && !t.startsWith('/script'), `no script tag: <${t}>`);
      assert.ok(!t.includes('onerror') && !t.includes('onload'), `no event handler: <${t}>`);
      assert.ok(!t.startsWith('img src=x'), `no image from the data: <${t}>`);
    }
    const lower = h.toLowerCase();
    assert.ok(!lower.includes('javascript:') && !lower.includes('http://'), 'no javascript: or http: URL');
  }
  assert.match(card, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(page, /No documents in the data\./);
});

test('demo data is labelled: the built-in sample always, a Reelly record when its name says demo or test', () => {
  const demo = DEMO_PROJECTS.map((p) => normaliseProject(p, { demo: true }));
  for (const v of demo) {
    assert.match(renderLaunchCard(v, { href: '/x' }), /<p class="lc-demo">Demo data<\/p>/);
    assert.match(renderProjectDetail(v, {}), /<p class="lc-banner">Demo data: placeholder values for layout only, not a real project\.<\/p>/);
  }
  assert.ok(DEMO_PROJECTS.every((p) => /^Demo /.test(p.name) && /^Demo /.test(p.developer) && p.cover_image === null && p.marketing_brochure === null));
  assert.equal(normaliseProject({ id: 2, name: 'Test Tower' }).demo, true);
  assert.equal(normaliseProject({ id: 3, name: 'Harbour Views', developer: 'Real Dev' }).demo, false);
  // The units table: grouped by type and bedrooms, availability counted, price and size ranges.
  assert.deepEqual(summariseUnits(DEMO_UNITS[900001]).map((g) => [g.type, g.bedrooms, g.count, g.available, g.priceMin, g.priceMax]), [
    ['Apartments', 1, 2, 1, 1250000, 1600000], ['Apartments', 2, 2, 2, 2050000, 2700000], ['Apartments', 3, 1, 0, 4100000, 4100000],
  ]);
});

test('normaliseProject reads the Reelly fields the docs define and invents nothing', () => {
  const v = normaliseProject({
    id: 7, slug_name: 'harbour', name: 'Harbour', developer: 'Dev', location: { district: 'Dubai Marina', region: 'Dubai' },
    cover_image: { url: 'https://media.example/c.webp' }, min_price: 1500000, max_price: 3000000, price_currency: 'AED',
    sale_status: 'on_sale', sale_status_display: 'On Sale', construction_status: 'under_construction', completion_date: '2028-08-31',
    payment_plans: [{ name: 'Plan', is_handover: false, steps: [{ name: 'On booking', percentage: 10.0 }, { name: 'On handover', percentage: 90 }] }],
    typical_units: [{ unit_type: 'apartments', bedrooms: 2, from_price_aed: 1500000, to_price_aed: 1900000 }],
    marketing_brochure: 'https://media.example/b.pdf', floor_plans: [{ id: 1, name: 'plans/1br.pdf', file: 'https://media.example/1br.pdf' }],
  });
  assert.equal(v.handover, 'Q3 2028');
  assert.equal(v.saleStatus, 'On Sale');
  assert.equal(v.constructionStatus, 'Under construction');
  assert.deepEqual(v.paymentPlans, [{ name: 'Plan', steps: [{ name: 'On booking', percentage: 10 }, { name: 'On handover', percentage: 90 }], postHandover: false }]);
  assert.deepEqual(v.documents.map((d) => d.label), ['Marketing brochure', '1br.pdf']);
  const empty = normaliseProject({ id: 8, name: 'Bare' });
  assert.deepEqual([empty.startingPrice, empty.handover, empty.paymentPlans, empty.documents, empty.image], [null, null, [], [], null]);
  assert.match(renderLaunchCard(empty, { href: '/x' }), /Starting price<\/span> Not given/);
});
