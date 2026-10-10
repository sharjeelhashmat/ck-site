// Mobile menu focus rules (Brand v3.1 follow-up, owner-approved 2026-10-10). While the menu is open, focus cycles
// between the menu button and the menu items and never reaches the page behind. Pure, so the rules are tested in Node;
// Nav.astro applies them.

/**
 * Where Tab or Shift+Tab should move focus while the menu is open, or null to let the browser move it (the next item
 * in DOM order, since the menu button comes directly before the items).
 * @template T
 * @param {{ shift: boolean; active: T | null; button: T; items: T[] }} p
 * @returns {T | null}
 */
export function wrapFocus({ shift, active, button, items }) {
  const first = items[0] ?? null;
  const last = items[items.length - 1] ?? null;
  if (!first || !last) return button;
  if (active === button) return shift ? last : first;
  if (active === last && !shift) return button;
  if (active === first && shift) return button;
  // Focus is somewhere outside the cycle (it should not be): bring it back in.
  if (!items.includes(/** @type {T} */ (active))) return shift ? last : first;
  return null;
}

/**
 * The page behind the menu: every element child of <body> except the header that holds the menu. Elements that are
 * already inert are left out, so closing the menu never removes an inert it did not add.
 * @template {{ hasAttribute(name: string): boolean }} E
 * @param {E[]} children
 * @param {E | null} header
 * @returns {E[]}
 */
export function pageBehind(children, header) {
  return children.filter((el) => el !== header && !el.hasAttribute('inert'));
}
