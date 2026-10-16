// Market-data sync, run by .github/workflows/market-data-sync.yml (working directory worker/):
//   npx --no-install tsx scripts/market-sync/sync.ts build --sql market-sync.sql --state market-sync.state.json
//   npx --no-install tsx scripts/market-sync/sync.ts check --sql market-sync.sql --state market-sync.state.json
// "build" downloads the public DLD open data (no login, no key) and the ADREC year-to-date feed, aggregates on the runner
// and writes the SQL file. It always writes a file: the data, or a failure record. It needs no credentials and reads none.
// Logs show host and path only, never a signed URL or a query string.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { badRowsProblem, DldProjectsAggregator, DldTxAggregator, parseAdrec, safeUrl, type AdrecYtd, type ProjectsStats } from './dld';
import { buildSql, checkSql } from './sql';

export const DLD_LIST_URL = (datasetId: number) =>
  `https://data.dubai/o/dda/data-services/dataset-download?datasetId=${datasetId}&page=1&pageSize=30&sortDir=desc`;
export const DLD_TX_DATASET = 470061;
export const DLD_PROJECTS_DATASET = 467654;
export const ADREC_URL = 'https://adrec.gov.ae/api/feature/MarketPerformance/AdrecStatistics';

type Fetch = typeof fetch;
export interface Ctx { fetch: Fetch; log: (s: string) => void; now: () => Date; uuid: () => string }

interface CsvPart { name: string; url: string; size: number }

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

/** Streams one CSV line by line; the file is never held in memory. */
export async function streamLines(ctx: Ctx, url: string, onLine: (line: string) => void): Promise<void> {
  const res = await ctx.fetch(url);
  if (!res.ok || !res.body) throw new Error(`download ${safeUrl(url)} returned HTTP ${res.status}`);
  const rl = createInterface({ input: Readable.fromWeb(res.body as unknown as NodeReadableStream), crlfDelay: Infinity });
  for await (const line of rl) onLine(line.charCodeAt(0) === 0xfeff ? line.slice(1) : line);
}

/** Every part is listed again right before it is fetched, because each signed URL is valid for 600 seconds. */
async function eachPart(ctx: Ctx, datasetId: number, onLine: (line: string) => void): Promise<number> {
  const first = await listParts(ctx, datasetId);
  for (let i = 0; i < first.length; i++) {
    const fresh = i === 0 ? first : await listParts(ctx, datasetId);
    const part = fresh.find((p) => p.name === first[i]!.name) ?? fresh[i];
    if (!part) throw new Error(`dataset ${datasetId}: part ${i + 1} disappeared between listings`);
    ctx.log(`dataset ${datasetId}: part ${i + 1}/${first.length} ${part.name} (${Math.round(part.size / 1e6)} MB) from ${safeUrl(part.url)}`);
    await streamLines(ctx, part.url, onLine);
  }
  return first.length;
}

const dubaiDate = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/https?:\/\/\S+/g, (u) => safeUrl(u));

export interface BuildResult { sql: string; runId: string; summary: Record<string, string | number> }

export async function build(ctx: Ctx): Promise<BuildResult> {
  const started = ctx.now();
  const t0 = started.getTime();
  const today = dubaiDate(started);
  const runId = ctx.uuid();
  const errors: string[] = [];
  const summary: Record<string, string | number> = { run_id: runId };

  const tx = new DldTxAggregator(today);
  let dld: Parameters<typeof buildSql>[0]['dld'] = null;
  try {
    summary.dld_parts = await eachPart(ctx, DLD_TX_DATASET, (l) => tx.line(l));
    const problem = badRowsProblem(tx.rowsTotal, tx.rowsBad);
    if (problem) errors.push(problem);
    else dld = { rowsTotal: tx.rowsTotal, rowsBad: tx.rowsBad, asOf: tx.asOf, areaMonths: tx.areaMonths(), monthTotals: tx.monthTotals() };
  } catch (e) {
    errors.push(message(e));
  }
  Object.assign(summary, { rows_total: tx.rowsTotal, rows_bad: tx.rowsBad, as_of: tx.asOf || 'n/a' });

  let projects: ProjectsStats | null = null;
  const pa = new DldProjectsAggregator(today);
  try {
    await eachPart(ctx, DLD_PROJECTS_DATASET, (l) => pa.line(l));
    projects = pa.stats();
    summary.projects = `${projects.new_projects_90d} new in 90 days, ${projects.active_projects} active${projects.pipeline_units !== undefined ? `, ${projects.pipeline_units} units` : ''}`;
  } catch (e) {
    errors.push(message(e));
  }
  // Column NAMES only (never values): the first run reports the real header so the projects mapping can be confirmed.
  if (pa.header) summary.projects_columns = pa.header.join(', ');

  let adrec: AdrecYtd | null = null;
  try {
    const res = await ctx.fetch(ADREC_URL, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`adrec: ${safeUrl(ADREC_URL)} returned HTTP ${res.status}`);
    adrec = parseAdrec(await res.json(), Number(today.slice(0, 4)));
    summary.adrec = `sales ${adrec.sales_value_aed}, transactions ${adrec.transaction_value_aed}, mortgages ${adrec.mortgage_value_aed} (AED)`;
  } catch (e) {
    errors.push(message(e));
  }

  const finished = ctx.now();
  summary.seconds = Math.round((finished.getTime() - t0) / 1000);
  summary.errors = errors.length ? errors.join(' | ') : 'none';
  const sql = buildSql({ runId, startedAt: started.toISOString(), finishedAt: finished.toISOString(), dld, rowsTotal: tx.rowsTotal, rowsBad: tx.rowsBad, projects, adrec, errors, uuid: ctx.uuid });
  return { sql, runId, summary };
}

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  const v = i > 0 ? process.argv[i + 1] : undefined;
  if (!v || !/^[\w.-]+$/.test(v)) throw new Error(`missing or invalid ${name}`);
  return v;
}

async function main(): Promise<number> {
  const mode = process.argv[2];
  const sqlPath = arg('--sql');
  const statePath = arg('--state');
  const ctx: Ctx = { fetch, log: (s) => console.log(s), now: () => new Date(), uuid: () => crypto.randomUUID() };
  if (mode === 'build') {
    const r = await build(ctx);
    writeFileSync(sqlPath, r.sql);
    writeFileSync(statePath, JSON.stringify({ run_id: r.runId }) + '\n');
    const rows = Object.entries(r.summary).map(([k, v]) => `| ${k} | ${String(v).replace(/\|/g, '\\|')} |`);
    const md = ['## market-data-sync', '', '| field | value |', '|---|---|', ...rows, ''].join('\n');
    console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
    if (r.summary.errors !== 'none') console.log(`::warning title=market-data-sync::${String(r.summary.errors).slice(0, 500)} (recorded in D1; the Check step will fail this run)`);
    return 0;
  }
  if (mode === 'check') {
    const { run_id } = JSON.parse(readFileSync(statePath, 'utf8')) as { run_id: string };
    writeFileSync(sqlPath, checkSql(run_id, new Date().toISOString()));
    return 0;
  }
  console.error('usage: sync.ts build|check --sql <file> --state <file>');
  return 2;
}

// Run only as a script (tests import the functions above).
if (process.argv[1] && /sync\.ts$/.test(process.argv[1])) {
  main().then((c) => { process.exitCode = c; }, (e) => { console.error(`market-data-sync: ${message(e)}`); process.exitCode = 1; });
}
