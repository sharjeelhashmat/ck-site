import type { APIRoute } from 'astro';
import { SITE } from '../lib/site';

// Only a production-indexable build (which requires the go-live values) advertises the sitemap. Every other build allows
// crawling so that crawlers can read the noindex (meta robots on every page, X-Robots-Tag on every path from postbuild)
// and has no sitemap at all (audit item 22).
export const GET: APIRoute = () => {
  const body = SITE.indexable
    ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE.origin}/sitemap-index.xml\n`
    : `User-agent: *\nAllow: /\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
