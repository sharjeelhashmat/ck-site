// "What's changing here" and the infrastructure trackers (PR 3): rules and build behaviour. Uses throwaway fixtures
// written to a temp dir, never files under src/data. Each build test writes to its own outDir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANNED_CLAIMS, STATUSES, AREA_EVENTS_MAX, checkChanges, checkEvent, checkProject, bannedIn, eventsForArea, projectStatus,
} from '../src/lib/changes.mjs';
import { areaSlugs } from '../src/lib/intel-data.mjs';
import { validEvent, validProject, officialSource, changesFixture as fixtureData } from './helpers/fixtures.mjs';
import { GOLIVE_TEST } from './helpers/golive.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const TODAY = '2026-10-26';
const AREAS = areaSlugs();
const ctx = { today: TODAY, areaSlugs: AREAS, projectSlugs: ['example-metro-line'] };
const all = (events, projects = [validProject()]) =>
  checkChanges({ events, projects: projects.map((p) => ({ file: `${p.slug}.json`, record: p })) }, { today: TODAY, areaSlugs: AREAS });

// ---------- rules ----------
test('the site area list is the 16 area guide slugs', () => {
  assert.equal(AREAS.length, 16);
  assert.ok(AREAS.includes('dubai-marina') && AREAS.includes('yas-island'));
});

test('a valid event and a valid project pass', () => {
  assert.deepEqual(checkEvent(validEvent('a'), ctx), []);
  assert.deepEqual(checkEvent(validEvent('b', { project: 'example-metro-line', officialDate: '' }), ctx), []);
  assert.deepEqual(checkProject(validProject(), { ...ctx, file: 'example-metro-line.json' }), []);
  assert.deepEqual(all([validEvent('a'), validEvent('b', { project: 'example-metro-line' })]), []);
});

test('every banned claim fails the build, in a title, a summary or a timeline note, any case', () => {
  const samples = {
    price: 'PRICES may rise', appreciat: 'Homes appreciate nearby', 'value will': 'Value will climb', boost: 'A boost for owners',
    surge: 'Demand to surge', ROI: 'Better ROI', yield: 'Higher yields expected', 'investment opportunity': 'An investment opportunity',
    'best area': 'The best area to own', 'must-buy': 'A must-buy district', guaranteed: 'Guaranteed returns',
  };
  assert.deepEqual(Object.keys(samples), BANNED_CLAIMS.map(([t]) => t), 'one sample per banned term');
  for (const [term, text] of Object.entries(samples)) {
    assert.deepEqual(bannedIn(text), [term], term);
    for (const field of ['title', 'summary']) {
      const errs = checkEvent(validEvent('x', { [field]: text }), ctx);
      assert.ok(errs.some((e) => e.includes(`${field} contains "${term}"`)), `${term} in event ${field}`);
    }
    const p = validProject(); p.timeline[0].note = text;
    assert.ok(checkProject(p, ctx).some((e) => e.includes(`note contains "${term}"`)), `${term} in timeline note`);
    assert.ok(checkProject(validProject('example-metro-line', { summary: text }), ctx).some((e) => e.includes(`summary contains "${term}"`)), `${term} in project summary`);
  }
});

test('the banned check matches whole words, so ordinary words that contain a term pass', () => {
  for (const ok of ['A new surgery wing opens', 'Heroic rescue', 'Approved by the council', 'Pricing desk relocates']) assert.deepEqual(bannedIn(ok), [], ok);
});

test('an unknown area slug fails, on an event and on a project', () => {
  assert.ok(checkEvent(validEvent('a', { areas: ['dubai-marina', 'atlantis'] }), ctx).some((e) => /unknown area slug "atlantis"/.test(e)));
  assert.ok(checkProject(validProject('example-metro-line', { areas: ['nowhere'] }), ctx).some((e) => /unknown area slug "nowhere"/.test(e)));
});

test('a tier 2 source fails, on an event and on a timeline entry', () => {
  assert.ok(checkEvent(validEvent('a', { source: officialSource({ tier: 2 }) }), ctx).some((e) => /source\.tier must be 1/.test(e)));
  const p = validProject(); p.timeline[1].source.tier = 2;
  assert.ok(checkProject(p, ctx).some((e) => /timeline 2: source\.tier must be 1/.test(e)));
});

test('an event whose project has no projects/*.json fails', () => {
  assert.ok(all([validEvent('a', { project: 'missing-line' })]).some((e) => /project "missing-line" matches no projects\/\*\.json slug/.test(e)));
  assert.ok(all([validEvent('a', { project: 'example-metro-line' })], []).some((e) => /matches no projects/.test(e)));
});

test('source url must be https; dates must be real; verifiedOn may not be in the future', () => {
  assert.ok(checkEvent(validEvent('a', { source: officialSource({ url: 'http://example.com' }) }), ctx).some((e) => /url must be https/.test(e)));
  assert.ok(checkEvent(validEvent('a', { announcedOn: '2026-02-30' }), ctx).some((e) => /announcedOn must be a valid/.test(e)));
  assert.ok(checkEvent(validEvent('a', { source: officialSource({ publishedOn: '01/10/2026' }) }), ctx).some((e) => /publishedOn must be a valid/.test(e)));
  assert.ok(checkEvent(validEvent('a', { source: officialSource({ verifiedOn: '2026-10-27' }) }), ctx).some((e) => /in the future/.test(e)));
  assert.deepEqual(checkEvent(validEvent('a', { source: officialSource({ verifiedOn: TODAY }) }), ctx), []);
  const p = validProject(); p.timeline[0].date = '2026-13-01';
  assert.ok(checkProject(p, ctx).some((e) => /timeline 1: date must be a valid/.test(e)));
});

test('schema: ids kebab-case, known emirate, category and status, summary at most 280 characters, unique ids', () => {
  assert.ok(checkEvent(validEvent('Not_Kebab'), ctx).some((e) => /kebab-case/.test(e)));
  assert.ok(checkEvent(validEvent('a', { emirate: 'Sharjah' }), ctx).some((e) => /emirate must be/.test(e)));
  assert.ok(checkEvent(validEvent('a', { category: 'Ports' }), ctx).some((e) => /category must be/.test(e)));
  assert.ok(checkEvent(validEvent('a', { status: 'Rumoured' }), ctx).some((e) => /status must be/.test(e)));
  assert.ok(checkEvent(validEvent('a', { summary: 'x'.repeat(281) }), ctx).some((e) => /281 characters/.test(e)));
  assert.deepEqual(checkEvent(validEvent('a', { summary: 'x'.repeat(280) }), ctx), []);
  assert.ok(checkEvent(validEvent('a', { areas: [] }), ctx).some((e) => /at least one area or a project/.test(e)));
  assert.ok(all([validEvent('a'), validEvent('a')]).some((e) => /duplicate event id a/.test(e)));
  assert.ok(checkProject(validProject(), { ...ctx, file: 'other.json' }).some((e) => /file name must be example-metro-line\.json/.test(e)));
  assert.ok(checkProject(validProject('example-metro-line', { name: 'N'.repeat(61) }), ctx).some((e) => /limit is 60/.test(e)));
  assert.ok(checkProject(validProject('example-metro-line', { timeline: [] }), ctx).some((e) => /at least one entry/.test(e)));
});

test('Cancelled is a valid status and cancelled events stay listed (no silent deletion)', () => {
  assert.ok(STATUSES.includes('Cancelled'));
  const events = [validEvent('a', { status: 'Cancelled' })];
  assert.deepEqual(all(events), []);
  assert.equal(eventsForArea(events, 'dubai-marina').length, 1);
});

test('area events: newest first, at most six, only those that name the area', () => {
  const events = Array.from({ length: 8 }, (_, i) => validEvent(`e${i}`, { announcedOn: `2026-0${i + 1}-01` }));
  events.push(validEvent('elsewhere', { areas: ['yas-island'], announcedOn: '2026-10-01' }));
  const shown = eventsForArea(events, 'dubai-marina');
  assert.equal(AREA_EVENTS_MAX, 6);
  assert.deepEqual(shown.map((e) => e.id), ['e7', 'e6', 'e5', 'e4', 'e3', 'e2']);
  assert.deepEqual(eventsForArea(events, 'saadiyat-island'), []);
});

test('a project status is its latest timeline entry, whatever the order in the file', () => {
  const p = validProject(); p.timeline.reverse();
  assert.equal(projectStatus(p), 'Approved');
});

test('the shipped data is empty: no event and no project in this PR', () => {
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'src/data/market-events.json'), 'utf8')), []);
  assert.deepEqual(readdirSync(join(root, 'src/data/projects')).filter((f) => f.endsWith('.json')), []);
});

// ---------- build behaviour ----------
function writeData(dir, { events = [], projects = [] }) {
  mkdirSync(join(dir, 'insights'), { recursive: true });
  mkdirSync(join(dir, 'projects'), { recursive: true });
  writeFileSync(join(dir, 'market-events.json'), JSON.stringify(events));
  for (const p of projects) writeFileSync(join(dir, 'projects', `${p.slug}.json`), JSON.stringify(p));
}
function build(dataDir, { today = TODAY, indexable = true } = {}) {
  const out = mkdtempSync(join(tmpdir(), 'ck-changes-out-'));
  const r = spawnSync('npx', ['astro', 'build', '--outDir', out], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, INTEL_DATA_DIR: dataDir, INTEL_TODAY: today, PUBLIC_INDEXABLE: indexable ? 'true' : 'false', GOLIVE_OVERRIDES: indexable ? GOLIVE_TEST : '' },
  });
  return { out, status: r.status, log: r.stdout + r.stderr };
}
const html = (out, p) => readFileSync(join(out, p), 'utf8');
const NOINDEX = /<meta name="robots" content="noindex,nofollow">/;
const INDEX = /<meta name="robots" content="index,follow/;

test('build: the area page renders "What\'s changing here" only where events name the area', () => {
  const data = mkdtempSync(join(tmpdir(), 'ck-changes-data-'));
  writeData(data, fixtureData());
  const r = build(data);
  assert.equal(r.status, 0, r.log);
  const marina = html(r.out, 'areas/dubai-marina.html');
  assert.match(marina, /<h2 class="guide-h2" id="changes-h"[^>]*>What&#39;s changing here<\/h2>|<h2 class="guide-h2" id="changes-h"[^>]*>What's changing here<\/h2>/);
  const items = [...marina.matchAll(/<span class="change-title"[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]);
  // Eight events name Dubai Marina: the newest six are shown, newest first.
  assert.deepEqual(items, ['Example metro line announced', 'Example bridge plan withdrawn', 'Example service fee rule', 'Example older notice 4', 'Example older notice 3', 'Example older notice 2']);
  assert.match(marina, /<span class="badge badge--cancelled"[^>]*>Cancelled<\/span>/);
  assert.match(marina, /Official date: Q4 2029/);
  assert.match(marina, /Official date: 1 January 2026/);
  assert.equal((marina.match(/Official date:/g) ?? []).length, 5, 'no "Official date" line when the source gives none');
  // Verified more than 180 days ago: "last checked" in muted text; otherwise "verified".
  assert.match(marina, /<span class="fine"[^>]*>last checked <span class="date"[^>]*>2026-03-01<\/span><\/span>/);
  assert.match(marina, /Example Transport Authority<\/a> · verified <span class="date"[^>]*>2026-10-20<\/span>/);
  assert.match(marina, /<a href="\/projects\/example-metro-line"[^>]*>Infrastructure tracker: Example Metro Line \(test fixture\)<\/a>/);
  assert.match(html(r.out, 'areas/palm-jumeirah.html'), /What(&#39;|')s changing here/);
  for (const slug of ['saadiyat-island', 'downtown-dubai']) assert.doesNotMatch(html(r.out, `areas/${slug}.html`), /changing here|class="changes"/, slug);
});

test('build: a tracker page shows its fields, timeline and fixed lines; /projects lists it and both enter the sitemap', () => {
  const data = mkdtempSync(join(tmpdir(), 'ck-changes-data-'));
  writeData(data, fixtureData());
  const r = build(data);
  assert.equal(r.status, 0, r.log);
  const page = html(r.out, 'projects/example-metro-line.html');
  assert.match(page, /<h1[^>]*>Example Metro Line \(test fixture\)<\/h1>/);
  assert.match(page, /Operator: Example Transport Authority/);
  assert.match(page, /Status: <span class="badge"[^>]*>Approved<\/span>/);
  assert.match(page, /Infrastructure tracker · Dubai/);
  assert.match(page, /<a href="\/areas\/dubai-marina"[^>]*>Dubai Marina<\/a>/);
  assert.match(page, /<a href="\/areas\/palm-jumeirah"[^>]*>Palm Jumeirah<\/a>/);
  assert.match(page, /<td class="date"[^>]*>2026-03-01<\/td><td[^>]*>Announced<\/td><td[^>]*>Line announced with its route\.<\/td>/);
  assert.ok(page.indexOf('>2026-03-01</td>') < page.indexOf('>2026-09-15</td>'), 'timeline oldest first');
  assert.match(page, /This page records official announcements only\. It does not predict prices or values\./);
  assert.match(page, /General information, not financial, tax or legal advice\./);
  assert.match(page, INDEX);
  assert.doesNotMatch(page, /stale-banner/);
  const index = html(r.out, 'projects.html');
  assert.match(index, INDEX);
  assert.match(index, /href="\/projects\/example-metro-line"/);
  assert.match(index, /Approved · Example Transport Authority/);
  const site = readFileSync(join(r.out, 'sitemap-0.xml'), 'utf8');
  assert.match(site, /\/projects</); assert.match(site, /\/projects\/example-metro-line</);
  // The launch-readiness rules (titles, descriptions, links, wording) pass on the built trackers and area pages.
  const ready = spawnSync('node', ['scripts/readiness.mjs', r.out], { cwd: root, encoding: 'utf8', env: { ...process.env, PUBLIC_INDEXABLE: 'true' } });
  assert.equal(ready.status, 0, ready.stdout + ready.stderr);
});

test('build: with no data, /projects is noindex and out of the sitemap, and no area page has the section', () => {
  const data = mkdtempSync(join(tmpdir(), 'ck-changes-data-'));
  writeData(data, {});
  const r = build(data);
  assert.equal(r.status, 0, r.log);
  const index = html(r.out, 'projects.html');
  assert.match(index, NOINDEX);
  assert.match(index, /No project is being tracked yet\./);
  assert.ok(!existsSync(join(r.out, 'projects')), 'no tracker pages');
  const site = readFileSync(join(r.out, 'sitemap-0.xml'), 'utf8');
  assert.doesNotMatch(site, /\/projects/);
  for (const f of readdirSync(join(r.out, 'areas'))) assert.doesNotMatch(html(r.out, `areas/${f}`), /changing here|class="changes"/, f);
  assert.match(html(r.out, 'insights.html'), /<a href="\/projects"[^>]*>Infrastructure tracker<\/a>/);
});

test('build: a tracker past reviewBy shows the stale banner and is noindex and out of the sitemap', () => {
  const data = mkdtempSync(join(tmpdir(), 'ck-changes-data-'));
  writeData(data, { projects: [validProject('example-metro-line', { reviewBy: '2026-10-25' })] });
  const r = build(data);
  assert.equal(r.status, 0, r.log);
  const page = html(r.out, 'projects/example-metro-line.html');
  assert.match(page, /class="stale-banner"[^>]*>This tracker is past its review date/);
  assert.match(page, NOINDEX);
  assert.match(html(r.out, 'projects.html'), /under review/);
  assert.match(html(r.out, 'projects.html'), NOINDEX, 'no current tracker: the index stays noindex');
  assert.doesNotMatch(readFileSync(join(r.out, 'sitemap-0.xml'), 'utf8'), /\/projects/);
});

test('build: a record that breaks a rule fails the build with the reason', () => {
  const data = mkdtempSync(join(tmpdir(), 'ck-changes-data-'));
  writeData(data, { events: [validEvent('bad', { summary: 'Prices will surge.', project: 'missing-line' })] });
  const r = build(data);
  assert.notEqual(r.status, 0);
  assert.match(r.log, /Market events and project trackers fail the rules/);
  assert.match(r.log, /summary contains "price", "surge"/);
  assert.match(r.log, /project "missing-line" matches no projects\/\*\.json slug/);
});

test('build: on a non-public (staging) build the trackers are noindex', () => {
  const data = mkdtempSync(join(tmpdir(), 'ck-changes-data-'));
  writeData(data, fixtureData());
  const r = build(data, { indexable: false });
  assert.equal(r.status, 0, r.log);
  for (const p of ['projects.html', 'projects/example-metro-line.html', 'areas/dubai-marina.html']) assert.match(html(r.out, p), NOINDEX, p);
});
