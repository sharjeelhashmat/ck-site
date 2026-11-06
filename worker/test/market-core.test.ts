// Period parsing for the /market endpoints (audit item 9), and the Dubai year to date.
import { describe, expect, it } from 'vitest';
import { areaBodies, areasBody, bn, lastCompleteMonth, parsePeriod, priorPeriod, rankAreas, YTD_ALIAS, ytdPeriod } from '../src/market-core';

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

describe('prior_value_bn (paired-bar charts: the same area in the prior period)', () => {
  const sums = (area_en: string, value: number) => ({ area_en, value, count: 10, offplan: 5 });

  it('is the prior aggregate in AED bn, rounded exactly as value_bn; null when the prior value is 0 or missing', () => {
    const { areas } = rankAreas(
      [sums('Alpha', 3_456_789_012), sums('Beta', 1_234_567_890), sums('Gamma', 987_654_321), sums('Delta', 50_000_000)],
      [sums('Alpha', 2_345_678_901), sums('Beta', 0), sums('Delta', 7_000_000)],
    );
    const by = new Map(areas.map((a) => [a.area_en, a]));
    expect(by.get('Alpha')).toMatchObject({ value_bn: 3.46, prior_value_bn: 2.35, prior_zero: false });
    expect(by.get('Alpha')!.prior_value_bn).toBe(bn(2_345_678_901));
    expect(by.get('Beta')).toMatchObject({ prior_value_bn: null, change_pct: null, prior_zero: true }); // prior 0
    expect(by.get('Gamma')).toMatchObject({ prior_value_bn: null, change_pct: null, prior_zero: true }); // prior missing
    expect(by.get('Delta')).toMatchObject({ value_bn: 0.05, prior_value_bn: 0.01, prior_zero: false });
    // Null exactly when change_pct is null and prior_zero is true, for every row.
    for (const a of areas) expect(a.prior_value_bn === null).toBe(a.change_pct === null && a.prior_zero);
  });

  it('value_bn / prior_value_bn agrees with change_pct within rounding', () => {
    const current: { area_en: string; value: number; count: number; offplan: number }[] = [];
    const prior: typeof current = [];
    // Deterministic spread of values from 0.2 to 40 AED bn, rising and falling.
    for (let i = 0; i < 40; i++) {
      current.push(sums(`A${i}`, 2e8 + ((i * 7919) % 40) * 1e9 + i * 12_345_678));
      prior.push(sums(`A${i}`, 2e8 + ((i * 104729) % 40) * 1e9 + i * 98_765_432));
    }
    for (const a of rankAreas(current, prior).areas) {
      expect(a.prior_value_bn).not.toBeNull();
      const ratioPct = (a.value_bn / a.prior_value_bn! - 1) * 100;
      // value_bn and prior_value_bn are each within 0.005 bn of the exact values; change_pct is within 0.05 points.
      const v = a.value_bn, pv = a.prior_value_bn!;
      const bound = (((v + 0.005) / (pv - 0.005)) - (v - 0.005) / (pv + 0.005)) * 100 / 2 + 0.05;
      expect(Math.abs(ratioPct - a.change_pct!), a.area_en).toBeLessThanOrEqual(bound);
    }
  });

  it('appears in top8 of the areas body and in area of every area body; existing fields unchanged', () => {
    const cur = [sums('Alpha', 2e9), sums('Beta', 1e9)];
    const prior = [sums('Alpha', 1e9)];
    const body = areasBody(parsePeriod('2026-H1')!, cur, prior, [], '2026-11-02') as { dubai: { top8: Record<string, unknown>[] } };
    expect(body.dubai.top8[0]).toEqual({ rank: 1, area_en: 'Alpha', label: null, value_bn: 2, share_pct: 66.7, change_pct: 100, prior_zero: false, offplan_pct: 50, prior_value_bn: 1 });
    expect(body.dubai.top8[1]).toMatchObject({ area_en: 'Beta', prior_value_bn: null, change_pct: null, prior_zero: true });
    const bodies = areaBodies(parsePeriod('2026-YTD10')!, cur, prior, '2026-11-02');
    expect((bodies.get('Alpha') as { area: Record<string, unknown> }).area.prior_value_bn).toBe(1);
    expect((bodies.get('Beta') as { area: Record<string, unknown> }).area.prior_value_bn).toBeNull();
  });
});
