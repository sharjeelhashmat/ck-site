// Market-data snapshot for .github/workflows/market-data-sync.yml, job "snapshot" (owner EXECUTE 2026-11-19).
// The Content task's sandbox cannot reach the Worker but can read raw.githubusercontent.com, so after a successful D1
// sync this copies the Worker's public read-only /market answers, unchanged, into the orphan branch market-data:
//   data/market/status.json      GET /market/status
//   data/market/areas-ytd.json   GET /market/areas?period=ytd   (Dubai year to date totals in dubai.ytd, top 8 areas)
//   data/market/launches.json    GET /market/launches            (Dubai projects, Abu Dhabi year to date)
//   data/market/manifest.json    schema, fetched_at, the Worker, the as_of dates, each file's endpoint and sha256
//   README.md
// Every answer is checked against its exact shape and scanned for anything that looks like a credential before a single
// file is written; one bad answer writes nothing and fails the step. When the three data files and the README are byte
// for byte what the branch already holds, nothing is written (so fetched_at alone never makes a commit).
// Plain Node, no secrets, no install (the job may not run npm, curl or wrangler):
//   node scripts/market-sync/snapshot.ts --out <market-data checkout> [--wait-seconds N]
// --wait-seconds: the Worker keeps a per-isolate memo of /market answers for 10 minutes, so the job waits that out
// after the sync before it reads (the workflow passes 660).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseStatus } from './gate.ts';

/** The production Worker. A fixed constant: never taken from an input. */
export const WORKER = 'https://ck-lead-worker.sharjeelhashmat.workers.dev';
export const REPO_RAW = 'https://raw.githubusercontent.com/sharjeelhashmat/ck-site/market-data';
export const SCHEMA = 1;
export const MAX_BYTES = 256 * 1024;
export const MEMO_WAIT_SECONDS = 660;

type Check = (body: unknown, now: Date) => string[];
export interface Endpoint { file: string; path: string; check: Check }

// ---- Shape checks: exact keys, exact types. Anything else is refused. -----------------------------------------------

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PERIOD_RE = /^\d{4}-(H1|H2|Q1|Q2|Q3|Q4|YTD(0[1-9]|1[0-2]))$/;
const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const nonNeg = (x: unknown) => num(x) && (x as number) >= 0;
const pos = (x: unknown) => num(x) && (x as number) > 0;
const int = (x: unknown, min: number) => typeof x === 'number' && Number.isInteger(x) && x >= min;
const text = (x: unknown, max = 200) => typeof x === 'string' && x.length > 0 && x.length <= max && !/[\u0000-\u001f\u007f<>]/.test(x);
const date = (x: unknown) => typeof x === 'string' && DATE_RE.test(x);
const https = (x: unknown) => text(x, 300) && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[\w./%-]*)?$/i.test(x as string);

function keys(o: Record<string, unknown>, want: string[], optional: string[], at: string, out: string[]) {
  const got = Object.keys(o);
  for (const k of want) if (!(k in o)) out.push(`${at}: missing ${k}`);
  for (const k of got) if (!want.includes(k) && !optional.includes(k)) out.push(`${at}: unexpected key ${k}`);
}

function field(ok: boolean, at: string, out: string[]) {
  if (!ok) out.push(`${at}: wrong type or value`);
}

/** /market/status: both timestamps present (a null is a transient read error on the Worker, never written). */
export const checkStatus: Check = (body, now) => {
  const s = parseStatus(body, now);
  if (!s) return ['status: not the expected shape'];
  return s.dld_synced_at && s.adrec_synced_at ? [] : ['status: a sync timestamp is null (transient Worker read error)'];
};

/** /market/areas?period=ytd. */
export const checkAreas: Check = (body) => {
  const out: string[] = [];
  if (!isObj(body)) return ['areas: not an object'];
  keys(body, ['period', 'prior_period', 'first_month', 'last_month', 'prior_first_month', 'prior_last_month', 'dubai'], [], 'areas', out);
  for (const k of ['period', 'prior_period']) field(typeof body[k] === 'string' && PERIOD_RE.test(body[k] as string), `areas.${k}`, out);
  for (const k of ['first_month', 'last_month', 'prior_first_month', 'prior_last_month']) field(typeof body[k] === 'string' && MONTH_RE.test(body[k] as string), `areas.${k}`, out);
  const d = body.dubai;
  if (!isObj(d)) return [...out, 'areas.dubai: not an object'];
  keys(d, ['ytd', 'top8', 'total_res_bn', 'as_of'], [], 'areas.dubai', out);
  field(pos(d.total_res_bn), 'areas.dubai.total_res_bn', out);
  field(date(d.as_of), 'areas.dubai.as_of', out);
  if (d.ytd !== null) {
    if (!isObj(d.ytd)) out.push('areas.dubai.ytd: not an object or null');
    else {
      keys(d.ytd, ['sales_bn', 'total_bn', 'mortgages_bn', 'as_of'], [], 'areas.dubai.ytd', out);
      for (const k of ['sales_bn', 'total_bn', 'mortgages_bn']) field(nonNeg(d.ytd[k]), `areas.dubai.ytd.${k}`, out);
      field(date(d.ytd.as_of), 'areas.dubai.ytd.as_of', out);
    }
  }
  if (!Array.isArray(d.top8) || d.top8.length < 1 || d.top8.length > 8) return [...out, 'areas.dubai.top8: not a list of 1 to 8 areas'];
  d.top8.forEach((a: unknown, i: number) => {
    const at = `areas.dubai.top8[${i}]`;
    if (!isObj(a)) return void out.push(`${at}: not an object`);
    keys(a, ['rank', 'area_en', 'label', 'value_bn', 'share_pct', 'change_pct', 'prior_zero', 'offplan_pct', 'prior_value_bn'], [], at, out);
    field(a.rank === i + 1, `${at}.rank`, out);
    field(text(a.area_en), `${at}.area_en`, out);
    field(a.label === null || text(a.label), `${at}.label`, out);
    field(pos(a.value_bn), `${at}.value_bn`, out);
    field(nonNeg(a.share_pct) && (a.share_pct as number) <= 100, `${at}.share_pct`, out);
    field(a.change_pct === null || num(a.change_pct), `${at}.change_pct`, out);
    field(typeof a.prior_zero === 'boolean', `${at}.prior_zero`, out);
    field(nonNeg(a.offplan_pct) && (a.offplan_pct as number) <= 100, `${at}.offplan_pct`, out);
    field(a.prior_value_bn === null || pos(a.prior_value_bn), `${at}.prior_value_bn`, out);
  });
  return out;
};

/** /market/launches: both sides present (both null is the Worker's transient read error answer). */
export const checkLaunches: Check = (body) => {
  const out: string[] = [];
  if (!isObj(body)) return ['launches: not an object'];
  keys(body, ['dubai', 'abu_dhabi'], [], 'launches', out);
  const d = body.dubai;
  if (!isObj(d)) out.push('launches.dubai: missing or null');
  else {
    keys(d, ['new_projects_90d', 'top_areas_90d', 'active_projects', 'as_of', 'source_label', 'source_url'], ['pipeline_units'], 'launches.dubai', out);
    field(int(d.new_projects_90d, 0), 'launches.dubai.new_projects_90d', out);
    field(int(d.active_projects, 0), 'launches.dubai.active_projects', out);
    if ('pipeline_units' in d) field(int(d.pipeline_units, 1), 'launches.dubai.pipeline_units', out);
    field(date(d.as_of), 'launches.dubai.as_of', out);
    field(text(d.source_label), 'launches.dubai.source_label', out);
    field(https(d.source_url), 'launches.dubai.source_url', out);
    if (!Array.isArray(d.top_areas_90d) || d.top_areas_90d.length > 5) out.push('launches.dubai.top_areas_90d: not a list of up to 5 areas');
    else d.top_areas_90d.forEach((a: unknown, i: number) => {
      const at = `launches.dubai.top_areas_90d[${i}]`;
      if (!isObj(a)) return void out.push(`${at}: not an object`);
      keys(a, ['area_en', 'label', 'count'], [], at, out);
      field(text(a.area_en), `${at}.area_en`, out);
      field(a.label === null || text(a.label), `${at}.label`, out);
      field(int(a.count, 1), `${at}.count`, out);
    });
  }
  const a = body.abu_dhabi;
  if (!isObj(a)) out.push('launches.abu_dhabi: missing or null');
  else {
    keys(a, ['transaction_value_bn', 'sales_value_bn', 'mortgage_value_bn', 'year', 'as_of', 'source_label', 'source_url'], [], 'launches.abu_dhabi', out);
    for (const k of ['transaction_value_bn', 'sales_value_bn', 'mortgage_value_bn']) field(pos(a[k]), `launches.abu_dhabi.${k}`, out);
    field(int(a.year, 2000), 'launches.abu_dhabi.year', out);
    field(date(a.as_of), 'launches.abu_dhabi.as_of', out);
    field(text(a.source_label), 'launches.abu_dhabi.source_label', out);
    field(https(a.source_url), 'launches.abu_dhabi.source_url', out);
  }
  return out;
};

export const ENDPOINTS: readonly Endpoint[] = [
  { file: 'status.json', path: '/market/status', check: checkStatus },
  { file: 'areas-ytd.json', path: '/market/areas?period=ytd', check: checkAreas },
  { file: 'launches.json', path: '/market/launches', check: checkLaunches },
];

// ---- No secrets ----------------------------------------------------------------------------------------------------

const SECRET_PATTERNS: readonly RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/, // GitHub tokens
  /\bgithub_pat_\w{20,}/,
  /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/, // JSON web tokens
  /\b[0-9a-f]{32,}\b/i, // hex keys and account ids
  /[A-Za-z0-9+_-]{40,}/, // long opaque tokens (no slash, so URL paths are not matched)
  /\b(bearer|basic)\s+[\w+/=.-]{8,}/i,
  /x-access-token|authorization|api[_-]?key|secret|password|credential|private[_ -]?key/i,
];

/** Names of environment variables that hold credentials. Their values must never reach a file. */
const SECRET_ENV_RE = /TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|AUTH/i;

/** Why a text must not be written, or [] when it is clean: credential shapes, and any credential variable's value. */
export function findSecrets(textIn: string, env: Record<string, string | undefined>): string[] {
  const out: string[] = [];
  for (const re of SECRET_PATTERNS) if (re.test(textIn)) out.push(`looks like a credential (${re.source.slice(0, 24)})`);
  for (const [k, v] of Object.entries(env)) if (SECRET_ENV_RE.test(k) && v && v.length >= 8 && textIn.includes(v)) out.push(`contains the value of ${k}`);
  return out;
}

// ---- The branch layout ---------------------------------------------------------------------------------------------

export const README = `# market-data

Snapshots of the public, read-only market answers of the site's Worker (${WORKER}).
The snapshot job of .github/workflows/market-data-sync.yml on phase2-site writes them after each successful weekly
sync. This is an orphan branch: it shares no history with the site and holds only this README and data/market/*.json.
Do not edit it by hand; the next snapshot replaces every file.

| File | Worker endpoint | Raw URL |
| --- | --- | --- |
${ENDPOINTS.map((e) => `| data/market/${e.file} | GET ${e.path} | ${REPO_RAW}/data/market/${e.file} |`).join('\n')}
| data/market/manifest.json | (written by the job) | ${REPO_RAW}/data/market/manifest.json |

Each data file is the Worker's answer byte for byte, unchanged. Dubai year to date totals are in areas-ytd.json under
dubai.ytd (sales_bn, total_bn, mortgages_bn, as_of); the top 8 Dubai areas are in dubai.top8. Abu Dhabi year to date
figures are in launches.json under abu_dhabi.

manifest.json holds the schema version, fetched_at (when the job read the Worker), the Worker's address, as_of (the
date of the newest Dubai transaction data) with the as_of date of every source, and each file's endpoint and sha256.
A commit is made only when a data file or this README changes, so fetched_at is the time of the last change, not of
the last check. raw.githubusercontent.com may serve a copy up to 5 minutes old.
`;

const ALLOWED_TOP = new Set(['.git', 'README.md', 'data']);
const ALLOWED_DATA = new Set([...ENDPOINTS.map((e) => e.file), 'manifest.json']);

/** The checkout must hold nothing but the branch's own files, so the commit can never pick up anything else. */
export function checkLayout(dir: string): string[] {
  if (!existsSync(dir)) return [`${dir} does not exist (the job checks out market-data there first)`];
  const out: string[] = [];
  for (const f of readdirSync(dir)) if (!ALLOWED_TOP.has(f)) out.push(`unexpected file in the market-data checkout: ${f}`);
  if (existsSync(join(dir, 'data'))) {
    for (const f of readdirSync(join(dir, 'data'))) if (f !== 'market') out.push(`unexpected file in data/: ${f}`);
    const m = join(dir, 'data', 'market');
    if (existsSync(m)) for (const f of readdirSync(m)) if (!ALLOWED_DATA.has(f)) out.push(`unexpected file in data/market/: ${f}`);
  }
  return out;
}

// ---- Fetch, check, write -------------------------------------------------------------------------------------------

export interface Fetched { file: string; path: string; text: string; body: unknown }

/** GET each fixed endpoint. No credential, no cookie, no header from anywhere else. Throws on any failure. */
export async function fetchAll(fetchImpl: typeof fetch): Promise<Fetched[]> {
  const out: Fetched[] = [];
  for (const e of ENDPOINTS) {
    const url = `${WORKER}${e.path}`;
    const res = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json', 'cache-control': 'no-cache' }, redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (res.status !== 200) throw new Error(`GET ${e.path} answered ${res.status}`);
    const textBody = await res.text();
    if (textBody.length > MAX_BYTES) throw new Error(`GET ${e.path}: answer larger than ${MAX_BYTES} bytes`);
    let body: unknown;
    try {
      body = JSON.parse(textBody);
    } catch {
      throw new Error(`GET ${e.path}: answer is not JSON`);
    }
    out.push({ file: e.file, path: e.path, text: textBody, body });
  }
  return out;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function manifest(items: Fetched[], fetchedAt: Date): string {
  const by = Object.fromEntries(items.map((i) => [i.file, i.body])) as Record<string, any>;
  const m = {
    schema: SCHEMA,
    fetched_at: fetchedAt.toISOString(),
    source: WORKER,
    as_of: by['areas-ytd.json'].dubai.as_of,
    as_of_by_source: {
      dubai_transactions: by['areas-ytd.json'].dubai.as_of,
      dubai_projects: by['launches.json'].dubai.as_of,
      abu_dhabi: by['launches.json'].abu_dhabi.as_of,
      dld_synced_at: by['status.json'].dld_synced_at,
      adrec_synced_at: by['status.json'].adrec_synced_at,
    },
    files: Object.fromEntries(items.map((i) => [i.file, { endpoint: `GET ${i.path}`, raw_url: `${REPO_RAW}/data/market/${i.file}`, sha256: sha256(i.text) }])),
  };
  return `${JSON.stringify(m, null, 2)}\n`;
}

export interface Result { changed: boolean; files: string[]; problems: string[] }

/**
 * Check everything, then write (or skip when unchanged). Returns problems instead of writing anything when an answer
 * has the wrong shape, looks like it holds a credential, or the checkout holds anything else.
 */
export function writeSnapshot(dir: string, items: Fetched[], fetchedAt: Date, env: Record<string, string | undefined>): Result {
  const problems = [...checkLayout(dir)];
  for (const e of ENDPOINTS) {
    const it = items.find((i) => i.file === e.file);
    if (!it) problems.push(`${e.file}: not fetched`);
    else problems.push(...e.check(it.body, fetchedAt), ...findSecrets(it.text, env).map((p) => `${e.file}: ${p}`));
  }
  if (problems.length) return { changed: false, files: [], problems };
  const m = manifest(items, fetchedAt);
  const leaks = findSecrets(m.replace(/"sha256": "[0-9a-f]{64}"/g, '"sha256": ""'), env).concat(findSecrets(README, env));
  if (leaks.length) return { changed: false, files: [], problems: leaks.map((p) => `manifest or README: ${p}`) };

  const mdir = join(dir, 'data', 'market');
  const want = new Map<string, string>([...items.map((i) => [join('data', 'market', i.file), i.text] as [string, string]), ['README.md', README]]);
  const same = [...want].every(([rel, t]) => existsSync(join(dir, rel)) && readFileSync(join(dir, rel), 'utf8') === t) && existsSync(join(mdir, 'manifest.json'));
  if (same) return { changed: false, files: [], problems: [] };
  mkdirSync(mdir, { recursive: true });
  for (const [rel, t] of want) writeFileSync(join(dir, rel), t);
  writeFileSync(join(mdir, 'manifest.json'), m);
  return { changed: true, files: [...want.keys(), join('data', 'market', 'manifest.json')], problems: [] };
}

/** A one-line description of a file's shape for the log: keys and types only, never values. */
export function shapeOf(x: unknown, depth = 0): string {
  if (x === null) return 'null';
  if (Array.isArray(x)) return `[${x.length} x ${x.length ? shapeOf(x[0], depth + 1) : 'nothing'}]`;
  if (typeof x === 'object') return depth > 3 ? '{...}' : `{${Object.entries(x as object).map(([k, v]) => `${k}: ${shapeOf(v, depth + 1)}`).join(', ')}}`;
  return typeof x;
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : null;
}

async function main(): Promise<void> {
  const dir = arg('--out');
  if (!dir) throw new Error('usage: node scripts/market-sync/snapshot.ts --out <dir> [--wait-seconds N]');
  const wait = Number(arg('--wait-seconds') ?? '0');
  if (!Number.isInteger(wait) || wait < 0 || wait > 900) throw new Error('--wait-seconds must be a whole number from 0 to 900');
  if (wait) {
    console.log(`waiting ${wait} s for the Worker's 10 minute memo to expire`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  const items = await fetchAll(fetch);
  const r = writeSnapshot(dir, items, new Date(), process.env);
  for (const it of items) console.log(`${it.file}: ${it.text.length} bytes ${shapeOf(it.body)}`);
  if (r.problems.length) {
    for (const p of r.problems) console.log(`refused: ${p}`);
    throw new Error('the snapshot was not written');
  }
  const line = r.changed ? `written: ${r.files.join(', ')}` : 'unchanged: the data files and README already match market-data, nothing written';
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendSummary(`## market-data snapshot\n\n${line}\n`);
}

function appendSummary(s: string) {
  writeFileSync(process.env.GITHUB_STEP_SUMMARY!, s, { flag: 'a' });
}

if (process.argv[1] && /snapshot\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.log(`snapshot failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    process.exitCode = 1;
  });
}
