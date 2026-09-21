import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { areaSnapshotState } from './src/lib/intel.mjs';
import { loadPublic, today } from './src/lib/intel-data.mjs';
import { AREAS } from './src/lib/areas.ts';

// Production-indexable builds are the only ones that may go public. They refuse to build without a BRN.
// Every other build (preview, staging, CI) is noindex and shows "BRN pending".
const indexable = process.env.PUBLIC_INDEXABLE === 'true';
if (indexable && !process.env.PUBLIC_BRN) {
  throw new Error('PUBLIC_INDEXABLE=true requires PUBLIC_BRN. Refusing to build a public site without a BRN.');
}

// Pages that have no real content yet stay out of the sitemap (they are also noindex in their own markup).
// /new-launches is always thin for now. Insights, Opportunities and each area page are gated by data (decision 5,
// 2026-09-21): they enter the sitemap only when their own rules pass, the same rules the pages use for noindex.
const THIN = ['/new-launches'];
const intel = loadPublic();
const liveAreas = new Set(AREAS.filter((a) => areaSnapshotState(a, today()).live).map((a) => `/areas/${a.slug}`));

export default defineConfig({
  site: 'https://www.sharjeelhashmat.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        if (THIN.includes(path)) return false;
        if (path === '/insights' || path.startsWith('/insights/')) return intel.insightsLive;
        if (path === '/opportunities') return intel.opportunities.length > 0;
        if (path.startsWith('/areas/')) return liveAreas.has(path);
        return true;
      },
    }),
  ],
  devToolbar: { enabled: false },
});
