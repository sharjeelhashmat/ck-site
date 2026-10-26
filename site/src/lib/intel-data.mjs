// Loads opportunity and article records, market events and project trackers from disk at build time (Node only).
// Data lives in src/data/{opportunities,insights,projects}/*.json and src/data/market-events.json. INTEL_DATA_DIR and
// INTEL_TODAY exist for tests.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkOpportunity, checkArticle, insightsLive, todayIso } from './intel.mjs';
import { checkChanges, projectStale } from './changes.mjs';

// Astro bundles this module into a build chunk, so a path relative to import.meta.url points at the wrong place during `astro build`.
// Builds and tests run from site/, so try the working directory first, then the path relative to this file.
const candidates = [join(process.cwd(), 'src', 'data'), fileURLToPath(new URL('../data/', import.meta.url))];
const defaultDir = candidates.find((d) => existsSync(join(d, 'insights'))) ?? candidates[0];
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

// The site's area list: the slugs of the area guide pages. Always read from the shipped data, never from INTEL_DATA_DIR.
export const areaSlugs = () => JSON.parse(readFileSync(join(defaultDir, 'area-guides.json'), 'utf8')).guides.map((g) => g.slug);

/**
 * Market events and project trackers ("What's changing here", /projects). Any rule broken fails the build with every
 * reason listed. A missing market-events.json reads as no events.
 */
export function loadChanges() {
  const t = today();
  const file = join(dataDir(), 'market-events.json');
  let events = [];
  if (existsSync(file)) {
    try {
      events = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`market-events.json: not valid JSON (${e.message})`);
    }
  }
  const projects = readJsonDir('projects').map(({ file: f, record }) => ({ file: f.slice('projects/'.length), record }));
  const errors = checkChanges({ events, projects }, { today: t, areaSlugs: areaSlugs() });
  if (errors.length) throw new Error(`Market events and project trackers fail the rules:\n - ${errors.join('\n - ')}`);
  const list = projects.map((x) => ({ ...x.record, stale: projectStale(x.record, t) })).sort((a, b) => (a.name < b.name ? -1 : 1));
  // /projects is noindex and out of the sitemap until at least one tracker is current (not past reviewBy).
  return { today: t, events, projects: list, projectsLive: list.some((p) => !p.stale) };
}
