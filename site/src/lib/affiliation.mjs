// The "Working with <agency> · BRN <number>" line. Plain ESM with JSDoc so the Astro build and node:test share it.
// Owner decision 2026-10-10: the line is shown only when BOTH the agency and the BRN are known; otherwise nothing is
// rendered (no "pending", no placeholder).

/**
 * @param {string} brokerage
 * @param {string} brn
 * @returns {string} the affiliation line, or '' when either value is empty
 */
export function affiliationLine(brokerage, brn) {
  const b = (brokerage ?? '').trim();
  const n = (brn ?? '').trim();
  return b && n ? `Working with ${b} · BRN ${n}` : '';
}
