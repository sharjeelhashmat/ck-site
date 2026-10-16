// Market-data sync (worker/scripts/market-sync): parsing, filters, aggregation, the sanity guard, SQL generation run
// against the real migrations in an in-memory SQLite, and the no-secret / no-signed-URL logging rule.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { badRowsProblem, DLD_TX_COLUMNS, DldProjectsAggregator, DldTxAggregator, isoDate, parseAdrec, safeUrl, splitLine } from '../scripts/market-sync/dld';
import { buildSql, checkSql } from '../scripts/market-sync/sql';
import { build, type Ctx } from '../scripts/market-sync/sync';
import { csvLine, fixtureLines, HEADER, row } from './market-fixture';

const TODAY = '2026-10-16';
const migrations = join(import.meta.dirname, '../migrations');

function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql')).sort()) d.exec(readFileSync(join(migrations, f), 'utf8'));
  return d;
}

function aggregate(lines = fixtureLines()) {
  const a = new DldTxAggregator(TODAY);
  for (const l of lines) a.line(l);
  return a;
}

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function sqlFor(a: DldTxAggregator, over: Partial<Parameters<typeof buildSql>[0]> = {}) {
  return buildSql({
    runId: uuid(), startedAt: '2026-10-16T02:23:00.000Z', finishedAt: '2026-10-16T02:30:00.000Z',
    dld: { rowsTotal: a.rowsTotal, rowsBad: a.rowsBad, asOf: a.asOf, areaMonths: a.areaMonths(), monthTotals: a.monthTotals() },
    rowsTotal: a.rowsTotal, rowsBad: a.rowsBad, projects: null, adrec: null, errors: [], uuid, ...over,
  });
}

describe('CSV line parsing', () => {
  it('strips the outer quotes and splits on ","; keeps commas and empty fields inside values', () => {
    expect(splitLine('"a","b, with comma","","d"')).toEqual(['a', 'b, with comma', '', 'd']);
    expect(splitLine('"a","b"\r')).toEqual(['a', 'b']);
    expect(splitLine('a,b')).toBeNull();
    expect(splitLine('"')).toBeNull();
  });

  it('reads the columns by name from the header, in any order', () => {
    expect(Object.values(DLD_TX_COLUMNS)).toEqual(['actual_worth', 'area_name_en', 'instance_date', 'master_project_en', 'procedure_area', 'property_usage_en', 'reg_type_en', 'trans_group_en']);
    const a = new DldTxAggregator(TODAY);
    expect(() => a.line(csvLine(['actual_worth', 'instance_date']))).toThrow(/area_name_en/);
  });

  it('counts rows whose column count is not 47 (or that are not quoted) as bad and skips them', () => {
    const a = aggregate([HEADER, row({ worth: 1e6, area: 'A', date: '2026-01-02' }), '"too","few"', 'unquoted,line', row({ worth: 2e6, area: 'A', date: '2026-01-03' })]);
    expect(a.rowsTotal).toBe(4);
    expect(a.rowsBad).toBe(2);
    expect(a.areaMonths()).toEqual([{ area_en: 'A', month: '2026-01', res_sales_value: 3e6, res_sales_count: 2, res_offplan_count: 0 }]);
  });

  it('accepts a header at the top of every CSV part', () => {
    const a = aggregate([HEADER, row({ worth: 1, area: 'A', date: '2026-01-02' }), HEADER, row({ worth: 1, area: 'A', date: '2026-01-03' })]);
    expect(a.rowsTotal).toBe(2);
  });

  it('dates: ISO, DD-MM-YYYY and DD/MM/YYYY', () => {
    expect(isoDate('2026-03-04 00:00:00')).toBe('2026-03-04');
    expect(isoDate('04-03-2026')).toBe('2026-03-04');
    expect(isoDate('04/03/2026')).toBe('2026-03-04');
    expect(isoDate('nope')).toBeNull();
  });
});

describe('aggregation', () => {
  const a = aggregate();
  const am = a.areaMonths();
  const sum = (area: string, from: string, to: string) => am.filter((r) => r.area_en === area && r.month >= from && r.month <= to).reduce((s, r) => s + r.res_sales_value, 0);

  it('meta: rows_total counts every data row; as_of is the latest instance_date', () => {
    expect(a.rowsTotal).toBe(fixtureLines().length - 1);
    expect(a.rowsBad).toBe(0);
    expect(a.asOf).toBe('2026-10-09');
  });

  it('residential-sales filter: only Sales + Residential reach dld_area_month; rows before 2025 are dropped', () => {
    expect(sum('Area01', '2026-01', '2026-06')).toBe(6e6); // commercial, mortgages and gifts excluded
    expect(sum('Alpha', '2024-01', '2024-12')).toBe(0);
    expect(am.every((r) => r.month >= '2025-01')).toBe(true);
  });

  it('area-month aggregation: value, count and off-plan count', () => {
    expect(sum('Alpha', '2026-01', '2026-06')).toBe(300e6);
    expect(sum('Alpha', '2025-01', '2025-06')).toBe(150e6);
    const alphaH1 = am.filter((r) => r.area_en === 'Alpha' && r.month <= '2026-06' && r.month >= '2026-01');
    expect(alphaH1.reduce((s, r) => s + r.res_sales_count, 0)).toBe(6);
    expect(alphaH1.reduce((s, r) => s + r.res_offplan_count, 0)).toBe(3);
  });

  it('month totals: every trans_group_en, all usages', () => {
    const jan = a.monthTotals().filter((t) => t.month === '2026-01');
    const by = Object.fromEntries(jan.map((t) => [t.trans_group, t]));
    expect(Object.keys(by).sort()).toEqual(['Gifts', 'Mortgages', 'Sales']);
    // Sales: Alpha 50 + Beta 30 + Gamma 20 + Delta 50 + 9 x (1 residential + 7 commercial) = 222M.
    expect(by.Sales!.value).toBe(222e6);
    expect(by.Mortgages!.value).toBe(27e6);
    expect(by.Gifts!.value).toBe(18e6);
  });
});

describe('sanity guard', () => {
  it('more than 1% bad rows, or no rows, blocks the write', () => {
    expect(badRowsProblem(1000, 10)).toBeNull();
    expect(badRowsProblem(1000, 11)).toMatch(/over 1%/);
    expect(badRowsProblem(0, 0)).toMatch(/no rows/);
  });

  it('rows_total below 90% of the previous run: DLD tables keep the previous data, run is not ok, events row written', () => {
    const d = db();
    const a = aggregate();
    d.exec(sqlFor(a));
    const before = d.prepare('SELECT COUNT(*) AS c, SUM(res_sales_value) AS v FROM dld_area_month').get();
    // Next run: only half the rows.
    const half = aggregate(fixtureLines().slice(0, 150));
    d.exec(sqlFor(half));
    expect(d.prepare('SELECT COUNT(*) AS c, SUM(res_sales_value) AS v FROM dld_area_month').get()).toEqual(before);
    const runs = d.prepare('SELECT ok, dld_written, error FROM market_sync_runs ORDER BY rowid').all() as { ok: number; dld_written: number; error: string | null }[];
    expect(runs.map((r) => [r.ok, r.dld_written])).toEqual([[1, 1], [0, 0]]);
    expect(runs[1]!.error).toMatch(/below 90% of the previous run/);
    expect(d.prepare("SELECT COUNT(*) AS c FROM events WHERE type = 'market_sync_failed'").get()).toEqual({ c: 1 });
  });

  it('rows_total at or above 90% replaces the DLD tables in full (DELETE + INSERT)', () => {
    const d = db();
    d.exec(sqlFor(aggregate()));
    const fewer = aggregate([...fixtureLines()].filter((l) => !l.includes('"Gamma"')));
    d.exec(sqlFor(fewer));
    expect(d.prepare("SELECT COUNT(*) AS c FROM dld_area_month WHERE area_en = 'Gamma'").get()).toEqual({ c: 0 });
    expect(d.prepare("SELECT COUNT(*) AS c FROM events WHERE type = 'market_sync_failed'").get()).toEqual({ c: 0 });
  });
});

describe('SQL generation', () => {
  it('quotes values, writes a run row, and the check passes only for an ok run', () => {
    const d = db();
    const a = aggregate([HEADER, row({ worth: 1e6, area: "O'Neil Area", date: '2026-02-01' })]);
    const id = 'run-ok';
    d.exec(sqlFor(a, { runId: id }));
    expect(d.prepare('SELECT area_en FROM dld_area_month').all()).toEqual([{ area_en: "O'Neil Area" }]);
    d.exec(checkSql(id, '2026-10-16T02:31:00Z'));
    expect(() => d.exec(checkSql('missing-run', '2026-10-16T02:31:00Z'))).toThrow(/CHECK constraint/);
  });

  it('a failure on the runner records ok = 0, keeps the DLD tables untouched, and the check fails', () => {
    const d = db();
    d.exec(sqlFor(aggregate()));
    const count = d.prepare('SELECT COUNT(*) AS c FROM dld_area_month').get();
    const id = 'run-failed';
    d.exec(buildSql({ runId: id, startedAt: 's', finishedAt: '2026-10-17T02:30:00Z', dld: null, rowsTotal: 0, rowsBad: 0, projects: null, adrec: null, errors: ['download data.dubai/x returned HTTP 503'], uuid }));
    expect(d.prepare('SELECT COUNT(*) AS c FROM dld_area_month').get()).toEqual(count);
    expect(d.prepare('SELECT ok, error FROM market_sync_runs WHERE run_id = ?').get(id)).toEqual({ ok: 0, error: 'download data.dubai/x returned HTTP 503' });
    expect(() => d.exec(checkSql(id, 'now'))).toThrow(/CHECK constraint/);
  });

  it('ADREC figures are stored only when they differ from the last stored ones', () => {
    const d = db();
    const adrec = { transaction_value_aed: 100e9, sales_value_aed: 70e9, mortgage_value_aed: 30e9, year: 2026 };
    const a = aggregate();
    d.exec(sqlFor(a, { adrec }));
    d.exec(sqlFor(a, { adrec, finishedAt: '2026-10-17T02:30:00.000Z' }));
    expect(d.prepare("SELECT COUNT(*) AS c FROM market_stats WHERE source = 'adrec_ytd'").get()).toEqual({ c: 1 });
    d.exec(sqlFor(a, { adrec: { ...adrec, sales_value_aed: 71e9 }, finishedAt: '2026-10-18T02:30:00.000Z' }));
    expect(d.prepare("SELECT as_of FROM market_stats WHERE source = 'adrec_ytd' ORDER BY fetched_at").all()).toEqual([{ as_of: '2026-10-16' }, { as_of: '2026-10-18' }]);
  });

  it('stores no raw rows and no project or developer names', () => {
    const s = sqlFor(aggregate());
    expect(s).not.toMatch(/Synthetic Master|instance_date|actual_worth/);
  });
});

describe('projects and ADREC parsing', () => {
  const H = csvLine(['project_id', 'project_name_en', 'developer_name_en', 'project_status', 'project_start_date', 'area_name_en', 'no_of_units']);
  const p = (status: string, start: string, area: string, units: string) => csvLine(['1', 'Secret Tower', 'Secret Developer', status, start, area, units]);

  it('counts new projects (90 days), top 5 areas (ties by name), active projects and units; keeps no names', () => {
    const a = new DldProjectsAggregator(TODAY);
    for (const l of [H, p('ACTIVE', '2026-10-01', 'Zeta', '100'), p('ACTIVE', '2026-09-01', 'Alpha', '50'), p('FINISHED', '2026-08-01', 'Alpha', '10'),
      p('ACTIVE', '2026-01-01', 'Beta', '7'), p('ACTIVE', '17-08-2026', 'Zeta', '3'), p('ACTIVE', '2026-07-18', 'Old', '1')]) a.line(l);
    const s = a.stats();
    expect(s).toEqual({ new_projects_90d: 4, top_areas_90d: [{ area_en: 'Alpha', count: 2 }, { area_en: 'Zeta', count: 2 }], active_projects: 5, pipeline_units: 161, as_of: TODAY });
    expect(JSON.stringify(s)).not.toMatch(/Secret/);
  });

  it('no units column: pipeline_units is omitted; a missing required column fails with the accepted names', () => {
    const a = new DldProjectsAggregator(TODAY);
    a.line(csvLine(['project_status', 'start_date', 'area_name_en']));
    a.line(csvLine(['ACTIVE', '2026-10-01', 'Zeta']));
    expect(a.stats()).not.toHaveProperty('pipeline_units');
    expect(() => new DldProjectsAggregator(TODAY).line(csvLine(['name', 'area_name_en']))).toThrow(/project_status\|project_status_en/);
  });

  it('ADREC feed: reads transaction, sales and mortgage value; rejects a changed shape', () => {
    expect(parseAdrec([{ transactionValueYtdAed: 1e11, saleValueYtdAed: '7e10', mortgageValueYtdAed: 3e10, fdiValueYtdAed: 1 }], 2026))
      .toEqual({ transaction_value_aed: 1e11, sales_value_aed: 7e10, mortgage_value_aed: 3e10, year: 2026 });
    expect(() => parseAdrec({}, 2026)).toThrow(/shape/);
    expect(() => parseAdrec([{ transactionValueYtdAed: 0 }], 2026)).toThrow(/transactionValueYtdAed/);
  });
});

describe('logging', () => {
  it('logs host and path only: no signed URL, query string or secret appears in logs, summary or SQL', async () => {
    const SIGNED = 'https://cdn.data.dubai/files/part-1.csv?X-Amz-Signature=SIGNATURE-SECRET&X-Amz-Credential=CRED-SECRET';
    process.env.CLOUDFLARE_API_TOKEN = 'TOKEN-SECRET';
    const logs: string[] = [];
    const listing = (name: string) => new Response(JSON.stringify({ data: { metadata: [{ files: [{ file_extension: 'csv', file_name: name, file_size: 1e6, file_url: SIGNED }] }] } }));
    const fake: typeof fetch = async (input) => {
      const u = String(input);
      if (u.includes('datasetId=470061')) return listing('tx-1.csv');
      if (u.includes('datasetId=467654')) return listing('projects.csv');
      if (u.startsWith('https://cdn.data.dubai/') && logs.some((l) => l.includes('467654'))) return new Response('not found', { status: 404 });
      if (u.startsWith('https://cdn.data.dubai/')) return new Response(fixtureLines().join('\n'));
      return new Response('{}', { status: 500 }); // ADREC down
    };
    const ctx: Ctx = { fetch: fake, log: (s) => logs.push(s), now: () => new Date('2026-10-16T02:23:00Z'), uuid };
    const r = await build(ctx);
    const all = [...logs, JSON.stringify(r.summary), r.sql].join('\n');
    expect(logs.some((l) => l.includes('cdn.data.dubai/files/part-1.csv'))).toBe(true);
    for (const secret of ['SIGNATURE-SECRET', 'CRED-SECRET', 'TOKEN-SECRET', 'X-Amz']) expect(all).not.toContain(secret);
    expect(logs.join('\n')).not.toContain('?');
    expect(r.summary.rows_total).toBe(fixtureLines().length - 1);
    expect(String(r.summary.errors)).toMatch(/adrec/);
    expect(safeUrl(SIGNED)).toBe('cdn.data.dubai/files/part-1.csv');
    delete process.env.CLOUDFLARE_API_TOKEN;
  });
});
