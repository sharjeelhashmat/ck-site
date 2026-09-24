// Central brand + contact facts. Every value here is either from the live site (owner-approved copy)
// or from an owner decision recorded in the Project memory. Nothing invented.

const env = import.meta.env;

export const SITE = {
  name: 'Sharjeel Hashmat',
  // Owner decision 2026-09-20: title is "Real Estate Consultant" only (SCA regulates investment advisers).
  title: 'Real Estate Consultant',
  origin: 'https://www.sharjeelhashmat.com',
  // Owner decision 2026-09-21: the site names the brokerage next to the BRN. Single source of truth: change it here if the brokerage changes.
  brokerage: 'Royals Field Properties',
  phoneDisplay: '+971 55 541 4468',
  phoneE164: '971555414468',
  // Owner decision 2026-09-19: hello@ replaces the Gmail address publicly.
  email: 'hello@sharjeelhashmat.com',
  languages: ['English', 'Urdu', 'Arabic'],
  areasServed: 'United Arab Emirates',
  instagram: 'https://www.instagram.com/sharjeelhashmat',
  linkedin: 'https://www.linkedin.com/in/sharjeel-hashmat-16944322',
  workerUrl: (env.PUBLIC_WORKER_URL as string | undefined) ?? 'https://ck-lead-worker.sharjeelhashmat.workers.dev',
  // Public by design (Turnstile site keys are embedded in pages).
  turnstileSiteKey: (env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined) ?? '0x4AAAAAAE9Ndhe9on1juQ_h',
  brn: ((env.PUBLIC_BRN as string | undefined) ?? '').trim(),
  indexable: env.PUBLIC_INDEXABLE === 'true',
  // Cloudflare Web Analytics (cookieless). Set by the owner as repo variable CF_ANALYTICS_TOKEN; the build receives it as
  // PUBLIC_CF_ANALYTICS_TOKEN (same pattern as BRN). Public by design: the beacon token is embedded in every page.
  cfAnalyticsToken: ((env.PUBLIC_CF_ANALYTICS_TOKEN as string | undefined) ?? '').trim(),
} as const;

// The beacon is emitted only on the public (indexable) build and only with a well-formed token, so an unset
// variable never blocks a build and staging traffic never pollutes the production numbers.
export const ANALYTICS_TOKEN = SITE.indexable && /^[A-Za-z0-9]{16,64}$/.test(SITE.cfAnalyticsToken) ? SITE.cfAnalyticsToken : '';

export function waLink(message: string): string {
  return `https://wa.me/${SITE.phoneE164}?text=${encodeURIComponent(message)}`;
}

export const NAV_LINKS = [
  { href: '/buy', label: 'Buy' },
  { href: '/invest', label: 'Invest' },
  { href: '/sell', label: 'Sell' },
  { href: '/areas', label: 'Areas' },
  { href: '/new-launches', label: 'New Launches' },
  { href: '/insights', label: 'Insights' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const;

export const INTENTS = [
  { value: 'buy', label: 'Buy a Home' },
  { value: 'invest', label: 'Invest in the UAE' },
  { value: 'sell', label: 'Sell a Property' },
  { value: 'abroad', label: 'Buy From Abroad' },
  { value: 'other', label: 'Just Researching' },
] as const;
export type IntentValue = (typeof INTENTS)[number]['value'];

export const BLURBS: Record<string, string> = {
  buy: 'Find the right property, community and lifestyle for your budget.',
  invest: 'Evaluate opportunities using price, rental income, yield, costs and exit potential.',
  sell: "Understand your property's market position before deciding what to do next.",
  abroad: 'Invest in the UAE with local guidance from selection through completion.',
};

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
