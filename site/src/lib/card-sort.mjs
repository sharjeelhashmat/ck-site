// The "Sort by" toggle over a data card grid (/areas, Dubai; Rules 1c v6.9). The grid is rendered in sales value order
// (lib/market.mjs areaCards), which is also what shows without JavaScript. Each card carries its position in both orders
// (data-order-value, data-order-change) and both rank labels (data-rank-value "#n", data-rank-change "#n by change", ''
// for a card with no comparable change, whose label is then hidden). The buttons are real buttons (keyboard operable)
// with aria-pressed. Plain ESM so tests/charts.test.mjs can drive it with a small fake document.

/**
 * Put the cards of a sortable grid in the given order and set the rank labels and the buttons.
 * @param {Element} section the element holding the .dc-sort buttons and the .dc-grid
 * @param {'value'|'change'} mode
 */
export function applySort(section, mode) {
  const grid = section.querySelector('.dc-grid[data-sortable="yes"]');
  if (!grid) return;
  const key = mode === 'change' ? 'orderChange' : 'orderValue';
  const cards = [...grid.children].filter((c) => c.classList.contains('dc'));
  cards.sort((a, b) => Number(a.dataset[key]) - Number(b.dataset[key])).forEach((c) => grid.appendChild(c));
  for (const c of cards) {
    const r = c.querySelector('.dc-rank');
    if (!r) continue;
    const text = mode === 'change' ? r.dataset.rankChange ?? '' : r.dataset.rankValue ?? '';
    r.textContent = text;
    r.hidden = text === '';
  }
  for (const b of section.querySelectorAll('.dc-sort button[data-sort]')) b.setAttribute('aria-pressed', b.dataset.sort === mode ? 'true' : 'false');
}

/** One click handler per document for every sort toggle on it, now or rendered later. @param {Document} doc */
export function initCardSort(doc) {
  const root = doc.documentElement;
  if (root.dataset.dcSort === 'bound') return;
  root.dataset.dcSort = 'bound';
  doc.addEventListener('click', (ev) => {
    const b = /** @type {Element|null} */ (ev.target)?.closest?.('.dc-sort button[data-sort]');
    if (!b) return;
    const section = b.closest('section') ?? doc.body;
    applySort(section, b.getAttribute('data-sort') === 'change' ? 'change' : 'value');
  });
}
