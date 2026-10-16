// Builds the one SQL file the workflow applies with "wrangler d1 execute ck-leads --remote --file market-sync.sql".
// A remote --file import is atomic (D1 returns to its original state if it does not complete), so the DLD tables are
// replaced in one transaction. The sanity guard that needs history (rows_total against the previous run) is evaluated
// inside the SQL itself: the run row records whether it passed, and every DLD statement is conditional on that row.
import type { AdrecYtd, AreaMonth, MonthTotal, ProjectsStats } from './dld';

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
  uuid: () => string;
}

export const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const n = (x: number) => (Number.isFinite(x) ? String(Math.round(x * 100) / 100) : '0');
const CHUNK = 200;
export const GUARD_RATIO = 0.9;

function chunks<T>(a: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += CHUNK) out.push(a.slice(i, i + CHUNK));
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
  const okExpr = x.errors.length ? '0' : 'g.pass';
  const errExpr = x.dld
    ? `CASE WHEN g.pass = 1 THEN ${jsError ? q(jsError) : 'NULL'} ELSE ${q([jsError, sanity].filter(Boolean).join('; '))} END`
    : q(jsError || 'dld_transactions: not read');
  const out: string[] = [
    `-- market-data-sync run ${x.runId}. Generated; applied once with wrangler d1 execute --remote --file.`,
    `INSERT INTO market_sync_runs (run_id, started_at, finished_at, ok, rows_total, rows_bad, as_of, error, dld_written)
SELECT ${id}, ${q(x.startedAt)}, ${q(x.finishedAt)}, ${okExpr}, ${x.rowsTotal}, ${x.rowsBad}, ${x.dld ? q(x.dld.asOf) : 'NULL'}, ${errExpr}, g.pass
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
  // Failure record in the existing events table, only when this run is not ok.
  out.push(`INSERT INTO events (id, created_at, type, lead_id, detail)
SELECT ${q(x.uuid())}, ${q(x.finishedAt)}, 'market_sync_failed', NULL, error FROM market_sync_runs WHERE run_id = ${id} AND ok = 0;`);
  return out.join('\n') + '\n';
}

/** The workflow's last D1 step: violates market_sync_checks' CHECK (ok = 1), failing the job, unless this run is ok. */
export function checkSql(runId: string, now: string): string {
  return `INSERT INTO market_sync_checks (run_id, ok, checked_at) VALUES (${q(runId)}, COALESCE((SELECT ok FROM market_sync_runs WHERE run_id = ${q(runId)}), 0), ${q(now)});\n`;
}
