// External links (owner decisions 2026-11-06: "keep my social profile links only", "remove source links only"). No page
// links outside sharjeelhashmat.com except the owner's three social profiles in the footer. Sources are named as plain
// text; their URLs stay in the data files as the verification record. tel: and mailto: links are not external links.
// Used by scripts/postbuild.mjs, which fails the build on any other external <a href>, and by tests/external-links.test.mjs.

// Entities decoded with &amp; last (CodeQL js/double-escaping), shared with the tests and the readiness check.
import { decodeEntities } from '../../scripts/html-text.mjs';

/** The only external hrefs a page may carry: exactly these three URLs (SITE.linkedin, SITE.instagram, SITE.facebook). */
export const SOCIAL_PROFILE_URLS = Object.freeze([
  'https://www.linkedin.com/in/sharjeel-hashmat-16944322',
  'https://www.instagram.com/sharjeelhashmat',
  'https://www.facebook.com/profile.php?id=61593982841274',
]);

/**
 * WhatsApp chat links to the owner's own number exist only with lead capture on (golive.ts LEAD_CAPTURE; the soft launch
 * build has none). They are a contact channel like tel:, not a source link, and are named here so a lead-capture build is
 * held to the same rule otherwise. Owner decision pending on whether they stay at go-live (PR report).
 */
export const WHATSAPP_OWNER_RE = /^https:\/\/wa\.me\/971555414468\?text=[^"\s]*$/;

const OWN_HOST = /^(?:www\.)?sharjeelhashmat\.com$/i;

/** Every <a href> in the HTML that points to another host (absolute http(s) or protocol-relative), as written. */
export function externalHrefs(html) {
  const out = [];
  for (const m of String(html).matchAll(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const href = decodeEntities((m[1] ?? m[2] ?? m[3] ?? '').trim());
    if (!/^(?:https?:)?\/\//i.test(href)) continue;
    let host = '';
    try { host = new URL(href, 'https://www.sharjeelhashmat.com').hostname; } catch { out.push(href); continue; }
    if (!OWN_HOST.test(host)) out.push(href);
  }
  return out;
}

/** The external hrefs that are not allowed. @param {string} html @param {{whatsapp?: boolean}} [opts] */
export function disallowedExternalHrefs(html, { whatsapp = false } = {}) {
  return externalHrefs(html).filter((h) => !SOCIAL_PROFILE_URLS.includes(h) && !(whatsapp && WHATSAPP_OWNER_RE.test(h)));
}
