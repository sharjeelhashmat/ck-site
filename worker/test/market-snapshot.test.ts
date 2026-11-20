// The market-data snapshot writer (worker/scripts/market-sync/snapshot.ts), used by the "snapshot" job of
// market-data-sync.yml: the exact shape of each file, no secrets in anything written, and no write when nothing changed.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { areasBody, launchesAbuDhabi, launchesDubai, parsePeriod } from '../src/market-core';
import {
  checkAreas, checkLaunches, checkStatus, ENDPOINTS, fetchAll, findSecrets, README, REPO_RAW, shapeOf, WORKER, writeSnapshot, type Fetched,
} from '../scripts/market-sync/snapshot';

const NOW = new Date('2026-11-20T10:30:00.000Z');
const STATUS = { dld_synced_at: '2026-11-18T06:47:47.308Z', adrec_synced_at: '2026-11-18T06:47:47.308Z' };
const AREA = { rank: 1, area_en: 'Madinat Al Mataar', label: 'Dubai South', value_bn: 17.88, share_pct: 6.6, change_pct: 16.8, prior_zero: false, offplan_pct: 93.8, prior_value_bn: 15.31 };
const AREAS = {
  period: '2026-YTD10', prior_period: '2025-YTD10', first_month: '2026-01', last_month: '2026-10', prior_first_month: '2025-01', prior_last_month: '2025-10',
  dubai: {
    ytd: { sales_bn: 431.29, total_bn: 658.76, mortgages_bn: 173.9, as_of: '2026-11-16' },
    top8: [AREA, { ...AREA, rank: 2, area_en: 'Al Yelayiss 1', label: null, change_pct: null, prior_zero: true, prior_value_bn: null }],
    total_res_bn: 272.4,
    as_of: '2026-11-16',
  },
};
const LAUNCHES = {
  dubai: {
    new_projects_90d: 62, top_areas_90d: [{ area_en: 'Palm Deira', label: 'Dubai Islands', count: 8 }], active_projects: 1237, pipeline_units: 328248,
    as_of: '2026-11-01', source_label: 'Dubai Land Department, Real Estate Projects open data via Data.Dubai (Open Data Licence)', source_url: 'https://data.dubai/en/l/467654',
  },
  abu_dhabi: {
    transaction_value_bn: 199.29, sales_value_bn: 138.77, mortgage_value_bn: 53.91, year: 2026, as_of: '2026-11-18',
    source_label: 'Abu Dhabi Real Estate Centre (ADREC), published year-to-date figures', source_url: 'https://adrec.gov.ae/en',
  },
};
const BODIES: Record<string, unknown> = { '/market/status': STATUS, '/market/areas?period=ytd': AREAS, '/market/launches': LAUNCHES };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const items = (over: Record<string, unknown> = {}): Fetched[] =>
  ENDPOINTS.map((e) => { const body = e.path in over ? over[e.path] : BODIES[e.path]; return { file: e.file, path: e.path, body, text: JSON.stringify(body) }; });

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'market-data-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(join(d, f.name)).map((p) => join(f.name, p)) : [f.name]));

describe('schema', () => {
  it('the three fixed endpoints, on the production Worker, and the raw URLs on the market-data branch', () => {
    expect(WORKER).toBe('https://ck-lead-worker.sharjeelhashmat.workers.dev');
    expect(ENDPOINTS.map((e) => [e.file, e.path])).toEqual([
      ['status.json', '/market/status'], ['areas-ytd.json', '/market/areas?period=ytd'], ['launches.json', '/market/launches'],
    ]);
    expect(REPO_RAW).toBe('https://raw.githubusercontent.com/sharjeelhashmat/ck-site/market-data');
  });

  it('the live shapes pass', () => {
    expect(checkStatus(STATUS, NOW)).toEqual([]);
    expect(checkAreas(AREAS, NOW)).toEqual([]);
    expect(checkLaunches(LAUNCHES, NOW)).toEqual([]);
    const noPipeline = clone(LAUNCHES) as any;
    delete noPipeline.dubai.pipeline_units;
    expect(checkLaunches(noPipeline, NOW)).toEqual([]);
    expect(checkAreas({ ...AREAS, dubai: { ...AREAS.dubai, ytd: null } }, NOW)).toEqual([]);
  });

  it('the Worker\'s own body builders produce bodies that pass (contract with src/market-core.ts)', () => {
    const p = parsePeriod('2026-YTD10')!;
    const current = [{ area_en: 'Business Bay', value: 3e9, count: 10, offplan: 5 }, { area_en: 'Alpha Test Area', value: 1e9, count: 4, offplan: 0 }];
    const prior = [{ area_en: 'Business Bay', value: 2e9, count: 8, offplan: 2 }];
    const totals = [{ month: '2026-03', trans_group: 'Sales', value: 5e9 }, { month: '2026-03', trans_group: 'Mortgages', value: 1e9 }];
    expect(checkAreas(areasBody(p, current, prior, totals, '2026-11-16'), NOW)).toEqual([]);
    const launches = {
      dubai: launchesDubai({ payload: { new_projects_90d: 3, top_areas_90d: [{ area_en: 'Business Bay', count: 2 }], active_projects: 9, as_of: '2026-11-01' }, as_of: '2026-11-01' }),
      abu_dhabi: launchesAbuDhabi({ payload: { transaction_value_aed: 2e9, sales_value_aed: 1e9, mortgage_value_aed: 5e8, year: 2026 }, as_of: '2026-11-18' }),
    };
    expect(checkLaunches(launches, NOW)).toEqual([]);
  });

  it('refuses a missing key, an extra key, a wrong type, and the Worker\'s transient error answers', () => {
    const bad: [string, unknown][] = [
      ['status null', { dld_synced_at: null, adrec_synced_at: STATUS.adrec_synced_at }],
      ['status extra', { ...STATUS, token: 'x' }],
      ['status string', 'ok'],
    ];
    for (const [name, b] of bad) expect(checkStatus(b, NOW).length, name).toBeGreaterThan(0);
    const areas = (f: (a: any) => void) => { const a = clone(AREAS) as any; f(a); return checkAreas(a, NOW); };
    expect(areas((a) => { delete a.period; })).toContain('areas: missing period');
    expect(areas((a) => { a.extra = 1; })).toContain('areas: unexpected key extra');
    expect(areas((a) => { a.dubai.top8[0].value_bn = '17.88'; })).toContain('areas.dubai.top8[0].value_bn: wrong type or value');
    expect(areas((a) => { a.dubai.top8[1].rank = 7; })).toContain('areas.dubai.top8[1].rank: wrong type or value');
    expect(areas((a) => { a.dubai.top8 = []; })).toContain('areas.dubai.top8: not a list of 1 to 8 areas');
    expect(areas((a) => { a.dubai.top8[0].area_en = '<script>'; })).toContain('areas.dubai.top8[0].area_en: wrong type or value');
    expect(areas((a) => { a.dubai.as_of = '16/11/2026'; })).toContain('areas.dubai.as_of: wrong type or value');
    expect(checkAreas({ ok: false, error: 'period_not_available' }, NOW).length).toBeGreaterThan(0);
    const launches = (f: (a: any) => void) => { const a = clone(LAUNCHES) as any; f(a); return checkLaunches(a, NOW); };
    expect(checkLaunches({ dubai: null, abu_dhabi: null }, NOW)).toEqual(['launches.dubai: missing or null', 'launches.abu_dhabi: missing or null']);
    expect(launches((a) => { a.abu_dhabi.source_url = 'http://adrec.gov.ae/en'; })).toContain('launches.abu_dhabi.source_url: wrong type or value');
    expect(launches((a) => { a.dubai.source_url = 'javascript:alert(1)'; })).toContain('launches.dubai.source_url: wrong type or value');
    expect(launches((a) => { a.dubai.top_areas_90d[0].count = 0; })).toContain('launches.dubai.top_areas_90d[0].count: wrong type or value');
    expect(launches((a) => { a.dubai.contact = 'x'; })).toContain('launches.dubai: unexpected key contact');
  });

  it('a bad answer writes nothing at all, not even the good files', () => {
    const d = tmp();
    const r = writeSnapshot(d, items({ '/market/launches': { dubai: null, abu_dhabi: null } }), NOW, {});
    expect(r.changed).toBe(false);
    expect(r.problems.length).toBeGreaterThan(0);
    expect(walk(d)).toEqual([]);
  });

  it('the files written: the answers byte for byte, the README, and a manifest with fetched_at and the as_of dates', () => {
    const d = tmp();
    const it = items();
    const r = writeSnapshot(d, it, NOW, {});
    expect(r).toEqual({ changed: true, problems: [], files: ['data/market/status.json', 'data/market/areas-ytd.json', 'data/market/launches.json', 'README.md', 'data/market/manifest.json'] });
    expect(walk(d).sort()).toEqual(['README.md', 'data/market/areas-ytd.json', 'data/market/launches.json', 'data/market/manifest.json', 'data/market/status.json']);
    for (const i of it) expect(readFileSync(join(d, 'data/market', i.file), 'utf8')).toBe(i.text);
    expect(readFileSync(join(d, 'README.md'), 'utf8')).toBe(README);
    const m = JSON.parse(readFileSync(join(d, 'data/market/manifest.json'), 'utf8'));
    expect(Object.keys(m)).toEqual(['schema', 'fetched_at', 'source', 'as_of', 'as_of_by_source', 'files']);
    expect(m.schema).toBe(1);
    expect(m.fetched_at).toBe(NOW.toISOString());
    expect(m.source).toBe(WORKER);
    expect(m.as_of).toBe('2026-11-16');
    expect(m.as_of_by_source).toEqual({ dubai_transactions: '2026-11-16', dubai_projects: '2026-11-01', abu_dhabi: '2026-11-18', dld_synced_at: STATUS.dld_synced_at, adrec_synced_at: STATUS.adrec_synced_at });
    expect(m.files['areas-ytd.json']).toEqual({ endpoint: 'GET /market/areas?period=ytd', raw_url: `${REPO_RAW}/data/market/areas-ytd.json`, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(README).toContain(`${REPO_RAW}/data/market/areas-ytd.json`);
  });

  it('the log describes shapes only, never values', () => {
    const s = shapeOf(AREAS);
    expect(s).toContain('top8: [2 x {rank: number');
    expect(s).not.toMatch(/431|Mataar|2026/);
  });
});

describe('no secrets', () => {
  const ENV = { GITHUB_TOKEN: 'ghs_FAKEFAKEFAKEFAKEFAKEFAKEFAKE1234', CLOUDFLARE_API_TOKEN: 'cf-test-value-not-real-0001', REELLY_API_KEY: 'reelly-test-value-0002', HOME: '/home/runner' };

  it('nothing written contains a credential variable\'s value or a credential shape', () => {
    const d = tmp();
    expect(writeSnapshot(d, items(), NOW, ENV).changed).toBe(true);
    for (const f of walk(d)) {
      const t = readFileSync(join(d, f), 'utf8');
      for (const v of Object.values(ENV).filter((x) => x !== '/home/runner')) expect(t.includes(v), f).toBe(false);
      if (f !== 'data/market/manifest.json') expect(findSecrets(t, ENV), f).toEqual([]);
    }
    expect(findSecrets(README, ENV)).toEqual([]);
  });

  it('an answer carrying a token, a key or a credential variable\'s value is refused and nothing is written', () => {
    const leaks: unknown[] = [
      { ...STATUS, dld_synced_at: ENV.GITHUB_TOKEN },
      { ...LAUNCHES, dubai: { ...LAUNCHES.dubai, source_label: `Bearer ${'a'.repeat(30)}` } },
      { ...LAUNCHES, dubai: { ...LAUNCHES.dubai, source_label: ENV.CLOUDFLARE_API_TOKEN } },
      { ...LAUNCHES, dubai: { ...LAUNCHES.dubai, source_label: 'api_key here' } },
      { ...LAUNCHES, dubai: { ...LAUNCHES.dubai, source_label: '6ae55501743fe5c0e6dc33be902cbace' } },
    ];
    for (const leak of leaks) {
      const d = tmp();
      const path = 'dld_synced_at' in (leak as object) ? '/market/status' : '/market/launches';
      const r = writeSnapshot(d, items({ [path]: leak }), NOW, ENV);
      expect(r.problems.length, JSON.stringify(leak).slice(0, 60)).toBeGreaterThan(0);
      expect(walk(d)).toEqual([]);
    }
  });

  it('fetches only the fixed Worker URLs, GET, with no credential header and no redirect', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const path = url.slice(WORKER.length);
      return new Response(JSON.stringify(BODIES[path]), { status: 200 });
    }) as unknown as typeof fetch;
    const got = await fetchAll(fake);
    expect(calls.map((c) => c.url)).toEqual(ENDPOINTS.map((e) => `${WORKER}${e.path}`));
    for (const c of calls) {
      expect(c.init.method).toBe('GET');
      expect(c.init.redirect).toBe('error');
      expect(Object.keys(c.init.headers as object).sort()).toEqual(['accept', 'cache-control']);
    }
    expect(got.map((g) => g.body)).toEqual([STATUS, AREAS, LAUNCHES]);
  });

  it('a non-200 or non-JSON answer stops the run', async () => {
    const answer = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch;
    await expect(fetchAll(answer(404, '{"ok":false}'))).rejects.toThrow('GET /market/status answered 404');
    await expect(fetchAll(answer(200, '<html>'))).rejects.toThrow('GET /market/status: answer is not JSON');
  });
});

describe('unchanged content is skipped', () => {
  it('the same answers a week later write nothing, so fetched_at alone never makes a commit', () => {
    const d = tmp();
    expect(writeSnapshot(d, items(), NOW, {}).changed).toBe(true);
    const before = readFileSync(join(d, 'data/market/manifest.json'), 'utf8');
    const later = new Date(NOW.getTime() + 7 * 86_400_000);
    expect(writeSnapshot(d, items(), later, {})).toEqual({ changed: false, files: [], problems: [] });
    expect(readFileSync(join(d, 'data/market/manifest.json'), 'utf8')).toBe(before);
  });

  it('one changed answer rewrites the files and the manifest', () => {
    const d = tmp();
    writeSnapshot(d, items(), NOW, {});
    const status = { dld_synced_at: '2026-11-25T06:00:00.000Z', adrec_synced_at: '2026-11-25T06:00:00.000Z' };
    expect(writeSnapshot(d, items({ '/market/status': status }), new Date('2026-11-27T10:30:00.000Z'), {}).changed).toBe(true);
    const m = JSON.parse(readFileSync(join(d, 'data/market/manifest.json'), 'utf8'));
    expect([m.fetched_at, m.as_of_by_source.dld_synced_at]).toEqual(['2026-11-27T10:30:00.000Z', status.dld_synced_at]);
  });

  it('a hand edit to a data file or the README is replaced at the next run', () => {
    const d = tmp();
    writeSnapshot(d, items(), NOW, {});
    writeFileSync(join(d, 'README.md'), 'edited');
    expect(writeSnapshot(d, items(), NOW, {}).changed).toBe(true);
    expect(readFileSync(join(d, 'README.md'), 'utf8')).toBe(README);
  });

  it('refuses a checkout that holds anything but the branch\'s own files', () => {
    for (const extra of ['notes.txt', 'data/other.json', 'data/market/extra.json']) {
      const d = tmp();
      mkdirSync(join(d, 'data', 'market'), { recursive: true });
      writeFileSync(join(d, extra), 'x');
      const r = writeSnapshot(d, items(), NOW, {});
      expect(r.problems.join(), extra).toMatch(/unexpected file/);
      expect(r.changed).toBe(false);
    }
    const d = tmp();
    mkdirSync(join(d, '.git'));
    expect(writeSnapshot(d, items(), NOW, {}).changed).toBe(true);
  });
});
