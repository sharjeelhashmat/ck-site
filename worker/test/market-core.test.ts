// Period parsing for the /market endpoints (audit item 9), and the Dubai year to date.
import { describe, expect, it } from 'vitest';
import { areaBodies, areasBody, lastCompleteMonth, parsePeriod, priorPeriod, YTD_ALIAS, ytdPeriod } from '../src/market-core';

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

describe('Dubai year to date (period=ytd)', () => {
  it('runs from 1 January to the last month fully covered by as_of, compared with the same months a year earlier', () => {
    expect(lastCompleteMonth('2026-10-31')).toBe('2026-10');
    expect(lastCompleteMonth('2026-10-30')).toBe('2026-09');
    expect(lastCompleteMonth('2026-11-02')).toBe('2026-10');
    expect(lastCompleteMonth('2028-02-29')).toBe('2028-02');
    expect(lastCompleteMonth('2026-02-28')).toBe('2026-02');
    expect(lastCompleteMonth('2028-02-28')).toBe('2028-01');
    expect(lastCompleteMonth('2027-01-15')).toBe('2026-12');
    expect(ytdPeriod('2026-10-31')).toEqual({ id: '2026-YTD10', firstMonth: '2026-01', lastMonth: '2026-10', endDate: '2026-10-31' });
    expect(ytdPeriod('2026-10-30').id).toBe('2026-YTD09');
    // Early January: the year to date is the whole previous year.
    expect(ytdPeriod('2027-01-15')).toEqual({ id: '2026-YTD12', firstMonth: '2026-01', lastMonth: '2026-12', endDate: '2026-12-31' });
    expect(priorPeriod(ytdPeriod('2026-11-02'))).toEqual({ id: '2025-YTD10', firstMonth: '2025-01', lastMonth: '2025-10', endDate: '2025-10-31' });
    // February in a leap year and the year before.
    expect(priorPeriod(parsePeriod('2028-YTD02')!).endDate).toBe('2027-02-28');
    expect(parsePeriod('2028-YTD02')!.endDate).toBe('2028-02-29');
  });

  it('parses only YYYY-YTD01 to YYYY-YTD12 in the year range; the alias is "ytd"', () => {
    expect(parsePeriod('2026-YTD10')).toEqual({ id: '2026-YTD10', firstMonth: '2026-01', lastMonth: '2026-10', endDate: '2026-10-31' });
    for (const id of ['2026-YTD', '2026-YTD0', '2026-YTD00', '2026-YTD13', '2026-YTD1', '2026-ytd10', '1999-YTD10', 'ytd', 'YTD']) expect(parsePeriod(id)).toBeNull();
    expect(YTD_ALIAS).toBe('ytd');
  });

  it('every body names its months explicitly, for the halves and quarters too', () => {
    const cur = [{ area_en: 'Alpha', value: 2e9, count: 2, offplan: 1 }];
    const prior = [{ area_en: 'Alpha', value: 1e9, count: 1, offplan: 0 }];
    const ytd = areasBody(parsePeriod('2026-YTD10')!, cur, prior, [], '2026-11-02') as Record<string, unknown>;
    expect([ytd.period, ytd.prior_period, ytd.first_month, ytd.last_month, ytd.prior_first_month, ytd.prior_last_month])
      .toEqual(['2026-YTD10', '2025-YTD10', '2026-01', '2026-10', '2025-01', '2025-10']);
    const h1 = areaBodies(parsePeriod('2026-H1')!, cur, prior, '2026-11-02').get('Alpha') as Record<string, unknown>;
    expect([h1.period, h1.first_month, h1.last_month, h1.prior_first_month, h1.prior_last_month]).toEqual(['2026-H1', '2026-01', '2026-06', '2025-01', '2025-06']);
  });
});
