// Serves a built site locally the way the Cloudflare Worker does, for the accessibility and Lighthouse checks
// (PR 2b item 5): "/about" -> about.html, the 404 page, the headers from dist/_headers, and brotli or gzip compression.
//   node serve.mjs <distDir> [port]          prints "listening on http://127.0.0.1:<port>"
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
};
const COMPRESS = /^(text\/|application\/(json|xml)|image\/svg)/;

// dist/_headers: "path pattern" lines followed by indented "Name: value" lines. Patterns are "/*" or "/prefix/*" or exact.
function readHeaders(dist) {
  const rules = [];
  let cur = null;
  let text = '';
  try { text = fs.readFileSync(path.join(dist, '_headers'), 'utf8'); } catch { return rules; }
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), headers: [] }; rules.push(cur); continue; }
    const i = line.indexOf(':');
    if (cur && i > 0) cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return rules;
}
const matches = (pattern, p) => (pattern.endsWith('*') ? p.startsWith(pattern.slice(0, -1)) : p === pattern);

export function start(dist, port = 0) {
  const root = path.resolve(dist);
  const rules = readHeaders(root);
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(root, p === '/' ? 'index.html' : p);
    if (!f.startsWith(root)) { res.writeHead(400); res.end(); return; }
    let status = 200;
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = fs.existsSync(`${f}.html`) ? `${f}.html` : path.join(f, 'index.html');
    if (!fs.existsSync(f)) { f = path.join(root, '404.html'); status = 404; }
    const type = TYPES[path.extname(f)] ?? 'application/octet-stream';
    const headers = { 'content-type': type };
    for (const r of rules) if (matches(r.pattern, p)) for (const [k, v] of r.headers) headers[k.toLowerCase()] = v;
    let body = fs.readFileSync(f);
    const accept = String(req.headers['accept-encoding'] ?? '');
    if (COMPRESS.test(type)) {
      if (/\bbr\b/.test(accept)) { body = zlib.brotliCompressSync(body); headers['content-encoding'] = 'br'; }
      else if (/\bgzip\b/.test(accept)) { body = zlib.gzipSync(body); headers['content-encoding'] = 'gzip'; }
      headers.vary = 'accept-encoding';
    }
    headers['content-length'] = body.length;
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = await start(process.argv[2] ?? '../dist', Number(process.argv[3] ?? 0));
  console.log(`listening on http://127.0.0.1:${server.address().port}`);
}
