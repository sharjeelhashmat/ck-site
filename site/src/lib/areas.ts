// The eight Dubai areas used by the investor profile form and the /buy page list. Slugs and names must stay as they are:
// the Worker validates the profile's area values (worker/src/profile.ts; tests/profile.test.mjs checks they agree).
// The area guide pages themselves (16, Dubai and Abu Dhabi) read src/data/area-guides.json through area-guides.ts.

export interface Area {
  slug: string;
  name: string;
}

export const AREAS: Area[] = [
  {
    slug: 'downtown-dubai',
    name: 'Downtown Dubai',
  },
  {
    slug: 'dubai-marina',
    name: 'Dubai Marina',
  },
  {
    slug: 'dubai-hills',
    name: 'Dubai Hills',
  },
  {
    slug: 'dubai-creek-harbour',
    name: 'Dubai Creek Harbour',
  },
  {
    slug: 'dubai-islands',
    name: 'Dubai Islands',
  },
  {
    slug: 'palm-jumeirah',
    name: 'Palm Jumeirah',
  },
  {
    slug: 'palm-jebel-ali',
    name: 'Palm Jebel Ali',
  },
  {
    slug: 'dubai-maritime-city',
    name: 'Dubai Maritime City',
  },
];
