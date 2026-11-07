// Data cards (Rules 1c v6.9, "Brand data standard"; replaces the v6.6 paired-bar chart blocks). Every comparison of
// figures on the site is shown as cards: one card per item, and inside the card the bar pair, the earlier period above
// the current one. There is no chart outside a card. This file defines the card once, as strings, for every place that
// draws one: /areas (both emirates), the area guide figures card and the Insights tables. The Astro component
// components/DataCard.astro renders the same strings at build time; the browser (/areas Dubai, the Dubai guides) calls
// the same functions. Plain ESM + JSDoc, no import, no chart library, no script, no request.
//
// Look (styles/data-card.css): current period bar solid Brass, earlier period bar a 1.5px Brass Deep outline with no fill
// (Brass on an Ink card); 10px bars with fully rounded ends; the value printed at the end of each bar and a small period
// label at its start; no legend. Change text is Ink when up and Brass Deep when down (Ivory and Brass on Ink). No Slate,
// Slate Light or Mono in a chart. Bar widths are fractions of the largest value in the card set, passed to CSS as --f.
// Each chart is role="img" with an aria-label that states both values and the change; the numbers stay in text.

/** @param {unknown} s */
export const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * A figure as written in a table cell: "126.7", "5.97", "AED 9.8bn", "1,234" -> 126.7, 5.97, 9.8, 1234; anything else NaN.
 * @param {unknown} s
 */
export function figure(s) {
  const m = /^(?:AED\s?)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:\s?bn)?$/.exec(String(s ?? '').trim());
  return m ? Number(m[1].replace(/,/g, '') + (m[2] ?? '')) : NaN;
}

/**
 * A change as written: "+11%" -> 11, "−46%" or "-46%" -> -46, "0%" -> 0; "≈8×" -> 700 (8 times = +700%); else NaN.
 * @param {unknown} s
 */
export function changeValue(s) {
  const t = String(s ?? '').trim();
  const pct = /^([+−-]?)(\d+(?:\.\d+)?)%$/.exec(t);
  if (pct) return (pct[1] === '−' || pct[1] === '-' ? -1 : 1) * Number(pct[2]);
  const times = /^≈(\d+(?:\.\d+)?)×$/.exec(t);
  return times ? (Number(times[1]) - 1) * 100 : NaN;
}

/** Whether the stated change agrees with the two values (within one percentage point, or 10% of an "≈N×"). */
export function changeAgrees(earlier, later, stated) {
  const c = changeValue(stated);
  if (!(earlier > 0) || !Number.isFinite(later) || !Number.isFinite(c)) return false;
  const actual = (later / earlier - 1) * 100;
  return /×/.test(String(stated)) ? Math.abs(later / earlier - (c / 100 + 1)) <= 0.1 * (c / 100 + 1) : Math.abs(actual - c) <= 1;
}

/** 'rise' | 'fall' | 'flat' for a change as written; anything that is not a number (e.g. "new this year") is 'flat'. */
export const dirOf = (changeText) => {
  const c = changeValue(changeText);
  return c > 0 ? 'rise' : c < 0 ? 'fall' : 'flat';
};

const pos = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;
/** A bar length as a fraction of the largest value in the card set, 0 to 1, three decimals; never a division by zero. */
export const barFraction = (v, max) => (pos(max) && Number.isFinite(v) && v > 0 ? Math.min(1, Math.round((v / max) * 1000) / 1000) : 0);

/**
 * @typedef {{name: string, earlierLabel: string, laterLabel: string, earlierName?: string, laterName?: string,
 *   earlier: number, later: number, earlierText: string, laterText: string, change: string}} Pair
 * earlierLabel / laterLabel: the small period labels on the bars ("2025", "Q3 2025"); earlierName / laterName: the
 * periods in full for the aria-label (default: the labels).
 */

/**
 * The bar pair: the earlier period row above the current period row. '' when either value is not a number above zero.
 * @param {Pair} p @param {number} max the largest value in the card set
 */
export function renderBars(p, max) {
  if (!pos(p?.earlier) || !pos(p?.later) || !pos(max)) return '';
  const label = `${p.name}: ${p.earlierText} in ${p.earlierName ?? p.earlierLabel}, ${p.laterText} in ${p.laterName ?? p.laterLabel}, change ${p.change}`;
  const row = (cls, period, v, text) => `<div class="dc-row dc-row--${cls}"><span class="dc-period">${escHtml(period)}</span>`
    + `<span class="dc-track"><span class="dc-bar dc-bar--${cls}" style="--f:${barFraction(v, max)}"></span><span class="dc-val">${escHtml(text)}</span></span></div>`;
  return `<div class="dc-chart" data-chart="bars" role="img" aria-label="${escHtml(label)}">`
    + row('earlier', p.earlierLabel, p.earlier, p.earlierText) + row('later', p.laterLabel, p.later, p.laterText) + '</div>';
}

/**
 * One data card. Every part is optional except the name; html parts (top, src) are passed through, text is escaped.
 * @param {{name?: string, heading?: 'h3'|'none', official?: string, rank?: {value: string, change?: string},
 *   value?: string, valueLabel?: string, bigChange?: string, pair?: Pair|null, max?: number, foot?: {left: string, change: string, dir?: string},
 *   top?: string, src?: string, dark?: boolean, attrs?: string, single?: boolean}} c
 */
export function renderDataCard(c) {
  const parts = [];
  if (c.top) parts.push(c.top);
  if (c.rank) parts.push(`<p class="dc-rank" data-rank-value="${escHtml(c.rank.value)}" data-rank-change="${escHtml(c.rank.change ?? '')}">${escHtml(c.rank.value)}</p>`);
  if (c.name && c.heading !== 'none') parts.push(`<h3 class="dc-name">${escHtml(c.name)}</h3>`);
  if (c.official && c.official !== c.name) parts.push(`<p class="dc-official">${escHtml(c.official)}</p>`);
  if (c.value) parts.push(`<p class="dc-value">${escHtml(c.value)}</p>`);
  if (c.valueLabel) parts.push(`<p class="dc-value-label">${escHtml(c.valueLabel)}</p>`);
  if (c.bigChange) parts.push(`<p class="dc-big-change dc-${dirOf(c.bigChange)}">${escHtml(c.bigChange)}</p>`);
  const bars = c.pair ? renderBars(c.pair, c.max ?? Math.max(c.pair.earlier, c.pair.later)) : '';
  if (bars) parts.push(bars);
  if (c.foot) parts.push(`<p class="dc-foot"><span>${escHtml(c.foot.left)}</span><span class="dc-change dc-${c.foot.dir ?? dirOf(c.foot.change)}">${escHtml(c.foot.change)}</span></p>`);
  if (c.src) parts.push(c.src);
  const cls = ['dc', c.single ? 'dc--single' : '', c.dark ? 'dc--dark' : '', bars ? '' : 'dc--nochart'].filter(Boolean).join(' ');
  return `<article class="${cls}"${c.attrs ?? ''}>${parts.join('')}</article>`;
}

/**
 * A grid of cards. One scale for the whole set: the largest value of any pair in it. cols: 4 (/areas: 4 columns, 2 on a
 * phone) or 2 (Insights: 2 columns, 1 on a phone).
 * @param {Array<Parameters<typeof renderDataCard>[0]>} cards @param {{label?: string, cols?: 2|4, attrs?: string}} [o]
 */
export function renderCardGrid(cards, o = {}) {
  const list = (cards ?? []).filter(Boolean);
  if (!list.length) return '';
  const max = setMax(list.map((c) => c.pair));
  const label = o.label ? ` role="group" aria-label="${escHtml(o.label)}"` : '';
  return `<div class="dc-grid dc-grid--${o.cols ?? 4}"${label}${o.attrs ?? ''}>${list.map((c) => renderDataCard({ ...c, max })).join('')}</div>`;
}

/** The largest value of any pair (0 when there is none). @param {Array<Pair|null|undefined>} pairs */
export function setMax(pairs) {
  const v = pairs.filter(Boolean).flatMap((p) => [p.earlier, p.later]).filter(pos);
  return v.length ? Math.max(...v) : 0;
}

/**
 * The order of the cards for the sort toggle: 'value' keeps the given order (sales value, highest first); 'change' puts
 * the cards with a comparable change first, highest first ("≈N×" above percentages, ties by value order), then the rest
 * in value order. Returns indexes into cards. @param {Array<{changeRank: [number, number]|null}>} cards @param {'value'|'change'} mode
 */
export function sortOrder(cards, mode) {
  const idx = cards.map((_, i) => i);
  if (mode !== 'change') return idx;
  const ranked = idx.filter((i) => cards[i].changeRank).sort((a, b) => cards[b].changeRank[0] - cards[a].changeRank[0] || cards[b].changeRank[1] - cards[a].changeRank[1] || a - b);
  return [...ranked, ...idx.filter((i) => !cards[i].changeRank)];
}

// ---- Insights: a table's optional chart spec --------------------------------------------------------------------------

/**
 * A table block may declare which columns hold the earlier value, the later value and the change:
 *   chart: { title, source, period, label: 0, earlier: {label: "2025", col: 1}, later: {label: "2026", col: 2}, change: 3 }
 * A column the table does not have can be given as values (one per row, as written), e.g. a prior period that the article
 * states only as a change: earlier: {label: "Q3 2025", values: ["4.51", ...]}. Returns the problems ('' fields named).
 * @param {{head: string[], rows: string[][]}} table @param {any} spec
 */
export function checkChartSpec(table, spec) {
  const e = [];
  if (!spec || typeof spec !== 'object') return ['chart must be an object'];
  const cols = Array.isArray(table?.head) ? table.head.length : 0;
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const col = (n) => Number.isInteger(n) && n >= 0 && n < cols;
  for (const f of ['title', 'source', 'period']) if (typeof spec[f] !== 'string' || !spec[f].trim()) e.push(`chart: missing ${f}`);
  if (!col(spec.label)) e.push('chart: label must be a column index');
  if (!col(spec.change)) e.push('chart: change must be a column index');
  for (const side of ['earlier', 'later']) {
    const s = spec[side];
    if (!s || typeof s.label !== 'string' || !s.label.trim()) { e.push(`chart: ${side}.label`); continue; }
    const hasCol = 'col' in s;
    const hasValues = 'values' in s;
    if (hasCol === hasValues) e.push(`chart: ${side} needs exactly one of col and values`);
    else if (hasCol && !col(s.col)) e.push(`chart: ${side}.col must be a column index`);
    else if (hasValues && !(Array.isArray(s.values) && s.values.length === rows.length)) e.push(`chart: ${side}.values needs one value per row (${rows.length})`);
  }
  if (e.length) return e;
  const data = chartRows(table, spec);
  data.forEach((r, i) => {
    if (!(r.earlier >= 0) || !(r.later >= 0)) e.push(`chart: row ${i + 1} has a value that is not a figure`);
    else if (!changeAgrees(r.earlier, r.later, r.change)) e.push(`chart: row ${i + 1} change ${r.change} does not match ${r.earlierText} to ${r.laterText}`);
  });
  return e;
}

/** The chart rows a table and its spec describe: values exactly as the table (or spec) writes them. */
export function chartRows(table, spec) {
  const cell = (row, i, side) => ('values' in spec[side] ? String(spec[side].values[i]) : String(row[spec[side].col]));
  return (table.rows ?? []).map((row, i) => {
    const earlierText = cell(row, i, 'earlier');
    const laterText = cell(row, i, 'later');
    return { label: String(row[spec.label]), earlier: figure(earlierText), later: figure(laterText), earlierText, laterText, change: String(row[spec.change]) };
  });
}

/** A table needs a chart when it compares: a column headed "Change" or "vs" (Rules 1c v6.6). */
export const isComparisonTable = (table) => Array.isArray(table?.head) && table.head.some((h) => /\bchange\b|\bvs\b/i.test(String(h)));

/** Whether a chart spec's figures are AED billions: its title says so, or a value column is headed "(AED bn)". */
export const isAedBn = (table, spec) => /\bin AED (billion|bn)\b/.test(spec?.title ?? '')
  || ['earlier', 'later'].some((k) => 'col' in (spec?.[k] ?? {}) && /\(AED bn\)/.test(String(table?.head?.[spec[k].col] ?? '')));

/** A figure as the cards print it: "AED 96.5bn" for AED billions (the table's own digits), else as written. */
export const cardFigure = (text, aed) => (aed ? `AED ${text}bn` : text);

/** Whether the table's label column is headed "DLD area (common name)": its labels read "DLD name (common name)". */
export const isDldLabelColumn = (table, spec) => /^DLD area \(common name\)$/i.test(String(table?.head?.[spec?.label] ?? '').trim());

/**
 * The common-name-first rule (Rules 1c v6.9) for a table label "Madinat Al Mataar (Dubai South)": the card heading is the
 * common name and "DLD: Madinat Al Mataar" goes under it; a label with no bracket (Business Bay, Al Yufrah 1) is the
 * heading alone. The table itself keeps its labels as written. @param {string} label
 */
export function splitDldLabel(label) {
  const m = /^(.+?) \(([^()]+)\)$/.exec(String(label ?? '').trim());
  return m ? { name: m[2], official: `DLD: ${m[1]}` } : { name: String(label ?? ''), official: '' };
}

/**
 * The cards for an article table, or '' when it declares no chart: one card per row (heading = the row label, or for a
 * "DLD area (common name)" column the common name with the DLD name under it; the change large; the bar pair), on one scale. Bar values use the site's money format, "AED 96.5bn", with the table's own digits
 * (Coordinator review 2026-11-07); the table itself follows on the page, unchanged. src: the block's 1-based source
 * numbers, linked in the source line under the cards as on the rest of the article.
 */
export function renderTableCards(id, table, spec, src = []) {
  if (!spec) return '';
  const rows = chartRows(table, spec);
  const aed = isAedBn(table, spec);
  const cite = src.length ? ` ${src.map((n) => `<a href="#src-${n}">[${n}]</a>`).join(' ')}` : '';
  const dld = isDldLabelColumn(table, spec);
  const cards = rows.map((r) => {
    const { name, official } = dld ? splitDldLabel(r.label) : { name: r.label, official: '' };
    return {
      name, official, bigChange: r.change,
      pair: {
        name, earlierLabel: spec.earlier.label, laterLabel: spec.later.label, earlier: r.earlier, later: r.later,
        earlierText: cardFigure(r.earlierText, aed), laterText: cardFigure(r.laterText, aed), change: r.change,
      },
    };
  });
  const grid = renderCardGrid(cards, { label: spec.title, cols: 2, attrs: ` id="${escHtml(id)}"` });
  return grid ? `${grid}<p class="dc-src">Source: ${escHtml(spec.source)}${cite}. ${escHtml(spec.period)}.</p>` : '';
}
