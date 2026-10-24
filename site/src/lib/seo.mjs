// Canonical URLs (audit B3). Plain ESM so the layout and node:test share it. Pages are built as files ("about.html") and
// served without the extension, so the canonical drops ".html" and a trailing "/index"; the home page is origin + "/",
// the same form the sitemap uses.

/**
 * @param {string} origin e.g. https://www.sharjeelhashmat.com (no trailing slash)
 * @param {string} pathname the page's built path, e.g. "/about.html", "/areas/index.html", "/"
 * @returns {string}
 */
export function canonicalUrl(origin, pathname) {
  const p = String(pathname ?? '')
    .replace(/\.html$/, '')
    .replace(/(^|\/)index$/, '')
    .replace(/\/+$/, '');
  return `${origin.replace(/\/+$/, '')}${p.startsWith('/') ? p : p ? `/${p}` : '/'}`;
}

export const TITLE_MAX = 60;

/**
 * The page <title> (audit item 21): "<title> · <name>" when that fits in 60 characters, else the title alone. The home
 * page (no title) is "<name>, <role> · UAE".
 * @param {string | undefined} title
 * @param {string} name
 * @param {string} role
 * @returns {string}
 */
export function pageTitle(title, name, role) {
  if (!title) return `${name}, ${role} · UAE`;
  const full = `${title} · ${name}`;
  return full.length <= TITLE_MAX ? full : title;
}
