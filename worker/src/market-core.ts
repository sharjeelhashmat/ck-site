// Pure market computation shared by the Worker (src/market.ts, live reads) and the market-data-sync apply step
// (scripts/market-sync/sql.ts, which precomputes the same response bodies into market_cache). No D1, no Workers types:
// it also loads under plain Node (type stripping), so its imports carry explicit extensions and import attributes.
import labelsJson from '../../site/src/data/dld-area-labels.json' with { type: 'json' };

const LABELS = labelsJson as Record<string, string>;

export const DLD_TX_SOURCE = {
  label: 'Dubai Land Department, Real Estate Transactions open data via Data.Dubai (Open Data Licence)',
  url: 'https://data.dubai/en/l/470061',
};
export const DLD_PROJECTS_SOURCE = {
  label: 'Dubai Land Department, Real Estate Projects open data via Data.Dubai (Open Data Licence)',
  url: 'https://data.dubai/en/l/467654',
};
export const ADREC_SOURCE = {
  label: 'Abu Dhabi Real Estate Centre (ADREC), published year-to-date figures',
  url: 'https://adrec.gov.ae/en',
};

// ---- Periods -------------------------------------------------------------------------------------------------------

export interface Period {
  id: string;           // 2026-H1, or 2026-YTD10 (Dubai year to date: Jan to Oct 2026)
  firstMonth: string;   // 2026-01
  lastMonth: string;    // 2026-06
  endDate: string;      // 2026-06-30 (inclusive)
}

/**
 * The Dubai year-to-date alias the site requests (?period=ytd). It resolves to the latest complete year to date in the
 * data: 1 January to the end of the last month fully covered by the DLD data's as_of (ytdPeriod), against the same
 * months of the prior year. The response carries the explicit period id and months.
 */
export const YTD_ALIAS = 'ytd';

const SPANS: Record<string, [number, number]> = { H1: [1, 6], H2: [7, 12], Q1: [1, 3], Q2: [4, 6], Q3: [7, 9], Q4: [10, 12] };
const pad = (n: number) => String(n).padStart(2, '0');

/** Request periods are limited to the years 2000 to 2100 (audit item 9); anything else is not a period. */
export const PERIOD_YEARS = { min: 2000, max: 2100 } as const;

function ytdOf(year: number, last: number): Period {
  const lastDay = new Date(Date.UTC(year, last, 0)).getUTCDate();
  return { id: `${year}-YTD${pad(last)}`, firstMonth: `${year}-01`, lastMonth: `${year}-${pad(last)}`, endDate: `${year}-${pad(last)}-${pad(lastDay)}` };
}

function periodOf(year: number, span: string): Period {
  const [a, b] = SPANS[span]!;
  const lastDay = new Date(Date.UTC(year, b, 0)).getUTCDate();
  return { id: `${year}-${span}`, firstMonth: `${year}-${pad(a)}`, lastMonth: `${year}-${pad(b)}`, endDate: `${year}-${pad(b)}-${pad(lastDay)}` };
}

export function parsePeriod(id: string | null): Period | null {
  const m = /^(\d{4})-(H1|H2|Q1|Q2|Q3|Q4|YTD(0[1-9]|1[0-2]))$/.exec(id ?? '');
  if (!m) return null;
  const year = Number(m[1]);
  if (year < PERIOD_YEARS.min || year > PERIOD_YEARS.max) return null;
  return m[3] ? ytdOf(year, Number(m[3])) : periodOf(year, m[2]!);
}

// The same span a year earlier (the comparison period); not range-checked, so 2000-H1 still has a 1999-H1 to compare with.
// A year to date compares with the same months of the prior year.
export function priorPeriod(p: Period): Period {
  const [y, span] = p.id.split('-') as [string, string];
  return span.startsWith('YTD') ? ytdOf(Number(y) - 1, Number(span.slice(3))) : periodOf(Number(y) - 1, span);
}

/** The last month fully covered by data dated asOf (YYYY-MM-DD): its own month on the month's last day, else the one before. */
export function lastCompleteMonth(asOf: string): string {
  const y = Number(asOf.slice(0, 4));
  const m = Number(asOf.slice(5, 7));
  const d = Number(asOf.slice(8, 10));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d >= lastDay) return asOf.slice(0, 7);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

/**
 * The Dubai year to date for data dated asOf: 1 January to the end of the last complete month, in that month's year
 * (as_of 2026-10-31: 2026-YTD10; as_of 2026-11-02: 2026-YTD10; as_of 2026-10-30: 2026-YTD09; as_of 2027-01-15: 2026-YTD12).
 */
export function ytdPeriod(asOf: string): Period {
  const last = lastCompleteMonth(asOf);
  return ytdOf(Number(last.slice(0, 4)), Number(last.slice(5, 7)));
}

// ---- Pure computation (unit-tested in Node) -----------------------------------------------------------------------

export interface AreaSums { area_en: string; value: number; count: number; offplan: number }
export interface TotalsRow { month: string; trans_group: string; value: number }

export interface AreaFigure {
  rank: number;
  area_en: string;
  label: string | null;
  value_bn: number;
  share_pct: number;
  change_pct: number | null;
  prior_zero: boolean;
  offplan_pct: number;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
export const bn = (aed: number) => round(aed / 1e9, 2);

/** Ranks every area with sales in the period (value desc, ties by name) and computes share and change. */
export function rankAreas(current: AreaSums[], prior: AreaSums[]): { areas: AreaFigure[]; total: number } {
  const total = current.reduce((s, a) => s + a.value, 0);
  const priorBy = new Map(prior.map((a) => [a.area_en, a.value]));
  const areas = current
    .filter((a) => a.value > 0)
    .sort((x, y) => y.value - x.value || x.area_en.localeCompare(y.area_en))
    .map((a, i): AreaFigure => {
      const p = priorBy.get(a.area_en) ?? 0;
      return {
        rank: i + 1,
        area_en: a.area_en,
        label: LABELS[a.area_en] ?? null,
        value_bn: bn(a.value),
        share_pct: total > 0 ? round((a.value / total) * 100, 1) : 0,
        change_pct: p > 0 ? round((a.value / p - 1) * 100, 1) : null,
        prior_zero: !(p > 0),
        offplan_pct: a.count > 0 ? round((a.offplan / a.count) * 100, 1) : 0,
      };
    });
  return { areas, total };
}

/** Year to date for the year of as_of: Sales, Mortgages, and total = Sales + Mortgages + Gifts. */
export function yearToDate(rows: TotalsRow[], asOf: string) {
  const year = asOf.slice(0, 4);
  const lastMonth = asOf.slice(0, 7);
  const sum = (g: string) => rows.filter((r) => r.trans_group === g && r.month >= `${year}-01` && r.month <= lastMonth).reduce((s, r) => s + r.value, 0);
  const sales = sum('Sales');
  const mortgages = sum('Mortgages');
  const gifts = sum('Gifts');
  if (sales <= 0) return null;
  return { sales_bn: bn(sales), total_bn: bn(sales + mortgages + gifts), mortgages_bn: bn(mortgages), as_of: asOf };
}

export interface ProjectsPayload { new_projects_90d: number; top_areas_90d: { area_en: string; count: number }[]; active_projects: number; pipeline_units?: number; as_of: string }
export interface AdrecPayload { transaction_value_aed: number; sales_value_aed: number; mortgage_value_aed: number; year: number }

const posInt = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x > 0;
const posNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0;

export function launchesDubai(s: { payload: ProjectsPayload; as_of: string } | null) {
  if (!s) return null;
  const p = s.payload;
  if (!posInt(p.new_projects_90d) && !posInt(p.active_projects)) return null;
  return {
    new_projects_90d: posInt(p.new_projects_90d) ? p.new_projects_90d : 0,
    top_areas_90d: (Array.isArray(p.top_areas_90d) ? p.top_areas_90d : []).filter((a) => a && typeof a.area_en === 'string' && posInt(a.count)).slice(0, 5)
      .map((a) => ({ area_en: a.area_en, label: LABELS[a.area_en] ?? null, count: a.count })),
    active_projects: posInt(p.active_projects) ? p.active_projects : 0,
    ...(posInt(p.pipeline_units) ? { pipeline_units: p.pipeline_units } : {}),
    as_of: s.as_of,
    source_label: DLD_PROJECTS_SOURCE.label,
    source_url: DLD_PROJECTS_SOURCE.url,
  };
}

export function launchesAbuDhabi(s: { payload: AdrecPayload; as_of: string } | null) {
  if (!s) return null;
  const p = s.payload;
  if (!posNum(p.sales_value_aed) || !posNum(p.transaction_value_aed) || !posNum(p.mortgage_value_aed) || !posInt(p.year)) return null;
  return {
    transaction_value_bn: bn(p.transaction_value_aed),
    sales_value_bn: bn(p.sales_value_aed),
    mortgage_value_bn: bn(p.mortgage_value_aed),
    year: p.year,
    as_of: s.as_of,
    source_label: ADREC_SOURCE.label,
    source_url: ADREC_SOURCE.url,
  };
}

// ---- Response bodies (identical whether computed live or precomputed by the sync) ----------------------------------

export type MarketResult = { status: number; body: unknown };

/** The period fields every /market/areas and /market/area body carries: ids plus the explicit first and last months. */
function periodFields(p: Period) {
  const pp = priorPeriod(p);
  return { period: p.id, prior_period: pp.id, first_month: p.firstMonth, last_month: p.lastMonth, prior_first_month: pp.firstMonth, prior_last_month: pp.lastMonth };
}

/** The 200 body of /market/areas, or null when the period has no sales. */
export function areasBody(p: Period, current: AreaSums[], prior: AreaSums[], totals: TotalsRow[], asOf: string): unknown | null {
  const { areas, total } = rankAreas(current, prior);
  if (total <= 0) return null;
  return { ...periodFields(p), dubai: { ytd: yearToDate(totals, asOf), top8: areas.slice(0, 8), total_res_bn: bn(total), as_of: asOf } };
}

/** The 200 body of /market/area/<area_en> for every area with sales in the period (prior sums may cover all areas). */
export function areaBodies(p: Period, current: AreaSums[], prior: AreaSums[], asOf: string): Map<string, unknown> {
  const { areas, total } = rankAreas(current, prior);
  const out = new Map<string, unknown>();
  if (total <= 0) return out;
  for (const area of areas) out.set(area.area_en, { ...periodFields(p), area, total_res_bn: bn(total), as_of: asOf });
  return out;
}

/** market_cache keys. Only validated input reaches them (a parsed period or the "ytd" alias, an area of at most 120 characters). */
export const cacheKey = {
  areas: (period: string) => `areas:${period}`,
  area: (period: string, areaEn: string) => `area:${period}:${areaEn}`,
  launches: 'launches',
};

/** Every period the Worker can serve from data starting at sinceMonth (YYYY-MM) and complete by asOf. */
export function completePeriods(sinceMonth: string, asOf: string): Period[] {
  const out: Period[] = [];
  for (let y = Number(sinceMonth.slice(0, 4)); y <= Number(asOf.slice(0, 4)); y++) {
    for (const span of ['H1', 'H2', 'Q1', 'Q2', 'Q3', 'Q4']) {
      const p = parsePeriod(`${y}-${span}`)!;
      if (p.firstMonth >= sinceMonth && p.endDate <= asOf) out.push(p);
    }
  }
  return out;
}
