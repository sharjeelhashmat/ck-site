// PR 2c item 6b (gap G08): the private readiness workflow's checks, in .github/scripts/readiness.mjs. Every statement is a
// single SELECT; each one answers ok = 1 (PASS), 0 (FAIL) or NULL (unknown: read again after 60 s, unknown twice = FAIL).
// Run here against an in-memory SQLite built from the real migrations. The runner prints one line per check and nothing
// else, because the repository and its Actions logs are public.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { REPLY_SKIP_OK } from '../src/outbox';

const SCRIPT = join(import.meta.dirname, '..', '..', '.github', 'scripts', 'readiness.mjs');
interface Check { name: string; sql: string; when?: (env: Record<string, string | undefined>) => boolean }
interface Mod {
  CHECKS: Check[];
  assertReadOnly(sql: string): void;
  runChecks(o: { exec: (sql: string) => Promise<unknown>; env: Record<string, string | undefined>; print: (s: string) => void; wait: (ms: number) => Promise<void> }): Promise<number>;
  parseOk(stdout: string): boolean | null;
}
const load = async (): Promise<Mod> => (await import(SCRIPT)) as Mod;

const migrations = join(import.meta.dirname, '..', 'migrations');
function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql')).sort()) d.exec(readFileSync(join(migrations, f), 'utf8'));
  return d;
}
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const H = 3_600_000;
const okOf = async (d: DatabaseSync, name: string) => {
  const c = (await load()).CHECKS.find((x) => x.name === name)!;
  return (d.prepare(c.sql).get() as { ok: number | null }).ok;
};

describe('readiness checks: read-only', () => {
  it('there are exactly these checks, and every statement starts with SELECT and is one statement', async () => {
    const { CHECKS, assertReadOnly } = await load();
    expect(CHECKS.map((c) => c.name)).toEqual(['retention', 'outbox-stuck', 'outbox-failed', 'market-data', 'replies']);
    for (const c of CHECKS) {
      expect(c.sql.trimStart().slice(0, 7).toUpperCase(), c.name).toBe('SELECT ');
      expect(c.sql, c.name).not.toContain(';');
      expect(c.sql, c.name).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|PRAGMA|VACUUM)\b/i);
      expect(() => assertReadOnly(c.sql)).not.toThrow();
    }
    for (const bad of ['DELETE FROM leads', 'SELECT 1; DELETE FROM leads', ' UPDATE outbox SET status = 1', 'WITH x AS (SELECT 1) DELETE FROM leads']) {
      expect(() => assertReadOnly(bad), bad).toThrow();
    }
  });

  it('the reply check accepts exactly the skip reasons the Worker treats as "no reply due"', async () => {
    const sql = (await load()).CHECKS.find((c) => c.name === 'replies')!.sql;
    const listed = [...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    for (const r of REPLY_SKIP_OK) expect(listed).toContain(r);
    for (const r of ['blocked', 'not_approved', 'template_missing', 'render_failed', 'wrong_stream', 'no_template']) expect(listed).not.toContain(r);
  });
});

describe('readiness checks: decisions', () => {
  it('retention: newest run ok and under 36 h passes; older, failed or none does not', async () => {
    const d = db();
    expect(await okOf(d, 'retention')).toBeNull();
    d.prepare('INSERT INTO retention_runs (run_at, ok) VALUES (?, 1)').run(ago(37 * H));
    expect(await okOf(d, 'retention')).toBe(0);
    d.prepare('INSERT INTO retention_runs (run_at, ok) VALUES (?, 1)').run(ago(2 * H));
    expect(await okOf(d, 'retention')).toBe(1);
    d.prepare('INSERT INTO retention_runs (run_at, ok) VALUES (?, 0)').run(ago(H));
    expect(await okOf(d, 'retention')).toBe(0);
  });

  it('outbox-stuck: a row claimed for more than 15 min fails; a fresh claim does not', async () => {
    const d = db();
    expect(await okOf(d, 'outbox-stuck')).toBe(1);
    d.prepare("INSERT INTO outbox (id, dedupe_key, kind, created_at, status) VALUES ('a', 'a', 'owner_alert', ?, 'claimed')").run(ago(60_000));
    expect(await okOf(d, 'outbox-stuck')).toBe(1);
    d.prepare("INSERT INTO outbox (id, dedupe_key, kind, created_at, status) VALUES ('b', 'b', 'lead_reply', ?, 'claimed')").run(ago(16 * 60_000));
    expect(await okOf(d, 'outbox-stuck')).toBe(0);
  });

  it('outbox-failed: a failed row in the last 24 h fails; an older one does not', async () => {
    const d = db();
    d.prepare("INSERT INTO outbox (id, dedupe_key, kind, created_at, status) VALUES ('a', 'a', 'lead_reply', ?, 'failed')").run(ago(25 * H));
    expect(await okOf(d, 'outbox-failed')).toBe(1);
    d.prepare("INSERT INTO outbox (id, dedupe_key, kind, created_at, status) VALUES ('b', 'b', 'lead_reply', ?, 'failed')").run(ago(23 * H));
    expect(await okOf(d, 'outbox-failed')).toBe(0);
  });

  it('market-data: the newest written DLD run under 8 days passes; older fails; none is unknown', async () => {
    const d = db();
    const run = (id: string, at: string, written: number) =>
      d.prepare('INSERT INTO market_sync_runs (run_id, started_at, finished_at, ok, dld_written, dld_status) VALUES (?, ?, ?, 1, ?, ?)').run(id, at, at, written, written ? 'written' : 'waiting_for_runner');
    run('w0', ago(H), 0);
    expect(await okOf(d, 'market-data')).toBeNull();
    run('w1', ago(9 * 24 * H), 1);
    expect(await okOf(d, 'market-data')).toBe(0);
    run('w2', ago(7 * 24 * H), 1);
    expect(await okOf(d, 'market-data')).toBe(1);
  });

  it('replies: a real lead 15 min to 24 h old needs a sent row or a skipped row with an accepted reason', async () => {
    const d = db();
    const lead = (id: string, at: string, status: string) => d.prepare("INSERT INTO leads (id, created_at, consent_contact, status) VALUES (?, ?, 1, ?)").run(id, at, status);
    const reply = (id: string, lead: string, status: string, error: string | null) =>
      d.prepare("INSERT INTO outbox (id, dedupe_key, kind, lead_id, created_at, status, error) VALUES (?, ?, 'lead_reply', ?, ?, ?, ?)").run(id, id, lead, ago(H), status, error);
    lead('fresh', ago(5 * 60_000), 'VALID');
    lead('old', ago(30 * H), 'VALID');
    lead('test', ago(H), 'TEST');
    lead('spam', ago(H), 'SPAM');
    expect(await okOf(d, 'replies')).toBe(1);
    lead('l1', ago(H), 'VALID');
    expect(await okOf(d, 'replies')).toBe(0);
    reply('r1', 'l1', 'skipped', 'blocked');
    expect(await okOf(d, 'replies')).toBe(0);
    reply('r2', 'l1', 'sent', null);
    expect(await okOf(d, 'replies')).toBe(1);
    lead('l2', ago(2 * H), 'DUPLICATE');
    reply('r3', 'l2', 'skipped', 'duplicate');
    lead('l3', ago(2 * H), 'VALID');
    reply('r4', 'l3', 'skipped', 'daily_cap');
    expect(await okOf(d, 'replies')).toBe(1);
    lead('l4', ago(3 * H), 'VALID');
    reply('r5', 'l4', 'failed', 'timeout');
    expect(await okOf(d, 'replies')).toBe(0);
  });
});

describe('readiness runner: output', () => {
  const answer = (ok: number | null) => JSON.stringify([{ results: [{ ok }], success: true }]);

  it('one line per check, "<name>: PASS" or "<name>: FAIL", nothing else; the reply check only with REPLIES_LIVE=yes', async () => {
    const { runChecks, CHECKS } = await load();
    const lines: string[] = [];
    const failed = await runChecks({ exec: async (sql) => answer(sql === CHECKS[2]!.sql ? 0 : 1), env: {}, print: (s) => lines.push(s), wait: async () => {} });
    expect(lines).toEqual(['retention: PASS', 'outbox-stuck: PASS', 'outbox-failed: FAIL', 'market-data: PASS']);
    expect(failed).toBe(1);
    const live: string[] = [];
    expect(await runChecks({ exec: async () => answer(1), env: { REPLIES_LIVE: 'yes' }, print: (s) => live.push(s), wait: async () => {} })).toBe(0);
    expect(live.at(-1)).toBe('replies: PASS');
  });

  it('unknown (NULL, unreadable output or a failed command) is read again after 60 s; unknown twice is FAIL', async () => {
    const { runChecks } = await load();
    const waits: number[] = [];
    let n = 0;
    const lines: string[] = [];
    const exec = async () => { n += 1; if (n === 1) return answer(null); if (n === 3) throw new Error('wrangler failed: secret-ish detail'); if (n === 4) return 'not json'; return answer(1); };
    await runChecks({ exec, env: {}, print: (s) => lines.push(s), wait: async (ms) => { waits.push(ms); } });
    expect(waits).toEqual([60_000, 60_000]);
    expect(lines).toEqual(['retention: PASS', 'outbox-stuck: FAIL', 'outbox-failed: PASS', 'market-data: PASS']);
    expect(lines.join('\n')).not.toContain('secret-ish');
  });

  it('parseOk reads wrangler --json output: 1 true, 0 false, anything else unknown', async () => {
    const { parseOk } = await load();
    expect(parseOk(answer(1))).toBe(true);
    expect(parseOk(answer(0))).toBe(false);
    for (const x of [answer(null), '[]', '{}', 'nope', JSON.stringify([{ results: [] }])]) expect(parseOk(x)).toBeNull();
  });
});
