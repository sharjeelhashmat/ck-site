// The Reelly API client behind the private research tool (owner 2026-11-19). Server side only: the key comes from the
// Worker secret REELLY_API_KEY and goes into one request header, X-API-Key, never into a URL, a log line or a response.
// Only GET, only an explicit allowlist of read endpoints (docs.reelly.ai, Clients API v2), only the query parameters each
// endpoint documents. Dictionaries are cached 24 hours, project and unit data 1 hour. A 429 is retried with backoff,
// then reported as a clear message. List pages follow "next" until it is null, and only while "next" stays on Reelly's API.

export const BASE = 'https://api-reelly.up.railway.app/api/v2/clients';
export const DICT_TTL = 24 * 60 * 60;
export const DATA_TTL = 60 * 60;
const MAX_PAGES = 50;
const MAX_ATTEMPTS = 3;

const PROJECT_FILTERS = [
  'limit', 'offset', 'ordering', 'search_query', 'country', 'region', 'districts', 'developer', 'sale_status', 'status',
  'completion_date_ranges', 'completion_quarters', 'unit_price_from', 'unit_price_to', 'price_type', 'unit_types',
  'unit_bedrooms', 'unit_area_from', 'unit_area_to', 'post_handover', 'has_escrow', 'preferred_currency', 'preferred_area_unit',
];
const DETAIL = ['preferred_currency', 'preferred_area_unit'];
const UNITS = ['limit', 'offset', 'ordering', 'bedrooms', 'min_price', 'max_price', 'min_size', 'max_size', 'preferred_currency', 'preferred_area_unit'];
const PAGED = ['limit', 'offset'];

interface Route { re: RegExp; kind: 'dict' | 'data'; params: readonly string[] }
/** The allowlist: local path (after /api) to the same Reelly path. Anything else is refused. */
export const ROUTES: readonly Route[] = [
  { re: /^\/projects$/, kind: 'data', params: PROJECT_FILTERS },
  { re: /^\/projects\/markers$/, kind: 'data', params: PROJECT_FILTERS },
  { re: /^\/projects\/sale-statuses$/, kind: 'dict', params: [] },
  { re: /^\/projects\/statuses$/, kind: 'dict', params: [] },
  { re: /^\/projects\/slug\/[a-z0-9][a-z0-9-]{0,120}$/, kind: 'data', params: DETAIL },
  { re: /^\/projects\/\d{1,9}$/, kind: 'data', params: DETAIL },
  { re: /^\/projects\/\d{1,9}\/units$/, kind: 'data', params: UNITS },
  { re: /^\/developers$/, kind: 'dict', params: PAGED },
  { re: /^\/developers\/\d{1,9}$/, kind: 'data', params: [] },
  { re: /^\/districts$/, kind: 'dict', params: PAGED },
  { re: /^\/regions$/, kind: 'dict', params: PAGED },
  { re: /^\/units\/types$/, kind: 'dict', params: [] },
];

/** The upstream URL for an allowlisted path, with only its documented parameters (sorted, so the cache key is stable). */
export function resolve(path: string, query: URLSearchParams): { url: string; kind: 'dict' | 'data'; ttl: number } | null {
  const route = ROUTES.find((r) => r.re.test(path));
  if (!route) return null;
  const q = new URLSearchParams();
  for (const name of [...route.params].sort()) {
    const v = query.get(name);
    if (v !== null && v !== '' && v.length <= 300 && /^[\w .,:@-]*$/.test(v)) q.set(name, v);
  }
  const qs = q.toString();
  return { url: `${BASE}${path}${qs ? `?${qs}` : ''}`, kind: route.kind, ttl: route.kind === 'dict' ? DICT_TTL : DATA_TTL };
}

export class UpstreamError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export interface CacheLike { get(key: string): Promise<string | null>; put(key: string, body: string, ttlSeconds: number): Promise<void> }

/** A per-isolate memory cache, in front of the Cache API where the Worker has one (on a custom domain; workers.dev
 * keeps only the memory layer). Keys are the upstream URLs, which never contain the key. */
export function defaultCache(now: () => number = Date.now): CacheLike {
  const mem = new Map<string, { body: string; exp: number }>();
  const edge = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const req = (key: string) => new Request(`https://reelly-cache.invalid/${encodeURIComponent(key)}`);
  return {
    async get(key) {
      const m = mem.get(key);
      if (m && m.exp > now()) return m.body;
      if (edge) {
        const r = await edge.match(req(key)).catch(() => undefined);
        if (r) return r.text();
      }
      return null;
    },
    async put(key, body, ttl) {
      mem.set(key, { body, exp: now() + ttl * 1000 });
      if (mem.size > 500) mem.delete(mem.keys().next().value as string);
      if (edge) await edge.put(req(key), new Response(body, { headers: { 'cache-control': `max-age=${ttl}` } })).catch(() => undefined);
    },
  };
}

export interface ClientDeps { fetch: typeof fetch; key: string; cache: CacheLike; sleep?: (ms: number) => Promise<void> }

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The Reelly client: one request with the key header, cache first, 429 retried with backoff. */
export function client(d: ClientDeps) {
  const sleep = d.sleep ?? pause;
  async function getUrl(url: string, ttl: number): Promise<unknown> {
    if (!url.startsWith(`${BASE}/`)) throw new UpstreamError(502, 'refused a URL outside the Reelly API');
    const hit = await d.cache.get(url);
    if (hit !== null) return JSON.parse(hit);
    for (let attempt = 1; ; attempt++) {
      // A fresh header set: nothing from the visitor's request is ever forwarded.
      const res = await d.fetch(url, { method: 'GET', headers: { 'X-API-Key': d.key, Accept: 'application/json' }, redirect: 'manual' });
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const after = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 5) * 1000 : 500 * 2 ** (attempt - 1));
        continue;
      }
      if (res.status === 429) throw new UpstreamError(429, 'Reelly is limiting requests right now. Try again in a minute.');
      if (res.status === 401 || res.status === 403) throw new UpstreamError(502, 'Reelly refused the API key (missing, invalid or expired).');
      if (res.status === 404) throw new UpstreamError(404, 'Not found on Reelly.');
      if (!res.ok) throw new UpstreamError(502, `Reelly answered ${res.status}.`);
      const body = await res.text();
      JSON.parse(body); // never cache or pass on anything that is not JSON
      await d.cache.put(url, body, ttl);
      return JSON.parse(body);
    }
  }
  /** One page (or one object). */
  const get = (path: string, query = new URLSearchParams()) => {
    const r = resolve(path, query);
    if (!r) throw new UpstreamError(404, 'Not an allowed Reelly endpoint.');
    return getUrl(r.url, r.ttl);
  };
  /** Every item of a list: a plain array as is, or a paginated envelope followed through "next" until it is null. */
  async function getAll(path: string, query = new URLSearchParams()): Promise<unknown[]> {
    const r = resolve(path, query);
    if (!r) throw new UpstreamError(404, 'Not an allowed Reelly endpoint.');
    const first = await getUrl(r.url, r.ttl);
    if (Array.isArray(first)) return first;
    const out: unknown[] = [];
    let page = first as { results?: unknown[]; next?: string | null };
    for (let n = 1; ; n++) {
      out.push(...(Array.isArray(page?.results) ? page.results : []));
      const next = page?.next;
      if (typeof next !== 'string' || !next || n >= MAX_PAGES) break;
      page = (await getUrl(next, r.ttl)) as typeof page;
    }
    return out;
  }
  return { get, getAll };
}

/** A list page for the browser: Reelly's "next" and "previous" URLs rewritten to this tool's /api paths. */
export function localisePaging(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const b = { ...(body as Record<string, unknown>) };
  for (const k of ['next', 'previous']) if (typeof b[k] === 'string' && (b[k] as string).startsWith(`${BASE}/`)) b[k] = `/api${(b[k] as string).slice(BASE.length)}`;
  return b;
}
