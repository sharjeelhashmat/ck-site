// Behaviour of /areas: which emirate shows, the switch, and the sticky offset. Plain ESM so node:test can check decide()
// and initAreasPage() (with a small fake document).

export const EMIRATE_IDS = ['dubai', 'abu_dhabi'];

/**
 * @param {{dubai: boolean, abu_dhabi: boolean}} has  whether each emirate has any figures to show
 * @returns {{shown: string[], selected: string|null, switchVisible: boolean}}
 */
export function decide(has) {
  const shown = EMIRATE_IDS.filter((e) => has[e]);
  return { shown, selected: shown[0] ?? null, switchVisible: shown.length === 2 };
}

/**
 * What is visible for a decision: panels and guide lists per emirate. The switch is the only way to reach the other
 * emirate, so without it every guide list stays visible (audit H10): Dubai guides are never hidden when there is no switch.
 * @param {{selected: string|null, switchVisible: boolean}} state
 * @param {string|null} [selected] the emirate picked on the switch (defaults to state.selected)
 */
export function visibility(state, selected = state.selected) {
  const out = {};
  for (const e of EMIRATE_IDS) {
    out[e] = { panel: e === selected, guides: state.switchVisible ? e === selected : true };
  }
  return out;
}

/**
 * Fill the panels, decide what shows and wire the switch. Safe to call more than once: slots are replaced (never
 * appended) and the switch listeners and the resize handler are attached once per document.
 * @param {Document} doc
 * @param {{dubai: {ytd: string, top: string, change: string}, abu_dhabi: {ytd: string}}} html  rendered sections ('' = none)
 */
export function initAreasPage(doc, html) {
  const panel = (e) => doc.querySelector(`.mk-panel[data-emirate="${e}"]`);
  const slot = (e, s) => panel(e)?.querySelector(`[data-slot="${s}"]`);
  for (const [e, parts] of Object.entries(html ?? {})) {
    for (const [s, h] of Object.entries(parts ?? {})) {
      const el = slot(e, s);
      if (el && h) el.innerHTML = h;
    }
  }
  const filled = (e) => [...(panel(e)?.querySelectorAll('[data-slot]') ?? [])].some((el) => el.innerHTML.trim() !== '');
  const state = decide({ dubai: filled('dubai'), abu_dhabi: filled('abu_dhabi') });
  const guides = (e) => doc.querySelector(`.mk-guides[data-emirate="${e}"]`);
  const pills = [...doc.querySelectorAll('.mk-pill')];
  const bar = doc.getElementById('mk-switch');
  const ask = doc.getElementById('mk-ask');

  const apply = (v, selected) => {
    for (const e of EMIRATE_IDS) {
      const p = panel(e);
      if (p) p.hidden = !v[e].panel;
      const g = guides(e);
      if (g) g.hidden = !v[e].guides;
    }
    for (const b of pills) {
      const on = b.dataset.emirate === selected;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    }
  };
  apply(visibility(state), state.selected);
  if (bar) bar.hidden = !state.switchVisible;
  if (ask) ask.hidden = !state.selected; // no figures at all: both guide lists stay, nothing else shows
  if (!state.switchVisible || !bar) return state;

  // Listeners once per page, however often this runs.
  if (bar.dataset.mkBound !== 'yes') {
    bar.dataset.mkBound = 'yes';
    // Both emirates have figures whenever the switch is on screen.
    const pick = (e) => { if (EMIRATE_IDS.includes(e)) apply(visibility({ selected: e, switchVisible: true }), e); };
    pills.forEach((b) => {
      b.addEventListener('click', () => pick(b.dataset.emirate));
      b.addEventListener('keydown', (ev) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
        if (!step) return;
        ev.preventDefault();
        const i = pills.indexOf(b);
        const next = pills[(i + step + pills.length) % pills.length];
        pick(next.dataset.emirate);
        next.focus();
      });
    });
    // Sticky directly under the fixed header: measure it instead of assuming its height.
    const header = doc.querySelector('.site-nav');
    const measure = () => doc.documentElement.style.setProperty('--mk-header', `${header ? header.getBoundingClientRect().height : 0}px`);
    measure();
    doc.defaultView?.addEventListener('resize', measure);
  }
  return state;
}
