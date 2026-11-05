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
//   softLaunch          soft launch mode (Rules v5.9 section 8d): no lead capture and no legal pages. While true (LEAD_CAPTURE
//                       false): no enquiry or profile form, no newsletter sign-up, no WhatsApp button or wa.me link, no call to
//                       action that asks the visitor to enquire, message or request, no Turnstile or form script, and
//                       /privacy, /terms and /investor-profile are not built. Phone and email stay as plain links.
//
// The agency line shows only when agencyName, agencyOrn and brokerBrn are all set. A public (indexable) build refuses to
// run unless indexing is set and, outside soft launch, agencyName, agencyOrn, brokerBrn and advertiserPermitNo are all
// set too (Dubai advertising shows both numbers). In soft launch a public build needs only indexing. GOLIVE_OVERRIDES (JSON, build-time env) exists for the test suite only; production builds never set it, and
// an unknown key (an old name such as agencyBrn included) fails the build.
export interface GoLive {
  agencyName: string;
  agencyOrn: string;
  agencyAddress: string;
  brokerBrn: string;
  advertiserPermitNo: string;
  abuDhabiLicensed: boolean;
  indexing: boolean;
  softLaunch: boolean;
}

const COMMITTED: GoLive = {
  agencyName: '',
  agencyOrn: '',
  agencyAddress: '',
  brokerBrn: '',
  advertiserPermitNo: '',
  abuDhabiLicensed: false,
  indexing: true,
  softLaunch: true,
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

/** What a public build needs; empty when ready. In soft launch only indexing. */
export function goLiveMissing(g: GoLive = GOLIVE): string[] {
  if (g.softLaunch) return (['indexing'] as const).filter((k) => !g[k]);
  return (['indexing', 'agencyName', 'agencyOrn', 'brokerBrn', 'advertiserPermitNo'] as const).filter((k) => !g[k]);
}

/** The one switch for lead capture and the legal pages (false in soft launch). Lifting soft launch is one value above. */
export const LEAD_CAPTURE = !GOLIVE.softLaunch;

/** Specific launches may be shown only with the agency, its ORN, the broker's BRN and the advertiser permit in place. */
export const LAUNCH_CARDS_ALLOWED = Boolean(GOLIVE.agencyName && GOLIVE.agencyOrn && GOLIVE.brokerBrn && GOLIVE.advertiserPermitNo);
