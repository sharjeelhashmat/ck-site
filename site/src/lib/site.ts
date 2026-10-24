// Central brand + contact facts. Every value here is either from the live site (owner-approved copy)
// or from an owner decision recorded in the Project memory. Nothing invented.

import { affiliationLine } from './affiliation.mjs';
import { GOLIVE } from './golive';

const env = import.meta.env;

export const SITE = {
  name: 'Sharjeel Hashmat',
  // Owner decision 2026-10-10 (Brand v3.0): title is "Property Consultant", shown as "Property Consultant · UAE" with the
  // geography. Never "Broker"; no adviser wording (SCA regulates investment advisers).
  title: 'Property Consultant',
  origin: 'https://www.sharjeelhashmat.com',
  // Owner decision 2026-10-10: no agency is named until the owner confirms the new one. Set it in golive.ts (Part B).
  // The "Working with … · BRN …" line renders only when both the agency and the BRN are set (AFFILIATION_LINE).
  brokerage: GOLIVE.agencyName,
  phoneDisplay: '+971 55 541 4468',
  phoneE164: '971555414468',
  // Owner decision 2026-09-19: hello@ replaces the Gmail address publicly.
  email: 'hello@sharjeelhashmat.com',
  // Structured data (JSON-LD knowsLanguage) has no proficiency level, so only fluent languages are listed; the About page
  // says "basic Arabic" in words (owner decision 2026-10-10).
  languages: ['English', 'Urdu'],
  areasServed: 'United Arab Emirates',
  instagram: 'https://www.instagram.com/sharjeelhashmat',
  linkedin: 'https://www.linkedin.com/in/sharjeel-hashmat-16944322',
  facebook: 'https://www.facebook.com/profile.php?id=61593982841274',
  workerUrl: (env.PUBLIC_WORKER_URL as string | undefined) ?? 'https://ck-lead-worker.sharjeelhashmat.workers.dev',
  // Public by design (Turnstile site keys are embedded in pages).
  turnstileSiteKey: (env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined) ?? '0x4AAAAAAE9Ndhe9on1juQ_h',
  brn: GOLIVE.agencyBrn,
  // Indexing needs both the go-live setting and the deploy-time public switch (deploy-site input "public").
  indexable: GOLIVE.indexing && env.PUBLIC_INDEXABLE === 'true',
  // Cloudflare Web Analytics (cookieless). Set by the owner as repo variable CF_ANALYTICS_TOKEN; the build receives it as
  // PUBLIC_CF_ANALYTICS_TOKEN (same pattern as BRN). Public by design: the beacon token is embedded in every page.
  cfAnalyticsToken: ((env.PUBLIC_CF_ANALYTICS_TOKEN as string | undefined) ?? '').trim(),
} as const;

// Rendered wherever the agency + BRN line appears; '' (render nothing) unless both are set.
export const AFFILIATION_LINE = affiliationLine(SITE.brokerage, SITE.brn);
// RERA card number, shown only after the agency + BRN line. "Broker" is never shown (Rules 1b).
export const CARD_LINE = AFFILIATION_LINE && GOLIVE.brokerCardNo ? `RERA card ${GOLIVE.brokerCardNo}` : '';
// UAE Media Council advertiser permit (Rules 8c.2: in the website footer once issued).
export const PERMIT_LINE = GOLIVE.advertiserPermitNo ? `UAE Media Council advertiser permit ${GOLIVE.advertiserPermitNo}` : '';

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
