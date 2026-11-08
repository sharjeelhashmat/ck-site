// Order of the area guide cards on /areas (Coordinator brief 2026-11-08): per emirate, the guides for this year's top 8
// areas by sales value come first, in rank order, then every other guide in the order of src/data/area-guides.json.
// Guides are never dropped. Abu Dhabi's ranking is ADREC's, applied at build time; Dubai's is the Worker's latest year to
// date (/market/areas top8), applied in the browser, and until it arrives (or if it never does) the JSON order stands.
// Plain ESM so the Astro build, the browser and node:test share one implementation.

/** How many ranked areas lead the list. */
export const TOP = 8;

/**
 * The order of the guides: indexes into guides. A guide leads when its area is among the first TOP of ranked (area names
 * in rank order, highest sales value first); the rest keep their given order.
 * @param {Array<{area?: string|null}>} guides in JSON order @param {string[]} ranked area names, rank order
 * @returns {number[]}
 */
export function guideOrder(guides, ranked) {
  const top = (Array.isArray(ranked) ? ranked : []).slice(0, TOP);
  const pos = (g) => (g?.area ? top.indexOf(g.area) : -1);
  const idx = guides.map((_, i) => i);
  const lead = idx.filter((i) => pos(guides[i]) >= 0).sort((a, b) => pos(guides[a]) - pos(guides[b]));
  return [...lead, ...idx.filter((i) => pos(guides[i]) < 0)];
}

/**
 * Dubai's ranked area names from the Worker rows (lib/market.mjs dubaiRows): by rank, lowest number first.
 * @param {Array<{rank: number, area: string}>} rows
 */
export const rankedAreas = (rows) => [...(rows ?? [])].sort((a, b) => a.rank - b.rank).map((r) => r.area);

/**
 * Put one emirate's guide cards (<a class="mk-guide" data-area="...">) in guideOrder. Moves the existing cards only.
 * @param {Document} doc @param {string} emirate @param {string[]} ranked
 */
export function applyGuideOrder(doc, emirate, ranked) {
  const grid = doc.querySelector(`.mk-guides[data-emirate="${emirate}"] .mk-guide-grid`);
  if (!grid) return;
  const cards = [...grid.children];
  // Always from the JSON order (data-order), so applying twice gives the same result.
  cards.sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
  for (const i of guideOrder(cards.map((c) => ({ area: c.dataset.area })), ranked)) grid.appendChild(cards[i]);
}
