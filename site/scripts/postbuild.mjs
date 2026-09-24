// Writes dist/_headers with a CSP whose script hashes are computed from the built HTML, so no 'unsafe-inline' for scripts.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// Optional argument: another build directory (tests build into a temp dir).
const dist = process.argv[2] ?? new URL('../dist/', import.meta.url).pathname;
const hashes = new Set();
let analytics = false;
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
for (const f of walk(dist).filter((p) => p.endsWith('.html'))) {
  const html = readFileSync(f, 'utf8');
  if (html.includes('https://static.cloudflareinsights.com/beacon.min.js')) analytics = true;
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type="application\/ld\+json"/.test(m[1])) continue; // data block, not executable
    hashes.add(`'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`);
  }
}
const worker = process.env.PUBLIC_WORKER_URL ?? 'https://ck-lead-worker.sharjeelhashmat.workers.dev';
// Cloudflare Web Analytics origins are allowed only when the beacon is actually in the built pages.
const cfScript = analytics ? ' https://static.cloudflareinsights.com' : '';
const cfConnect = analytics ? ' https://cloudflareinsights.com' : '';
const csp = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].join(' ')} https://challenges.cloudflare.com${cfScript}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${worker} https://challenges.cloudflare.com${cfConnect}`,
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
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/*.html
  Cache-Control: public, max-age=0, must-revalidate
`;
writeFileSync(join(dist, '_headers'), headers);
console.log(`postbuild: wrote _headers with ${hashes.size} inline-script hash(es)${analytics ? ', analytics allowed' : ''}`);
