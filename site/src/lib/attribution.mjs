// Attribution fields sent with an enquiry (Package F relies on them). The first-touch values are captured on every page
// by the inline script in layouts/Base.astro into sessionStorage "ck_attr" (first touch wins); this maps them onto the
// payload. Plain ESM so the form script and node:test share it.

/**
 * @param {Record<string, string | null | undefined> | null | undefined} stored the parsed "ck_attr" object
 * @param {string} pathname current page path (fallback landing page)
 * @param {string} referrer document.referrer (fallback)
 */
export function attributionFields(stored, pathname, referrer) {
  const a = stored ?? {};
  return {
    utm_source: a.utm_source, utm_medium: a.utm_medium, utm_campaign: a.utm_campaign,
    utm_content: a.utm_content, utm_term: a.utm_term,
    landing_page: a.landing_page ?? pathname,
    referrer: a.referrer ?? (referrer || undefined),
  };
}
