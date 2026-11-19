// Types for launch-cards.mjs (used by the private research tool's TypeScript, worker/reelly).
export interface LaunchView {
  id: number | null; slug: string | null; name: string; developer: string | null; district: string | null; region: string | null;
  image: string | null; startingPrice: number | null; maxPrice: number | null; currency: string; saleStatus: string | null;
  constructionStatus: string | null; handover: string | null; escrow: string | null; serviceCharge: string | null;
  paymentPlans: { name: string; steps: { name: string; percentage: number | null }[]; postHandover: boolean }[];
  typicalUnits: { type: string | null; bedrooms: number | null; from: number | null; to: number | null }[];
  documents: { label: string; url: string }[]; updated: string | null; demo: boolean;
}
export interface UnitGroup { type: string; bedrooms: number | null; count: number; available: number; priceMin: number | null; priceMax: number | null; sizeMin: number | null; sizeMax: number | null }
export declare const esc: (v: unknown) => string;
export declare function safeUrl(u: unknown): string | null;
export declare const formatAED: (n: unknown) => string | null;
export declare function handoverLabel(d: unknown): string | null;
export declare function dayLabel(d: unknown): string | null;
export declare const DEMO_RE: RegExp;
export declare function normaliseProject(p: unknown, o?: { demo?: boolean }): LaunchView;
export declare function summariseUnits(units: unknown): UnitGroup[];
export declare function renderLaunchCard(v: LaunchView, o: { href: string }): string;
export declare function renderLaunchGrid(vs: LaunchView[], href: (v: LaunchView) => string): string;
export declare function renderProjectDetail(v: LaunchView, o?: { units?: UnitGroup[]; waHref?: string | null; compliance?: { permit_number: string; permit_qr: string; agency_name: string; agency_orn: string } | null; areaUnit?: string; headingLevel?: 2 | 3; sample?: boolean }): string;
export declare const waHrefFor: (phoneE164: string, project: string) => string;
