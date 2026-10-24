// Stale-data alert for .github/workflows/market-data-sync.yml, job "apply", step "Stale-data check" (audit item 28).
// A run whose DLD outcome is waiting_for_runner is not a failure, so a PC that stays off for weeks, or a runner hook that
// wrongly rejects the real dld job, would never alert. This step fails (and so GitHub emails the owner) when the newest
// successful DLD write is older than 8 days.
//
// /market/status returns nulls on any transient D1 read error, so a null (or an unreadable answer) is UNKNOWN, not stale:
// it is read again after 60 s, and only two unknown reads in a row fail the step. Plain Node, no secrets, no install:
//   node scripts/market-sync/stale.ts
import { appendFileSync } from 'node:fs';
import { readStatus, type Status } from './gate.ts';

export const STALE_DAYS = 8;
export const RETRY_MS = 60_000;

export interface Freshness { ok: boolean; reason: string }

/** A real timestamp decides; anything else (null, unreadable) is unknown. */
export function judge(status: Status | null, now: Date): Freshness | null {
  const last = status?.dld_synced_at;
  if (!last) return null;
  const ageDays = (now.getTime() - Date.parse(last)) / 86_400_000;
  if (ageDays > STALE_DAYS) return { ok: false, reason: `STALE: the newest DLD write is ${last} (${ageDays.toFixed(1)} days old, limit ${STALE_DAYS})` };
  return { ok: true, reason: `fresh: the newest DLD write is ${last} (${ageDays.toFixed(1)} days old)` };
}

export async function checkFreshness(read: () => Promise<Status | null>, wait: (ms: number) => Promise<void>, now: () => Date): Promise<Freshness> {
  const first = judge(await read(), now());
  if (first) return first;
  await wait(RETRY_MS);
  const second = judge(await read(), now());
  if (second) return second;
  return { ok: false, reason: 'UNKNOWN twice: /market/status gave no DLD timestamp on two reads 60 s apart' };
}

async function main(): Promise<void> {
  const r = await checkFreshness(() => readStatus(fetch, new Date()), (ms) => new Promise((ok) => setTimeout(ok, ms)), () => new Date());
  console.log(r.reason);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## market-data-sync stale-data check\n\n${r.reason}\n`);
  if (!r.ok) process.exitCode = 1;
}

if (process.argv[1] && /stale\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.log(`stale-data check error: ${e instanceof Error ? e.message : 'unknown'}`);
    process.exitCode = 1;
  });
}
