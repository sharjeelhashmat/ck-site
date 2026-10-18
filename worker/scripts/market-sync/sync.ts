// Market-data sync, run by .github/workflows/market-data-sync.yml from the worker/ directory, in two jobs:
//
//   job "dld" (the owner's PC in the UAE; Data.Dubai serves UAE requests only; no secrets; no npm install, so no
//   dependency code runs on the PC: plain Node runs this file with type stripping, hence the .ts import extensions and
//   no enums or parameter properties anywhere in its imports):
//     node scripts/market-sync/sync.ts dld --out market-dld.json
//   job "apply" (GitHub-hosted, environment market-data):
//     npx --no-install tsx scripts/market-sync/sync.ts apply --dld market-dld.json --sql market-sync.sql --state market-sync.state.json
//     npx --no-install tsx scripts/market-sync/sync.ts check --sql market-sync.sql --state market-sync.state.json
//
// "dld" downloads the public DLD open data (no login, no key), parses it as RFC 4180 CSV in a stream and writes only
// aggregates. "apply" validates that file as untrusted input, fetches the ADREC feed itself and always writes the SQL
// file: the data, or a failure record (Dubai then keeps its last good data). Logs show host and path only.
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { buildArtifact, cleanError, MAX_ARTIFACT_BYTES, validateArtifact, type ValidDld } from './artifact.ts';
import { badRowsProblem, CsvParser, DldProjectsAggregator, DldTxAggregator, parseAdrec, safeUrl, type AdrecYtd } from './dld.ts';
import { buildSql, checkSql } from './sql.ts';

export const DLD_LIST_URL = (datasetId: number) =>
  `https://data.dubai/o/dda/data-services/dataset-download?datasetId=${datasetId}&page=1&pageSize=30&sortDir=desc`;
export const DLD_TX_DATASET = 470061;
export const DLD_PROJECTS_DATASET = 467654;
export const ADREC_URL = 'https://adrec.gov.ae/api/feature/MarketPerformance/AdrecStatistics';

type Fetch = typeof fetch;
export interface Ctx { fetch: Fetch; log: (s: string) => void; now: () => Date; uuid: () => string }

interface CsvPart { name: string; url: string; size: number }

export const dubaiDate = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
const message = (e: unknown) => cleanError(e instanceof Error ? e.message : String(e));

/** Lists the CSV parts of a dataset. The file URLs are signed and short-lived: never logged, used immediately. */
export async function listParts(ctx: Ctx, datasetId: number): Promise<CsvPart[]> {
  const url = DLD_LIST_URL(datasetId);
  const res = await ctx.fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`dataset ${datasetId}: listing ${safeUrl(url)} returned HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { metadata?: { files?: { file_extension?: string; file_url?: string; file_name?: string; file_size?: number }[] }[] } };
  const parts = (body.data?.metadata ?? []).flatMap((m) => m.files ?? [])
    .filter((f) => String(f.file_extension ?? '').toLowerCase() === 'csv' && typeof f.file_url === 'string')
    .map((f) => ({ name: String(f.file_name ?? ''), url: f.file_url!, size: Number(f.file_size ?? 0) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!parts.length) throw new Error(`dataset ${datasetId}: no CSV files listed`);
  return parts;
}

/** Streams one CSV through the RFC 4180 parser; the file is never held in memory. */
export async function streamRecords(ctx: Ctx, url: string, onRecord: (fields: string[] | null) => void): Promise<number> {
  const res = await ctx.fetch(url);
  if (!res.ok || !res.body) throw new Error(`download ${safeUrl(url)} returned HTTP ${res.status}`);
  const parser = new CsvParser(onRecord);
  const decoder = new TextDecoder('utf-8');
  let bytes = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    bytes += chunk.byteLength;
    parser.feed(decoder.decode(chunk, { stream: true }));
  }
  parser.feed(decoder.decode());
  parser.end();
  return bytes;
}

/** Every part is listed again right before it is fetched, because each signed URL is valid for 600 seconds. */
async function eachPart(ctx: Ctx, datasetId: number, onRecord: (fields: string[] | null) => void): Promise<{ parts: number; bytes: number }> {
  const first = await listParts(ctx, datasetId);
  let bytes = 0;
  for (let i = 0; i < first.length; i++) {
    const fresh = i === 0 ? first : await listParts(ctx, datasetId);
    const part = fresh.find((p) => p.name === first[i]!.name) ?? fresh[i];
    if (!part) throw new Error(`dataset ${datasetId}: part ${i + 1} disappeared between listings`);
    ctx.log(`dataset ${datasetId}: part ${i + 1}/${first.length} ${part.name} from ${safeUrl(part.url)}`);
    bytes += await streamRecords(ctx, part.url, onRecord);
  }
  return { parts: first.length, bytes };
}

// ---- job "dld" ------------------------------------------------------------------------------------------------------

export async function runDld(ctx: Ctx) {
  const now = ctx.now();
  const t0 = now.getTime();
  const today = dubaiDate(now);
  const summary: Record<string, string | number> = { today };

  const tx = new DldTxAggregator(today);
  let txPart: Parameters<typeof buildArtifact>[0]['tx'];
  try {
    const { parts, bytes } = await eachPart(ctx, DLD_TX_DATASET, (r) => tx.record(r));
    summary.transactions_download_mb = Math.round(bytes / 1e6);
    const problem = badRowsProblem('dld_transactions', tx.rowsTotal, tx.rowsBad);
    txPart = problem
      ? { ok: false, rowsTotal: tx.rowsTotal, rowsBad: tx.rowsBad, error: problem }
      : { ok: true, rowsTotal: tx.rowsTotal, rowsBad: tx.rowsBad, asOf: tx.asOf, parts, areaMonths: tx.areaMonths(), monthTotals: tx.monthTotals() };
  } catch (e) {
    txPart = { ok: false, rowsTotal: tx.rowsTotal, rowsBad: tx.rowsBad, error: message(e) };
  }
  Object.assign(summary, { rows_total: tx.rowsTotal, rows_bad: tx.rowsBad, as_of: tx.asOf || 'n/a' });

  const pa = new DldProjectsAggregator(today);
  let projPart: Parameters<typeof buildArtifact>[0]['projects'];
  try {
    const { bytes } = await eachPart(ctx, DLD_PROJECTS_DATASET, (r) => pa.record(r));
    summary.projects_download_mb = Math.round((bytes / 1e6) * 10) / 10;
    const problem = badRowsProblem('dld_projects', pa.rowsTotal, pa.rowsBad);
    projPart = problem ? { ok: false, columns: pa.header ?? [], error: problem } : { ok: true, rowsTotal: pa.rowsTotal, rowsBad: pa.rowsBad, columns: pa.header ?? [], stats: pa.stats() };
  } catch (e) {
    projPart = { ok: false, columns: pa.header ?? [], error: message(e) };
  }
  Object.assign(summary, { projects_rows: pa.rowsTotal, projects_rows_bad: pa.rowsBad });
  // Column NAMES only (never values), so the header can be checked against DLD_PROJECT_COLUMNS.
  const cols = (pa.header ?? []).filter((c) => /^[A-Za-z0-9_ ]{1,64}$/.test(c)).slice(0, 100);
  projPart = { ...projPart, columns: cols };
  summary.projects_columns = cols.join(', ') || 'n/a';
  summary.seconds = Math.round((ctx.now().getTime() - t0) / 1000);
  summary.errors = [txPart.ok ? '' : txPart.error, projPart.ok ? '' : projPart.error].filter(Boolean).join(' | ') || 'none';
  return { artifact: buildArtifact({ today, now, tx: txPart, projects: projPart }), summary };
}

// ---- job "apply" ----------------------------------------------------------------------------------------------------

export const DLD_RESULTS = ['success', 'failure', 'cancelled', 'skipped'] as const;

/**
 * Classifies the dld job by its result AND whether it ever started on the UAE PC (its first step sets started=true,
 * before anything else), so the outcome never depends on how GitHub reports a job whose 24-hour queue expired:
 *   success                          -> the artifact is read and validated as untrusted input;
 *   not success, never started       -> "waiting_for_runner": the PC was off; not a failure, no email, the gate re-queues;
 *   not success, started on the PC   -> a failure (the Check step fails, GitHub emails the owner).
 */
export function readDld(path: string, dldResult: string, dldStarted: string, today: string): ValidDld {
  const none = (why: string): ValidDld => ({ today, tx: null, rowsTotal: 0, rowsBad: 0, projects: null, projectsColumns: [], errors: [why] });
  if (dldResult !== 'success' && dldStarted !== 'true') return { today, tx: null, rowsTotal: 0, rowsBad: 0, projects: null, projectsColumns: [], errors: [], waiting: true };
  if (dldResult !== 'success') return none(`dld job: ${DLD_RESULTS.includes(dldResult as never) ? dldResult : 'unknown result'} after starting on the UAE runner`);
  if (!existsSync(path)) return none('dld job: no artifact');
  if (statSync(path).size > MAX_ARTIFACT_BYTES) return none('dld artifact: too large');
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(path, 'utf8')); } catch { return none('dld artifact: not JSON'); }
  return validateArtifact(raw, today);
}

export async function runApply(ctx: Ctx, dld: ValidDld) {
  const started = ctx.now();
  const runId = ctx.uuid();
  const errors = [...dld.errors];
  let adrec: AdrecYtd | null = null;
  try {
    const res = await ctx.fetch(ADREC_URL, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`adrec: ${safeUrl(ADREC_URL)} returned HTTP ${res.status}`);
    adrec = parseAdrec(await res.json(), Number(dubaiDate(started).slice(0, 4)));
  } catch (e) {
    errors.push(message(e));
  }
  const finished = ctx.now();
  const sql = buildSql({ runId, startedAt: started.toISOString(), finishedAt: finished.toISOString(), dld: dld.tx, rowsTotal: dld.rowsTotal, rowsBad: dld.rowsBad, projects: dld.projects, adrec, errors, uuid: ctx.uuid, dldWaiting: dld.waiting === true });
  const summary: Record<string, string | number> = {
    run_id: runId, dld: dld.waiting ? 'waiting_for_runner (UAE PC offline; re-queued by the gate)' : dld.tx ? 'delivered' : 'failed', dld_as_of: dld.tx?.asOf ?? 'n/a', rows_total: dld.rowsTotal, rows_bad: dld.rowsBad,
    area_months: dld.tx?.areaMonths.length ?? 0, projects: dld.projects ? `${dld.projects.new_projects_90d} new in 90 days, ${dld.projects.active_projects} active` : 'n/a',
    projects_columns: dld.projectsColumns.join(', ') || 'n/a',
    adrec: adrec ? `sales ${adrec.sales_value_aed}, transactions ${adrec.transaction_value_aed}, mortgages ${adrec.mortgage_value_aed} (AED)` : 'n/a',
    errors: errors.length ? errors.join(' | ') : 'none',
  };
  return { sql, runId, summary };
}

// ---- CLI ------------------------------------------------------------------------------------------------------------

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  const v = i > 0 ? process.argv[i + 1] : undefined;
  if (!v || !/^[\w.-]+$/.test(v)) throw new Error(`missing or invalid ${name}`);
  return v;
}

function report(title: string, summary: Record<string, string | number>) {
  const rows = Object.entries(summary).map(([k, v]) => `| ${k} | ${String(v).replace(/\|/g, '\\|')} |`);
  const md = [`## ${title}`, '', '| field | value |', '|---|---|', ...rows, ''].join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}

async function main(): Promise<number> {
  const mode = process.argv[2];
  const ctx: Ctx = { fetch, log: (s) => console.log(s), now: () => new Date(), uuid: () => crypto.randomUUID() };
  if (mode === 'dld') {
    const { artifact, summary } = await runDld(ctx);
    writeFileSync(arg('--out'), JSON.stringify(artifact));
    report('market-data-sync: DLD (UAE runner)', summary);
    return 0;
  }
  if (mode === 'apply') {
    const dld = readDld(arg('--dld'), process.env.DLD_RESULT ?? '', process.env.DLD_STARTED ?? '', dubaiDate(ctx.now()));
    const r = await runApply(ctx, dld);
    writeFileSync(arg('--sql'), r.sql);
    writeFileSync(arg('--state'), JSON.stringify({ run_id: r.runId }) + '\n');
    report('market-data-sync: apply', r.summary);
    if (r.summary.errors !== 'none') console.log(`::warning title=market-data-sync::${String(r.summary.errors).slice(0, 500)} (recorded in D1; the Check step will fail this run)`);
    return 0;
  }
  if (mode === 'check') {
    const { run_id } = JSON.parse(readFileSync(arg('--state'), 'utf8')) as { run_id: string };
    if (!/^[0-9a-f-]{36}$/.test(run_id)) throw new Error('state: bad run id');
    writeFileSync(arg('--sql'), checkSql(run_id, new Date().toISOString()));
    return 0;
  }
  console.error('usage: sync.ts dld --out <file> | apply --dld <file> --sql <file> --state <file> | check --sql <file> --state <file>');
  return 2;
}

// Run only as a script (tests import the functions above).
if (process.argv[1] && /sync\.ts$/.test(process.argv[1])) {
  main().then((c) => { process.exitCode = c; }, (e) => { console.error(`market-data-sync: ${message(e)}`); process.exitCode = 1; });
}
