// The mode site/dist was built in, read from the same environment variables the build reads (src/lib/golive.ts and
// src/lib/site.ts). CI's build is noindex: PUBLIC_INDEXABLE=false and no GOLIVE_OVERRIDES, so every go-live value is
// empty. The public test build sets PUBLIC_INDEXABLE=true and GOLIVE_OVERRIDES=GOLIVE_TEST (helpers/golive.mjs). Tests
// that read site/dist assert what the build under test must contain in its own mode, so `npm test` is green after
// either build and neither mode's expectation is skipped.
const raw = process.env.GOLIVE_OVERRIDES ? JSON.parse(process.env.GOLIVE_OVERRIDES) : {};
const g = { agencyName: '', agencyOrn: '', agencyAddress: '', brokerBrn: '', advertiserPermitNo: '', indexing: false, ...raw };
for (const k of ['agencyName', 'agencyOrn', 'agencyAddress', 'brokerBrn', 'advertiserPermitNo']) g[k] = String(g[k]).trim();

export const BUILD = Object.freeze({
  // SITE.indexable (site.ts)
  indexable: Boolean(g.indexing) && process.env.PUBLIC_INDEXABLE === 'true',
  // AFFILIATION_LINE (site.ts, affiliation.mjs): "Working with <agency> · ORN <orn> · BRN <brn>"
  affiliation: g.agencyName && g.agencyOrn && g.brokerBrn ? `Working with ${g.agencyName} · ORN ${g.agencyOrn} · BRN ${g.brokerBrn}` : '',
  // LAUNCH_CARDS_ALLOWED (golive.ts)
  launchCards: Boolean(g.agencyName && g.agencyOrn && g.brokerBrn && g.advertiserPermitNo),
  golive: Object.freeze(g),
});

// The JSON-LD identifiers the Person carries in this build (lib/jsonld.mjs, Base.astro): the broker's BRN once the
// agency line shows, the advertiser permit once issued.
export const PERSON_IDS = [
  ...(BUILD.affiliation ? [['BRN', BUILD.golive.brokerBrn]] : []),
  ...(BUILD.golive.advertiserPermitNo ? [['UAE Media Council advertiser permit', BUILD.golive.advertiserPermitNo]] : []),
];
export const SITEMAP_LINE = 'Sitemap: https://www.sharjeelhashmat.com/sitemap-index.xml';
