// Builds the one SQL file the workflow applies with "wrangler d1 execute ck-leads --remote --file market-sync.sql".
// A remote --file import is atomic (D1 returns to its original state if it does not complete), so the DLD tables are
// replaced in one transaction. The sanity guard that needs history (rows_total against the previous run) is evaluated
// inside the SQL itself: the run row records whether it passed, and every DLD statement is conditional on that row.
// Every /market/* response body is precomputed here into market_cache (migration 0005), in the same import as the data,
// with the same functions the Worker uses live (src/market-core.ts), so a request reads one row.
import { DLD_SINCE, type AdrecYtd, type AreaMonth, type MonthTotal, type ProjectsStats } from './dld.ts';
import { areaBodies, areasBody, cacheKey, completePeriods, launchesAbuDhabi, launchesDubai, priorPeriod, type AreaSums, type Period } from '../../src/market-core.ts';

export interface BuildInput {
  runId: string;
  startedAt: string;
  finishedAt: string;
  /** DLD transactions aggregated and passed the bad-row check; null when the DLD part failed before writing. */
  dld: { rowsTotal: number; rowsBad: number; asOf: string; areaMonths: AreaMonth[]; monthTotals: MonthTotal[] } | null;
  /** Counts for rows_total / rows_bad even when the DLD part failed (0 when nothing was read). */
  rowsTotal: number;
  rowsBad: number;
  projects: ProjectsStats | null;
  adrec: AdrecYtd | null;
  /** Failures found on the runner (download, parsing, bad rows, ADREC, projects). Empty when none. */
  errors: string[];
  /** The UAE runner did not run this week yet (PC offline, job cancelled or skipped): recorded, not a failure. */
  dldWaiting?: boolean;
  uuid: () => string;
}

export const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const n = (x: number) => (Number.isFinite(x) ? String(Math.round(x * 100) / 100) : '0');
const CHUNK = 200;
// Cached bodies are a few hundred bytes each: 100 per statement stays well under D1's 100 KB statement limit.
const CACHE_CHUNK = 100;
export const GUARD_RATIO = 0.9;

function chunks<T>(a: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += size) out.push(a.slice(i, i + size));
  return out;
}

// The stored values, rounded exactly as the INSERTs below round them, so a cached body equals the live one.
const r2 = (x: number) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : 0);

function sumsFor(rows: AreaMonth[], p: Period): AreaSums[] {
  const by = new Map<string, AreaSums>();
  for (const r of rows) {
    if (r.month < p.firstMonth || r.month > p.lastMonth) continue;
    const a = by.get(r.area_en) ?? { area_en: r.area_en, value: 0, count: 0, offplan: 0 };
    a.value += r2(r.res_sales_value);
    a.count += r.res_sales_count;
    a.offplan += r.res_offplan_count;
    by.set(r.area_en, a);
  }
  return [...by.values()];
}

/** [key, body] for /market/areas and /market/area/<area_en> in every period complete in this run's data. */
export function cacheRows(d: { asOf: string; areaMonths: AreaMonth[]; monthTotals: MonthTotal[] }): [string, string][] {
  const out: [string, string][] = [];
  const totals = d.monthTotals.map((t) => ({ month: t.month, trans_group: t.trans_group, value: r2(t.value) }));
  for (const p of completePeriods(DLD_SINCE.slice(0, 7), d.asOf)) {
    const prior = priorPeriod(p);
    const current = sumsFor(d.areaMonths, p);
    const priorSums = sumsFor(d.areaMonths, prior);
    const body = areasBody(p, current, priorSums, totals, d.asOf);
    if (!body) continue;
    out.push([cacheKey.areas(p.id), JSON.stringify(body)]);
    for (const [area, b] of areaBodies(p, current, priorSums, d.asOf)) out.push([cacheKey.area(p.id, area), JSON.stringify(b)]);
  }
  return out;
}

export function buildSql(x: BuildInput): string {
  const id = q(x.runId);
  const written = `(SELECT dld_written FROM market_sync_runs WHERE run_id = ${id}) = 1`;
  const jsError = x.errors.length ? x.errors.join('; ').slice(0, 900) : '';
  const sanity = `dld_transactions: rows_total ${x.rowsTotal} is below ${GUARD_RATIO * 100}% of the previous run`;
  // pass = 1 when the DLD aggregates exist and rows_total >= 90% of the last run that wrote DLD data (or there is none).
  const pass = x.dld
    ? `(SELECT CASE WHEN prev IS NULL OR ${x.dld.rowsTotal} >= ${GUARD_RATIO} * prev THEN 1 ELSE 0 END FROM (SELECT (SELECT rows_total FROM market_sync_runs WHERE dld_written = 1 ORDER BY started_at DESC LIMIT 1) AS prev))`
    : '0';
  // ok: no failure recorded. A week waiting for the UAE runner is not a failure (no email for an offline PC).
  const okExpr = x.errors.length ? '0' : x.dld ? 'g.pass' : x.dldWaiting ? '1' : '0';
  const statusExpr = x.dld ? "CASE WHEN g.pass = 1 THEN 'written' ELSE 'guard_failed' END" : x.dldWaiting ? "'waiting_for_runner'" : "'failed'";
  const errExpr = x.dld
    ? `CASE WHEN g.pass = 1 THEN ${jsError ? q(jsError) : 'NULL'} ELSE ${q([jsError, sanity].filter(Boolean).join('; '))} END`
    : jsError ? q(jsError) : x.dldWaiting ? 'NULL' : q('dld_transactions: not read');
  const out: string[] = [
    `-- market-data-sync run ${x.runId}. Generated; applied once with wrangler d1 execute --remote --file.`,
    `INSERT INTO market_sync_runs (run_id, started_at, finished_at, ok, rows_total, rows_bad, as_of, error, dld_written, dld_status, adrec_ok)
SELECT ${id}, ${q(x.startedAt)}, ${q(x.finishedAt)}, ${okExpr}, ${x.rowsTotal}, ${x.rowsBad}, ${x.dld ? q(x.dld.asOf) : 'NULL'}, ${errExpr}, g.pass, ${statusExpr}, ${x.adrec ? 1 : 0}
FROM (SELECT ${pass} AS pass) AS g;`,
  ];
  if (x.dld) {
    out.push(`DELETE FROM dld_area_month WHERE ${written};`);
    for (const c of chunks(x.dld.areaMonths)) {
      out.push(`INSERT INTO dld_area_month (area_en, month, res_sales_value, res_sales_count, res_offplan_count)
SELECT column1, column2, column3, column4, column5 FROM (VALUES ${c.map((r) => `(${q(r.area_en)}, ${q(r.month)}, ${n(r.res_sales_value)}, ${r.res_sales_count}, ${r.res_offplan_count})`).join(', ')})
WHERE ${written};`);
    }
    out.push(`DELETE FROM dld_month_totals WHERE ${written};`);
    for (const c of chunks(x.dld.monthTotals)) {
      out.push(`INSERT INTO dld_month_totals (month, trans_group, value, count)
SELECT column1, column2, column3, column4 FROM (VALUES ${c.map((r) => `(${q(r.month)}, ${q(r.trans_group)}, ${n(r.value)}, ${r.count})`).join(', ')})
WHERE ${written};`);
    }
  }
  if (x.dld) {
    // Replaced only together with the data (the same sanity guard): otherwise the old bodies still match the old data.
    out.push(`DELETE FROM market_cache WHERE (key LIKE 'areas:%' OR key LIKE 'area:%') AND ${written};`);
    for (const c of chunks(cacheRows(x.dld), CACHE_CHUNK)) {
      out.push(`INSERT INTO market_cache (key, body, computed_at)
SELECT column1, column2, column3 FROM (VALUES ${c.map(([k, b]) => `(${q(k)}, ${q(b)}, ${q(x.finishedAt)})`).join(', ')})
WHERE ${written};`);
    }
  }
  if (x.projects) {
    out.push(`INSERT INTO market_stats (id, source, payload_json, as_of, fetched_at) VALUES (${q(x.uuid())}, 'dld_projects', ${q(JSON.stringify(x.projects))}, ${q(x.projects.as_of)}, ${q(x.finishedAt)});`);
  }
  if (x.adrec) {
    // Stored only when the figures differ from the last stored ones; as_of is the run date.
    const payload = q(JSON.stringify(x.adrec));
    out.push(`INSERT INTO market_stats (id, source, payload_json, as_of, fetched_at)
SELECT ${q(x.uuid())}, 'adrec_ytd', ${payload}, ${q(x.finishedAt.slice(0, 10))}, ${q(x.finishedAt)}
WHERE COALESCE((SELECT payload_json FROM market_stats WHERE source = 'adrec_ytd' ORDER BY fetched_at DESC LIMIT 1), '') <> ${payload};`);
  }
  // /market/launches. Only when this run read both sources; otherwise the row is removed and the Worker computes the
  // body live from the latest stored figures. ADREC figures are stored only when they change, so their as_of is read
  // from the stored row (it may predate this run).
  if (x.projects && x.adrec) {
    const abuDhabi = launchesAbuDhabi({ payload: x.adrec, as_of: '' });
    const body = q(JSON.stringify({ dubai: launchesDubai({ payload: x.projects, as_of: x.projects.as_of }), abu_dhabi: abuDhabi }));
    const expr = abuDhabi ? `json_set(${body}, '$.abu_dhabi.as_of', (SELECT as_of FROM market_stats WHERE source = 'adrec_ytd' ORDER BY fetched_at DESC LIMIT 1))` : body;
    out.push(`INSERT INTO market_cache (key, body, computed_at) VALUES (${q(cacheKey.launches)}, ${expr}, ${q(x.finishedAt)})
ON CONFLICT(key) DO UPDATE SET body = excluded.body, computed_at = excluded.computed_at;`);
  } else {
    out.push(`DELETE FROM market_cache WHERE key = ${q(cacheKey.launches)};`);
  }
  // Failure record in the existing events table, only when this run is not ok.
  out.push(`INSERT INTO events (id, created_at, type, lead_id, detail)
SELECT ${q(x.uuid())}, ${q(x.finishedAt)}, 'market_sync_failed', NULL, error FROM market_sync_runs WHERE run_id = ${id} AND ok = 0;`);
  return out.join('\n') + '\n';
}

/** The workflow's last D1 step: violates market_sync_checks' CHECK (ok = 1), failing the job, unless this run is ok. */
export function checkSql(runId: string, now: string): string {
  return `INSERT INTO market_sync_checks (run_id, ok, checked_at) VALUES (${q(runId)}, COALESCE((SELECT ok FROM market_sync_runs WHERE run_id = ${q(runId)}), 0), ${q(now)});\n`;
}
