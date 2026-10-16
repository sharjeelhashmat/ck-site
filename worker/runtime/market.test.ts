// GET /market/* in workerd with the real D1 migrations, seeded through the same SQL the sync workflow applies.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/index';
import { DldTxAggregator, parseCsv } from '../scripts/market-sync/dld';
import { buildSql } from '../scripts/market-sync/sql';
import { fixtureLines } from '../test/market-fixture';

const ORIGIN = 'https://sharjeelhashmat.com';
const STAGING = 'https://ck-site-web.sharjeelhashmat.workers.dev';
const cf = env as unknown as Env;
const e = (over: Record<string, string> = {}) => ({ ...cf, SITE_URL: ORIGIN, STAGING_ORIGIN: '', ...over }) as Env;

let n = 0;
const uuid = () => `run-${++n}`;

async function seed(opts: { projects?: boolean; adrec?: boolean } = {}) {
  const a = new DldTxAggregator('2026-10-16');
  for (const r of parseCsv(fixtureLines().join('\r\n'))) a.record(r);
  const sql = buildSql({
    runId: uuid(), startedAt: '2026-10-16T02:23:00.000Z', finishedAt: '2026-10-16T02:30:00.000Z',
    dld: { rowsTotal: a.rowsTotal, rowsBad: a.rowsBad, asOf: a.asOf, areaMonths: a.areaMonths(), monthTotals: a.monthTotals() },
    rowsTotal: a.rowsTotal, rowsBad: a.rowsBad,
    projects: opts.projects ? { new_projects_90d: 12, top_areas_90d: [{ area_en: 'Palm Deira', count: 4 }, { area_en: 'Alpha', count: 3 }], active_projects: 340, pipeline_units: 52000, as_of: '2026-10-16' } : null,
    adrec: opts.adrec ? { transaction_value_aed: 117.04e9, sales_value_aed: 86.1e9, mortgage_value_aed: 25.5e9, year: 2026 } : null,
    errors: [], uuid,
  });
  const statements = sql.split(/;\n/).map((s) => s.split('\n').filter((l) => !l.startsWith('--')).join('\n').trim()).filter(Boolean);
  await cf.DB.batch(statements.map((s) => cf.DB.prepare(s)));
}

const get = (path: string, origin: string | null = ORIGIN, over: Record<string, string> = {}, method = 'GET') =>
  worker.fetch(new Request(`https://api.test${path}`, { method, headers: origin ? { origin } : {} }), e(over));

// Storage is shared across the tests in this file, so the order matters: empty first, then ADREC only, then everything.
describe('GET /market/* before any sync', () => {
  it('launches: both emirates null; areas and area: 404', async () => {
    const r = await get('/market/launches');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ dubai: null, abu_dhabi: null });
    expect((await get('/market/areas?period=2026-H1')).status).toBe(404);
    expect((await get('/market/area/Alpha?period=2026-H1')).status).toBe(404);
  });

  it('launches: one emirate missing (ADREC stored, no DLD projects yet): that side is null', async () => {
    await seed({ adrec: true });
    const b = (await (await get('/market/launches')).json()) as { dubai: unknown; abu_dhabi: unknown };
    expect(b.dubai).toBeNull();
    expect(b.abu_dhabi).not.toBeNull();
  });
});

describe('GET /market/areas', () => {
  it('top 8: rank (ties by name), share, change vs the same period last year, prior_zero, off-plan share; year to date', async () => {
    await seed();
    const r = await get('/market/areas?period=2026-H1');
    expect(r.status).toBe(200);
    const b = (await r.json()) as { period: string; prior_period: string; dubai: { ytd: unknown; top8: Record<string, unknown>[]; total_res_bn: number; as_of: string } };
    expect(b.period).toBe('2026-H1');
    expect(b.prior_period).toBe('2025-H1');
    expect(b.dubai.as_of).toBe('2026-10-09');
    expect(b.dubai.total_res_bn).toBe(0.95); // 954M
    expect(b.dubai.top8.map((a) => a.area_en)).toEqual(['Alpha', 'Delta', 'Beta', 'Gamma', 'Area01', 'Area02', 'Area03', 'Area04']);
    expect(b.dubai.top8[0]).toEqual({ rank: 1, area_en: 'Alpha', label: null, value_bn: 0.3, share_pct: 31.4, change_pct: 100, prior_zero: false, offplan_pct: 50 });
    // +400% is passed as a number; the site turns anything at or above +200% into "≈N×" (here ≈5×).
    expect(b.dubai.top8[1]).toMatchObject({ area_en: 'Delta', change_pct: 400, prior_zero: false });
    expect(b.dubai.top8[2]).toMatchObject({ area_en: 'Beta', change_pct: -25 });
    expect(b.dubai.top8[3]).toMatchObject({ area_en: 'Gamma', change_pct: null, prior_zero: true });
    expect(b.dubai.top8[4]).toMatchObject({ area_en: 'Area01', change_pct: 0, share_pct: 0.6 });
    // Year to date (2026, to 9 Oct): Sales 1,352M; Mortgages 162M; Gifts 108M; total = all three.
    expect(b.dubai.ytd).toEqual({ sales_bn: 1.35, total_bn: 1.62, mortgages_bn: 0.16, as_of: '2026-10-09' });
  });

  it('a period not complete in the data is 404; a malformed period is 400', async () => {
    await seed();
    expect((await get('/market/areas?period=2026-H2')).status).toBe(404);
    expect((await get('/market/areas?period=2026-Q4')).status).toBe(404);
    expect((await get('/market/areas?period=2026-Q3')).status).toBe(200);
    expect((await get('/market/areas?period=2026')).status).toBe(400);
    expect((await get('/market/areas')).status).toBe(400);
  });

  it('CORS: site, www and staging origins only; public cache for an hour; GET only', async () => {
    await seed();
    const ok = await get('/market/areas?period=2026-H1');
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(ok.headers.get('cache-control')).toBe('public, max-age=3600');
    expect((await get('/market/areas?period=2026-H1', 'https://www.sharjeelhashmat.com')).headers.get('access-control-allow-origin')).toBe('https://www.sharjeelhashmat.com');
    expect((await get('/market/areas?period=2026-H1', STAGING, { STAGING_ORIGIN: STAGING })).headers.get('access-control-allow-origin')).toBe(STAGING);
    expect((await get('/market/areas?period=2026-H1', 'https://example.invalid')).headers.get('access-control-allow-origin')).toBeNull();
    expect((await get('/market/launches', ORIGIN, {}, 'POST')).status).toBe(405);
  });

  it('returns aggregates only: no raw rows, counts or source columns', async () => {
    await seed();
    const text = await (await get('/market/areas?period=2026-H1')).text();
    for (const leak of ['res_sales_count', 'res_offplan_count', 'Synthetic Master', 'instance_date', 'actual_worth', '2026-01']) expect(text).not.toContain(leak);
  });
});

describe('GET /market/area/<area_en>', () => {
  it('one area, ranked against every area, including one outside the top 8; unknown area 404', async () => {
    await seed();
    const g = (await (await get('/market/area/Gamma?period=2026-H1')).json()) as { area: Record<string, unknown>; period: string; total_res_bn: number };
    expect(g.period).toBe('2026-H1');
    expect(g.area).toMatchObject({ rank: 4, area_en: 'Gamma', change_pct: null, prior_zero: true });
    const a9 = (await (await get('/market/area/Area09?period=2026-H1')).json()) as { area: Record<string, unknown> };
    expect(a9.area).toMatchObject({ rank: 13, area_en: 'Area09', change_pct: 0 });
    expect((await get('/market/area/Nowhere?period=2026-H1')).status).toBe(404);
    expect((await get('/market/area/Alpha?period=2026-H2')).status).toBe(404);
  });
});

describe('GET /market/launches', () => {
  it('shape: Dubai project counts (no names) and Abu Dhabi year to date in AED bn, each with its source', async () => {
    await seed({ projects: true, adrec: true });
    const b = (await (await get('/market/launches')).json()) as Record<string, unknown>;
    expect(b).toEqual({
      dubai: {
        new_projects_90d: 12,
        top_areas_90d: [{ area_en: 'Palm Deira', label: 'Dubai Islands', count: 4 }, { area_en: 'Alpha', label: null, count: 3 }],
        active_projects: 340, pipeline_units: 52000, as_of: '2026-10-16',
        source_label: 'Dubai Land Department, Real Estate Projects open data via Data.Dubai (Open Data Licence)', source_url: 'https://data.dubai/en/l/467654',
      },
      abu_dhabi: {
        transaction_value_bn: 117.04, sales_value_bn: 86.1, mortgage_value_bn: 25.5, year: 2026, as_of: '2026-10-16',
        source_label: 'Abu Dhabi Real Estate Centre (ADREC), published year-to-date figures', source_url: 'https://adrec.gov.ae/en',
      },
    });
  });

});
