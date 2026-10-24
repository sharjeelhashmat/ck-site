// Writes dist/_headers with a CSP whose script hashes are computed from the built HTML, so no 'unsafe-inline' for scripts.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Optional argument: another build directory (tests build into a temp dir).
const dist = process.argv[2] ?? fileURLToPath(new URL('../dist/', import.meta.url));
const hashes = new Set();
// Origins the pages actually call (every data-worker attribute in the built HTML): the CSP connect-src is built from
// them, so it can never drift from the URL the build used (audit item 18).
const workerOrigins = new Set();
let analytics = false;
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
for (const f of walk(dist).filter((p) => p.endsWith('.html'))) {
  const html = readFileSync(f, 'utf8');
  if (html.includes('https://static.cloudflareinsights.com/beacon.min.js')) analytics = true;
  for (const m of html.matchAll(/\bdata-worker="([^"]*)"/g)) {
    let u;
    try { u = new URL(m[1].replace(/&amp;/g, '&')); } catch { throw new Error(`postbuild: unparseable data-worker URL in ${f}`); }
    if (u.protocol !== 'https:') throw new Error(`postbuild: data-worker must be https in ${f}: ${u.origin}`);
    workerOrigins.add(u.origin);
  }
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type="application\/ld\+json"/.test(m[1])) continue; // data block, not executable
    hashes.add(`'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`);
  }
}
if (!workerOrigins.size) throw new Error('postbuild: no data-worker attribute found in the built pages');
// A non-indexable build (robots.txt has no Sitemap line) is noindex on every path through a header too, so crawlers that
// are allowed in (robots Allow: /) still see noindex; an indexable build is unchanged (audit item 22).
const indexable = (() => { try { return /^Sitemap: /m.test(readFileSync(join(dist, 'robots.txt'), 'utf8')); } catch { return false; } })();
// Cloudflare Web Analytics origins are allowed only when the beacon is actually in the built pages.
const cfScript = analytics ? ' https://static.cloudflareinsights.com' : '';
const cfConnect = analytics ? ' https://cloudflareinsights.com' : '';
const csp = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].join(' ')} https://challenges.cloudflare.com${cfScript}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${[...workerOrigins].sort().join(' ')} https://challenges.cloudflare.com${cfConnect}`,
  'frame-src https://challenges.cloudflare.com',
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
${indexable ? '' : '  X-Robots-Tag: noindex\n'}/_astro/*
  Cache-Control: public, max-age=31536000, immutable
`;
// site/public/_headers holds static rules (e.g. text/plain charset). Astro copies it into dist, so read it from the source
// tree, not from dist, so that running this script twice never duplicates it.
const staticRules = (() => {
  try { return readFileSync(fileURLToPath(new URL('../public/_headers', import.meta.url)), 'utf8').trimEnd() + '\n'; } catch { return ''; }
})();
writeFileSync(join(dist, '_headers'), staticRules + headers);
console.log(`postbuild: wrote _headers with ${hashes.size} inline-script hash(es), connect-src ${[...workerOrigins].join(' ')}${analytics ? ', analytics allowed' : ''}${indexable ? '' : ', X-Robots-Tag noindex'}`);
