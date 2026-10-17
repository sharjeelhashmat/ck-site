// Synthetic DLD-shaped CSV for the market tests: a few hundred rows, every value invented. Not real data.
import { DLD_TX_COLUMNS, DLD_TX_COLUMN_COUNT } from '../scripts/market-sync/dld';

const NAMED = Object.values(DLD_TX_COLUMNS) as string[];
export const HEADER_FIELDS = [...NAMED, ...Array.from({ length: DLD_TX_COLUMN_COUNT - NAMED.length }, (_, i) => `filler_${i + 1}`)];
export const csvLine = (fields: string[]) => `"${fields.join('","')}"`;
export const HEADER = csvLine(HEADER_FIELDS);

export interface Tx { worth: number; area: string; date: string; usage?: string; reg?: string; group?: string }

export function row(t: Tx): string {
  const by: Record<string, string> = {
    actual_worth: String(t.worth), area_name_en: t.area, instance_date: t.date, master_project_en: 'Synthetic Master',
    procedure_area: '100', property_usage_en: t.usage ?? 'Residential', reg_type_en: t.reg ?? 'Existing Properties', trans_group_en: t.group ?? 'Sales',
  };
  return csvLine(HEADER_FIELDS.map((h) => by[h] ?? 'x'));
}

/**
 * 2026-H1 vs 2025-H1, residential sales (AED):
 *   Alpha   2026: 6 x 50M = 300M (3 off-plan)   2025: 6 x 25M = 150M   -> +100%
 *   Beta    2026: 6 x 30M = 180M                 2025: 6 x 40M = 240M   -> -25%
 *   Gamma   2026: 6 x 20M = 120M                 2025: none             -> prior zero ("new this year")
 *   Delta   2026: 6 x 50M = 300M                 2025: 6 x 10M = 60M    -> +400% (shown as ≈5×)
 *   Area01..Area09: 2026: 6 x 1M each; 2025: 6 x 1M each                -> 0%
 * plus non-residential sales, mortgages and gifts that must not count as residential sales, rows before 2025,
 * and 2026-07..2026-10 rows so 2026-H1 is complete (as_of 2026-10-09).
 */
export function fixtureLines(): string[] {
  const out: string[] = [HEADER];
  const months = ['01', '02', '03', '04', '05', '06'];
  for (const m of months) {
    out.push(row({ worth: 50e6, area: 'Alpha', date: `2026-${m}-10`, reg: Number(m) % 2 ? 'Off-Plan Properties' : 'Existing Properties' }));
    out.push(row({ worth: 25e6, area: 'Alpha', date: `2025-${m}-10` }));
    out.push(row({ worth: 30e6, area: 'Beta', date: `2026-${m}-11` }));
    out.push(row({ worth: 40e6, area: 'Beta', date: `2025-${m}-11` }));
    out.push(row({ worth: 20e6, area: 'Gamma', date: `2026-${m}-12` }));
    out.push(row({ worth: 50e6, area: 'Delta', date: `2026-${m}-13` }));
    out.push(row({ worth: 10e6, area: 'Delta', date: `2025-${m}-13` }));
    for (let a = 1; a <= 9; a++) {
      const area = `Area${String(a).padStart(2, '0')}`;
      out.push(row({ worth: 1e6, area, date: `2026-${m}-15` }));
      out.push(row({ worth: 1e6, area, date: `2025-${m}-15` }));
      // Not residential sales: commercial sales, mortgages and gifts in the same area.
      out.push(row({ worth: 7e6, area, date: `2026-${m}-16`, usage: 'Commercial' }));
      out.push(row({ worth: 3e6, area, date: `2026-${m}-17`, group: 'Mortgages' }));
      out.push(row({ worth: 2e6, area, date: `2026-${m}-18`, group: 'Gifts' }));
    }
  }
  for (const d of ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-09']) out.push(row({ worth: 5e6, area: 'Alpha', date: d }));
  for (const d of ['2024-03-01', '2024-11-30']) out.push(row({ worth: 9e9, area: 'Alpha', date: d }));
  return out;
}
