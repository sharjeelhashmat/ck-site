// PR 2c item 1f: outbox rows are purged after 730 days by the existing daily retention job, which records the count.
import { beforeEach, describe, expect, it } from 'vitest';
import { RETENTION_DAYS, runAndRecordRetention } from '../src/retention';
import { cf, rows } from './helpers';

const NOW = new Date('2026-10-17T01:17:00Z');
const daysAgo = (d: number, extraMs = 0) => new Date(NOW.getTime() - d * 86_400_000 - extraMs).toISOString();

beforeEach(async () => {
  for (const t of ['outbox', 'retention_runs']) await cf.DB.exec(`DELETE FROM ${t}`);
});

describe('outbox retention', () => {
  it('rows older than 730 days are deleted, newer ones kept; the run records the count', async () => {
    expect(RETENTION_DAYS.outbox).toBe(730);
    for (const [id, at] of [['o-old', daysAgo(730, 1)], ['o-new', daysAgo(729)]] as const) {
      await cf.DB.prepare("INSERT INTO outbox (id, dedupe_key, kind, created_at, status) VALUES (?1, ?1, 'lead_reply', ?2, 'sent')").bind(id, at).run();
    }
    const r = await runAndRecordRetention(cf.DB, NOW);
    expect(r.outbox).toBe(1);
    expect(await rows('SELECT id FROM outbox')).toEqual([{ id: 'o-new' }]);
    expect(await rows('SELECT outbox FROM retention_runs')).toEqual([{ outbox: 1 }]);
  });
});
