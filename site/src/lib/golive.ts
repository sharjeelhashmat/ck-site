// Go-live settings (Part B): the ONE file the owner fills in when the agency, BRN and permits exist. Every value ships
// empty or false, and whatever depends on a value stays hidden until it is set (no "pending", no placeholder).
//
//   agencyName          footer, About, FAQ, print header, Privacy wording, JSON-LD, launch cards  (with agencyBrn)
//   agencyBrn           the "Working with <agency> · BRN <n>" line and JSON-LD                    (with agencyName)
//   agencyAddress       the agency's office address, one line: JSON-LD RealEstateAgent only       (with agencyName and agencyBrn)
//   brokerCardNo        "RERA card <n>" after that line (footer, About) and JSON-LD                (needs the agency line)
//   advertiserPermitNo  "UAE Media Council advertiser permit <n>" in the footer, and JSON-LD
//   abuDhabiLicensed    allows Abu Dhabi items in "Launches I'm watching" on /new-launches
//   indexing            with PUBLIC_INDEXABLE=true (the deploy-site "public" input): index,follow, robots Allow, sitemap
//
// A public (indexable) build refuses to run unless indexing, agencyName, agencyBrn and advertiserPermitNo are all set.
// GOLIVE_OVERRIDES (JSON, build-time env) exists for the test suite only; production builds never set it.
export interface GoLive {
  agencyName: string;
  agencyBrn: string;
  agencyAddress: string;
  brokerCardNo: string;
  advertiserPermitNo: string;
  abuDhabiLicensed: boolean;
  indexing: boolean;
}

const COMMITTED: GoLive = {
  agencyName: '',
  agencyBrn: '',
  agencyAddress: '',
  brokerCardNo: '',
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
  agencyBrn: merged.agencyBrn.trim(),
  agencyAddress: merged.agencyAddress.trim(),
  brokerCardNo: merged.brokerCardNo.trim(),
  advertiserPermitNo: merged.advertiserPermitNo.trim(),
});

/** What a public build needs; empty when ready. */
export function goLiveMissing(g: GoLive = GOLIVE): string[] {
  return (['indexing', 'agencyName', 'agencyBrn', 'advertiserPermitNo'] as const).filter((k) => !g[k]);
}

/** Specific launches may be shown only with the agency, BRN and advertiser permit in place. */
export const LAUNCH_CARDS_ALLOWED = Boolean(GOLIVE.agencyName && GOLIVE.agencyBrn && GOLIVE.advertiserPermitNo);
