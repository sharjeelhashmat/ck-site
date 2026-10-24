// No em dash (U+2014) anywhere in the site or Worker copy, code or docs (owner decision 2026-10-24, permanent rule).
// One scanner, run by the site's npm test (tests/no-em-dash.test.mjs) and the Worker's vitest (test/no-em-dash.test.ts).
//
// site/src/lib/legal.ts (Privacy and Terms) is waiting for the lawyer's review and is not edited until then. The
// lawyer-approved Privacy PR flips this ONE constant to false, and from then on legal.ts is checked like every file.
export const LEGAL_EMDASH_ALLOWED = true;

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const EM_DASH = '\u2014';
// What is scanned, relative to the repository root. site/public is scanned for text files only (images are skipped).
export const SCANNED = ['site/src', 'site/public', 'site/docs', 'worker/src', 'worker/templates', 'worker/scripts'];
const TEXT = /\.(astro|ts|mts|mjs|js|json|css|md|txt|html|svg|xml|toml|jsonc)$|(^|[/\\])_(headers|redirects)$/;
export const LEGAL = 'site/src/lib/legal.ts';

function files(dir) {
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    out = e.isDirectory() ? out.concat(files(p)) : out.concat(p);
  }
  return out;
}

/** Every line with an em dash, as "path:line: text". legal.ts is skipped while LEGAL_EMDASH_ALLOWED is true. */
export function findEmDashes(root = REPO, allowLegal = LEGAL_EMDASH_ALLOWED) {
  const hits = [];
  for (const d of SCANNED) {
    const abs = join(root, d);
    try { statSync(abs); } catch { continue; }
    for (const f of files(abs)) {
      const rel = relative(root, f).split(sep).join('/');
      if (!TEXT.test(rel)) continue;
      if (allowLegal && rel === LEGAL) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (line.includes(EM_DASH)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`); });
    }
  }
  return hits;
}
