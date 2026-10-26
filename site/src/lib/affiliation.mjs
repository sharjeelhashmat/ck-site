// The "Working with <agency> · ORN <orn> · BRN <brn>" line. Plain ESM with JSDoc so the Astro build and node:test share it.
// In Dubai the agency holds the ORN (RERA Office Registration Number) and the broker holds the BRN (the number on the
// RERA broker card). Owner decisions 2026-10-10 and 2026-10-26: the line is shown only when the agency, its ORN and the
// broker's BRN are ALL known; otherwise nothing is rendered (no "pending", no placeholder).

/**
 * @param {string} agency
 * @param {string} orn
 * @param {string} brn
 * @returns {string} the affiliation line, or '' when any value is empty
 */
export function affiliationLine(agency, orn, brn) {
  const a = (agency ?? '').trim();
  const o = (orn ?? '').trim();
  const b = (brn ?? '').trim();
  return a && o && b ? `Working with ${a} · ORN ${o} · BRN ${b}` : '';
}
