// Market-data sync (worker/scripts/market-sync): the RFC 4180 parser, filters, aggregation, the per-file sanity guard, the
// dld -> apply artifact (validated as untrusted input), SQL generation run against the real migrations in an in-memory
// SQLite, and the no-secret / no-signed-URL logging rule.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { buildArtifact, validateArtifact } from '../scripts/market-sync/artifact';
import { badRowsProblem, CsvParser, DLD_TX_COLUMNS, DldProjectsAggregator, DldTxAggregator, isoDate, parseAdrec, parseCsv, safeUrl } from '../scripts/market-sync/dld';
import { buildSql, checkSql } from '../scripts/market-sync/sql';
import { assertDownloadUrl, DLD_DOWNLOAD_TIMEOUT_MS, readDld, runApply, runDld, streamRecords, type Ctx } from '../scripts/market-sync/sync';
import { csvLine, fixtureLines, HEADER, row } from './market-fixture';

const TODAY = '2026-10-16';
const NOW = new Date('2026-10-16T02:23:00Z'); // 06:23 Dubai
const migrations = join(import.meta.dirname, '../migrations');

function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql')).sort()) d.exec(readFileSync(join(migrations, f), 'utf8'));
  return d;
}

function aggregate(lines = fixtureLines(), eol = '\n') {
  const a = new DldTxAggregator(TODAY);
  for (const r of parseCsv(lines.join(eol))) a.record(r);
  return a;
}

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function sqlFor(a: DldTxAggregator, over: Partial<Parameters<typeof buildSql>[0]> = {}) {
  return buildSql({
    runId: uuid(), startedAt: '2026-10-16T02:23:00.000Z', finishedAt: '2026-10-16T02:30:00.000Z',
    dld: { rowsTotal: a.rowsTotal, rowsBad: a.rowsBad, asOf: a.asOf, areaMonths: a.areaMonths(), monthTotals: a.monthTotals() },
    rowsTotal: a.rowsTotal, rowsBad: a.rowsBad, projects: null, adrec: null, errors: [], uuid, ...over,
  });
}

// The real projects line shape the Coordinator saw on 2026-10-16 (Arabic replaced by "AR"): 38 fields, empty fields
// unquoted, a comma inside a quoted description. The header is synthetic: only the four column names the sync reads are
// real, at the positions this line implies; project and developer name columns are included to prove they are ignored.
const PROJECT_LINE = '"445","AR AR AR","Jabal Ali First",,,"7904755","AR","951","16","AR","121","AR","121","AR","Al Furjan","1","0","85","0","90.60000","AR","1","N/A","G+1P+10+R,Residential.The project designed.",,"529545309","AR AR 5","2744","2023-07-10","ACTIVE","AR","AR","1","950095296","AR","Trakhees","4","2026-06-15 15:24:01.000"';
const PROJECT_HEADER = Array.from({ length: 38 }, (_, i) => `col_${i}`);
Object.assign(PROJECT_HEADER, { 1: 'project_name', 2: 'area_name_en', 6: 'developer_name', 27: 'no_of_units', 28: 'project_start_date', 29: 'project_status', 37: 'load_timestamp' });
const projectLine = (status: string, start: string, area: string, units: string, loaded = '2026-06-15 15:24:01.000') =>
  PROJECT_LINE.replace('"Jabal Ali First"', `"${area}"`).replace('"2744"', `"${units}"`).replace('"2023-07-10"', `"${start}"`).replace('"ACTIVE"', `"${status}"`).replace('"2026-06-15 15:24:01.000"', `"${loaded}"`);

describe('RFC 4180 parser', () => {
  it('quoted and unquoted fields, empty unquoted fields, commas and doubled quotes inside quotes', () => {
    expect(parseCsv('"a","b, with comma",,"say ""hi""",plain,""\n')).toEqual([['a', 'b, with comma', '', 'say "hi"', 'plain', '']]);
    expect(parseCsv('a,,b\n,,\n')).toEqual([['a', '', 'b'], ['', '', '']]);
  });

  it('CRLF and LF line ends, a newline inside a quoted field, no final line end, blank lines skipped', () => {
    expect(parseCsv('"x","line1\r\nline2"\r\n"y","z"\r\n\r\nlast,row')).toEqual([['x', 'line1\r\nline2'], ['y', 'z'], ['last', 'row']]);
  });

  it('the real projects line shape: 38 fields, the quoted comma does not split', () => {
    const [r] = parseCsv(PROJECT_LINE);
    expect(r).toHaveLength(38);
    expect(r![3]).toBe('');
    expect(r![23]).toBe('G+1P+10+R,Residential.The project designed.');
    expect(r![28]).toBe('2023-07-10');
    expect(r![29]).toBe('ACTIVE');
  });

  it('stray quotes make one malformed record and parsing resumes on the next line', () => {
    expect(parseCsv('ab"c,d\n"ok",1\n"x"y,2\n"unterminated')).toEqual([null, ['ok', '1'], null, null]);
  });

  it('streams: the same records whatever the chunk boundaries (inside quotes, on "", on CRLF)', () => {
    const text = `${HEADER}\r\n${fixtureLines().slice(1, 40).join('\r\n')}\r\n"q","a ""b"" c","x\r\ny"\r\n`;
    const whole = parseCsv(text);
    for (const size of [1, 2, 3, 7, 64]) {
      const out: (string[] | null)[] = [];
      const p = new CsvParser((r) => out.push(r));
      for (let i = 0; i < text.length; i += size) p.feed(text.slice(i, i + size));
      p.end();
      expect(out).toEqual(whole);
    }
  });

  it('a byte-order mark before the header is dropped', () => {
    expect(parseCsv('﻿"area_name_en"\n')).toEqual([['area_name_en']]);
  });
});

describe('transactions', () => {
  it('reads the columns by name from the header (one constant), in any order', () => {
    expect(Object.values(DLD_TX_COLUMNS)).toEqual(['actual_worth', 'area_name_en', 'instance_date', 'master_project_en', 'procedure_area', 'property_usage_en', 'reg_type_en', 'trans_group_en']);
    expect(() => new DldTxAggregator(TODAY).record(['actual_worth', 'instance_date'])).toThrow(/area_name_en/);
  });

  it('counts records whose column count is not 47 (or that are malformed) as bad and skips them', () => {
    const a = aggregate([HEADER, row({ worth: 1e6, area: 'A', date: '2026-01-02' }), '"too","few"', 'x"y,z', row({ worth: 2e6, area: 'A', date: '2026-01-03' })]);
    expect(a.rowsTotal).toBe(4);
    expect(a.rowsBad).toBe(2);
    expect(a.areaMonths()).toEqual([{ area_en: 'A', month: '2026-01', res_sales_value: 3e6, res_sales_count: 2, res_offplan_count: 0 }]);
  });

  it('accepts unquoted and empty unquoted fields in the transactions file too', () => {
    const unquoted = row({ worth: 5e5, area: 'B', date: '2026-02-02' }).replace(/"x"/g, '').replace(/"/g, '');
    const a = aggregate([HEADER, unquoted]);
    expect(a.rowsBad).toBe(0);
    expect(a.areaMonths()[0]).toMatchObject({ area_en: 'B', res_sales_value: 5e5 });
  });

  it('a header at the top of every CSV part; CRLF files', () => {
    const a = aggregate([HEADER, row({ worth: 1, area: 'A', date: '2026-01-02' }), HEADER, row({ worth: 1, area: 'A', date: '2026-01-03' })], '\r\n');
    expect(a.rowsTotal).toBe(2);
    expect(a.rowsBad).toBe(0);
  });

  it('dates: ISO, DD-MM-YYYY and DD/MM/YYYY', () => {
    expect(isoDate('2026-03-04 00:00:00')).toBe('2026-03-04');
    expect(isoDate('04-03-2026')).toBe('2026-03-04');
    expect(isoDate('04/03/2026')).toBe('2026-03-04');
    expect(isoDate('nope')).toBeNull();
  });

  const a = aggregate();
  const am = a.areaMonths();
  const sum = (area: string, from: string, to: string) => am.filter((r) => r.area_en === area && r.month >= from && r.month <= to).reduce((s, r) => s + r.res_sales_value, 0);

  it('meta: rows_total counts every data row; as_of is the latest instance_date', () => {
    expect(a.rowsTotal).toBe(fixtureLines().length - 1);
    expect(a.rowsBad).toBe(0);
    expect(a.asOf).toBe('2026-10-09');
  });

  it('residential-sales filter: only Sales + Residential reach dld_area_month; rows before 2025 are dropped', () => {
    expect(sum('Area01', '2026-01', '2026-06')).toBe(6e6);
    expect(sum('Alpha', '2024-01', '2024-12')).toBe(0);
    expect(am.every((r) => r.month >= '2025-01')).toBe(true);
  });

  it('area-month aggregation: value, count and off-plan count', () => {
    expect(sum('Alpha', '2026-01', '2026-06')).toBe(300e6);
    expect(sum('Alpha', '2025-01', '2025-06')).toBe(150e6);
    const alphaH1 = am.filter((r) => r.area_en === 'Alpha' && r.month <= '2026-06' && r.month >= '2026-01');
    expect(alphaH1.reduce((s, r) => s + r.res_sales_count, 0)).toBe(6);
    expect(alphaH1.reduce((s, r) => s + r.res_offplan_count, 0)).toBe(3);
  });

  it('month totals: every trans_group_en, all usages', () => {
    const by = Object.fromEntries(a.monthTotals().filter((t) => t.month === '2026-01').map((t) => [t.trans_group, t]));
    expect(Object.keys(by).sort()).toEqual(['Gifts', 'Mortgages', 'Sales']);
    // Sales: Alpha 50 + Beta 30 + Gamma 20 + Delta 50 + 9 x (1 residential + 7 commercial) = 222M.
    expect(by.Sales!.value).toBe(222e6);
    expect(by.Mortgages!.value).toBe(27e6);
    expect(by.Gifts!.value).toBe(18e6);
  });
});

describe('projects', () => {
  it('counts new projects (90 days), top 5 areas (ties by name), ACTIVE-only projects and units; keeps no names', () => {
    const p = new DldProjectsAggregator(TODAY);
    const L = `${TODAY} 02:00:00.000`; // a file loaded today: the 90 days end today
    for (const r of parseCsv([csvLine(PROJECT_HEADER), projectLine('ACTIVE', '2026-10-01', 'Zeta', '100', L), projectLine('ACTIVE', '2026-09-01', 'Alpha', '50', L),
      projectLine('FINISHED', '2026-08-01', 'Alpha', '10', L), projectLine('PENDING', '2026-09-02', 'Beta', '7', L), projectLine('CONDITIONAL_ACTIVATING', '2026-01-01', 'Beta', '7', L),
      projectLine('ACTIVE', '2026-08-17', 'Zeta', '3', L), projectLine('ACTIVE', '2026-07-18', 'Old', '1', L)].join('\r\n'))) p.record(r);
    expect(p.rowsBad).toBe(0);
    const s = p.stats();
    expect(s).toEqual({
      new_projects_90d: 5,
      top_areas_90d: [{ area_en: 'Alpha', count: 2 }, { area_en: 'Zeta', count: 2 }, { area_en: 'Beta', count: 1 }],
      active_projects: 4, pipeline_units: 154, as_of: TODAY,
    });
    expect(JSON.stringify(s)).not.toMatch(/AR|Furjan|Trakhees/);
  });

  it('as_of is the latest load_timestamp, not the run date; the 90 days end at as_of', () => {
    // The real case (2026-10-17): every row loaded in 2026-06, so the data is as of June, whatever day the sync runs.
    const p = new DldProjectsAggregator(TODAY);
    for (const r of parseCsv([csvLine(PROJECT_HEADER),
      projectLine('ACTIVE', '2026-06-01', 'Alpha', '10', '2026-06-15 15:24:01.000'),
      projectLine('ACTIVE', '2026-03-23', 'Beta', '10', '2026-06-20 09:00:00.000'), // 89 days before as_of: in
      projectLine('ACTIVE', '2026-03-22', 'Gamma', '10', '2026-06-01 09:00:00.000'), // 90 days before as_of: out
      projectLine('ACTIVE', '2026-07-01', 'Delta', '10', '2026-06-02 09:00:00.000'), // after as_of: out
    ].join('\r\n'))) p.record(r);
    expect(p.stats()).toMatchObject({ as_of: '2026-06-20', new_projects_90d: 2, top_areas_90d: [{ area_en: 'Alpha', count: 1 }, { area_en: 'Beta', count: 1 }], active_projects: 4 });
  });

  it('without load_timestamp (column or values), as_of is the latest project_start_date up to today; future dates ignored', () => {
    const noCol = PROJECT_HEADER.map((c) => (c === 'load_timestamp' ? 'col_37' : c));
    const a = new DldProjectsAggregator(TODAY);
    for (const r of parseCsv([csvLine(noCol), projectLine('ACTIVE', '2026-07-01', 'Alpha', '1'), projectLine('ACTIVE', '2026-04-10', 'Beta', '1'), projectLine('PENDING', '2027-01-01', 'Gamma', '1')].join('\r\n'))) a.record(r);
    expect(a.stats()).toMatchObject({ as_of: '2026-07-01', new_projects_90d: 2 });
    const b = new DldProjectsAggregator(TODAY);
    for (const r of parseCsv([csvLine(PROJECT_HEADER), projectLine('ACTIVE', '2026-05-05', 'Alpha', '1', ''), projectLine('ACTIVE', '2026-05-01', 'Beta', '1', '2027-02-01 00:00:00.000')].join('\r\n'))) b.record(r);
    expect(b.stats().as_of).toBe('2026-05-05');
  });

  it('a file with no usable date fails rather than taking the run date', () => {
    const p = new DldProjectsAggregator(TODAY);
    for (const r of parseCsv([csvLine(PROJECT_HEADER), projectLine('ACTIVE', '', 'Alpha', '1', '')].join('\r\n'))) p.record(r);
    expect(() => p.stats()).toThrow(/no load_timestamp or project_start_date to date the file/);
  });

  it('the old split on "," would have marked the real line bad; the parser does not', () => {
    const p = new DldProjectsAggregator(TODAY);
    for (const r of parseCsv(`${csvLine(PROJECT_HEADER)}\n${PROJECT_LINE}\n`)) p.record(r);
    expect([p.rowsTotal, p.rowsBad]).toEqual([1, 0]);
    expect(PROJECT_LINE.slice(1, -1).split('","').length).not.toBe(38);
  });

  it('a missing confirmed column fails with its name', () => {
    expect(() => new DldProjectsAggregator(TODAY).record(['project_status', 'area_name_en'])).toThrow(/project_start_date, no_of_units/);
  });
});

describe('sanity guard', () => {
  it('per file: more than 1% bad rows, or no rows, blocks that file', () => {
    expect(badRowsProblem('dld_projects', 1000, 10)).toBeNull();
    expect(badRowsProblem('dld_projects', 1000, 11)).toMatch(/dld_projects: 11 bad rows of 1000 \(over 1%\)/);
    expect(badRowsProblem('dld_transactions', 0, 0)).toMatch(/no rows/);
  });

  it('rows_total below 90% of the previous run: DLD tables keep the previous data, run is not ok, events row written', () => {
    const d = db();
    d.exec(sqlFor(aggregate()));
    const before = d.prepare('SELECT COUNT(*) AS c, SUM(res_sales_value) AS v FROM dld_area_month').get();
    d.exec(sqlFor(aggregate(fixtureLines().slice(0, 150))));
    expect(d.prepare('SELECT COUNT(*) AS c, SUM(res_sales_value) AS v FROM dld_area_month').get()).toEqual(before);
    const runs = d.prepare('SELECT ok, dld_written, error FROM market_sync_runs ORDER BY rowid').all() as { ok: number; dld_written: number; error: string | null }[];
    expect(runs.map((r) => [r.ok, r.dld_written])).toEqual([[1, 1], [0, 0]]);
    expect(runs[1]!.error).toMatch(/below 90% of the previous run/);
    expect(d.prepare("SELECT COUNT(*) AS c FROM events WHERE type = 'market_sync_failed'").get()).toEqual({ c: 1 });
  });

  it('rows_total at or above 90% replaces the DLD tables in full (DELETE + INSERT)', () => {
    const d = db();
    d.exec(sqlFor(aggregate()));
    d.exec(sqlFor(aggregate(fixtureLines().filter((l) => !l.includes('"Gamma"')))));
    expect(d.prepare("SELECT COUNT(*) AS c FROM dld_area_month WHERE area_en = 'Gamma'").get()).toEqual({ c: 0 });
    expect(d.prepare("SELECT COUNT(*) AS c FROM events WHERE type = 'market_sync_failed'").get()).toEqual({ c: 0 });
  });
});

// ---- dld -> apply artifact ----

function artifactFrom(a: DldTxAggregator, over: Record<string, unknown> = {}) {
  const art = buildArtifact({
    today: TODAY, now: NOW,
    tx: { ok: true, rowsTotal: a.rowsTotal, rowsBad: a.rowsBad, asOf: a.asOf, parts: 2, areaMonths: a.areaMonths(), monthTotals: a.monthTotals() },
    projects: { ok: true, rowsTotal: 3040, rowsBad: 0, columns: PROJECT_HEADER, stats: { new_projects_90d: 12, top_areas_90d: [{ area_en: 'Palm Deira', count: 4 }], active_projects: 612, pipeline_units: 52000, as_of: TODAY } },
  });
  return JSON.parse(JSON.stringify({ ...art, ...over }));
}

describe('artifact: built on the UAE runner, validated as untrusted on the apply side', () => {
  it('a good artifact round-trips to the same aggregates', () => {
    const a = aggregate();
    const v = validateArtifact(artifactFrom(a), TODAY);
    expect(v.errors).toEqual([]);
    expect(v.tx!.areaMonths).toEqual(a.areaMonths());
    expect(v.tx!.monthTotals).toEqual(a.monthTotals());
    expect(v.projects!.active_projects).toBe(612);
    expect(v.projectsColumns).toEqual(PROJECT_HEADER);
  });

  it('carries no raw rows, names or URLs', () => {
    const s = JSON.stringify(artifactFrom(aggregate()));
    expect(s).not.toMatch(/Synthetic Master|https?:|instance_date/);
  });

  const reject = (mutate: (x: any) => void, why: RegExp) => {
    const x = artifactFrom(aggregate());
    mutate(x);
    const v = validateArtifact(x, TODAY);
    expect(v.tx).toBeNull();
    expect(v.projects).toBeNull();
    expect(v.errors.join()).toMatch(why);
  };

  it('rejects wrong types, ranges, lengths, character sets, duplicates and unexpected keys', () => {
    reject((x) => { x.v = 2; }, /version/);
    reject((x) => { x.extra = 1; }, /unexpected key/);
    reject((x) => { x.today = '2026-10-10'; }, /today/);
    reject((x) => { x.tx.rows_total = -1; }, /tx\.rows_total/);
    reject((x) => { x.tx.rows_bad = x.tx.rows_total + 1; }, /tx\.rows_bad/);
    reject((x) => { x.tx.as_of = '2026-10-17'; }, /tx\.as_of/);
    reject((x) => { x.tx.area_months[0][0] = "Area'); DROP TABLE leads;--"; }, /area_months\[0\]\.area/);
    reject((x) => { x.tx.area_months[0][0] = 'A'.repeat(81); }, /area_months\[0\]\.area/);
    reject((x) => { x.tx.area_months[0][0] = '<script>'; }, /area_months\[0\]\.area/);
    reject((x) => { x.tx.area_months[0][2] = 'NaN'; }, /area_months\[0\]\.value/);
    reject((x) => { x.tx.area_months[0][2] = 1e14; }, /area_months\[0\]\.value/);
    reject((x) => { x.tx.area_months[0][4] = x.tx.area_months[0][3] + 1; }, /offplan/);
    reject((x) => { x.tx.area_months[0][1] = '2026-13'; }, /month/);
    reject((x) => { x.tx.area_months[0][1] = '2024-12'; }, /out of range/);
    reject((x) => { x.tx.area_months.push(x.tx.area_months[0]); }, /duplicate/);
    reject((x) => { x.tx.month_totals[0][1] = 'Sales<b>'; }, /month_totals\[0\]\.group/);
    reject((x) => { x.projects.stats.top_areas_90d.push(...Array(5).fill({ area_en: 'X', count: 1 })); }, /top_areas_90d/);
    reject((x) => { x.projects.stats.project_name = 'Secret Tower'; }, /unexpected key/);
    reject((x) => { x.projects.columns = ['ok', 'bad;column']; }, /projects\.columns\[1\]/);
  });

  it('re-applies the 1% bad-row guard per file instead of trusting the producer', () => {
    const x = artifactFrom(aggregate());
    x.tx.rows_bad = Math.floor(x.tx.rows_total * 0.02);
    x.projects.rows_bad = 100;
    const v = validateArtifact(x, TODAY);
    expect(v.tx).toBeNull();
    expect(v.projects).toBeNull();
    expect(v.errors.join(' | ')).toMatch(/dld_transactions: \d+ bad rows of \d+ \(over 1%\) \| dld_projects: 100 bad rows of 3040 \(over 1%\)/);
  });

  it('a failure reported by the dld job is recorded (cleaned: no URLs, ASCII, one line)', () => {
    const x = artifactFrom(aggregate());
    x.tx = { ok: false, rows_total: 0, rows_bad: 0, error: 'listing https://data.dubai/o/x?sig=SECRET returned HTTP 403\nRequest Rejected' };
    const v = validateArtifact(x, TODAY);
    expect(v.tx).toBeNull();
    expect(v.errors[0]).toBe('dld job: listing data.dubai/o/x returned HTTP 403 Request Rejected');
  });

  it('classification: success -> validated; not success and never started -> waiting; not success after starting -> failure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ck-dld-'));
    const ok = join(dir, 'ok.json');
    writeFileSync(ok, JSON.stringify(artifactFrom(aggregate())));
    // success: the artifact is read and validated (started is always true then; it is not needed).
    const good = readDld(ok, 'success', 'true', TODAY);
    expect([good.errors, good.waiting, good.tx !== null]).toEqual([[], undefined, true]);
    // Never reached the PC: waiting, whatever GitHub reports for an expired or skipped queued job.
    for (const result of ['cancelled', 'skipped', 'failure', '']) {
      const w = readDld(ok, result, '', TODAY);
      expect([w.waiting, w.errors, w.tx], result).toEqual([true, [], null]);
    }
    // Started on the PC, then did not succeed: a failure.
    for (const result of ['failure', 'cancelled']) {
      const f = readDld(ok, result, 'true', TODAY);
      expect([f.waiting, f.tx, f.errors], result).toEqual([undefined, null, [`dld job: ${result} after starting on the UAE runner`]]);
    }
    expect(readDld(ok, 'odd', 'true', TODAY).errors[0]).toMatch(/unknown result after starting/);
  });

  it('apply side: a missing, oversized or non-JSON artifact after a successful dld job is a failure with the reason', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ck-dld-'));
    expect(readDld(join(dir, 'missing.json'), 'success', 'true', TODAY).errors[0]).toMatch(/no artifact/);
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{not json');
    expect(readDld(bad, 'success', 'true', TODAY).errors[0]).toMatch(/not JSON/);
    const big = join(dir, 'big.json');
    writeFileSync(big, ' '.repeat(10 * 1024 * 1024 + 1));
    expect(readDld(big, 'success', 'true', TODAY).errors[0]).toMatch(/too large/);
  });
});

describe('SQL generation', () => {
  it('quotes values, writes a run row, and the check passes only for an ok run', () => {
    const d = db();
    const a = aggregate([HEADER, row({ worth: 1e6, area: "O'Neil Area", date: '2026-02-01' })]);
    d.exec(sqlFor(a, { runId: 'run-ok' }));
    expect(d.prepare('SELECT area_en FROM dld_area_month').all()).toEqual([{ area_en: "O'Neil Area" }]);
    d.exec(checkSql('run-ok', '2026-10-16T02:31:00Z'));
    expect(() => d.exec(checkSql('missing-run', '2026-10-16T02:31:00Z'))).toThrow(/CHECK constraint/);
  });

  it('dld job failed after starting on the PC: ADREC is still written, a failure row and event are recorded, Dubai keeps its last data, the check fails', async () => {
    const d = db();
    d.exec(sqlFor(aggregate()));
    const count = d.prepare('SELECT COUNT(*) AS c FROM dld_area_month').get();
    const adrecFeed = [{ transactionValueYtdAed: 117e9, saleValueYtdAed: 86.1e9, mortgageValueYtdAed: 25.5e9, fdiValueYtdAed: 1 }];
    const ctx: Ctx = { fetch: async () => new Response(JSON.stringify(adrecFeed)), log: () => {}, now: () => NOW, uuid };
    const r = await runApply(ctx, readDld('nope.json', 'failure', 'true', TODAY));
    d.exec(r.sql);
    expect(d.prepare('SELECT COUNT(*) AS c FROM dld_area_month').get()).toEqual(count);
    expect(d.prepare("SELECT COUNT(*) AS c FROM market_stats WHERE source = 'adrec_ytd'").get()).toEqual({ c: 1 });
    expect(d.prepare('SELECT ok, dld_written, dld_status, error FROM market_sync_runs WHERE run_id = ?').get(r.runId)).toEqual({ ok: 0, dld_written: 0, dld_status: 'failed', error: 'dld job: failure after starting on the UAE runner' });
    expect(d.prepare("SELECT COUNT(*) AS c FROM events WHERE type = 'market_sync_failed'").get()).toEqual({ c: 1 });
    expect(() => d.exec(checkSql(r.runId, 'now'))).toThrow(/CHECK constraint/);
  });

  for (const result of ['cancelled', 'skipped', 'failure']) {
    it(`dld job ${result} without ever starting (UAE PC offline, queue expired): ADREC written, DLD "waiting_for_runner", no failure, the check passes`, async () => {
      const d = db();
      d.exec(sqlFor(aggregate()));
      const count = d.prepare('SELECT COUNT(*) AS c FROM dld_area_month').get();
      const adrecFeed = [{ transactionValueYtdAed: 117e9, saleValueYtdAed: 86.1e9, mortgageValueYtdAed: 25.5e9 }];
      const ctx: Ctx = { fetch: async () => new Response(JSON.stringify(adrecFeed)), log: () => {}, now: () => NOW, uuid };
      const r = await runApply(ctx, readDld('market-dld.json', result, '', TODAY));
      expect(r.summary.errors).toBe('none');
      d.exec(r.sql);
      expect(d.prepare('SELECT ok, dld_written, dld_status, adrec_ok, error FROM market_sync_runs WHERE run_id = ?').get(r.runId))
        .toEqual({ ok: 1, dld_written: 0, dld_status: 'waiting_for_runner', adrec_ok: 1, error: null });
      expect(d.prepare('SELECT COUNT(*) AS c FROM dld_area_month').get()).toEqual(count);
      expect(d.prepare("SELECT COUNT(*) AS c FROM market_stats WHERE source = 'adrec_ytd'").get()).toEqual({ c: 1 });
      expect(d.prepare("SELECT COUNT(*) AS c FROM events WHERE type = 'market_sync_failed'").get()).toEqual({ c: 0 });
      d.exec(checkSql(r.runId, 'now')); // passes: no email for an offline PC
    });
  }

  it('dld job cancelled but ADREC down: that is a failure, the check fails', async () => {
    const d = db();
    const ctx: Ctx = { fetch: async () => new Response('', { status: 503 }), log: () => {}, now: () => NOW, uuid };
    const r = await runApply(ctx, readDld('market-dld.json', 'cancelled', '', TODAY));
    d.exec(r.sql);
    expect(d.prepare('SELECT ok, dld_status, adrec_ok FROM market_sync_runs WHERE run_id = ?').get(r.runId)).toEqual({ ok: 0, dld_status: 'waiting_for_runner', adrec_ok: 0 });
    expect(() => d.exec(checkSql(r.runId, 'now'))).toThrow(/CHECK constraint/);
  });

  it('an artifact that fails validation is a failure (dld_status failed), the check fails', async () => {
    const d = db();
    const dir = mkdtempSync(join(tmpdir(), 'ck-dld-'));
    const f = join(dir, 'a.json');
    const bad = artifactFrom(aggregate());
    bad.tx.area_months[0][0] = '<bad>';
    writeFileSync(f, JSON.stringify(bad));
    const ctx: Ctx = { fetch: async () => new Response(JSON.stringify([{ transactionValueYtdAed: 1, saleValueYtdAed: 1, mortgageValueYtdAed: 1 }])), log: () => {}, now: () => NOW, uuid };
    const r = await runApply(ctx, readDld(f, 'success', 'true', TODAY));
    d.exec(r.sql);
    expect(d.prepare('SELECT ok, dld_status FROM market_sync_runs WHERE run_id = ?').get(r.runId)).toEqual({ ok: 0, dld_status: 'failed' });
    expect(() => d.exec(checkSql(r.runId, 'now'))).toThrow(/CHECK constraint/);
  });

  it('a good artifact plus ADREC: everything written, ok run, the check passes', async () => {
    const d = db();
    const dir = mkdtempSync(join(tmpdir(), 'ck-dld-'));
    const f = join(dir, 'a.json');
    writeFileSync(f, JSON.stringify(artifactFrom(aggregate())));
    const adrecFeed = [{ transactionValueYtdAed: 117e9, saleValueYtdAed: 86.1e9, mortgageValueYtdAed: 25.5e9 }];
    const ctx: Ctx = { fetch: async () => new Response(JSON.stringify(adrecFeed)), log: () => {}, now: () => NOW, uuid };
    const r = await runApply(ctx, readDld(f, 'success', 'true', TODAY));
    expect(r.summary.errors).toBe('none');
    d.exec(r.sql);
    expect(d.prepare('SELECT ok, dld_written, dld_status, adrec_ok, as_of FROM market_sync_runs WHERE run_id = ?').get(r.runId)).toEqual({ ok: 1, dld_written: 1, dld_status: 'written', adrec_ok: 1, as_of: '2026-10-09' });
    expect(d.prepare("SELECT COUNT(*) AS c FROM market_stats").get()).toEqual({ c: 2 });
    d.exec(checkSql(r.runId, 'now'));
  });

  it('ADREC figures are stored only when they differ from the last stored ones', () => {
    const d = db();
    const adrec = { transaction_value_aed: 100e9, sales_value_aed: 70e9, mortgage_value_aed: 30e9, year: 2026 };
    const a = aggregate();
    d.exec(sqlFor(a, { adrec }));
    d.exec(sqlFor(a, { adrec, finishedAt: '2026-10-17T02:30:00.000Z' }));
    expect(d.prepare("SELECT COUNT(*) AS c FROM market_stats WHERE source = 'adrec_ytd'").get()).toEqual({ c: 1 });
    d.exec(sqlFor(a, { adrec: { ...adrec, sales_value_aed: 71e9 }, finishedAt: '2026-10-18T02:30:00.000Z' }));
    expect(d.prepare("SELECT as_of FROM market_stats WHERE source = 'adrec_ytd' ORDER BY fetched_at").all()).toEqual([{ as_of: '2026-10-16' }, { as_of: '2026-10-18' }]);
  });

  it('stores no raw rows and no project or developer names', () => {
    expect(sqlFor(aggregate())).not.toMatch(/Synthetic Master|instance_date|actual_worth/);
  });
});

describe('ADREC parsing and logging', () => {
  it('ADREC feed: reads transaction, sales and mortgage value; rejects a changed shape', () => {
    expect(parseAdrec([{ transactionValueYtdAed: 1e11, saleValueYtdAed: '7e10', mortgageValueYtdAed: 3e10, fdiValueYtdAed: 1 }], 2026))
      .toEqual({ transaction_value_aed: 1e11, sales_value_aed: 7e10, mortgage_value_aed: 3e10, year: 2026 });
    expect(() => parseAdrec({}, 2026)).toThrow(/shape/);
    expect(() => parseAdrec([{ transactionValueYtdAed: 0 }], 2026)).toThrow(/transactionValueYtdAed/);
  });

  it('dld job logs host and path only: no signed URL, query string or secret in logs, summary or artifact', async () => {
    const SIGNED = 'https://cdn.data.dubai/files/part-1.csv?X-Amz-Signature=SIGNATURE-SECRET&X-Amz-Credential=CRED-SECRET';
    process.env.CLOUDFLARE_API_TOKEN = 'TOKEN-SECRET';
    const logs: string[] = [];
    const listing = (name: string) => new Response(JSON.stringify({ data: { metadata: [{ files: [{ file_extension: 'csv', file_name: name, file_size: 1e6, file_url: SIGNED }] }] } }));
    let projects = false;
    const fake: typeof fetch = async (input) => {
      const u = String(input);
      if (u.includes('datasetId=470061')) return listing('tx-1.csv');
      if (u.includes('datasetId=467654')) { projects = true; return listing('projects.csv'); }
      if (u.startsWith('https://cdn.data.dubai/')) {
        return projects ? new Response(`${csvLine(PROJECT_HEADER)}\r\n${PROJECT_LINE}\r\n`) : new Response(fixtureLines().join('\r\n'));
      }
      return new Response('{}', { status: 500 });
    };
    const ctx: Ctx = { fetch: fake, log: (s) => logs.push(s), now: () => NOW, uuid };
    const { artifact, summary } = await runDld(ctx);
    const all = [...logs, JSON.stringify(summary), JSON.stringify(artifact)].join('\n');
    expect(logs.some((l) => l.includes('cdn.data.dubai/files/part-1.csv'))).toBe(true);
    for (const secret of ['SIGNATURE-SECRET', 'CRED-SECRET', 'TOKEN-SECRET', 'X-Amz']) expect(all).not.toContain(secret);
    expect(logs.join('\n')).not.toContain('?');
    expect(summary.rows_total).toBe(fixtureLines().length - 1);
    expect(summary.projects_rows).toBe(1);
    expect(summary.projects_rows_bad).toBe(0);
    expect(summary.errors).toBe('none');
    const v = validateArtifact(JSON.parse(JSON.stringify(artifact)), TODAY);
    expect(v.errors).toEqual([]);
    // Dated by the file's load_timestamp (15 Jun), not the run date, all the way into the validated artifact.
    expect(v.projects!.as_of).toBe('2026-06-15');
    expect(safeUrl(SIGNED)).toBe('cdn.data.dubai/files/part-1.csv');
    delete process.env.CLOUDFLARE_API_TOKEN;
  });
});

describe('market_cache in the sync import (B1)', () => {
  const PROJ = { new_projects_90d: 2, top_areas_90d: [{ area_en: 'Palm Deira', count: 2 }], active_projects: 10, pipeline_units: 500, as_of: '2026-06-20' };
  const ADREC = { transaction_value_aed: 117e9, sales_value_aed: 86.1e9, mortgage_value_aed: 25.5e9, year: 2026 };

  it('writes areas and area bodies for every complete period, in the same import and behind the same sanity guard', () => {
    const d = db();
    d.exec(sqlFor(aggregate()));
    const keys = (d.prepare('SELECT key FROM market_cache ORDER BY key').all() as { key: string }[]).map((r) => r.key);
    expect(keys.some((k) => k.startsWith('areas:2026-H1'))).toBe(true);
    expect(keys.some((k) => k.startsWith('area:2026-H1:'))).toBe(true);
    expect(keys.every((k) => !k.includes('2026-H2') && !k.includes('2026-Q4'))).toBe(true);
    // A run that fails the sanity guard leaves the old bodies with the old data.
    const before = d.prepare('SELECT key, body FROM market_cache ORDER BY key').all();
    d.exec(sqlFor(aggregate(fixtureLines().slice(0, 3)), { runId: 'run-small' }));
    expect(d.prepare("SELECT dld_written FROM market_sync_runs WHERE run_id = 'run-small'").get()).toEqual({ dld_written: 0 });
    expect(d.prepare('SELECT key, body FROM market_cache ORDER BY key').all()).toEqual(before);
  });

  it('launches: written only when this run read both sources; the ADREC as_of comes from the stored row', () => {
    const d = db();
    d.exec(sqlFor(aggregate(), { runId: 'r1', projects: PROJ, adrec: ADREC, finishedAt: '2026-10-09T02:30:00.000Z' }));
    // Same ADREC figures next run: not stored again, so the cached as_of keeps the first-seen date.
    d.exec(sqlFor(aggregate(), { runId: 'r2', projects: PROJ, adrec: ADREC, finishedAt: '2026-10-16T02:30:00.000Z' }));
    const body = JSON.parse((d.prepare("SELECT body FROM market_cache WHERE key = 'launches'").get() as { body: string }).body);
    expect(body.dubai).toMatchObject({ new_projects_90d: 2, as_of: '2026-06-20' });
    expect(body.abu_dhabi).toMatchObject({ sales_value_bn: 86.1, as_of: '2026-10-09' });
    // A run without the projects figures (UAE PC offline) removes the row: the Worker then computes it live.
    d.exec(sqlFor(aggregate(), { runId: 'r3', projects: null, adrec: ADREC }));
    expect(d.prepare("SELECT body FROM market_cache WHERE key = 'launches'").get()).toBeUndefined();
  });

  it('the dld job runs under plain Node (no npm install on the PC): the whole import graph loads with type stripping', () => {
    let code = 0;
    let err = '';
    try {
      execFileSync(process.execPath, [join(import.meta.dirname, '../scripts/market-sync/sync.ts')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      code = (e as { status: number }).status;
      err = (e as { stderr: string }).stderr;
    }
    expect(code).toBe(2);
    expect(err).toMatch(/^usage: sync\.ts dld/m);
    expect(err).not.toMatch(/ERR_|SyntaxError|Cannot find/);
  });
});

describe('DLD download guard (audit item 8)', () => {
  const ctxWith = (fetchImpl: typeof fetch): Ctx => ({ fetch: fetchImpl, log: () => {}, now: () => NOW, uuid });

  it('https and the allow-listed CDN host only; the error names the host, never the signed query', () => {
    expect(() => assertDownloadUrl('https://cdn.data.dubai/files/a.csv?X-Amz-Signature=S')).not.toThrow();
    expect(() => assertDownloadUrl('http://cdn.data.dubai/files/a.csv')).toThrow(/not https/);
    expect(() => assertDownloadUrl('https://evil.example/files/a.csv?X-Amz-Signature=S')).toThrow(/host evil\.example is not allowed/);
    expect(() => assertDownloadUrl('https://cdn.data.dubai.evil.example/a.csv')).toThrow(/not allowed/);
    try { assertDownloadUrl('https://evil.example/a.csv?X-Amz-Signature=SECRET'); } catch (e) { expect(String(e)).not.toContain('SECRET'); }
  });

  it('a disallowed host is refused before any request; a redirect off the allow-list is refused too', async () => {
    let calls = 0;
    await expect(streamRecords(ctxWith(async () => { calls++; return new Response('a\n'); }), 'https://evil.example/a.csv', () => {})).rejects.toThrow(/not allowed/);
    expect(calls).toBe(0);
    const redirected = async () => { const r = new Response('a\n'); Object.defineProperty(r, 'url', { value: 'https://evil.example/a.csv' }); return r; };
    await expect(streamRecords(ctxWith(redirected), 'https://cdn.data.dubai/a.csv', () => {})).rejects.toThrow(/host evil\.example/);
  });

  it('passes a 15-minute timeout signal and aborts above the byte limit (declared or streamed)', async () => {
    let signal: AbortSignal | undefined;
    const ok = async (_u: unknown, init?: RequestInit) => { signal = init?.signal ?? undefined; return new Response('h\n1\n'); };
    const rows: unknown[] = [];
    await streamRecords(ctxWith(ok as typeof fetch), 'https://cdn.data.dubai/a.csv', (r) => rows.push(r));
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(DLD_DOWNLOAD_TIMEOUT_MS).toBe(15 * 60_000);
    expect(rows).toHaveLength(2);
    const declared = async () => new Response('x', { headers: { 'content-length': '100' } });
    await expect(streamRecords(ctxWith(declared), 'https://cdn.data.dubai/a.csv', () => {}, 10)).rejects.toThrow(/over the 10 byte limit/);
    const streamed = async () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < 4; i++) c.enqueue(new TextEncoder().encode('abcd\n')); c.close(); } }));
    await expect(streamRecords(ctxWith(streamed), 'https://cdn.data.dubai/a.csv', () => {}, 10)).rejects.toThrow(/aborted/);
  });
});
