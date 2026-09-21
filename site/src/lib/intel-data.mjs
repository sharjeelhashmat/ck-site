// Loads opportunity and article records from disk at build time (Node only).
// Data lives in src/data/{opportunities,insights}/*.json. INTEL_DATA_DIR and INTEL_TODAY exist for tests.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkOpportunity, checkArticle, insightsLive, todayIso } from './intel.mjs';

const defaultDir = fileURLToPath(new URL('../data/', import.meta.url));
export const dataDir = () => process.env.INTEL_DATA_DIR || defaultDir;
export const today = () => process.env.INTEL_TODAY || todayIso();

function readJsonDir(sub) {
  const dir = join(dataDir(), sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      try {
        return { file: `${sub}/${f}`, record: JSON.parse(readFileSync(join(dir, f), 'utf8')) };
      } catch (e) {
        throw new Error(`${sub}/${f}: not valid JSON (${e.message})`);
      }
    });
}

/** Everything the build and the freshness report need, with each record's check result attached. */
export function loadIntel() {
  const t = today();
  const opportunities = readJsonDir('opportunities').map(({ file, record }) => ({ file, record, check: checkOpportunity(record, t) }));
  const articles = readJsonDir('insights').map(({ file, record }) => ({ file, record, check: checkArticle(record, t) }));
  return { today: t, opportunities, articles };
}

/** For pages: only what may be shown. Structural errors in a published record fail the build; stale ones are dropped with a warning. */
export function loadPublic() {
  const intel = loadIntel();
  const problems = [];
  for (const x of [...intel.opportunities, ...intel.articles]) {
    if (x.record.status === 'published' && x.check.errors.length) problems.push(`${x.file}: ${x.check.errors.join('; ')}`);
  }
  if (problems.length) throw new Error(`Published records fail the intelligence rules:\n - ${problems.join('\n - ')}`);
  const opportunities = intel.opportunities.filter((x) => x.record.status === 'published' && x.check.publishable).map((x) => x.record);
  for (const x of intel.opportunities) {
    if (x.record.status === 'published' && x.check.stale) console.warn(`[intel] ${x.file} is STALE and is not built (past review window). Re-verify it to bring it back.`);
  }
  const articles = intel.articles.filter((x) => x.record.status === 'published').map((x) => ({ ...x.record, stale: x.check.stale }));
  const articlesForGate = intel.articles.filter((x) => x.record.status === 'published').map((x) => x.record);
  return { today: intel.today, opportunities, articles, insightsLive: insightsLive(articlesForGate, intel.today) };
}
