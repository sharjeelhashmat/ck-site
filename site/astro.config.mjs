import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Production-indexable builds are the only ones that may go public. They refuse to build without a BRN.
// Every other build (preview, staging, CI) is noindex and shows "BRN pending".
const indexable = process.env.PUBLIC_INDEXABLE === 'true';
if (indexable && !process.env.PUBLIC_BRN) {
  throw new Error('PUBLIC_INDEXABLE=true requires PUBLIC_BRN. Refusing to build a public site without a BRN.');
}

// Pages that have no real content yet stay out of the sitemap (they are also noindex in their own markup).
// Remove a path from this list only when the page carries real content.
const THIN = ['/new-launches', '/insights', '/areas/'];

export default defineConfig({
  site: 'https://www.sharjeelhashmat.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        if (path === '/areas') return true;
        return !THIN.some((t) => path === t || (t.endsWith('/') && path.startsWith(t)));
      },
    }),
  ],
  devToolbar: { enabled: false },
});
