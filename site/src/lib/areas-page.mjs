// Behaviour of /areas: which emirate shows, the switch, and the sticky offset. Plain ESM so node:test can check decide().

/**
 * @param {{dubai: boolean, abu_dhabi: boolean}} has  whether each emirate has any figures to show
 * @returns {{shown: string[], selected: string|null, switchVisible: boolean}}
 */
export function decide(has) {
  const shown = ['dubai', 'abu_dhabi'].filter((e) => has[e]);
  return { shown, selected: shown[0] ?? null, switchVisible: shown.length === 2 };
}

/**
 * @param {Document} doc
 * @param {{dubai: {ytd: string, top: string, change: string}, abu_dhabi: {ytd: string}}} html  rendered sections ('' = none)
 */
export function initAreasPage(doc, html) {
  const panel = (e) => doc.querySelector(`.mk-panel[data-emirate="${e}"]`);
  const slot = (e, s) => panel(e)?.querySelector(`[data-slot="${s}"]`);
  for (const [e, parts] of Object.entries(html)) {
    for (const [s, h] of Object.entries(parts)) {
      const el = slot(e, s);
      if (el && h) el.innerHTML = h;
    }
  }
  const filled = (e) => [...(panel(e)?.querySelectorAll('[data-slot]') ?? [])].some((el) => el.innerHTML.trim() !== '');
  const state = decide({ dubai: filled('dubai'), abu_dhabi: filled('abu_dhabi') });
  const guides = (e) => doc.querySelector(`.mk-guides[data-emirate="${e}"]`);
  if (!state.selected) return state; // no figures at all: both guide lists stay, nothing else shows

  const ask = doc.getElementById('mk-ask');
  if (ask) ask.hidden = false;
  const pills = [...doc.querySelectorAll('.mk-pill')];
  const select = (e) => {
    for (const x of ['dubai', 'abu_dhabi']) {
      const on = x === e;
      const p = panel(x);
      if (p) p.hidden = !on;
      const g = guides(x);
      if (g) g.hidden = !on;
    }
    for (const b of pills) {
      const on = b.dataset.emirate === e;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    }
  };
  select(state.selected);

  const bar = doc.getElementById('mk-switch');
  if (state.switchVisible && bar) {
    bar.hidden = false;
    pills.forEach((b, i) => {
      b.addEventListener('click', () => select(b.dataset.emirate));
      b.addEventListener('keydown', (ev) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
        if (!step) return;
        ev.preventDefault();
        const next = pills[(i + step + pills.length) % pills.length];
        select(next.dataset.emirate);
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
