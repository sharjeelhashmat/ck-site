// Freshness report: which records are fresh, expiring soon, stale or invalid. Read-only.
// Usage: npm run freshness [-- --json] [-- --within 7]   (INTEL_TODAY overrides today for testing)
import { loadIntel } from '../src/lib/intel-data.mjs';
import { FRESHNESS_DAYS, daysBetween } from '../src/lib/intel.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const within = Number(args[args.indexOf('--within') + 1]) || 7;
const intel = loadIntel();
const rows = [];

for (const { file, record: o, check } of intel.opportunities) {
  if (o.status !== 'published') { rows.push({ file, kind: 'opportunity', state: o.status, next: '', detail: 'not built' }); continue; }
  if (check.errors.length) { rows.push({ file, kind: 'opportunity', state: 'INVALID', next: '', detail: check.errors.join('; ') }); continue; }
  const claims = [...(o.numbers ?? []), ...(o.income ?? []), ...(o.comparables ?? []), ...(o.supply ?? [])];
  const left = claims.map((c) => ({ k: c.key, days: FRESHNESS_DAYS[c.category] - daysBetween(c.verifiedOn, intel.today), v: c.verification }));
  const reviewLeft = daysBetween(intel.today, o.reviewBy);
  const worst = left.reduce((a, b) => (b.days < a.days ? b : a), { k: 'review-by', days: reviewLeft });
  const state = check.stale ? 'STALE' : worst.days <= within ? 'EXPIRING' : 'FRESH';
  rows.push({ file, kind: 'opportunity', state, next: `${worst.k} in ${worst.days} day(s)`, detail: check.stale ? 'not built until re-verified' : '' });
}
for (const { file, record: a, check } of intel.articles) {
  if (a.status !== 'published') { rows.push({ file, kind: 'article', state: a.status, next: '', detail: 'not built' }); continue; }
  if (check.errors.length) { rows.push({ file, kind: 'article', state: 'INVALID', next: '', detail: check.errors.join('; ') }); continue; }
  const left = daysBetween(intel.today, a.reviewBy);
  rows.push({ file, kind: 'article', state: check.stale ? 'STALE' : left <= within ? 'EXPIRING' : 'FRESH', next: `review in ${left} day(s)`, detail: check.stale ? 'live with review banner; not counted for the Insights gate' : '' });
}

if (asJson) console.log(JSON.stringify({ today: intel.today, rows }, null, 2));
else {
  console.log(`Freshness report as of ${intel.today} (expiring = within ${within} days)`);
  if (!rows.length) console.log('No records yet.');
  for (const r of rows) console.log(`${r.state.padEnd(9)} ${r.kind.padEnd(11)} ${r.file.padEnd(40)} ${r.next}${r.detail ? '  | ' + r.detail : ''}`);
  const bad = rows.filter((r) => ['STALE', 'EXPIRING', 'INVALID'].includes(r.state));
  console.log(bad.length ? `\n${bad.length} record(s) need attention.` : '\nNothing needs attention.');
}
