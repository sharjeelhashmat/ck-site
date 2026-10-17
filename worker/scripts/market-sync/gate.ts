// Weekly gate for .github/workflows/market-data-sync.yml (owner EXECUTE 2026-10-17). The workflow fires twice a day
// (02:07 and 14:07 Dubai); this decides whether that run does anything. It runs on a GitHub-hosted runner with no
// secrets, straight from Node (no npm install):  node scripts/market-sync/gate.ts
//
// run=true when: the run was started by hand (workflow_dispatch); or the last successful DLD sync is missing or older
// than the most recent Monday 14:07 Dubai that is <= now; or /market/status cannot be read or is invalid (fail open).
// Otherwise run=false and nothing else in the workflow runs (no download).
//
// Self-contained on purpose (no imports), so Node can run it without dependencies.
import { appendFileSync } from 'node:fs';

/** The production Worker. A fixed constant: never taken from an input. */
export const STATUS_URL = 'https://ck-lead-worker.sharjeelhashmat.workers.dev/market/status';
const DUBAI_OFFSET_MS = 4 * 3600_000; // Asia/Dubai is UTC+4 all year (no daylight saving)
const WEEK_MS = 7 * 86_400_000;

/** The most recent Monday 14:07 in Dubai that is at or before `now`, as a UTC instant. */
export function weeklyCutoff(now: Date): Date {
  const local = new Date(now.getTime() + DUBAI_OFFSET_MS); // Dubai wall clock, read with getUTC*
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const mondayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday, 14, 7, 0, 0);
  let cutoff = mondayLocal - DUBAI_OFFSET_MS;
  if (cutoff > now.getTime()) cutoff -= WEEK_MS;
  return new Date(cutoff);
}

export interface Status { dld_synced_at: string | null; adrec_synced_at: string | null }

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Strict shape check of /market/status: exactly the two keys, each null or an ISO instant not in the future. */
export function parseStatus(body: unknown, now: Date): Status | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  if (keys.length !== 2 || keys[0] !== 'adrec_synced_at' || keys[1] !== 'dld_synced_at') return null;
  for (const k of keys) {
    const v = o[k];
    if (v === null) continue;
    if (typeof v !== 'string' || !ISO_RE.test(v) || !(Date.parse(v) <= now.getTime() + 3600_000)) return null;
  }
  return o as unknown as Status;
}

export function decide(input: { event: string; now: Date; status: Status | null }): { run: boolean; reason: string } {
  const cutoff = weeklyCutoff(input.now);
  if (input.event === 'workflow_dispatch') return { run: true, reason: 'started by hand (workflow_dispatch)' };
  if (!input.status) return { run: true, reason: '/market/status unreachable or invalid: running anyway (fail open)' };
  const last = input.status.dld_synced_at;
  if (!last) return { run: true, reason: 'no successful DLD sync recorded yet' };
  if (Date.parse(last) < cutoff.getTime()) return { run: true, reason: `last DLD sync ${last} is before this week's cutoff ${cutoff.toISOString()}` };
  return { run: false, reason: `already synced this week (${last} >= cutoff ${cutoff.toISOString()})` };
}

export async function readStatus(fetchImpl: typeof fetch, now: Date): Promise<Status | null> {
  try {
    const res = await fetchImpl(STATUS_URL, { headers: { accept: 'application/json', 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return parseStatus(await res.json(), now);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const now = new Date();
  const event = process.env.EVENT_NAME ?? '';
  const status = event === 'workflow_dispatch' ? null : await readStatus(fetch, now);
  const d = decide({ event, now, status });
  console.log(`run=${d.run}: ${d.reason}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${d.run}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## market-data-sync gate\n\nrun=${d.run}: ${d.reason}\n`);
}

if (process.argv[1] && /gate\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    // Never block the weekly update on the gate itself: fail open.
    console.log(`run=true: gate error (${e instanceof Error ? e.message : 'unknown'}), running anyway`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'run=true\n');
  });
}
