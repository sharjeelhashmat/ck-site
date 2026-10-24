// Period parsing for the /market endpoints (audit item 9).
import { describe, expect, it } from 'vitest';
import { parsePeriod, priorPeriod } from '../src/market-core';

describe('parsePeriod', () => {
  it('accepts halves and quarters in the years 2000 to 2100', () => {
    expect(parsePeriod('2026-H1')).toEqual({ id: '2026-H1', firstMonth: '2026-01', lastMonth: '2026-06', endDate: '2026-06-30' });
    expect(parsePeriod('2024-Q1')?.endDate).toBe('2024-03-31');
    expect(parsePeriod('2000-H2')?.id).toBe('2000-H2');
    expect(parsePeriod('2100-Q4')?.endDate).toBe('2100-12-31');
  });

  it('refuses years outside 2000-2100 and anything that is not a period', () => {
    for (const id of ['1999-H1', '2101-H1', '0000-Q1', '9999-Q4', '2026-H3', '2026-h1', ' 2026-H1', '2026-H1 ', '', null]) {
      expect(parsePeriod(id)).toBeNull();
    }
  });

  it('the prior period is the same span a year earlier, also for 2000', () => {
    expect(priorPeriod(parsePeriod('2026-Q3')!).id).toBe('2025-Q3');
    expect(priorPeriod(parsePeriod('2000-H1')!)).toEqual({ id: '1999-H1', firstMonth: '1999-01', lastMonth: '1999-06', endDate: '1999-06-30' });
  });
});
