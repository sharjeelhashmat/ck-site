// The area guide cards on /areas, per emirate, in two sections (Rules 8d v6.7, owner-approved 6 Nov: "an area that leaves
// the top 8 keeps its guide under 'More areas'"):
//   "Area guides · <emirate>": the guides for this year's top 8 areas by sales value, in rank order;
//   "More areas · <emirate>": every other guide, alphabetical by name.
// A section with no guide is not shown. Guides are never dropped. Abu Dhabi's ranking is ADREC's, applied at build time;
// Dubai's is the Worker's latest year to date (/market/areas top8), applied in the browser. Without a ranking (before the
// Worker answers, or if it never does) every guide stays in the first section, in the order of src/data/area-guides.json.
// Plain ESM so the Astro build, the browser and node:test share one implementation.

/** How many ranked areas make the first section. */
export const TOP = 8;

/**
 * The two sections: indexes into guides. top: guides whose area is among the first TOP of ranked (area names in rank
 * order, highest sales value first), in that order; more: every other guide, alphabetical by name. With no ranking, top
 * is every guide in the given order and more is empty.
 * @param {Array<{area?: string|null, name: string}>} guides in JSON order @param {string[]|null|undefined} ranked
 * @returns {{top: number[], more: number[]}}
 */
export function guideSections(guides, ranked) {
  const idx = guides.map((_, i) => i);
  const top8 = (Array.isArray(ranked) ? ranked : []).slice(0, TOP);
  if (!top8.length) return { top: idx, more: [] };
  const pos = (g) => (g?.area ? top8.indexOf(g.area) : -1);
  const top = idx.filter((i) => pos(guides[i]) >= 0).sort((a, b) => pos(guides[a]) - pos(guides[b]));
  const more = idx.filter((i) => pos(guides[i]) < 0).sort((a, b) => String(guides[a].name).localeCompare(String(guides[b].name), 'en') || a - b);
  return { top, more };
}

/**
 * Dubai's ranked area names from the Worker rows (lib/market.mjs dubaiRows): by rank, lowest number first.
 * @param {Array<{rank: number, area: string}>} rows
 */
export const rankedAreas = (rows) => [...(rows ?? [])].sort((a, b) => a.rank - b.rank).map((r) => r.area);

/**
 * Put one emirate's guide cards (<a class="mk-guide" data-order data-area data-name>) into its two sections
 * (<section class="mk-guides" data-emirate data-group="top"|"more">). Moves the existing cards only, sets each section's
 * data-count, and hides a section left empty. Showing a section is lib/areas-page.mjs's job (it runs after this and
 * follows the emirate switch), so a section that gains cards is not unhidden here.
 * @param {Document} doc @param {string} emirate @param {string[]} ranked
 */
export function applyGuideSections(doc, emirate, ranked) {
  const section = (group) => doc.querySelector(`.mk-guides[data-emirate="${emirate}"][data-group="${group}"]`);
  const top = section('top');
  const more = section('more');
  if (!top || !more) return;
  const grid = (s) => s.querySelector('.mk-guide-grid');
  // Always from the JSON order (data-order), so applying twice gives the same result.
  const cards = [...grid(top).children, ...grid(more).children].sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
  const s = guideSections(cards.map((c) => ({ area: c.dataset.area, name: c.dataset.name })), ranked);
  for (const [sec, list] of [[top, s.top], [more, s.more]]) {
    for (const i of list) grid(sec).appendChild(cards[i]);
    sec.dataset.count = String(list.length);
    if (!list.length) sec.hidden = true;
  }
}
