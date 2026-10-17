// The weekly gate (worker/scripts/market-sync/gate.ts): Monday 14:07 Dubai cutoff maths, the decision, and fail-open.
import { describe, expect, it } from 'vitest';
import { decide, parseStatus, readStatus, STATUS_URL, weeklyCutoff } from '../scripts/market-sync/gate';

// Monday 19 Oct 2026, 14:07 Dubai = 10:07 UTC. The Monday before is 12 Oct.
const MON = '2026-10-19T10:07:00.000Z';
const PREV_MON = '2026-10-12T10:07:00.000Z';
const at = (iso: string) => new Date(iso);
const status = (dld: string | null, adrec: string | null = dld) => ({ dld_synced_at: dld, adrec_synced_at: adrec });

describe('weekly cutoff: the most recent Monday 14:07 Dubai at or before now', () => {
  it('just before and just after Monday 14:07 Dubai', () => {
    expect(weeklyCutoff(at('2026-10-19T10:06:59.999Z')).toISOString()).toBe(PREV_MON);
    expect(weeklyCutoff(at('2026-10-19T10:07:00.000Z')).toISOString()).toBe(MON);
    expect(weeklyCutoff(at('2026-10-19T10:07:00.001Z')).toISOString()).toBe(MON);
  });

  it('Monday 14:06 Dubai, and the Monday 02:07 run, still belong to last week', () => {
    expect(weeklyCutoff(at('2026-10-19T10:06:00Z')).toISOString()).toBe(PREV_MON);
    expect(weeklyCutoff(at('2026-10-18T22:07:00Z')).toISOString()).toBe(PREV_MON); // Mon 02:07 Dubai, still Sunday in UTC
  });

  it('Sunday (in Dubai, and Sunday UTC that is already Monday in Dubai)', () => {
    expect(weeklyCutoff(at('2026-10-18T08:00:00Z')).toISOString()).toBe(PREV_MON); // Sun 12:00 Dubai
    expect(weeklyCutoff(at('2026-10-18T20:30:00Z')).toISOString()).toBe(PREV_MON); // Mon 00:30 Dubai
    expect(weeklyCutoff(at('2026-10-25T19:59:59Z')).toISOString()).toBe(MON); // Sun 23:59 Dubai, end of the week
  });

  it('Tuesday and later in the week, across a month end', () => {
    expect(weeklyCutoff(at('2026-10-20T10:07:00Z')).toISOString()).toBe(MON);
    expect(weeklyCutoff(at('2026-11-02T10:07:00Z')).toISOString()).toBe('2026-11-02T10:07:00.000Z');
    expect(weeklyCutoff(at('2026-11-01T12:00:00Z')).toISOString()).toBe('2026-10-26T10:07:00.000Z');
  });
});

describe('decision', () => {
  const sched = (now: string, s: ReturnType<typeof status> | null) => decide({ event: 'schedule', now: at(now), status: s });

  it('a week with a successful sync does not run again (every later 02:07 / 14:07 run that week is a no-op)', () => {
    const synced = status('2026-10-19T11:00:00.000Z'); // Mon 15:00 Dubai
    for (const now of ['2026-10-19T22:07:00Z', '2026-10-20T10:07:00Z', '2026-10-23T22:07:00Z', '2026-10-25T22:07:00Z', '2026-10-26T10:06:00Z']) {
      expect(sched(now, synced).run, now).toBe(false);
    }
    expect(sched('2026-10-26T10:07:00Z', synced).run).toBe(true); // the next Monday 14:07 Dubai
  });

  it('runs at Monday 14:07 Dubai, not at Monday 14:06 or on Sunday, when last week was synced', () => {
    const lastWeek = status('2026-10-12T11:00:00.000Z');
    expect(sched('2026-10-19T10:06:00Z', lastWeek).run).toBe(false);
    expect(sched('2026-10-18T08:00:00Z', lastWeek).run).toBe(false);
    expect(sched('2026-10-19T10:07:00Z', lastWeek).run).toBe(true);
  });

  it('Tuesday after a missed Monday (PC was off): runs, and keeps running every 12 hours until a sync lands', () => {
    const missed = status('2026-10-12T11:00:00.000Z');
    expect(sched('2026-10-19T22:07:00Z', missed).run).toBe(true); // Tue 02:07 Dubai
    expect(sched('2026-10-20T10:07:00Z', missed).run).toBe(true); // Tue 14:07 Dubai
    expect(sched('2026-10-24T22:07:00Z', missed).run).toBe(true); // Sun 02:07 Dubai
  });

  it('a sync exactly at the cutoff counts for that week', () => {
    expect(sched('2026-10-20T10:07:00Z', status(MON)).run).toBe(false);
  });

  it('never synced: runs', () => {
    expect(sched('2026-10-20T10:07:00Z', status(null, null)).run).toBe(true);
  });

  it('a manual run (workflow_dispatch) always runs, even after this week\'s sync', () => {
    expect(decide({ event: 'workflow_dispatch', now: at('2026-10-20T10:07:00Z'), status: status('2026-10-20T09:00:00.000Z') }).run).toBe(true);
  });

  it('status unreachable or invalid: runs (fail open)', () => {
    expect(sched('2026-10-20T10:07:00Z', null)).toEqual({ run: true, reason: '/market/status unreachable or invalid: running anyway (fail open)' });
  });
});

describe('reading /market/status', () => {
  const now = at('2026-10-20T10:07:00Z');
  it('reads the fixed production URL, never an input', async () => {
    expect(STATUS_URL).toBe('https://ck-lead-worker.sharjeelhashmat.workers.dev/market/status');
    let asked = '';
    await readStatus(async (u) => { asked = String(u); return new Response(JSON.stringify(status(null, null))); }, now);
    expect(asked).toBe(STATUS_URL);
  });

  it('endpoint down, HTTP error, non-JSON, wrong shape, extra keys or a future date: null (so the gate runs)', async () => {
    const res = (body: string, s = 200) => async () => new Response(body, { status: s });
    expect(await readStatus(async () => { throw new Error('ECONNREFUSED'); }, now)).toBeNull();
    expect(await readStatus(res('{}', 503), now)).toBeNull();
    expect(await readStatus(res('<html>'), now)).toBeNull();
    expect(await readStatus(res(JSON.stringify({ dld_synced_at: null })), now)).toBeNull();
    expect(await readStatus(res(JSON.stringify({ ...status(null), extra: 1 })), now)).toBeNull();
    expect(await readStatus(res(JSON.stringify(status('yesterday'))), now)).toBeNull();
    expect(await readStatus(res(JSON.stringify(status('2027-01-01T00:00:00.000Z'))), now)).toBeNull();
    expect(await readStatus(res(JSON.stringify(status('2026-10-19T11:00:00.000Z', null))), now)).toEqual(status('2026-10-19T11:00:00.000Z', null));
  });

  it('parseStatus accepts exactly the two keys, null or ISO instants', () => {
    expect(parseStatus(status(null, '2026-10-19T11:00:00Z'), now)).toEqual(status(null, '2026-10-19T11:00:00Z'));
    expect(parseStatus([], now)).toBeNull();
    expect(parseStatus(null, now)).toBeNull();
  });
});
