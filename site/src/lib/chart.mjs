// Comparison charts (Rules 1c v6.6): every comparison of figures on the site is shown with a chart as well as the numbers.
// Paired bars, one pair per row: the earlier period above the later one, every value written next to its bar, the change
// written beside each pair, and a source and period line under the chart. Pure inline SVG built as a string: no chart
// library, no script, no request. Plain ESM + JSDoc so the Astro build, the browser (/areas, the area guides) and node:test
// share one implementation. The table beside a chart stays the text alternative; the chart repeats its values exactly.
//
// Colours are Rules 1c tokens: earlier period Slate (--sky), later period Ink. Slate Light, the colour the rule names for
// the earlier period, is 2.3:1 on Ivory and 2.6:1 on white, below the 3:1 a bar needs (WCAG 1.4.11); Slate is the closest
// token that passes (4.6:1 on the white chart card, 3.4:1 against Ink). Change text is Ink for a rise and Brass Deep for a
// fall, as on /areas. Brass is never used as text.
//
// The SVG has no viewBox: its user units are CSS pixels, so the 14px text never scales down on a phone. Bar lengths are
// percentages of the chart width; the room the value and change labels need is reserved from the widest label, measured at
// the narrowest chart (a 320px screen, minus the page and card padding).

const MIN_WIDTH = 216;  // px: the narrowest chart: inside the area guide card on a 320px screen (224px), with margin
const CHAR = 8.5;       // px: a generous width for one 14px Inter character (tabular digits are about 8.1px)
const LINE = 20;        // px: one label line
const BAR = 14;         // px: bar height
const BAR_GAP = 4;      // px: between the two bars of a pair
const ROW_GAP = 20;     // px: between rows
const LEGEND = 28;      // px: legend height
const WRAP = Math.floor((MIN_WIDTH - 8) / CHAR); // characters per label line

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

/** Splits a label into lines of at most WRAP characters, at spaces. @param {string} s */
export function wrapLabel(s, width = WRAP) {
  const lines = [];
  let cur = '';
  for (const w of String(s).split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + w).length > width) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

const dirOf = (changeText) => {
  const c = changeValue(changeText);
  return c > 0 ? 'rise' : c < 0 ? 'fall' : 'flat';
};

/**
 * @typedef {{label: string, earlier: number, later: number, earlierText: string, laterText: string, change: string}} ChartRow
 * @typedef {{id: string, title: string, earlierLabel: string, laterLabel: string, rows: ChartRow[], caption: string}} Chart
 * caption is HTML (it may hold a source link); every other field is text and is escaped here.
 * @param {Chart} c
 * @returns {string} '' when there is no row to draw
 */
export function renderCompareChart(c) {
  const rows = (c?.rows ?? []).filter((r) => r && Number.isFinite(r.earlier) && Number.isFinite(r.later) && r.earlier >= 0 && r.later >= 0);
  if (!rows.length || !c.id) return '';
  const top = Math.max(...rows.flatMap((r) => [r.earlier, r.later]));
  // Room for the widest value and change labels at the narrowest chart width; the bars take what is left.
  const valueChars = Math.max(...rows.flatMap((r) => [r.earlierText.length, r.laterText.length]));
  const changeChars = Math.max(...rows.map((r) => r.change.length));
  const barMax = Math.max(30, Math.floor(((MIN_WIDTH - CHAR * (valueChars + changeChars) - 24) / MIN_WIDTH) * 100));
  const pct = (v) => (top > 0 ? Math.round((v / top) * barMax * 10) / 10 : 0);

  // The two legend keys side by side when both fit the narrowest chart, else one under the other.
  const sideBySide = 18 + CHAR * c.earlierLabel.length + 24 + 18 + CHAR * c.laterLabel.length <= MIN_WIDTH;
  const kx = sideBySide ? 18 + CHAR * c.earlierLabel.length + 24 : 0;
  const ky = sideBySide ? 0 : LINE;
  let y = LEGEND + ky + 8;
  const body = rows.map((r) => {
    const lines = wrapLabel(r.label);
    const label = lines.map((l, i) => `<text class="cmp-label" x="0" y="${y + 14 + i * LINE}">${escHtml(l)}</text>`).join('');
    y += lines.length * LINE + 4;
    const yE = y;
    const yL = y + BAR + BAR_GAP;
    const mid = yE + BAR + BAR_GAP / 2;
    const bar = (yy, v, text, cls) => {
      const w = pct(v);
      return `<rect class="${cls}" x="0" y="${yy}" width="${w}%" height="${BAR}"></rect>`
        + `<text class="cmp-value" x="${w}%" dx="6" y="${yy + BAR / 2}" dominant-baseline="central">${escHtml(text)}</text>`;
    };
    const out = `<g class="cmp-row">${label}${bar(yE, r.earlier, r.earlierText, 'cmp-earlier')}${bar(yL, r.later, r.laterText, 'cmp-later')}`
      + `<text class="cmp-change cmp-${dirOf(r.change)}" x="100%" y="${mid}" text-anchor="end" dominant-baseline="central">${escHtml(r.change)}</text></g>`;
    y = yL + BAR + ROW_GAP;
    return out;
  }).join('');
  const height = y - ROW_GAP + 4;
  const desc = rows.map((r) => `${r.label}: ${r.earlierText} in ${c.earlierLabel}, ${r.laterText} in ${c.laterLabel}, change ${r.change}`).join('; ');
  const t = `${c.id}-t`;
  const d = `${c.id}-d`;
  return `<figure class="cmp" data-chart="compare">
<svg class="cmp-svg" width="100%" height="${height}" role="img" aria-labelledby="${t} ${d}" focusable="false" xmlns="http://www.w3.org/2000/svg">
<title id="${t}">${escHtml(c.title)}</title><desc id="${d}">${escHtml(desc)}.</desc>
<g class="cmp-legend" aria-hidden="true"><rect class="cmp-earlier" x="0" y="6" width="12" height="12"></rect><text class="cmp-key" x="18" y="12" dominant-baseline="central">${escHtml(c.earlierLabel)}</text>`
    + `<rect class="cmp-later" x="${kx}" y="${6 + ky}" width="12" height="12"></rect><text class="cmp-key" x="${kx + 18}" y="${12 + ky}" dominant-baseline="central">${escHtml(c.laterLabel)}</text></g>
${body}
</svg>
<figcaption class="cmp-src">${c.caption}</figcaption>
</figure>`;
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

/**
 * The chart for an article table, or '' when it declares none. src: the block's 1-based source numbers; the first one is
 * linked in the caption as on the rest of the article.
 */
export function renderTableChart(id, table, spec, src = []) {
  if (!spec) return '';
  const cite = src.length ? ` ${src.map((n) => `<a href="#src-${n}">[${n}]</a>`).join(' ')}` : '';
  return renderCompareChart({
    id, title: spec.title, earlierLabel: spec.earlier.label, laterLabel: spec.later.label, rows: chartRows(table, spec),
    caption: `Source: ${escHtml(spec.source)}${cite}. ${escHtml(spec.period)}.`,
  });
}
