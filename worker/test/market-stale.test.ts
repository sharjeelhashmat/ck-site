// The stale-data alert in market-data-sync's apply job (worker/scripts/market-sync/stale.ts, audit item 28).
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { checkFreshness, judge, RETRY_MS, STALE_DAYS } from '../scripts/market-sync/stale';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const status = (dld: string | null) => ({ dld_synced_at: dld, adrec_synced_at: null });

describe('stale-data check', () => {
  it('a real timestamp decides: up to 8 days is fresh, older is stale', () => {
    expect(STALE_DAYS).toBe(8);
    expect(judge(status(daysAgo(1)), NOW)?.ok).toBe(true);
    expect(judge(status(daysAgo(8)), NOW)?.ok).toBe(true);
    const stale = judge(status(daysAgo(8.01)), NOW);
    expect(stale?.ok).toBe(false);
    expect(stale?.reason).toMatch(/^STALE/);
  });

  it('a null or unreadable answer is unknown, not stale', () => {
    expect(judge(null, NOW)).toBeNull();
    expect(judge(status(null), NOW)).toBeNull();
  });

  it('fresh on the first read: one read, no wait', async () => {
    const waits: number[] = [];
    let reads = 0;
    const r = await checkFreshness(async () => { reads++; return status(daysAgo(2)); }, async (ms) => { waits.push(ms); }, () => NOW);
    expect(r.ok).toBe(true);
    expect([reads, waits]).toEqual([1, []]);
  });

  it('stale on the first read fails at once', async () => {
    const r = await checkFreshness(async () => status(daysAgo(20)), async () => {}, () => NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/^STALE/);
  });

  it('unknown, then a real timestamp after 60 s: that timestamp decides (both ways)', async () => {
    const seq = (second: string) => { let n = 0; return async () => (n++ === 0 ? null : status(second)); };
    const waits: number[] = [];
    expect((await checkFreshness(seq(daysAgo(1)), async (ms) => { waits.push(ms); }, () => NOW)).ok).toBe(true);
    expect(waits).toEqual([RETRY_MS]);
    expect(RETRY_MS).toBe(60_000);
    expect((await checkFreshness(seq(daysAgo(30)), async () => {}, () => NOW)).ok).toBe(false);
  });

  it('two unknown reads in a row fail the step', async () => {
    const r = await checkFreshness(async () => status(null), async () => {}, () => NOW);
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/^UNKNOWN twice/) });
  });

  it('runs under plain Node (no npm install in the apply step): the import graph loads with type stripping', () => {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', "import('./scripts/market-sync/stale.ts').then((m) => console.log(typeof m.checkFreshness))"], { cwd: `${import.meta.dirname}/..`, encoding: 'utf8' });
    expect(out.trim()).toBe('function');
  });
});
