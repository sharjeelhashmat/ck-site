// The seven-factor method (owner decision 2026-09-21). Factor keys and order come from the rules in intel.mjs, so the
// public copy, the Property Brief and the tests cannot drift apart. Only the plain-language description lives here.
import { FACTORS } from './intel.mjs';

const DESC: Record<string, string> = {
  location: 'Where the asset is, and what is changing around it.',
  entry: "What you're actually paying, including the payment plan, relative to comparable transactions.",
  fundamentals: 'What supports real demand for this unit, in this building, at this price.',
  yield: 'Return after service charges and costs, not the gross number on a brochure.',
  supply: 'How much competing inventory is coming to this area or building.',
  liquidity: 'Who is likely to buy from you later, and how easily you can get out.',
  risk: 'What could invalidate the thesis.',
};

export const METHOD = FACTORS.map((f) => ({ key: f.key, title: f.label, desc: DESC[f.key] }));
