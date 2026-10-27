import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { loadChanges, loadPublic } from './src/lib/intel-data.mjs';
import { goLiveMissing, LAUNCH_CARDS_ALLOWED } from './src/lib/golive.ts';

// Production-indexable builds are the only ones that may go public (Part B: site/src/lib/golive.ts is the one go-live
// file). A public build refuses to run unless indexing, the agency, its ORN, the broker's BRN and the advertiser permit are
// all set there.
// Every other build (preview, staging, CI) is noindex.
const indexable = process.env.PUBLIC_INDEXABLE === 'true';
if (indexable && goLiveMissing().length) {
  throw new Error(`PUBLIC_INDEXABLE=true requires golive.ts: ${goLiveMissing().join(', ')}. Refusing to build a public site.`);
}

// Pages that have no real content yet stay out of the sitemap (they are also noindex in their own markup).
// /new-launches stays out until LAUNCH_CARDS_ALLOWED (agency, ORN, BRN and advertiser permit in golive.ts; audit M2), the same
// switch its own noindex follows. Insights and Opportunities are gated by data (decision 5, 2026-09-21): they enter
// the sitemap only when their own rules pass, the same rules the pages use for noindex. The 16 area guides carry
// owner-approved copy (2026-10-16) and are listed like every other page. /projects enters only once a tracker is current,
// and a tracker past its reviewBy date stays out until it is updated (both noindex in their own markup too). The sitemap
// is only advertised (robots.txt) and pages are only indexable when GOLIVE.indexing is on for a public build (golive.ts).
const THIN = [...(LAUNCH_CARDS_ALLOWED ? [] : ['/new-launches']), '/investor-profile'];
const intel = loadPublic();
// Loading also validates market events and trackers, so a broken record stops the build before any page is rendered.
const changes = loadChanges();

export default defineConfig({
  site: 'https://www.sharjeelhashmat.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  // No sitemap at all in a non-indexable build (audit item 22).
  integrations: indexable ? [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        if (THIN.includes(path)) return false;
        if (path === '/insights' || path.startsWith('/insights/')) return intel.insightsLive;
        if (path === '/opportunities') return intel.opportunities.length > 0;
        if (path === '/projects') return changes.projectsLive;
        if (path.startsWith('/projects/')) return changes.projects.some((p) => path === `/projects/${p.slug}` && !p.stale);
        return true;
      },
    }),
  ] : [],
  devToolbar: { enabled: false },
});
