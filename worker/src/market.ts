// Read-only market endpoints (Part A). The data is written once a week by the market-data-sync workflow
// (worker/scripts/market-sync); this file only reads from D1. No raw rows, no project or developer names.
//   GET /market/launches                     Dubai project activity (DLD) and Abu Dhabi year to date (ADREC)
//   GET /market/areas?period=2026-H1         Dubai year to date + top 8 areas by residential sales value
//   GET /market/area/<area_en>?period=...    the same figures for one DLD area (area guide pages)
//   GET /market/status                       last successful DLD and ADREC sync (the workflow's weekly gate reads it)
// Quota protection (Workers Free: D1 reads are capped per day): the sync precomputes every response body into
// market_cache in the same atomic import, so a request reads one row; live computation runs only when that row is
// missing. On top, a per-isolate memo answers repeated 200s for 10 minutes without touching D1.
import {
  areaBodies, areasBody, cacheKey, launchesAbuDhabi, launchesDubai, parsePeriod, priorPeriod,
  type AdrecPayload, type AreaSums, type MarketResult, type Period, type ProjectsPayload, type TotalsRow,
} from './market-core';
import { safeError } from './log';

export * from './market-core';

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

/** Live /market/areas: 400 on a malformed period, 404 when the period is not complete in the data (or no data). */
async function liveAreas(db: D1Database, p: Period): Promise<MarketResult> {
  const asOf = await latestAsOf(db);
  if (!asOf || asOf < p.endDate) return { status: 404, body: { ok: false, error: 'period_not_available' } };
  const totals = (await db.prepare('SELECT month, trans_group, value FROM dld_month_totals WHERE month >= ?1 AND month <= ?2')
    .bind(`${asOf.slice(0, 4)}-01`, asOf.slice(0, 7)).all<TotalsRow>()).results ?? [];
  const body = areasBody(p, await areaSums(db, p), await areaSums(db, priorPeriod(p)), totals.map((r) => ({ ...r, value: Number(r.value) })), asOf);
  return body ? { status: 200, body } : { status: 404, body: { ok: false, error: 'period_not_available' } };
}

/** Live /market/area/<area_en>: the same fields for one area, ranked against every area in the period. */
async function liveArea(db: D1Database, areaEn: string, p: Period): Promise<MarketResult> {
  const asOf = await latestAsOf(db);
  if (!asOf || asOf < p.endDate) return { status: 404, body: { ok: false, error: 'period_not_available' } };
  const body = areaBodies(p, await areaSums(db, p), await areaSums(db, priorPeriod(p), areaEn), asOf).get(areaEn);
  return body ? { status: 200, body } : { status: 404, body: { ok: false, error: 'not_found' } };
}

// ---- market_cache (migration 0005) ------------------------------------------------------------------------------------

/** The cached body for a key, or null when the row (or, before migration 0005, the table) is missing. */
async function cached(db: D1Database, key: string): Promise<string | null> {
  try {
    const r = await db.prepare('SELECT body FROM market_cache WHERE key = ?1').bind(key).first<{ body: string }>();
    return r?.body ?? null;
  } catch {
    return null;
  }
}

type Served = { status: number; body: unknown } | { status: 200; text: string };

export async function marketAreas(db: D1Database, periodId: string | null): Promise<Served> {
  const p = parsePeriod(periodId);
  if (!p) return { status: 400, body: { ok: false, error: 'invalid_period' } };
  const hit = await cached(db, cacheKey.areas(p.id));
  return hit !== null ? { status: 200, text: hit } : liveAreas(db, p);
}

export async function marketArea(db: D1Database, areaEn: string, periodId: string | null): Promise<Served> {
  const p = parsePeriod(periodId);
  if (!p) return { status: 400, body: { ok: false, error: 'invalid_period' } };
  if (!areaEn || areaEn.length > 120) return { status: 404, body: { ok: false, error: 'not_found' } };
  const hit = await cached(db, cacheKey.area(p.id, areaEn));
  if (hit !== null) return { status: 200, text: hit };
  // The sync caches every area with sales in every complete period: when the period is cached and the area is not,
  // the area has no sales there. Only an uncached period (before the first sync after migration 0005) goes live.
  if ((await cached(db, cacheKey.areas(p.id))) !== null) return { status: 404, body: { ok: false, error: 'not_found' } };
  return liveArea(db, areaEn, p);
}

async function latestStat<T>(db: D1Database, source: 'dld_projects' | 'adrec_ytd'): Promise<{ payload: T; as_of: string } | null> {
  const r = await db.prepare('SELECT payload_json, as_of FROM market_stats WHERE source = ?1 ORDER BY fetched_at DESC LIMIT 1').bind(source).first<{ payload_json: string; as_of: string }>();
  if (!r) return null;
  try { return { payload: JSON.parse(r.payload_json) as T, as_of: r.as_of }; } catch { return null; }
}


export async function marketLaunches(db: D1Database): Promise<Served> {
  const hit = await cached(db, cacheKey.launches);
  if (hit !== null) return { status: 200, text: hit };
  const [d, a] = await Promise.all([latestStat<ProjectsPayload>(db, 'dld_projects'), latestStat<AdrecPayload>(db, 'adrec_ytd')]);
  return { status: 200, body: { dubai: launchesDubai(d), abu_dhabi: launchesAbuDhabi(a) } };
}

/** Last successful DLD write and last successful ADREC read, as ISO instants; null if never. Nothing else. */
export async function marketStatus(db: D1Database): Promise<MarketResult> {
  const t = async (where: string) =>
    (await db.prepare(`SELECT MAX(finished_at) AS t FROM market_sync_runs WHERE ${where}`).first<{ t: string | null }>())?.t ?? null;
  return { status: 200, body: { dld_synced_at: await t('dld_written = 1'), adrec_synced_at: await t('adrec_ok = 1') } };
}

// ---- Per-isolate memo ------------------------------------------------------------------------------------------------
// 200 responses only, 10 minutes, at most 500 keys (oldest evicted first). Keys are built from validated input only.
const MEMO_TTL_MS = 10 * 60 * 1000;
const MEMO_MAX = 500;
const memo = new Map<string, { text: string; until: number }>();

function memoGet(key: string, now: number): string | null {
  const m = memo.get(key);
  if (!m) return null;
  if (m.until > now) return m.text;
  memo.delete(key);
  return null;
}

function memoSet(key: string, text: string, now: number) {
  memo.delete(key);
  while (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
  memo.set(key, { text, until: now + MEMO_TTL_MS });
}

/** Tests only: start from an empty memo. */
export function clearMarketMemo() {
  memo.clear();
}

/** The memo key for a request, or null when the input does not validate (those requests are never memoised). */
function memoKey(pathname: string, period: string | null, area: string | null): string | null {
  if (pathname === '/market/launches') return cacheKey.launches;
  const p = parsePeriod(period);
  if (!p) return null;
  if (pathname === '/market/areas') return cacheKey.areas(p.id);
  if (area !== null && area !== '' && area.length <= 120) return cacheKey.area(p.id, area);
  return null;
}

/** Routes /market/*. Returns null for any other path. GET (and OPTIONS) only; read-only, publicly cacheable for an hour. */
export async function handleMarket(req: Request, url: URL, db: D1Database, corsOrigin: string | undefined): Promise<Response | null> {
  if (!url.pathname.startsWith('/market/')) return null;
  const isStatus = url.pathname === '/market/status';
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-content-type-options': 'nosniff', 'cache-control': isStatus ? 'public, max-age=300' : 'public, max-age=3600', vary: 'origin' };
  if (corsOrigin) headers['access-control-allow-origin'] = corsOrigin;
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsOrigin ? { 'access-control-allow-origin': corsOrigin, 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400', vary: 'origin' } : {} });
  }
  if (req.method !== 'GET') return new Response(JSON.stringify({ ok: false }), { status: 405, headers: { ...headers, 'cache-control': 'no-store' } });
  const period = url.searchParams.get('period');
  let area: string | null = null;
  if (url.pathname.startsWith('/market/area/')) {
    try { area = decodeURIComponent(url.pathname.slice('/market/area/'.length)); } catch { area = ''; }
  }
  const key = isStatus ? null : memoKey(url.pathname, period, area);
  const now = Date.now();
  const hit = key === null ? null : memoGet(key, now);
  if (hit !== null) return new Response(hit, { status: 200, headers });
  let out: Served;
  try {
    if (isStatus) out = await marketStatus(db);
    else if (url.pathname === '/market/launches') out = await marketLaunches(db);
    else if (url.pathname === '/market/areas') out = await marketAreas(db, period);
    else if (area !== null) out = await marketArea(db, area, period);
    else out = { status: 404, body: { ok: false } };
  } catch (e) {
    // Tables not migrated yet, or D1 unavailable (including the Free plan's daily read limit): nothing to show, and
    // nothing any cache may keep. Never a stack trace.
    console.error('market: read failed', safeError(e));
    const body = url.pathname === '/market/launches' ? { dubai: null, abu_dhabi: null }
      : isStatus ? { dld_synced_at: null, adrec_synced_at: null }
      : { ok: false, error: 'unavailable' };
    return new Response(JSON.stringify(body), { status: url.pathname === '/market/launches' || isStatus ? 200 : 404, headers: { ...headers, 'cache-control': 'no-store' } });
  }
  const text = 'text' in out ? out.text : JSON.stringify(out.body);
  if (out.status === 200 && key !== null) memoSet(key, text, now);
  return new Response(text, { status: out.status, headers: out.status === 200 || isStatus ? headers : { ...headers, 'cache-control': 'public, max-age=300' } });
}
