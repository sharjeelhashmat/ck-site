// Go-live settings (Part B): the ONE file the owner fills in when the agency, its ORN, the broker's BRN and the permits
// exist. Every value ships empty or false, and whatever depends on a value stays hidden until it is set (no "pending",
// no placeholder). In Dubai: ORN = the agency (RERA Office Registration Number); BRN = the broker (Broker Registration
// Number, the number on the RERA broker card).
//
//   agencyName          footer, About, FAQ, print header, Privacy wording, JSON-LD, launch cards  (with agencyOrn)
//   agencyOrn           the agency's ORN: "Working with <agency> · ORN <orn> · BRN <brn>" and the JSON-LD RealEstateAgent
//   agencyAddress       the agency's office address, one line: JSON-LD RealEstateAgent only       (needs the agency line)
//   brokerBrn           the broker's own BRN: the same line (footer, About) and the JSON-LD Person
//   advertiserPermitNo  "UAE Media Council advertiser permit <n>" in the footer, and JSON-LD
//   abuDhabiLicensed    allows Abu Dhabi items in "Launches I'm watching" on /new-launches
//   indexing            with PUBLIC_INDEXABLE=true (the deploy-site "public" input): index,follow, robots Allow, sitemap
//
// The agency line shows only when agencyName, agencyOrn and brokerBrn are all set. A public (indexable) build refuses to
// run unless indexing, agencyName, agencyOrn, brokerBrn and advertiserPermitNo are all set (Dubai advertising shows both
// numbers). GOLIVE_OVERRIDES (JSON, build-time env) exists for the test suite only; production builds never set it, and
// an unknown key (an old name such as agencyBrn included) fails the build.
export interface GoLive {
  agencyName: string;
  agencyOrn: string;
  agencyAddress: string;
  brokerBrn: string;
  advertiserPermitNo: string;
  abuDhabiLicensed: boolean;
  indexing: boolean;
}

const COMMITTED: GoLive = {
  agencyName: '',
  agencyOrn: '',
  agencyAddress: '',
  brokerBrn: '',
  advertiserPermitNo: '',
  abuDhabiLicensed: false,
  indexing: false,
};

function overrides(): Partial<GoLive> {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.GOLIVE_OVERRIDES;
  if (!raw) return {};
  const o = JSON.parse(raw) as Partial<GoLive>;
  for (const k of Object.keys(o)) if (!(k in COMMITTED)) throw new Error(`GOLIVE_OVERRIDES: unknown key ${k}`);
  return o;
}

const merged = { ...COMMITTED, ...overrides() };
export const GOLIVE: Readonly<GoLive> = Object.freeze({
  ...merged,
  agencyName: merged.agencyName.trim(),
  agencyOrn: merged.agencyOrn.trim(),
  agencyAddress: merged.agencyAddress.trim(),
  brokerBrn: merged.brokerBrn.trim(),
  advertiserPermitNo: merged.advertiserPermitNo.trim(),
});

/** What a public build needs; empty when ready. */
export function goLiveMissing(g: GoLive = GOLIVE): string[] {
  return (['indexing', 'agencyName', 'agencyOrn', 'brokerBrn', 'advertiserPermitNo'] as const).filter((k) => !g[k]);
}

/** Specific launches may be shown only with the agency, its ORN, the broker's BRN and the advertiser permit in place. */
export const LAUNCH_CARDS_ALLOWED = Boolean(GOLIVE.agencyName && GOLIVE.agencyOrn && GOLIVE.brokerBrn && GOLIVE.advertiserPermitNo);
