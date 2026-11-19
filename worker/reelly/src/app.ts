// The private Reelly research tool (owner 2026-11-19): a small Worker of its own (ck-reelly-tool), on its own hostname
// behind Cloudflare Access, apart from ck-lead-worker and the public site. Every request, page or API, must carry a valid
// Access token (access.ts). Then:
//   /launches                 the search page (filters: emirate, district, developer, sale status, construction status,
//                             handover years, starting price), cards linking to
//   /launches/<id>            the project page: payment plans, unit types and price ranges, units, documents, WhatsApp
//   /api/<Reelly path>        the read-only JSON proxy, allowlisted endpoints only (reelly.ts)
//   /assets/*                 the site's stylesheet and fonts
// ?demo=1 shows the built-in sample (labelled "Demo data") instead of Reelly. Without REELLY_API_KEY the pages say
// "not configured" (with a link to the demo) and the proxy answers 503; without the Access variables everything answers 503.
import { accessConfigured, verifyAccess, type AccessEnv } from './access';
import { client, defaultCache, localisePaging, resolve, UpstreamError, type CacheLike } from './reelly';
import { listingPage, messagePage, pairs, projectPage, readFilters, reellyQuery, views } from './pages';
import { normaliseProject, summariseUnits, waHrefFor } from '../../../site/src/lib/launch-cards.mjs';
import { DEMO_PROJECTS, DEMO_UNITS } from '../../../site/src/lib/reelly-demo.mjs';
import { OWNER_WHATSAPP } from './config';

export interface Env extends AccessEnv { REELLY_API_KEY?: string }
export interface Assets { css: string; fonts: Record<string, ArrayBuffer> }
export interface Deps { fetch: typeof fetch; assets: Assets; cache?: CacheLike; now?: () => number; sleep?: (ms: number) => Promise<void> }

/** Response headers on everything this Worker sends: private, never indexed, no script, no framing, no referrer. */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' https: data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};
const send = (body: BodyInit | null, status: number, type: string, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { ...SECURITY_HEADERS, 'Content-Type': type, ...extra } });
const html = (body: string, status = 200) => send(body, status, 'text/html; charset=utf-8');
const json = (body: unknown, status = 200) => send(JSON.stringify(body), status, 'application/json; charset=utf-8');

const isDemo = (u: URL) => u.searchParams.get('demo') === '1';

export function createApp(deps: Deps) {
  const cache = deps.cache ?? defaultCache(deps.now);

  async function listing(u: URL, env: Env): Promise<Response> {
    const f = readFilters(u);
    if (isDemo(u)) {
      const min = Number(f.price_from || 0);
      const max = Number(f.price_to || Infinity);
      const items = DEMO_PROJECTS.filter((p) => (!f.region || p.location.region === f.region) && (!f.sale_status || p.sale_status === f.sale_status)
        && (!f.status || p.construction_status === f.status) && p.min_price >= min && p.min_price <= max);
      return html(listingPage({ views: views(items, true), count: items.length, filters: f, demo: true, regions: ['Abu Dhabi', 'Dubai'], districts: [], developers: [] }));
    }
    if (!env.REELLY_API_KEY) return html(notConfigured(), 503);
    const c = client({ fetch: deps.fetch, key: env.REELLY_API_KEY, cache, sleep: deps.sleep });
    try {
      const [page, regions, districts, developers] = await Promise.all([
        c.get('/projects', reellyQuery(f)) as Promise<{ count?: number; results?: unknown[] }>,
        c.getAll('/regions'), c.getAll('/districts'), c.getAll('/developers'),
      ]);
      const results = Array.isArray(page?.results) ? page.results : [];
      return html(listingPage({
        views: views(results, false), count: typeof page?.count === 'number' ? page.count : results.length, filters: f, demo: false,
        regions: regions.map((r) => String((r as { name?: unknown })?.name ?? '')).filter(Boolean).sort(),
        districts: pairs(districts), developers: pairs(developers),
      }));
    } catch (e) {
      return html(listingPage({ views: [], count: 0, filters: f, demo: false, error: upstreamMessage(e), regions: [], districts: [], developers: [] }), statusOf(e));
    }
  }

  async function project(id: number, u: URL, env: Env): Promise<Response> {
    if (isDemo(u)) {
      const p = DEMO_PROJECTS.find((x) => x.id === id);
      if (!p) return html(messagePage('Not found', 'There is no demo project with that number.'), 404);
      const v = normaliseProject(p, { demo: true });
      return html(projectPage(v, summariseUnits(DEMO_UNITS[id] ?? []), waHrefFor(OWNER_WHATSAPP, v.name), true));
    }
    if (!env.REELLY_API_KEY) return html(notConfigured(), 503);
    const c = client({ fetch: deps.fetch, key: env.REELLY_API_KEY, cache, sleep: deps.sleep });
    try {
      const q = new URLSearchParams({ preferred_currency: 'AED' });
      const [p, units] = await Promise.all([c.get(`/projects/${id}`, q), c.getAll(`/projects/${id}/units`, new URLSearchParams({ limit: '100', preferred_currency: 'AED' }))]);
      const v = normaliseProject(p);
      return html(projectPage(v, summariseUnits(units), waHrefFor(OWNER_WHATSAPP, v.name), false));
    } catch (e) {
      return html(messagePage('Could not load the project', upstreamMessage(e)), statusOf(e));
    }
  }

  async function api(path: string, u: URL, env: Env): Promise<Response> {
    if (!env.REELLY_API_KEY) return json({ error: 'not_configured', message: 'REELLY_API_KEY is not set on this Worker.' }, 503);
    const r = resolve(path, u.searchParams);
    if (!r) return json({ error: 'not_allowed', message: 'Not an allowed Reelly endpoint.' }, 404);
    const c = client({ fetch: deps.fetch, key: env.REELLY_API_KEY, cache, sleep: deps.sleep });
    try {
      return json(r.kind === 'dict' ? await c.getAll(path, u.searchParams) : localisePaging(await c.get(path, u.searchParams)));
    } catch (e) {
      return json({ error: statusOf(e) === 429 ? 'rate_limited' : 'upstream', message: upstreamMessage(e) }, statusOf(e));
    }
  }

  return {
    async fetch(req: Request, env: Env): Promise<Response> {
      const u = new URL(req.url);
      if (req.method !== 'GET') return send('Only GET is allowed.', 405, 'text/plain; charset=utf-8', { Allow: 'GET' });
      if (!accessConfigured(env)) {
        return u.pathname.startsWith('/api/')
          ? json({ error: 'not_configured', message: 'Cloudflare Access is not configured for this tool.' }, 503)
          : html(messagePage('Not configured', 'Cloudflare Access is not set up for this tool yet, so it serves nothing.'), 503);
      }
      const access = await verifyAccess(req, env, { fetch: deps.fetch, now: deps.now });
      if (!access.ok) return u.pathname.startsWith('/api/') ? json({ error: 'forbidden' }, 403) : html(messagePage('Access denied', 'This tool is private.'), 403);

      if (u.pathname === '/assets/app.css') return send(deps.assets.css, 200, 'text/css; charset=utf-8', { 'Cache-Control': 'private, max-age=3600' });
      const font = u.pathname.match(/^\/assets\/fonts\/([a-z0-9-]+\.woff2)$/);
      if (font) {
        const f = deps.assets.fonts[font[1] as string];
        return f ? send(f, 200, 'font/woff2', { 'Cache-Control': 'private, max-age=86400' }) : send('Not found', 404, 'text/plain; charset=utf-8');
      }
      if (u.pathname === '/' ) return send(null, 302, 'text/plain; charset=utf-8', { Location: '/launches' });
      if (u.pathname === '/launches') return listing(u, env);
      const p = u.pathname.match(/^\/launches\/(\d{1,9})$/);
      if (p) return project(Number(p[1]), u, env);
      if (u.pathname === '/api/status') return json({ access: true, reelly: Boolean(env.REELLY_API_KEY) });
      if (u.pathname.startsWith('/api/')) return api(u.pathname.slice(4), u, env);
      return html(messagePage('Not found', 'There is nothing at this address.'), 404);
    },
  };
}

function notConfigured(): string {
  return messagePage('Not configured', 'The Reelly API key (the Worker secret REELLY_API_KEY) is not set, so no Reelly data can be loaded.',
    '<div class="actions"><a class="btn btn--ghost" href="/launches?demo=1">See the layout with demo data</a></div>');
}
const statusOf = (e: unknown) => (e instanceof UpstreamError ? e.status : 502);
const upstreamMessage = (e: unknown) => (e instanceof UpstreamError ? e.message : 'Reelly could not be reached.');
