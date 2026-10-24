// Area guides (Part F, copy owner-approved 2026-10-16). The copy lives in src/data/area-guides.json exactly as approved;
// it carries no figures: every number on a guide page comes from the live figures card (DLD via the Worker, or ADREC via
// src/data/adrec-areas.json). The build fails if a copy field contains a digit (only the proper noun "Pier 7" is allowed).
import data from '../data/area-guides.json';
import adrec from '../data/adrec-areas.json';
import { checkAdrecAreas } from './market.mjs';

export type Emirate = 'dubai' | 'abu_dhabi';
export interface Guide {
  slug: string;
  emirate: Emirate;
  h1: string;
  one_liner: string;
  // Meta description when one_liner is over 160 characters (audit item 21); one_liner stays the visible copy.
  meta_description?: string;
  what_it_is: string;
  who_buys: string;
  things_to_consider: string[];
  my_view: string;
  dld_area?: string;
}
export interface AdrecArea {
  rank: number;
  area: string;
  value_bn: number;
  share_pct: number;
  change_pct?: number | null;
  change_text?: string;
  guide: string;
}
export interface AdrecFile {
  period: string;
  published: string | null;
  total_res_bn: number | null;
  prior_total_res_bn?: number | null;
  source_url: string;
  areas: AdrecArea[];
}

export const VIEW_HEADING: string = data.view_heading;
export const GUIDES = data.guides as Guide[];
export const ADREC = adrec as AdrecFile;
/** The period both emirates show: the latest one ADREC publishes by area. */
export const PERIOD = ADREC.period;

export const guidesFor = (e: Emirate) => GUIDES.filter((g) => g.emirate === e);

/** Every copy field of a guide, for the no-digit rule and the copy tests. */
export const copyFields = (g: Guide): string[] => [g.h1, g.one_liner, g.what_it_is, g.who_buys, ...g.things_to_consider, g.my_view];

export function digitProblems(): string[] {
  return GUIDES.flatMap((g) => copyFields(g).filter((t) => /\d/.test(t.replace(/\bPier 7\b/g, ''))).map((t) => `${g.slug}: digit in "${t.slice(0, 60)}…"`));
}

const problems = [
  ...digitProblems(),
  ...(GUIDES.length === 16 ? [] : [`expected 16 guides, found ${GUIDES.length}`]),
  ...GUIDES.filter((g) => g.emirate === 'dubai' && !g.dld_area).map((g) => `${g.slug}: dld_area missing`),
  ...checkAdrecAreas(ADREC, guidesFor('abu_dhabi').map((g) => g.slug)).map((p) => `adrec-areas.json: ${p}`),
];
if (problems.length) throw new Error(`Area guide data:\n- ${problems.join('\n- ')}`);
