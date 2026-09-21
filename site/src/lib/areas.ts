// Orientation copy for each area, carried over verbatim from the live site. Price range, rental profile,
// investment case, risks and "view" are the owner's judgement calls and are intentionally empty until he
// supplies them. An area page with no filled detail stays noindex and out of the sitemap.

// A sourced figure. Same fields as an opportunity claim; an area page goes live (indexable, in the sitemap)
// only when all three snapshot figures are present, sourced and inside their 90-day review window.
export interface SnapshotClaim {
  value: string;
  sourceName: string;
  sourceType: string;
  sourceUrl: string;
  publishedOn: string;
  verifiedOn: string;
}

export interface AreaDetails {
  snapshot?: { priceSqft?: SnapshotClaim; rent?: SnapshotClaim; netYield?: SnapshotClaim };
  buyerProfile?: string;
  priceRange?: string;
  rentalProfile?: string;
  investmentCase?: string;
  risks?: string;
  sharjeelView?: string;
}

export interface Area {
  slug: string;
  name: string;
  overview: string;
  details: AreaDetails;
}

export const AREAS: Area[] = [
  {
    slug: 'downtown-dubai',
    name: 'Downtown Dubai',
    overview:
      "Home to the Burj Khalifa and The Dubai Mall — Dubai's dense, high-rise business and tourism core, with a mix of residential towers, hotels and corporate space.",
    details: {},
  },
  {
    slug: 'dubai-marina',
    name: 'Dubai Marina',
    overview:
      'A man-made waterfront canal district lined with high-rise residential towers and the Marina Walk promenade — popular with young professionals and short-stay visitors.',
    details: {},
  },
  {
    slug: 'dubai-hills',
    name: 'Dubai Hills',
    overview:
      'A master-planned Emaar community built around Dubai Hills Golf Club and Dubai Hills Mall — villas and low/mid-rise apartments with a more suburban, family-oriented feel.',
    details: {},
  },
  {
    slug: 'dubai-creek-harbour',
    name: 'Dubai Creek Harbour',
    overview:
      'A newer waterfront development on Dubai Creek near Ras Al Khor, planned as a mixed-use district with views back toward the Downtown Dubai skyline.',
    details: {},
  },
  {
    slug: 'dubai-islands',
    name: 'Dubai Islands',
    overview:
      "A reclaimed island development off Dubai's northern coast (formerly Deira Islands), positioned as an emerging beachfront residential and hospitality destination.",
    details: {},
  },
  {
    slug: 'palm-jumeirah',
    name: 'Palm Jumeirah',
    overview:
      'The iconic palm-shaped artificial island — beachfront villas and apartments, and one of the most recognized residential addresses in Dubai.',
    details: {},
  },
  {
    slug: 'palm-jebel-ali',
    name: 'Palm Jebel Ali',
    overview:
      'A second, larger palm-shaped island project further along the coast from Palm Jumeirah, positioned as a newer beachfront development.',
    details: {},
  },
  {
    slug: 'dubai-maritime-city',
    name: 'Dubai Maritime City',
    overview:
      'A peninsula development focused on the maritime industry and marine services, alongside waterfront residential and commercial space.',
    details: {},
  },
];

export const hasDetails = (a: Area): boolean => Object.entries(a.details).some(([k, v]) => k !== 'snapshot' && Boolean(v));
