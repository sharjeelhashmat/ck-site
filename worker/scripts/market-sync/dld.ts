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
 * DLD Real Estate Projects (datasetId 467654), columns confirmed by the Coordinator on the real file (2026-10-16:
 * 38 columns). project_name / developer_name exist in the file and are never read.
 */
export const DLD_PROJECT_COLUMNS = {
  status: 'project_status',
  start: 'project_start_date',
  area: 'area_name_en',
  units: 'no_of_units',
} as const;
/** When DLD loaded each row; dates the file (the dataset is not refreshed every week). Optional: without it, or without
 * any usable value, the file is dated by its latest project_start_date. */
export const DLD_PROJECT_LOADED = 'load_timestamp';

/**
 * Streaming RFC 4180 parser. Feed text chunks in any size; complete records are passed to onRecord. Handles quoted and
 * unquoted fields, empty unquoted fields (a,,b), commas, doubled quotes and newlines inside quotes, and CRLF or LF
 * line ends. A record with a stray quote (inside an unquoted field, or text after a closing quote) is reported as
 * malformed (fields = null) and parsing resumes at the next line end outside quotes.
 */
export class CsvParser {
  private field = '';
  private fields: string[] = [];
  private inQuotes = false;
  private afterQuote = false; // just closed a quoted field: only , or a line end may follow
  private bad = false;
  private pendingQuote = false; // a quote seen inside quotes, at the end of a chunk: escape or close, decided by the next char
  private pendingCr = false;
  private started = false;

  private readonly onRecord: (fields: string[] | null) => void;

  // No parameter properties: this file runs under plain Node (type stripping only), which does not transform them.
  constructor(onRecord: (fields: string[] | null) => void) {
    this.onRecord = onRecord;
  }

  private endField(): void {
    this.fields.push(this.field);
    this.field = '';
    this.afterQuote = false;
  }

  private endRecord(): void {
    this.endField();
    const empty = this.fields.length === 1 && this.fields[0] === '' && !this.bad;
    if (!empty) this.onRecord(this.bad ? null : this.fields);
    this.fields = [];
    this.bad = false;
    this.started = false;
  }

  feed(chunk: string): void {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i]!;
      if (!this.started && c === '﻿') continue; // BOM
      if (this.pendingCr) {
        this.pendingCr = false;
        if (c === '\n') continue; // CRLF: the record already ended at the CR
      }
      if (this.pendingQuote) {
        this.pendingQuote = false;
        if (c === '"') { this.field += '"'; continue; } // "" inside quotes
        this.inQuotes = false;
        this.afterQuote = true;
      }
      this.started = true;
      if (this.inQuotes) {
        if (c === '"') this.pendingQuote = true;
        else this.field += c;
        continue;
      }
      if (c === ',') { this.endField(); continue; }
      if (c === '\n' || c === '\r') {
        this.endRecord();
        if (c === '\r') this.pendingCr = true;
        continue;
      }
      if (this.afterQuote) { this.bad = true; continue; }
      if (c === '"') {
        if (this.field === '') { this.inQuotes = true; continue; }
        this.bad = true;
        continue;
      }
      this.field += c;
    }
  }

  /** Flushes the last record (a file without a final line end). An unterminated quote is a malformed record. */
  end(): void {
    if (this.pendingQuote) { this.pendingQuote = false; this.inQuotes = false; this.afterQuote = true; }
    if (this.inQuotes) { this.bad = true; this.inQuotes = false; }
    if (this.started || this.field !== '' || this.fields.length) this.endRecord();
  }
}

/** Parses a whole CSV string (tests and small inputs). */
export function parseCsv(text: string): (string[] | null)[] {
  const out: (string[] | null)[] = [];
  const p = new CsvParser((r) => out.push(r));
  p.feed(text);
  p.end();
  return out;
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

/** Takes parsed transaction records (a header at the top of every CSV part) and keeps only the aggregates. */
export class DldTxAggregator {
  rowsTotal = 0;
  rowsBad = 0;
  asOf = '';
  private idx: TxIndex | null = null;
  private width = DLD_TX_COLUMN_COUNT;
  private areaMonth = new Map<string, AreaMonth>();
  private totals = new Map<string, MonthTotal>();

  private readonly today: string;

  constructor(today: string) {
    this.today = today;
  }

  /** A header record (re)sets the column positions. Throws when a column this sync reads is missing. */
  private header(fields: string[]): void {
    const idx = {} as TxIndex;
    const missing: string[] = [];
    for (const [k, name] of Object.entries(DLD_TX_COLUMNS) as [keyof TxIndex, string][]) {
      const i = fields.indexOf(name);
      if (i < 0) missing.push(name);
      idx[k] = i;
    }
    if (missing.length) throw new Error(`dld_transactions: column(s) not found: ${missing.join(', ')}`);
    if (fields.length !== DLD_TX_COLUMN_COUNT) throw new Error(`dld_transactions: header has ${fields.length} columns, expected ${DLD_TX_COLUMN_COUNT}`);
    this.idx = idx;
    this.width = fields.length;
  }

  record(f: string[] | null): void {
    if (f && (f.includes(DLD_TX_COLUMNS.area) || f.includes(DLD_TX_COLUMNS.date))) { this.header(f); return; }
    if (!this.idx) throw new Error('dld_transactions: data before the header');
    this.rowsTotal++;
    if (!f || f.length !== this.width) { this.rowsBad++; return; }
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

/** Sanity guard, the part that needs no history (applied to each file): more than 1% bad rows, or no rows, blocks it. */
export function badRowsProblem(file: string, rowsTotal: number, rowsBad: number): string | null {
  if (rowsTotal === 0) return `${file}: no rows`;
  if (rowsBad > rowsTotal * 0.01) return `${file}: ${rowsBad} bad rows of ${rowsTotal} (over 1%)`;
  return null;
}

export interface ProjectsStats { new_projects_90d: number; top_areas_90d: { area_en: string; count: number }[]; active_projects: number; pipeline_units?: number; as_of: string }

/**
 * Counts from the projects CSV. Reads only status, start date, area, units and load time; names are never read.
 * as_of is the date of the data, never the run date: the latest load_timestamp up to today, else the latest
 * project_start_date up to today. "New in 90 days" is the 90 days ending at as_of.
 */
export class DldProjectsAggregator {
  header: string[] | null = null;
  rowsTotal = 0;
  rowsBad = 0;
  private col: { status: number; start: number; area: number; units: number; loaded: number } | null = null;
  private starts: [string, string][] = [];
  private maxLoaded = '';
  private maxStart = '';
  private active = 0;
  private units = 0;

  private readonly today: string;

  constructor(today: string) {
    this.today = today;
  }

  record(f: string[] | null): void {
    if (!this.header) {
      if (!f) throw new Error('dld_projects: the header is not a valid CSV record');
      this.header = f;
      const col = { status: f.indexOf(DLD_PROJECT_COLUMNS.status), start: f.indexOf(DLD_PROJECT_COLUMNS.start), area: f.indexOf(DLD_PROJECT_COLUMNS.area), units: f.indexOf(DLD_PROJECT_COLUMNS.units) };
      const missing = (Object.keys(col) as (keyof typeof col)[]).filter((k) => col[k] < 0).map((k) => DLD_PROJECT_COLUMNS[k]);
      if (missing.length) throw new Error(`dld_projects: column(s) not found: ${missing.join(', ')}`);
      this.col = { ...col, loaded: f.indexOf(DLD_PROJECT_LOADED) };
      return;
    }
    if (f && f.join('\u0000') === this.header.join('\u0000')) return; // a repeated header (multi-part files)
    this.rowsTotal++;
    if (!f || f.length !== this.header.length || !this.col) { this.rowsBad++; return; }
    const c = this.col;
    // Active projects are status ACTIVE only (values seen: ACTIVE, FINISHED, PENDING, CONDITIONAL_ACTIVATING).
    if (f[c.status]!.trim().toUpperCase() === 'ACTIVE') {
      this.active++;
      const u = Number(f[c.units]);
      if (Number.isFinite(u) && u > 0) this.units += u;
    }
    const loaded = c.loaded >= 0 ? isoDate(f[c.loaded]!) : null;
    if (loaded && loaded <= this.today && loaded > this.maxLoaded) this.maxLoaded = loaded;
    const start = isoDate(f[c.start]!);
    if (start && start <= this.today) {
      if (start > this.maxStart) this.maxStart = start;
      this.starts.push([start, f[c.area]!.trim()]);
    }
  }

  stats(): ProjectsStats {
    if (!this.header) throw new Error('dld_projects: empty file');
    const asOf = this.maxLoaded || this.maxStart;
    if (!asOf) throw new Error(`dld_projects: no ${DLD_PROJECT_LOADED} or ${DLD_PROJECT_COLUMNS.start} to date the file`);
    const d = new Date(`${asOf}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 90);
    const since = d.toISOString().slice(0, 10);
    let newCount = 0;
    const newByArea = new Map<string, number>();
    for (const [start, area] of this.starts) {
      if (start <= since || start > asOf) continue;
      newCount++;
      if (area) newByArea.set(area, (newByArea.get(area) ?? 0) + 1);
    }
    const top = [...newByArea.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([area_en, count]) => ({ area_en, count }));
    return { new_projects_90d: newCount, top_areas_90d: top, active_projects: this.active, pipeline_units: Math.round(this.units), as_of: asOf };
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
