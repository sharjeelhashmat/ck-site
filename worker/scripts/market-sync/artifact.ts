// The aggregate-only JSON that the "dld" job (the owner's PC in the UAE: DLD open data is UAE-only) hands to the "apply"
// job (GitHub-hosted, holds the D1 token). It carries counts and sums only: no raw rows, no project or developer names,
// no URLs. The apply side treats it as UNTRUSTED input: validateArtifact() checks every type, range, length and
// character set and re-applies the bad-row guard; anything off rejects the whole DLD part (Dubai keeps its last data).
import type { AreaMonth, MonthTotal, ProjectsStats } from './dld';

export const ARTIFACT_VERSION = 1;
export const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

type TxOk = { ok: true; rows_total: number; rows_bad: number; as_of: string; parts: number; area_months: [string, string, number, number, number][]; month_totals: [string, string, number, number][] };
type TxFail = { ok: false; rows_total: number; rows_bad: number; error: string };
type ProjOk = { ok: true; rows_total: number; rows_bad: number; columns: string[]; stats: ProjectsStats };
type ProjFail = { ok: false; columns: string[]; error: string };
export interface DldArtifact { v: number; generated_at: string; today: string; tx: TxOk | TxFail; projects: ProjOk | ProjFail }

export interface ValidDld {
  today: string;
  tx: { rowsTotal: number; rowsBad: number; asOf: string; areaMonths: AreaMonth[]; monthTotals: MonthTotal[] } | null;
  rowsTotal: number;
  rowsBad: number;
  projects: ProjectsStats | null;
  projectsColumns: string[];
  errors: string[];
  /** The dld job was cancelled or skipped (UAE PC offline, or its 24-hour queue expired): waiting, not failed. */
  waiting?: boolean;
}

/** One line, printable ASCII, no URLs, at most 300 characters. */
export function cleanError(s: unknown): string {
  return String(s ?? '')
    .replace(/https?:\/\/[^\s"']+/g, (u) => { try { const x = new URL(u); return `${x.host}${x.pathname}`; } catch { return '(url)'; } })
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function buildArtifact(x: {
  today: string; now: Date;
  tx: { ok: true; rowsTotal: number; rowsBad: number; asOf: string; parts: number; areaMonths: AreaMonth[]; monthTotals: MonthTotal[] } | { ok: false; rowsTotal: number; rowsBad: number; error: string };
  projects: { ok: true; rowsTotal: number; rowsBad: number; columns: string[]; stats: ProjectsStats } | { ok: false; columns: string[]; error: string };
}): DldArtifact {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    v: ARTIFACT_VERSION,
    generated_at: x.now.toISOString(),
    today: x.today,
    tx: x.tx.ok
      ? { ok: true, rows_total: x.tx.rowsTotal, rows_bad: x.tx.rowsBad, as_of: x.tx.asOf, parts: x.tx.parts,
          area_months: x.tx.areaMonths.map((a) => [a.area_en, a.month, r2(a.res_sales_value), a.res_sales_count, a.res_offplan_count]),
          month_totals: x.tx.monthTotals.map((t) => [t.month, t.trans_group, r2(t.value), t.count]) }
      : { ok: false, rows_total: x.tx.rowsTotal, rows_bad: x.tx.rowsBad, error: cleanError(x.tx.error) },
    projects: x.projects.ok
      ? { ok: true, rows_total: x.projects.rowsTotal, rows_bad: x.projects.rowsBad, columns: x.projects.columns, stats: x.projects.stats }
      : { ok: false, columns: x.projects.columns, error: cleanError(x.projects.error) },
  };
}

// ---- Validation (apply side) ----------------------------------------------------------------------------------------

const AREA_RE = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]{0,79}$/;
const GROUP_RE = /^[A-Za-z][A-Za-z ]{0,39}$/;
const COLUMN_RE = /^[A-Za-z0-9_ ]{1,64}$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_AREA_MONTHS = 50_000;
const MAX_MONTH_TOTALS = 1_000;
const MAX_ROWS = 50_000_000;
const MAX_AED = 1e13;
const MAX_COUNT = 10_000_000;

class Invalid extends Error {}
const fail = (where: string): never => { throw new Invalid(`dld artifact: invalid ${where}`); };
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const int = (x: unknown, max: number, where: string) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max ? x : fail(where));
const num = (x: unknown, max: number, where: string) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max ? x : fail(where));
const str = (x: unknown, re: RegExp, where: string) => (typeof x === 'string' && re.test(x) ? x : fail(where));
const keys = (o: Record<string, unknown>, allowed: string[], where: string) => { for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`${where} (unexpected key)`); };

function columns(x: unknown): string[] {
  if (!Array.isArray(x) || x.length > 100) fail('projects.columns');
  return (x as unknown[]).map((c, i) => str(c, COLUMN_RE, `projects.columns[${i}]`));
}

/**
 * @param raw   JSON.parse of the artifact file (already size-checked by the caller)
 * @param today the apply run's own Dubai date; the artifact must be from today or the two days before
 */
export function validateArtifact(raw: unknown, today: string): ValidDld {
  try {
    if (!isObj(raw)) fail('document');
    const a = raw as Record<string, unknown>;
    keys(a, ['v', 'generated_at', 'today', 'tx', 'projects'], 'document');
    if (a.v !== ARTIFACT_VERSION) fail('version');
    str(a.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/, 'generated_at');
    const day = str(a.today, DATE_RE, 'today');
    const lag = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;
    if (!(lag >= 0 && lag <= 2)) fail('today (not a run from the last two days)');

    const errors: string[] = [];
    let tx: ValidDld['tx'] = null;
    if (!isObj(a.tx)) fail('tx');
    const t = a.tx as Record<string, unknown>;
    const rowsTotal = int(t.rows_total, MAX_ROWS, 'tx.rows_total');
    const rowsBad = int(t.rows_bad, rowsTotal, 'tx.rows_bad');
    if (t.ok === true) {
      keys(t, ['ok', 'rows_total', 'rows_bad', 'as_of', 'parts', 'area_months', 'month_totals'], 'tx');
      const asOf = str(t.as_of, DATE_RE, 'tx.as_of');
      if (asOf > day || asOf < '2025-01-01') fail('tx.as_of (out of range)');
      int(t.parts, 20, 'tx.parts');
      const lastMonth = asOf.slice(0, 7);
      if (!Array.isArray(t.area_months) || t.area_months.length > MAX_AREA_MONTHS) fail('tx.area_months');
      const seen = new Set<string>();
      const areaMonths = (t.area_months as unknown[]).map((r, i): AreaMonth => {
        if (!Array.isArray(r) || r.length !== 5) fail(`tx.area_months[${i}]`);
        const [area, month, value, count, offplan] = r as unknown[];
        const m = str(month, MONTH_RE, `tx.area_months[${i}].month`);
        if (m < '2025-01' || m > lastMonth) fail(`tx.area_months[${i}].month (out of range)`);
        const row = {
          area_en: str(area, AREA_RE, `tx.area_months[${i}].area`), month: m, res_sales_value: num(value, MAX_AED, `tx.area_months[${i}].value`),
          res_sales_count: int(count, MAX_COUNT, `tx.area_months[${i}].count`), res_offplan_count: int(offplan, MAX_COUNT, `tx.area_months[${i}].offplan`),
        };
        if (row.res_offplan_count > row.res_sales_count) fail(`tx.area_months[${i}].offplan (above count)`);
        const k = `${row.area_en}\u0000${m}`;
        if (seen.has(k)) fail(`tx.area_months[${i}] (duplicate)`);
        seen.add(k);
        return row;
      });
      if (!Array.isArray(t.month_totals) || t.month_totals.length > MAX_MONTH_TOTALS) fail('tx.month_totals');
      const seenT = new Set<string>();
      const monthTotals = (t.month_totals as unknown[]).map((r, i): MonthTotal => {
        if (!Array.isArray(r) || r.length !== 4) fail(`tx.month_totals[${i}]`);
        const [month, group, value, count] = r as unknown[];
        const m = str(month, MONTH_RE, `tx.month_totals[${i}].month`);
        if (m < '2025-01' || m > lastMonth) fail(`tx.month_totals[${i}].month (out of range)`);
        const row = { month: m, trans_group: str(group, GROUP_RE, `tx.month_totals[${i}].group`), value: num(value, MAX_AED * 100, `tx.month_totals[${i}].value`), count: int(count, MAX_COUNT * 10, `tx.month_totals[${i}].count`) };
        const k = `${m}\u0000${row.trans_group}`;
        if (seenT.has(k)) fail(`tx.month_totals[${i}] (duplicate)`);
        seenT.add(k);
        return row;
      });
      // The bad-row guard again: the producer is not trusted to have applied it.
      if (rowsTotal === 0) errors.push('dld_transactions: no rows');
      else if (rowsBad > rowsTotal * 0.01) errors.push(`dld_transactions: ${rowsBad} bad rows of ${rowsTotal} (over 1%)`);
      else if (!areaMonths.length || !monthTotals.length) errors.push('dld_transactions: no aggregates');
      else tx = { rowsTotal, rowsBad, asOf, areaMonths, monthTotals };
    } else if (t.ok === false) {
      keys(t, ['ok', 'rows_total', 'rows_bad', 'error'], 'tx');
      errors.push(`dld job: ${cleanError(t.error) || 'transactions failed'}`);
    } else fail('tx.ok');

    if (!isObj(a.projects)) fail('projects');
    const p = a.projects as Record<string, unknown>;
    let projects: ProjectsStats | null = null;
    const cols = columns(p.columns);
    if (p.ok === true) {
      keys(p, ['ok', 'rows_total', 'rows_bad', 'columns', 'stats'], 'projects');
      const pTotal = int(p.rows_total, 1_000_000, 'projects.rows_total');
      const pBad = int(p.rows_bad, pTotal, 'projects.rows_bad');
      if (!isObj(p.stats)) fail('projects.stats');
      const s = p.stats as Record<string, unknown>;
      keys(s, ['new_projects_90d', 'top_areas_90d', 'active_projects', 'pipeline_units', 'as_of'], 'projects.stats');
      if (!Array.isArray(s.top_areas_90d) || s.top_areas_90d.length > 5) fail('projects.stats.top_areas_90d');
      const stats: ProjectsStats = {
        new_projects_90d: int(s.new_projects_90d, 100_000, 'projects.stats.new_projects_90d'),
        top_areas_90d: (s.top_areas_90d as unknown[]).map((x, i) => {
          if (!isObj(x)) fail(`projects.stats.top_areas_90d[${i}]`);
          const o = x as Record<string, unknown>;
          keys(o, ['area_en', 'count'], `projects.stats.top_areas_90d[${i}]`);
          return { area_en: str(o.area_en, AREA_RE, `projects.stats.top_areas_90d[${i}].area_en`), count: int(o.count, 100_000, `projects.stats.top_areas_90d[${i}].count`) };
        }),
        active_projects: int(s.active_projects, 100_000, 'projects.stats.active_projects'),
        ...(s.pipeline_units === undefined ? {} : { pipeline_units: int(s.pipeline_units, 100_000_000, 'projects.stats.pipeline_units') }),
        as_of: str(s.as_of, DATE_RE, 'projects.stats.as_of'),
      };
      if (stats.as_of > day) fail('projects.stats.as_of (in the future)');
      if (pTotal === 0) errors.push('dld_projects: no rows');
      else if (pBad > pTotal * 0.01) errors.push(`dld_projects: ${pBad} bad rows of ${pTotal} (over 1%)`);
      else projects = stats;
    } else if (p.ok === false) {
      keys(p, ['ok', 'columns', 'error'], 'projects');
      errors.push(`dld job: ${cleanError(p.error) || 'projects failed'}`);
    } else fail('projects.ok');

    return { today: day, tx, rowsTotal, rowsBad, projects, projectsColumns: cols, errors };
  } catch (e) {
    if (e instanceof Invalid) return { today, tx: null, rowsTotal: 0, rowsBad: 0, projects: null, projectsColumns: [], errors: [e.message] };
    throw e;
  }
}
