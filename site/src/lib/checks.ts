// The five checks (owner decision M5, 2026-09-26): ONE source for /about, /investment-approach and /invest (audit item 27),
// so the three pages cannot drift. In the numbered lists the first four read "<strong>Price.</strong> text" and the last
// "<strong>My view:</strong> text"; on /invest each is a card with the name as its heading and the text as a sentence.
export interface Check { name: string; sep: '.' | ':'; text: string }

export const FIVE_CHECKS: readonly Check[] = [
  { name: 'Price', sep: '.', text: 'What comparable units actually sold for, per Dubai Land Department records, not the asking price.' },
  { name: 'Returns', sep: '.', text: 'Net yield after service charges, vacancy and management. For off-plan, the payment plan set against your cash flow.' },
  { name: 'Risk', sep: '.', text: "The developer's delivery record, the project's escrow status, and the supply arriving in the same area." },
  { name: 'Exit', sep: '.', text: 'Who buys this unit from you in five years, and at what realistic price.' },
  { name: 'My view', sep: ':', text: "buy, watch, or pass. If the numbers don't work, I'll tell you not to buy." },
];

/** The text as a stand-alone sentence (capital first letter), for the /invest cards. */
export const asSentence = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
