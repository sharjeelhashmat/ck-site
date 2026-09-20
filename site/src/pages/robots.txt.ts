import type { APIRoute } from 'astro';
import { SITE } from '../lib/site';

// Non-production builds disallow everything. Only a production-indexable build (which requires a BRN) opens the site.
export const GET: APIRoute = () => {
  const body = SITE.indexable
    ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE.origin}/sitemap-index.xml\n`
    : `User-agent: *\nDisallow: /\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
