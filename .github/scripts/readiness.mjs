#!/usr/bin/env node
// Readiness checks (PR 2c item 6, gap G08), run by .github/workflows/readiness.yml. Plain Node, no dependencies.
//
// Each check is ONE read-only SELECT against the production D1 (wrangler d1 execute ck-leads --remote --json --command)
// that answers a single column ok: 1 = PASS, 0 = FAIL, NULL = unknown. Unknown (NULL, unreadable output, a failed
// command) is read again after 60 s, and unknown twice is FAIL (the market-data stale rule, PR 2 item 28).
//
// The repository is public, so its Actions logs are public: this prints exactly one line per check, "<name>: PASS" or
// "<name>: FAIL", and nothing else. Wrangler's own output (rows, counts, errors) is captured and never printed; no step
// summary, no artifact. Any FAIL exits 1, so the job fails and GitHub emails the owner.
//
//   retention      newest retention_runs row is under 36 h old and ok
//   outbox-stuck   no outbox row has stayed 'claimed' for more than 15 min
//   outbox-failed  no outbox row failed in the last 24 h (failed rows are never resent automatically)
//   market-data    newest market_sync_runs row with dld_written = 1 finished under 8 days ago
//   replies        only when the repository variable REPLIES_LIVE is 'yes' (go-live, Runbook step 5.4): every lead that
//                  is not TEST or SPAM and is 15 min to 24 h old has a lead_reply row that is sent, or skipped for a
//                  reason that means no reply was due (src/outbox.ts REPLY_SKIP_OK)
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RETRY_MS = 60_000;

export const CHECKS = [
  {
    name: 'retention',
    sql: `SELECT CASE WHEN run_at IS NULL THEN NULL
      WHEN run_ok = 1 AND julianday(run_at) >= julianday('now', '-36 hours') THEN 1 ELSE 0 END AS ok
      FROM (SELECT (SELECT run_at FROM retention_runs ORDER BY run_at DESC LIMIT 1) AS run_at,
                   (SELECT ok FROM retention_runs ORDER BY run_at DESC LIMIT 1) AS run_ok)`,
  },
  {
    name: 'outbox-stuck',
    sql: `SELECT CASE WHEN EXISTS (SELECT 1 FROM outbox WHERE status = 'claimed'
      AND julianday(created_at) < julianday('now', '-15 minutes')) THEN 0 ELSE 1 END AS ok`,
  },
  {
    name: 'outbox-failed',
    sql: `SELECT CASE WHEN EXISTS (SELECT 1 FROM outbox WHERE status = 'failed'
      AND julianday(created_at) >= julianday('now', '-24 hours')) THEN 0 ELSE 1 END AS ok`,
  },
  {
    name: 'market-data',
    sql: `SELECT CASE WHEN t IS NULL THEN NULL WHEN julianday(t) >= julianday('now', '-8 days') THEN 1 ELSE 0 END AS ok
      FROM (SELECT MAX(finished_at) AS t FROM market_sync_runs WHERE dld_written = 1)`,
  },
  {
    name: 'replies',
    when: (env) => env.REPLIES_LIVE === 'yes',
    sql: `SELECT CASE WHEN EXISTS (SELECT 1 FROM leads l
      WHERE COALESCE(l.status, '') NOT IN ('TEST', 'SPAM')
        AND julianday(l.created_at) < julianday('now', '-15 minutes')
        AND julianday(l.created_at) >= julianday('now', '-24 hours')
        AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.kind = 'lead_reply' AND o.lead_id = l.id
          AND (o.status = 'sent' OR (o.status = 'skipped' AND o.error IN ('suppressed', 'daily_cap', 'duplicate', 'quarantined')))))
      THEN 0 ELSE 1 END AS ok`,
  },
];

/** Refuses anything that is not one plain SELECT (no second statement, no write keyword). */
export function assertReadOnly(sql) {
  if (!/^\s*SELECT\s/i.test(sql) || sql.includes(';') || /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|PRAGMA|VACUUM)\b/i.test(sql)) {
    throw new Error('readiness: refusing a statement that is not a single read-only SELECT');
  }
}

/** wrangler d1 execute --json output: [{ results: [{ ok }] }]. true / false, or null when unknown. */
export function parseOk(stdout) {
  try {
    const ok = JSON.parse(stdout)?.[0]?.results?.[0]?.ok;
    return ok === 1 ? true : ok === 0 ? false : null;
  } catch {
    return null;
  }
}

async function readOnce(exec, sql) {
  try {
    return parseOk(String(await exec(sql)));
  } catch {
    return null;
  }
}

/** Runs every check that applies; prints one PASS/FAIL line each; returns the number of FAILs. */
export async function runChecks({ exec, env, print, wait }) {
  let failed = 0;
  for (const c of CHECKS) {
    if (c.when && !c.when(env)) continue;
    assertReadOnly(c.sql);
    let ok = await readOnce(exec, c.sql);
    if (ok === null) {
      await wait(RETRY_MS);
      ok = await readOnce(exec, c.sql);
    }
    if (ok !== true) failed += 1;
    print(`${c.name}: ${ok === true ? 'PASS' : 'FAIL'}`);
  }
  return failed;
}

// The only command this script runs: a read-only query, output captured (never printed). cwd worker/ (wrangler.toml).
const WORKER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'worker');
function wranglerSelect(sql) {
  assertReadOnly(sql);
  return new Promise((resolve, reject) => {
    execFile('npx', ['--no-install', 'wrangler', 'd1', 'execute', 'ck-leads', '--remote', '--json', '--command', sql],
      { cwd: WORKER, maxBuffer: 1024 * 1024, timeout: 90_000, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
      (err, stdout) => (err ? reject(new Error('wrangler failed')) : resolve(stdout)));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runChecks({ exec: wranglerSelect, env: process.env, print: (s) => console.log(s), wait: (ms) => new Promise((ok) => setTimeout(ok, ms)) })
    .then((failed) => { process.exitCode = failed ? 1 : 0; })
    .catch(() => { console.log('readiness: FAIL'); process.exitCode = 1; });
}
