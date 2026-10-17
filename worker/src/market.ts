// Read-only market endpoints (Part A). The data is written once a day by the market-data-sync workflow
// (worker/scripts/market-sync); this file only reads aggregates from D1. No raw rows, no project or developer names.
//   GET /market/launches                     Dubai project activity (DLD) and Abu Dhabi year to date (ADREC)
//   GET /market/areas?period=2026-H1         Dubai year to date + top 8 areas by residential sales value
//   GET /market/area/<area_en>?period=...    the same figures for one DLD area (area guide pages)
//   GET /market/status                       last successful DLD and ADREC sync (the workflow's weekly gate reads it)
import labelsJson from '../../site/src/data/dld-area-labels.json';

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
  id: string;           // 2026-H1
  firstMonth: string;   // 2026-01
  lastMonth: string;    // 2026-06
  endDate: string;      // 2026-06-30 (inclusive)
}

const SPANS: Record<string, [number, number]> = { H1: [1, 6], H2: [7, 12], Q1: [1, 3], Q2: [4, 6], Q3: [7, 9], Q4: [10, 12] };
const pad = (n: number) => String(n).padStart(2, '0');

export function parsePeriod(id: string | null): Period | null {
  const m = /^(\d{4})-(H1|H2|Q1|Q2|Q3|Q4)$/.exec(id ?? '');
  if (!m) return null;
  const year = Number(m[1]);
  const [a, b] = SPANS[m[2]!]!;
  const lastDay = new Date(Date.UTC(year, b, 0)).getUTCDate();
  return { id: m[0], firstMonth: `${year}-${pad(a)}`, lastMonth: `${year}-${pad(b)}`, endDate: `${year}-${pad(b)}-${pad(lastDay)}` };
}

export function priorPeriod(p: Period): Period {
  const [y, span] = p.id.split('-') as [string, string];
  return parsePeriod(`${Number(y) - 1}-${span}`)!;
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

// ---- D1 reads -------------------------------------------------------------------------------------------------------

async function latestAsOf(db: D1Database): Promise<string | null> {
  const r = await db.prepare('SELECT as_of FROM market_sync_runs WHERE dld_written = 1 AND as_of IS NOT NULL ORDER BY started_at DESC LIMIT 1').first<{ as_of: string }>();
  return r?.as_of ?? null;
}

async function areaSums(db: D1Database, p: Period, area?: string): Promise<AreaSums[]> {
  const sql = `SELECT area_en, SUM(res_sales_value) AS value, SUM(res_sales_count) AS count, SUM(res_offplan_count) AS offplan
    FROM dld_area_month WHERE month >= ?1 AND month <= ?2 ${area === undefined ? '' : 'AND area_en = ?3'} GROUP BY area_en`;
  const stmt = area === undefined ? db.prepare(sql).bind(p.firstMonth, p.lastMonth) : db.prepare(sql).bind(p.firstMonth, p.lastMonth, area);
  return ((await stmt.all<AreaSums>()).results ?? []).map((r) => ({ area_en: r.area_en, value: Number(r.value), count: Number(r.count), offplan: Number(r.offplan) }));
}

async function periodTotal(db: D1Database, p: Period): Promise<number> {
  const r = await db.prepare('SELECT SUM(res_sales_value) AS v FROM dld_area_month WHERE month >= ?1 AND month <= ?2').bind(p.firstMonth, p.lastMonth).first<{ v: number | null }>();
  return Number(r?.v ?? 0);
}

async function ytd(db: D1Database, asOf: string) {
  const rows = (await db.prepare('SELECT month, trans_group, value FROM dld_month_totals WHERE month >= ?1 AND month <= ?2')
    .bind(`${asOf.slice(0, 4)}-01`, asOf.slice(0, 7)).all<TotalsRow>()).results ?? [];
  return yearToDate(rows.map((r) => ({ ...r, value: Number(r.value) })), asOf);
}

export type MarketResult = { status: number; body: unknown };

/** /market/areas: 400 on a malformed period, 404 when the period is not complete in the data (or there is no data). */
export async function marketAreas(db: D1Database, periodId: string | null): Promise<MarketResult> {
  const p = parsePeriod(periodId);
  if (!p) return { status: 400, body: { ok: false, error: 'invalid_period' } };
  const asOf = await latestAsOf(db);
  if (!asOf || asOf < p.endDate) return { status: 404, body: { ok: false, error: 'period_not_available' } };
  const prior = priorPeriod(p);
  const { areas, total } = rankAreas(await areaSums(db, p), await areaSums(db, prior));
  if (total <= 0) return { status: 404, body: { ok: false, error: 'period_not_available' } };
  return {
    status: 200,
    body: { period: p.id, prior_period: prior.id, dubai: { ytd: await ytd(db, asOf), top8: areas.slice(0, 8), total_res_bn: bn(total), as_of: asOf } },
  };
}

/** /market/area/<area_en>: the same fields for one area, ranked against every area in the period. */
export async function marketArea(db: D1Database, areaEn: string, periodId: string | null): Promise<MarketResult> {
  const p = parsePeriod(periodId);
  if (!p) return { status: 400, body: { ok: false, error: 'invalid_period' } };
  if (!areaEn || areaEn.length > 120) return { status: 404, body: { ok: false, error: 'not_found' } };
  const asOf = await latestAsOf(db);
  if (!asOf || asOf < p.endDate) return { status: 404, body: { ok: false, error: 'period_not_available' } };
  const prior = priorPeriod(p);
  const { areas, total } = rankAreas(await areaSums(db, p), await areaSums(db, prior, areaEn));
  const area = areas.find((a) => a.area_en === areaEn);
  if (!area || total <= 0) return { status: 404, body: { ok: false, error: 'not_found' } };
  return { status: 200, body: { period: p.id, prior_period: prior.id, area, total_res_bn: bn(total), as_of: asOf } };
}

interface ProjectsPayload { new_projects_90d: number; top_areas_90d: { area_en: string; count: number }[]; active_projects: number; pipeline_units?: number; as_of: string }
interface AdrecPayload { transaction_value_aed: number; sales_value_aed: number; mortgage_value_aed: number; year: number }

async function latestStat<T>(db: D1Database, source: 'dld_projects' | 'adrec_ytd'): Promise<{ payload: T; as_of: string } | null> {
  const r = await db.prepare('SELECT payload_json, as_of FROM market_stats WHERE source = ?1 ORDER BY fetched_at DESC LIMIT 1').bind(source).first<{ payload_json: string; as_of: string }>();
  if (!r) return null;
  try { return { payload: JSON.parse(r.payload_json) as T, as_of: r.as_of }; } catch { return null; }
}

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

export async function marketLaunches(db: D1Database): Promise<MarketResult> {
  const [d, a] = await Promise.all([latestStat<ProjectsPayload>(db, 'dld_projects'), latestStat<AdrecPayload>(db, 'adrec_ytd')]);
  return { status: 200, body: { dubai: launchesDubai(d), abu_dhabi: launchesAbuDhabi(a) } };
}

/** Last successful DLD write and last successful ADREC read, as ISO instants; null if never. Nothing else. */
export async function marketStatus(db: D1Database): Promise<MarketResult> {
  const t = async (where: string) =>
    (await db.prepare(`SELECT MAX(finished_at) AS t FROM market_sync_runs WHERE ${where}`).first<{ t: string | null }>())?.t ?? null;
  return { status: 200, body: { dld_synced_at: await t('dld_written = 1'), adrec_synced_at: await t('adrec_ok = 1') } };
}

/** Routes /market/*. Returns null for any other path. GET (and OPTIONS) only; read-only, publicly cacheable for an hour. */
export async function handleMarket(req: Request, url: URL, db: D1Database, corsOrigin: string | undefined): Promise<Response | null> {
  if (!url.pathname.startsWith('/market/')) return null;
  const isStatus = url.pathname === '/market/status';
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cache-control': isStatus ? 'public, max-age=300' : 'public, max-age=3600', vary: 'origin' };
  if (corsOrigin) headers['access-control-allow-origin'] = corsOrigin;
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsOrigin ? { 'access-control-allow-origin': corsOrigin, 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400', vary: 'origin' } : {} });
  }
  if (req.method !== 'GET') return new Response(JSON.stringify({ ok: false }), { status: 405, headers: { ...headers, 'cache-control': 'no-store' } });
  let out: MarketResult;
  try {
    const period = url.searchParams.get('period');
    if (isStatus) out = await marketStatus(db);
    else if (url.pathname === '/market/launches') out = await marketLaunches(db);
    else if (url.pathname === '/market/areas') out = await marketAreas(db, period);
    else if (url.pathname.startsWith('/market/area/')) {
      let area = '';
      try { area = decodeURIComponent(url.pathname.slice('/market/area/'.length)); } catch { area = ''; }
      out = await marketArea(db, area, period);
    } else out = { status: 404, body: { ok: false } };
  } catch (e) {
    // Tables not migrated yet, or D1 unavailable: nothing to show. Never a stack trace.
    console.error('market: read failed', e instanceof Error ? e.message : 'unknown');
    out = url.pathname === '/market/launches' ? { status: 200, body: { dubai: null, abu_dhabi: null } }
      : isStatus ? { status: 200, body: { dld_synced_at: null, adrec_synced_at: null } }
      : { status: 404, body: { ok: false, error: 'unavailable' } };
  }
  return new Response(JSON.stringify(out.body), { status: out.status, headers: out.status === 200 || isStatus ? headers : { ...headers, 'cache-control': 'public, max-age=300' } });
}
