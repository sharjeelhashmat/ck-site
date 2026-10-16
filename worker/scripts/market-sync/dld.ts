// Parsing and aggregation for the market-data sync. Pure functions, no I/O: unit-tested in worker/test/market-sync.test.ts.
// Only aggregates leave this file. Project names, developer names and raw rows are never kept.

/** DLD Real Estate Transactions (Data.Dubai datasetId 470061): the only column names this sync reads. */
export const DLD_TX_COLUMNS = {
  actualWorth: 'actual_worth',
  area: 'area_name_en',
  date: 'instance_date',
  masterProject: 'master_project_en',
  procedureArea: 'procedure_area',
  usage: 'property_usage_en',
  regType: 'reg_type_en',
  group: 'trans_group_en',
} as const;
export const DLD_TX_COLUMN_COUNT = 47;
export const DLD_SINCE = '2025-01-01';

/**
 * DLD Real Estate Projects (datasetId 467654). The CSV header was not confirmed before this was written (the source
 * was unreachable from the build session), so each field lists the names accepted; the first one present wins. A run
 * whose header has none of the names for a required field fails and prints the header, so the next fix is exact.
 */
export const DLD_PROJECT_COLUMNS = {
  status: ['project_status', 'project_status_en'],
  start: ['project_start_date', 'start_date', 'registration_date', 'adoption_date'],
  area: ['area_name_en'],
  units: ['no_of_units', 'number_of_units', 'units'],
} as const;

/** One CSV record per line, every field quoted: strip the outer quotes and split on '","'. Null when not quoted. */
export function splitLine(line: string): string[] | null {
  const t = line.endsWith('\r') ? line.slice(0, -1) : line;
  if (t.length < 2 || !t.startsWith('"') || !t.endsWith('"')) return null;
  return t.slice(1, -1).split('","');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD from "YYYY-MM-DD…", "DD-MM-YYYY" or "DD/MM/YYYY"; null otherwise. */
export function isoDate(s: string): string | null {
  const t = s.trim();
  if (DATE_RE.test(t.slice(0, 10))) return t.slice(0, 10);
  const m = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export interface AreaMonth { area_en: string; month: string; res_sales_value: number; res_sales_count: number; res_offplan_count: number }
export interface MonthTotal { month: string; trans_group: string; value: number; count: number }

type TxIndex = Record<keyof typeof DLD_TX_COLUMNS, number>;

/** Streams transaction lines (header lines included, one per CSV part) into the aggregates. */
export class DldTxAggregator {
  rowsTotal = 0;
  rowsBad = 0;
  asOf = '';
  private idx: TxIndex | null = null;
  private areaMonth = new Map<string, AreaMonth>();
  private totals = new Map<string, MonthTotal>();

  constructor(private readonly today: string) {}

  /** A header line (re)sets the column positions. Throws when a column this sync reads is missing. */
  private header(fields: string[]): void {
    const idx = {} as TxIndex;
    const missing: string[] = [];
    for (const [k, name] of Object.entries(DLD_TX_COLUMNS) as [keyof TxIndex, string][]) {
      const i = fields.indexOf(name);
      if (i < 0) missing.push(name);
      idx[k] = i;
    }
    if (missing.length) throw new Error(`dld_transactions: column(s) not found: ${missing.join(', ')}`);
    this.idx = idx;
  }

  line(line: string): void {
    if (!line) return;
    const f = splitLine(line);
    if (f && (f.includes(DLD_TX_COLUMNS.area) || f.includes(DLD_TX_COLUMNS.date))) { this.header(f); return; }
    if (!this.idx) throw new Error('dld_transactions: data before the header');
    this.rowsTotal++;
    if (!f || f.length !== DLD_TX_COLUMN_COUNT) { this.rowsBad++; return; }
    const i = this.idx;
    const date = isoDate(f[i.date]!);
    if (!date || date > this.today) return;
    if (date > this.asOf) this.asOf = date;
    if (date < DLD_SINCE) return;
    const month = date.slice(0, 7);
    const worth = Number(f[i.actualWorth]);
    const value = Number.isFinite(worth) && worth > 0 ? worth : 0;
    const group = f[i.group]!.trim();
    if (group) {
      const k = `${month}\u0000${group}`;
      const t = this.totals.get(k) ?? { month, trans_group: group, value: 0, count: 0 };
      t.value += value;
      t.count++;
      this.totals.set(k, t);
    }
    if (group === 'Sales' && f[i.usage]!.trim() === 'Residential') {
      const area = f[i.area]!.trim();
      if (!area) return;
      const k = `${area}\u0000${month}`;
      const a = this.areaMonth.get(k) ?? { area_en: area, month, res_sales_value: 0, res_sales_count: 0, res_offplan_count: 0 };
      a.res_sales_value += value;
      a.res_sales_count++;
      if (/off-plan/i.test(f[i.regType]!)) a.res_offplan_count++;
      this.areaMonth.set(k, a);
    }
  }

  areaMonths(): AreaMonth[] {
    return [...this.areaMonth.values()].sort((a, b) => a.area_en.localeCompare(b.area_en) || a.month.localeCompare(b.month));
  }

  monthTotals(): MonthTotal[] {
    return [...this.totals.values()].sort((a, b) => a.month.localeCompare(b.month) || a.trans_group.localeCompare(b.trans_group));
  }
}

/** Sanity guard, part 1 (no history needed): more than 1% bad rows, or no rows at all, blocks the DLD write. */
export function badRowsProblem(rowsTotal: number, rowsBad: number): string | null {
  if (rowsTotal === 0) return 'dld_transactions: no rows';
  if (rowsBad > rowsTotal * 0.01) return `dld_transactions: ${rowsBad} bad rows of ${rowsTotal} (over 1%)`;
  return null;
}

export interface ProjectsStats { new_projects_90d: number; top_areas_90d: { area_en: string; count: number }[]; active_projects: number; pipeline_units?: number; as_of: string }

/** Counts from the projects CSV. Reads only status, start date, area and units; names are never read. */
export class DldProjectsAggregator {
  header: string[] | null = null;
  rowsTotal = 0;
  rowsBad = 0;
  private col: { status: number; start: number; area: number; units: number } | null = null;
  private newByArea = new Map<string, number>();
  private newCount = 0;
  private active = 0;
  private units = 0;
  private readonly since: string;

  constructor(private readonly today: string) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 90);
    this.since = d.toISOString().slice(0, 10);
  }

  private pick(fields: string[], names: readonly string[]): number {
    for (const n of names) { const i = fields.indexOf(n); if (i >= 0) return i; }
    return -1;
  }

  line(line: string): void {
    if (!line) return;
    const f = splitLine(line);
    if (!this.header) {
      if (!f) throw new Error('dld_projects: header is not a quoted CSV line');
      this.header = f;
      const col = { status: this.pick(f, DLD_PROJECT_COLUMNS.status), start: this.pick(f, DLD_PROJECT_COLUMNS.start), area: this.pick(f, DLD_PROJECT_COLUMNS.area), units: this.pick(f, DLD_PROJECT_COLUMNS.units) };
      const missing = (['status', 'start', 'area'] as const).filter((k) => col[k] < 0);
      if (missing.length) throw new Error(`dld_projects: required column(s) not found (${missing.map((k) => DLD_PROJECT_COLUMNS[k].join('|')).join('; ')})`);
      this.col = col;
      return;
    }
    if (f && f.join('\u0000') === this.header.join('\u0000')) return; // a repeated header (multi-part files)
    this.rowsTotal++;
    if (!f || f.length !== this.header.length || !this.col) { this.rowsBad++; return; }
    const c = this.col;
    const isActive = f[c.status]!.trim().toUpperCase() === 'ACTIVE';
    if (isActive) {
      this.active++;
      const u = c.units >= 0 ? Number(f[c.units]) : NaN;
      if (Number.isFinite(u) && u > 0) this.units += u;
    }
    const start = isoDate(f[c.start]!);
    if (start && start > this.since && start <= this.today) {
      this.newCount++;
      const area = f[c.area]!.trim();
      if (area) this.newByArea.set(area, (this.newByArea.get(area) ?? 0) + 1);
    }
  }

  stats(): ProjectsStats {
    if (!this.header) throw new Error('dld_projects: empty file');
    const top = [...this.newByArea.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([area_en, count]) => ({ area_en, count }));
    return {
      new_projects_90d: this.newCount,
      top_areas_90d: top,
      active_projects: this.active,
      ...(this.col && this.col.units >= 0 ? { pipeline_units: Math.round(this.units) } : {}),
      as_of: this.today,
    };
  }
}

export interface AdrecYtd { transaction_value_aed: number; sales_value_aed: number; mortgage_value_aed: number; year: number }

/** The ADREC homepage feed: [{transactionValueYtdAed, saleValueYtdAed, mortgageValueYtdAed, fdiValueYtdAed}]. */
export function parseAdrec(body: unknown, year: number): AdrecYtd {
  const row = Array.isArray(body) ? body[0] : null;
  if (!row || typeof row !== 'object') throw new Error('adrec: unexpected response shape');
  const r = row as Record<string, unknown>;
  const num = (k: string) => {
    const v = typeof r[k] === 'string' ? Number(String(r[k]).replace(/,/g, '')) : r[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error(`adrec: ${k} missing or not positive`);
    return v;
  };
  return { transaction_value_aed: num('transactionValueYtdAed'), sales_value_aed: num('saleValueYtdAed'), mortgage_value_aed: num('mortgageValueYtdAed'), year };
}

/** Host and path only: signed query strings never reach a log. */
export function safeUrl(u: string): string {
  try { const x = new URL(u); return `${x.host}${x.pathname}`; } catch { return '(unparseable url)'; }
}
