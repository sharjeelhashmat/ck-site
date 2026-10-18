// Market figures on /areas, the area guides and /new-launches. Plain ESM + JSDoc so the Astro build, the browser and
// node:test share one implementation. Every renderer returns '' when it has nothing to show: production never shows an
// empty box, a zero, a spinner or a placeholder. Text colours come from Rules 1c tokens only (rises Ink, falls Brass Deep).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SPANS = { H1: [1, 6], H2: [7, 12], Q1: [1, 3], Q2: [4, 6], Q3: [7, 9], Q4: [10, 12] };
const MINUS = '−';

export const SOURCES = {
  dubaiTx: { name: 'Dubai Land Department, Real Estate Transactions open data via Data.Dubai (Open Data Licence)', url: 'https://data.dubai/en/l/470061' },
  adrec: { name: 'Abu Dhabi Real Estate Centre (ADREC)', url: 'https://adrec.gov.ae/en' },
};
export const EMIRATES = { dubai: 'Dubai', abu_dhabi: 'Abu Dhabi' };

/** @param {string} s */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** "2026-H1" -> {year, span} or null. @param {string} id */
export function parsePeriod(id) {
  const m = /^(\d{4})-(H1|H2|Q1|Q2|Q3|Q4)$/.exec(id ?? '');
  return m ? { year: Number(m[1]), span: m[2] } : null;
}

/** "2026-H1" -> "Jan–Jun 2026"; "2026-Q3" -> "Jul–Sep 2026". @param {string} id */
export function periodLabel(id) {
  const p = parsePeriod(id);
  if (!p) throw new Error(`bad period ${id}`);
  const [a, b] = SPANS[p.span];
  return `${MONTHS[a - 1]}–${MONTHS[b - 1]} ${p.year}`;
}

/** The same span one year earlier. @param {string} id */
export function priorPeriodId(id) {
  const p = parsePeriod(id);
  if (!p) throw new Error(`bad period ${id}`);
  return `${p.year - 1}-${p.span}`;
}

/** The name ADREC gives the report: "2026-H1" -> "H1 2026", "2026-Q3" -> "Q3 2026". @param {string} id */
export function reportName(id) {
  const p = parsePeriod(id);
  if (!p) throw new Error(`bad period ${id}`);
  return `${p.span} ${p.year}`;
}

/** @param {string} id */
export const isHalfYear = (id) => /-H[12]$/.test(id);

/** "2026-10-09" -> "9 Oct 2026". @param {string} iso */
export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "2026-06-20" -> "Jun 2026". @param {string} iso */
export function fmtMonth(iso) {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(iso ?? '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

/** One decimal, AED billions. @param {number} x */
export const fmtBn = (x) => `AED ${x.toFixed(1)}bn`;

/** A real, finite number above zero (never a numeric string, NaN or Infinity). @param {unknown} x */
const pos = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;

/**
 * Change against the same period last year.
 *   positive "+N%", negative "−N%" (true minus), >= +200% "≈N×" with N = round(1 + pct/100),
 *   null "change n/p", Dubai prior_zero "new this year", ADREC change_text as given.
 * @param {{change_pct?: number|null, prior_zero?: boolean, change_text?: string}} a
 * @returns {{text: string, dir: 'rise'|'fall'|'flat'|'none', rank: [number, number]|null}}
 */
export function formatChange(a) {
  if (typeof a.change_text === 'string' && a.change_text) {
    const n = Number((/(\d+(?:\.\d+)?)/.exec(a.change_text) ?? [])[1]);
    return { text: a.change_text, dir: 'rise', rank: /×/.test(a.change_text) && Number.isFinite(n) ? [1, n] : null };
  }
  if (a.prior_zero) return { text: 'new this year', dir: 'none', rank: null };
  const pct = a.change_pct;
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return { text: 'change n/p', dir: 'none', rank: null };
  if (pct >= 200) {
    const n = Math.round(1 + pct / 100);
    return { text: `≈${n}×`, dir: 'rise', rank: [1, n] };
  }
  const r = Math.round(pct);
  if (r > 0) return { text: `+${r}%`, dir: 'rise', rank: [0, pct] };
  if (r < 0) return { text: `${MINUS}${Math.abs(r)}%`, dir: 'fall', rank: [0, pct] };
  return { text: '0%', dir: 'flat', rank: [0, pct] };
}

/** Areas that have a change, highest first; "≈N×" values rank above percentages. */
export function rankByChange(areas) {
  return areas
    .map((a) => ({ a, c: formatChange(a) }))
    .filter((x) => x.c.rank)
    .sort((x, y) => y.c.rank[0] - x.c.rank[0] || y.c.rank[1] - x.c.rank[1] || x.a.rank - y.a.rank);
}

/** @param {number} x */
const pct1 = (x) => `${x.toFixed(1)}%`;
const changeSpan = (c) => `<span class="mk-change mk-${c.dir}">${esc(c.text)}</span>`;

// ---- /areas section 3: year to date ----------------------------------------------------------------------------------

/**
 * @param {'dubai'|'abu_dhabi'} emirate
 * @param {{sales_bn: number, total_bn: number, mortgages_bn: number, as_of: string, year?: number}|null} ytd
 */
export function renderYtd(emirate, ytd) {
  if (!ytd || !pos(ytd.sales_bn) || !pos(ytd.total_bn) || !pos(ytd.mortgages_bn) || !fmtDate(ytd.as_of)) return '';
  const year = String(ytd.year ?? Number(ytd.as_of.slice(0, 4)));
  const tiles = [
    [ytd.sales_bn, `sales, ${year} to date`],
    [ytd.total_bn, `total transactions, ${year} to date`],
    [ytd.mortgages_bn, `mortgages, ${year} to date`],
  ];
  const source = emirate === 'dubai'
    ? `Source: Dubai Land Department, <a href="${SOURCES.dubaiTx.url}" target="_blank" rel="noopener">Real Estate Transactions open data</a> via Data.Dubai (Open Data Licence), 1 Jan – ${esc(fmtDate(ytd.as_of))}.`
    : `Source: <a href="${SOURCES.adrec.url}" target="_blank" rel="noopener">Abu Dhabi Real Estate Centre (ADREC)</a>, published year-to-date figures, as of ${esc(fmtDate(ytd.as_of))}.`;
  return `<section class="mk-block" aria-labelledby="mk-ytd-${emirate}">
<h2 id="mk-ytd-${emirate}" class="mk-h2">${esc(year)} so far · ${EMIRATES[emirate]}</h2>
<div class="mk-tiles">${tiles.map(([v, l]) => `<div class="mk-tile"><p class="mk-tile-value">${fmtBn(v)}</p><p class="mk-tile-label">${esc(l)}</p></div>`).join('')}</div>
<p class="mk-src">${source}</p>
</section>`;
}

// ---- /areas sections 4 and 5: top areas and change -------------------------------------------------------------------

/**
 * @typedef {{rank: number, area: string, label?: string|null, value_bn: number, share_pct: number, change_pct?: number|null, prior_zero?: boolean, change_text?: string, guide?: string}} AreaRow
 * @param {'dubai'|'abu_dhabi'} emirate
 * @param {{period: string, areas: AreaRow[], published?: string|null}} d
 */
export function renderTop(emirate, d) {
  const areas = (d?.areas ?? []).filter((a) => a.value_bn > 0);
  if (!areas.length || !parsePeriod(d.period)) return '';
  const label = periodLabel(d.period);
  const prior = periodLabel(priorPeriodId(d.period));
  const top = Math.max(...areas.map((a) => a.value_bn));
  const note = isHalfYear(d.period)
    ? `<p class="mk-note">Both emirates show ${esc(label)}: the latest period ADREC publishes by area, so Dubai and Abu Dhabi stay comparable. Both move to a newer period together as soon as ADREC publishes it.</p>`
    : '';
  const cards = areas.map((a) => {
    const c = formatChange(a);
    return `<article class="mk-card">
<p class="mk-rank">#${esc(a.rank)}</p>
<h3 class="mk-area">${esc(a.area)}</h3>${a.label ? `<p class="mk-label">${esc(a.label)}</p>` : ''}
<p class="mk-value">${fmtBn(a.value_bn)}</p>
<div class="mk-bar" aria-hidden="true"><span style="width:${Math.max(2, Math.round((a.value_bn / top) * 100))}%"></span></div>
<p class="mk-foot"><span>${pct1(a.share_pct)} of total</span>${changeSpan(c)}</p>
</article>`;
  }).join('');
  return `<section class="mk-block" aria-labelledby="mk-top-${emirate}">
<h2 id="mk-top-${emirate}" class="mk-h2">Top areas by sales value · ${EMIRATES[emirate]}</h2>
<p class="mk-chip">${esc(label)} vs ${esc(prior)}</p>${note}
<div class="mk-cards">${cards}</div>
</section>`;
}

/**
 * @param {'dubai'|'abu_dhabi'} emirate
 * @param {{period: string, areas: AreaRow[], published?: string|null}} d
 */
export function renderChange(emirate, d) {
  const areas = (d?.areas ?? []).filter((a) => a.value_bn > 0);
  const ranked = rankByChange(areas);
  if (!ranked.length || !parsePeriod(d.period)) return '';
  const missing = emirate === 'abu_dhabi' ? areas.length - ranked.length : 0;
  const rows = ranked.map(({ a, c }, i) => `<tr><td class="mk-num">${i + 1}</td><td><span class="mk-tarea">${esc(a.area)}</span>${a.label ? `<span class="mk-label">${esc(a.label)}</span>` : ''}</td><td class="mk-num">${fmtBn(a.value_bn)}</td><td class="mk-num">${changeSpan(c)}</td></tr>`).join('');
  const np = missing > 0
    ? `<p class="mk-src">ADREC did not publish a year-on-year change for ${missing} of the top areas (n/p = not published). They are left out of this ranking rather than estimated.</p>`
    : '';
  const source = emirate === 'dubai'
    ? `Source: Dubai Land Department, <a href="${SOURCES.dubaiTx.url}" target="_blank" rel="noopener">Real Estate Transactions open data</a> via Data.Dubai (Open Data Licence). Residential sales value. Area names as registered by DLD.`
    : `Source: <a href="${esc(d.source_url ?? SOURCES.adrec.url)}" target="_blank" rel="noopener">Abu Dhabi Real Estate Centre (ADREC)</a>, ${esc(reportName(d.period))} market report${d.published ? ` (published ${esc(fmtDate(d.published))})` : ''}. Residential sales value.`;
  return `<section class="mk-block" aria-labelledby="mk-chg-${emirate}">
<h2 id="mk-chg-${emirate}" class="mk-h2">Change vs last year · ${EMIRATES[emirate]}</h2>
<div class="mk-table-card"><div class="mk-table-scroll"><table class="mk-table">
<thead><tr><th scope="col" class="mk-num">#</th><th scope="col">Area</th><th scope="col" class="mk-num">Sales value</th><th scope="col" class="mk-num">Change</th></tr></thead>
<tbody>${rows}</tbody></table></div></div>
${np}<p class="mk-src">${source}</p>
</section>`;
}

/**
 * Dubai /market/areas -> the rows the renderers take. A malformed row (rank not a positive whole number, no area name,
 * value_bn or share_pct not a finite number, change_pct neither a finite number nor null/absent) is dropped, never shown
 * as NaN or undefined.
 */
export function dubaiRows(body) {
  const top = body?.dubai?.top8;
  if (!Array.isArray(top)) return [];
  return top
    .filter((a) => a && typeof a === 'object'
      && Number.isInteger(a.rank) && a.rank > 0
      && typeof a.area_en === 'string' && a.area_en.trim() !== ''
      && pos(a.value_bn)
      && typeof a.share_pct === 'number' && Number.isFinite(a.share_pct) && a.share_pct >= 0
      && (a.change_pct == null || (typeof a.change_pct === 'number' && Number.isFinite(a.change_pct))))
    .map((a) => ({
      rank: a.rank, area: a.area_en, label: typeof a.label === 'string' && a.label ? a.label : null, value_bn: a.value_bn,
      share_pct: a.share_pct, change_pct: a.change_pct ?? null, prior_zero: a.prior_zero === true,
    }));
}

// ---- Area guide: live figures card ----------------------------------------------------------------------------------

/**
 * @param {'dubai'|'abu_dhabi'} emirate
 * @param {{period: string, area: AreaRow, dldArea?: string, published?: string|null, source_url?: string}|null} d
 */
export function renderGuideCard(emirate, d) {
  const a = d?.area;
  if (!a || !(a.value_bn > 0) || !parsePeriod(d.period)) return '';
  const label = periodLabel(d.period);
  const prior = periodLabel(priorPeriodId(d.period));
  const c = formatChange(a);
  const source = emirate === 'dubai'
    ? `Source: Dubai Land Department, <a href="${SOURCES.dubaiTx.url}" target="_blank" rel="noopener">Real Estate Transactions open data</a> via Data.Dubai (Open Data Licence). Residential sales value${d.dldArea ? ` for the DLD area ${esc(d.dldArea)}` : ''}.`
    : `Source: <a href="${esc(d.source_url ?? SOURCES.adrec.url)}" target="_blank" rel="noopener">Abu Dhabi Real Estate Centre (ADREC)</a>, ${esc(reportName(d.period))} market report${d.published ? ` (published ${esc(fmtDate(d.published))})` : ''}. Residential sales value.`;
  return `<p class="mk-chip">${esc(label)} vs ${esc(prior)}</p>
<p class="mk-value">${fmtBn(a.value_bn)}</p>
<p class="mk-tile-label">residential sales value, ${esc(label)}</p>
<p class="mk-foot"><span>${pct1(a.share_pct)} of ${EMIRATES[emirate]}'s total</span>${changeSpan(c)}</p>
<p class="mk-src">${source}</p>`;
}

// ---- /new-launches: Launch activity ---------------------------------------------------------------------------------

/** @param {number} n */
const int = (n) => n.toLocaleString('en-GB');
const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many}`;

/** The DLD projects dataset is not refreshed every week: older than this, the Dubai card is not shown at all. */
export const LAUNCH_MAX_AGE_DAYS = 120;
const todayIso = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** @param {any} d @param {string} [today] YYYY-MM-DD */
export function renderLaunchDubai(d, today = todayIso()) {
  if (!d || !fmtMonth(d.as_of) || !(daysBetween(d.as_of, today) <= LAUNCH_MAX_AGE_DAYS)) return '';
  const lines = [];
  if (d.new_projects_90d > 0) lines.push(`<p class="mk-lead">${plural(d.new_projects_90d, 'new project', 'new projects')} registered in the last 90 days</p>`);
  const top = (d.top_areas_90d ?? []).filter((a) => a.count > 0).slice(0, 5);
  if (top.length) {
    lines.push(`<p class="mk-sub">Top areas</p><ol class="mk-list">${top.map((a) => `<li><span>${esc(a.area_en)}${a.label ? ` <span class="mk-label">${esc(a.label)}</span>` : ''}</span><span class="mk-num">${int(a.count)}</span></li>`).join('')}</ol>`);
  }
  if (d.active_projects > 0) lines.push(`<p class="mk-line">${plural(d.active_projects, 'active project', 'active projects')}</p>`);
  if (d.pipeline_units > 0) lines.push(`<p class="mk-line">${plural(d.pipeline_units, 'unit', 'units')} across active projects</p>`);
  if (!lines.length) return '';
  // The month the data is from (the dataset's load date), never the day the sync ran.
  return `<article class="mk-launch"><h3>Dubai</h3>${lines.join('')}
<p class="mk-src">Source: Dubai Land Department, <a href="${esc(d.source_url)}" target="_blank" rel="noopener">Real Estate Projects open data</a> via Data.Dubai (Open Data Licence), as of ${esc(fmtMonth(d.as_of))}.</p></article>`;
}

export function renderLaunchAbuDhabi(d) {
  if (!d || !(d.sales_value_bn > 0) || !(d.transaction_value_bn > 0) || !(d.mortgage_value_bn > 0) || !fmtDate(d.as_of)) return '';
  return `<article class="mk-launch"><h3>Abu Dhabi</h3>
<p class="mk-lead">${fmtBn(d.sales_value_bn)} in sales, ${esc(String(d.year))} to date</p>
<p class="mk-line">${fmtBn(d.transaction_value_bn)} total transactions</p>
<p class="mk-line">${fmtBn(d.mortgage_value_bn)} mortgages</p>
<p class="mk-src">Source: <a href="${esc(d.source_url)}" target="_blank" rel="noopener">Abu Dhabi Real Estate Centre (ADREC)</a>, published year-to-date figures, as of ${esc(fmtDate(d.as_of))}.</p></article>`;
}

/** Both cards, or one full-width card, or '' (panel hidden). @param {any} body @param {string} [today] YYYY-MM-DD */
export function renderLaunchPanel(body, today = todayIso()) {
  const cards = [renderLaunchDubai(body?.dubai, today), renderLaunchAbuDhabi(body?.abu_dhabi)].filter(Boolean);
  if (!cards.length) return '';
  return `<div class="mk-launch-grid${cards.length === 1 ? ' mk-launch-grid--one' : ''}">${cards.join('')}</div>`;
}

// ---- Build-time checks for the two hand-maintained data files ------------------------------------------------------

/**
 * site/src/data/adrec-areas.json. Figures enter only when confirmed against ADREC's own report (Rules 3, relay rule);
 * the card count stays even. Returns the problems; the build fails on any.
 * @param {any} f @param {string[]} guideSlugs
 */
export function checkAdrecAreas(f, guideSlugs) {
  const e = [];
  if (!parsePeriod(f?.period)) e.push('period must look like 2026-H1, 2026-H2 or 2026-Q3');
  if (!Array.isArray(f?.areas)) return [...e, 'areas must be a list'];
  if (f.areas.length % 2) e.push('keep the card count even');
  if (f.areas.length) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.published ?? '')) e.push('published (YYYY-MM-DD) is required once areas are listed');
    if (!/^https:\/\/adrec\.gov\.ae\//.test(f.source_url ?? '')) e.push("source_url must be ADREC's own page or report");
    if (!(f.total_res_bn > 0)) e.push('total_res_bn is required once areas are listed');
  }
  // Shares are value / emirate total, one decimal: a typo in either shows up here.
  if (f.total_res_bn > 0) {
    f.areas.forEach((a, i) => {
      if (a.value_bn > 0 && Math.abs(Math.round((a.value_bn / f.total_res_bn) * 1000) / 10 - a.share_pct) > 0.1) e.push(`areas[${i}]: share_pct ${a.share_pct} does not match value_bn / total_res_bn`);
    });
  }
  f.areas.forEach((a, i) => {
    const at = `areas[${i}]`;
    if (a.rank !== i + 1) e.push(`${at}: rank must be ${i + 1}`);
    if (typeof a.area !== 'string' || !a.area) e.push(`${at}: area`);
    if (!(a.value_bn > 0)) e.push(`${at}: value_bn`);
    if (!(a.share_pct > 0)) e.push(`${at}: share_pct`);
    const hasText = typeof a.change_text === 'string';
    if (hasText === ('change_pct' in a)) e.push(`${at}: exactly one of change_pct (number or null) and change_text`);
    if ('change_pct' in a && a.change_pct !== null && typeof a.change_pct !== 'number') e.push(`${at}: change_pct`);
    if (!guideSlugs.includes(a.guide)) e.push(`${at}: guide ${a.guide} is not an Abu Dhabi guide`);
  });
  return e;
}

/**
 * site/src/data/launch-reviews.json ("Launches I'm watching"). Ships empty. Every item needs its permit number and QR
 * and the agency name and BRN; Abu Dhabi items are refused until GOLIVE.abuDhabiLicensed.
 * @param {any} items @param {{abuDhabiLicensed: boolean}} golive
 */
export function checkLaunchReviews(items, golive) {
  if (!Array.isArray(items)) return ['launch-reviews.json must be a list'];
  const e = [];
  items.forEach((it, i) => {
    for (const k of ['permit_number', 'permit_qr', 'agency_name', 'agency_brn']) if (typeof it?.[k] !== 'string' || !it[k].trim()) e.push(`item ${i + 1}: ${k} is required`);
    if (it?.emirate !== 'dubai' && it?.emirate !== 'abu_dhabi') e.push(`item ${i + 1}: emirate must be dubai or abu_dhabi`);
    if (it?.emirate === 'abu_dhabi' && !golive.abuDhabiLicensed) e.push(`item ${i + 1}: Abu Dhabi items are refused while GOLIVE.abuDhabiLicensed is false`);
  });
  return e;
}
