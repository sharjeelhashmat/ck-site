// New launch cards and project pages fed from Reelly (owner 2026-11-19). ONE renderer for both places they appear, so the
// private preview shows exactly what would go public later:
//   - the private, Access-protected research tool (worker/reelly), live now;
//   - the public /new-launches cards and /new-launches/<id> pages, built in code now but OFF: they render only with
//     GOLIVE (LAUNCH_CARDS_ALLOWED) and, per project, a Trakheesi permit number and QR, agency and ORN (reelly-gate.mjs).
// Plain ESM with no dependencies (the Worker bundles it; node:test imports it). Every value from Reelly is escaped, and
// only https URLs are ever used for images and documents. Styles: styles/launch-cards.css (with data-card.css).

/** Escape text for HTML content and double-quoted attributes. @param {unknown} v */
export const esc = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** An https URL as given, or null (never javascript:, data:, http: or a relative path from upstream data). @param {unknown} u */
export function safeUrl(u) {
  if (typeof u !== 'string' || !u.trim()) return null;
  try {
    const x = new URL(u.trim());
    return x.protocol === 'https:' ? x.href : null;
  } catch {
    return null;
  }
}

/** Whole AED, en-AE grouping, as the ROI calculator writes it. @param {unknown} n */
export const formatAED = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? `AED ${Math.round(n).toLocaleString('en-AE')}` : null);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const list = (v) => (Array.isArray(v) ? v : []);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Q2 2028" from an ISO date ("2028-06-30" or a datetime), else null. @param {unknown} d */
export function handoverLabel(d) {
  const m = typeof d === 'string' ? d.match(/^(\d{4})-(\d{2})/) : null;
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `Q${Math.ceil(month / 3)} ${m[1]}` : null;
}

/** "18 November 2026" from an ISO date. @param {unknown} d */
export function dayLabel(d) {
  const m = typeof d === 'string' ? d.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null;
}

const SNAKE = (s) => (typeof s === 'string' ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : null);

/** Reelly marks nothing as demo or placeholder data (not in its docs), so a project is flagged when its own name or its
 * developer's name says so. The private preview's built-in sample (reelly-demo.mjs) is always flagged. */
export const DEMO_RE = /\b(demo|test|sample|placeholder|dummy)\b/i;

/**
 * The view of one project from a Reelly payload (GET /projects list item or GET /projects/{id}). Fields Reelly may omit
 * stay null or empty; nothing is invented.
 * @param {any} p @param {{demo?: boolean}} [o]
 */
export function normaliseProject(p, o = {}) {
  const loc = p?.location ?? {};
  const developer = typeof p?.developer === 'string' ? str(p.developer) : str(p?.developer?.name);
  const name = str(p?.name) ?? 'Unnamed project';
  const plans = list(p?.payment_plans).map((pl) => ({
    name: str(pl?.name) ?? 'Payment plan',
    steps: list(pl?.steps).map((s) => ({ name: str(s?.name) ?? '', percentage: num(s?.percentage) })).filter((s) => s.name || s.percentage !== null),
    postHandover: pl?.is_handover === true || num(pl?.months_after_handover) > 0,
  })).filter((pl) => pl.steps.length > 0 || pl.name !== 'Payment plan');
  const typical = list(p?.typical_units).map((u) => ({
    type: SNAKE(str(u?.unit_type)) ?? null,
    bedrooms: num(u?.bedrooms),
    from: num(u?.from_price_aed) ?? num(u?.min_price),
    to: num(u?.to_price_aed) ?? num(u?.max_price),
  }));
  const docs = [];
  const brochure = safeUrl(p?.marketing_brochure);
  if (brochure) docs.push({ label: 'Marketing brochure', url: brochure });
  for (const f of list(p?.floor_plans)) {
    const url = safeUrl(f?.file ?? f?.url);
    if (url) docs.push({ label: str(f?.name)?.split('/').pop() ?? 'Floor plan', url });
  }
  const general = safeUrl(p?.general_plan?.url);
  if (general) docs.push({ label: 'General plan', url: general });
  return {
    id: num(p?.id),
    slug: str(p?.slug_name),
    name,
    developer,
    district: str(loc.district),
    region: str(loc.region),
    image: safeUrl(p?.cover_image?.url),
    startingPrice: num(p?.min_price),
    maxPrice: num(p?.max_price),
    currency: str(p?.price_currency) ?? 'AED',
    saleStatus: str(p?.sale_status_display) ?? SNAKE(str(p?.sale_status)),
    constructionStatus: str(p?.construction_status_display) ?? SNAKE(str(p?.construction_status)),
    handover: handoverLabel(p?.completion_date ?? p?.completion_datetime ?? p?.construction_end_date),
    escrow: str(p?.escrow_number),
    serviceCharge: str(p?.service_charge),
    paymentPlans: plans,
    typicalUnits: typical,
    documents: docs,
    updated: dayLabel(p?.updated_at),
    demo: Boolean(o.demo) || DEMO_RE.test(name) || DEMO_RE.test(developer ?? ''),
  };
}

/**
 * Units (GET /projects/{id}/units results) grouped by type and bedrooms: how many, how many available, price and size
 * ranges. @param {any[]} units
 */
export function summariseUnits(units) {
  const groups = new Map();
  for (const u of list(units)) {
    const type = SNAKE(str(u?.unit_type)) ?? 'Unit';
    const beds = num(u?.bedrooms);
    const key = `${type}|${beds ?? ''}`;
    const g = groups.get(key) ?? { type, bedrooms: beds, count: 0, available: 0, priceMin: null, priceMax: null, sizeMin: null, sizeMax: null };
    g.count += 1;
    if (u?.status === 'available') g.available += 1;
    const price = num(u?.price);
    const size = num(u?.size);
    if (price !== null && price > 0) { g.priceMin = g.priceMin === null ? price : Math.min(g.priceMin, price); g.priceMax = g.priceMax === null ? price : Math.max(g.priceMax, price); }
    if (size !== null && size > 0) { g.sizeMin = g.sizeMin === null ? size : Math.min(g.sizeMin, size); g.sizeMax = g.sizeMax === null ? size : Math.max(g.sizeMax, size); }
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.type.localeCompare(b.type) || (a.bedrooms ?? -1) - (b.bedrooms ?? -1));
}

const bedsLabel = (b) => (b === null ? '' : b === 0 ? 'Studio' : `${b} bedroom${b === 1 ? '' : 's'}`);
const range = (a, b, fmt) => {
  const x = fmt(a);
  const y = fmt(b);
  if (x && y && x !== y) return `${x} to ${y}`;
  return x ?? y ?? 'Not given';
};
const sizeFmt = (unit) => (n) => (typeof n === 'number' && n > 0 ? `${Math.round(n).toLocaleString('en-AE')} ${unit}` : null);
const demoChip = '<p class="lc-demo">Demo data</p>';

/**
 * One launch card: image, name, area, developer, starting price, a link to the project page.
 * @param {ReturnType<typeof normaliseProject>} v @param {{href: string}} o
 */
export function renderLaunchCard(v, o) {
  const area = [v.district, v.region].filter(Boolean).join(', ');
  const img = v.image
    ? `<img class="lc-img" src="${esc(v.image)}" alt="" loading="lazy" decoding="async" width="640" height="400">`
    : '<div class="lc-img lc-img--none" aria-hidden="true"></div>';
  const price = formatAED(v.startingPrice);
  return `<article class="dc lc-card${v.demo ? ' lc-card--demo' : ''}">`
    + img
    + `<h3 class="dc-name lc-name"><a href="${esc(o.href)}">${esc(v.name)}</a></h3>`
    + (area ? `<p class="lc-area">${esc(area)}</p>` : '')
    + (v.developer ? `<p class="lc-dev">${esc(v.developer)}</p>` : '')
    + `<p class="lc-price"><span class="lc-label">Starting price</span> ${price ? esc(price) : 'Not given'}</p>`
    + (v.demo ? demoChip : '')
    + '</article>';
}

/** The card grid. @param {ReturnType<typeof normaliseProject>[]} vs @param {(v: ReturnType<typeof normaliseProject>) => string} href */
export function renderLaunchGrid(vs, href) {
  return `<div class="lc-grid">${vs.map((v) => renderLaunchCard(v, { href: href(v) })).join('')}</div>`;
}

/**
 * The project page body: key facts, payment plans, unit types with price ranges, units, documents, the source line,
 * then the WhatsApp button and the permit block only when the caller passes them (public: LEAD_CAPTURE and the
 * per-project compliance values; the private preview always has the button and never the permit block).
 * @param {ReturnType<typeof normaliseProject>} v
 * @param {{ units?: ReturnType<typeof summariseUnits>, waHref?: string | null, compliance?: {permit_number: string, permit_qr: string, agency_name: string, agency_orn: string} | null, areaUnit?: string, headingLevel?: 2 | 3, sample?: boolean }} [o]
 *   sample: the private preview's built-in demo data (its source line says so instead of naming Reelly).
 */
export function renderProjectDetail(v, o = {}) {
  const h = o.headingLevel ?? 2;
  const area = [v.district, v.region].filter(Boolean).join(', ');
  const facts = [
    ['Starting price', formatAED(v.startingPrice)],
    ['Highest price', formatAED(v.maxPrice)],
    ['Developer', v.developer],
    ['Area', area || null],
    ['Handover', v.handover],
    ['Sale status', v.saleStatus],
    ['Construction', v.constructionStatus],
    ['Escrow account', v.escrow],
    ['Service charge', v.serviceCharge],
  ].filter(([, x]) => x);
  const parts = [];
  if (v.demo) parts.push('<p class="lc-banner">Demo data: placeholder values for layout only, not a real project.</p>');
  if (v.image) parts.push(`<img class="lc-hero" src="${esc(v.image)}" alt="" width="1280" height="720" decoding="async">`);
  parts.push(`<dl class="lc-facts">${facts.map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${esc(x)}</dd></div>`).join('')}</dl>`);

  parts.push(`<h${h} class="lc-h">Payment plans</h${h}>`);
  if (v.paymentPlans.length) {
    parts.push(`<div class="dc-grid lc-plans">${v.paymentPlans.map((pl) => `<section class="dc lc-plan"><h${h + 1} class="dc-name">${esc(pl.name)}</h${h + 1}>`
      + `<ol class="lc-steps">${pl.steps.map((s) => `<li><span>${esc(s.name)}</span>${s.percentage !== null ? ` <strong>${esc(String(s.percentage).replace(/\.0+$/, ''))}%</strong>` : ''}</li>`).join('')}</ol>`
      + (pl.postHandover ? '<p class="lc-note">Includes payments after handover.</p>' : '')
      + '</section>').join('')}</div>`);
  } else parts.push('<p class="lc-none">No payment plan in the data.</p>');

  parts.push(`<h${h} class="lc-h">Unit types</h${h}>`);
  if (v.typicalUnits.length) {
    parts.push('<div class="table-scroll" tabindex="0"><table class="lc-table"><caption class="sr-only">Unit types and price ranges</caption><thead><tr><th scope="col">Type</th><th scope="col">Price range</th></tr></thead><tbody>'
      + v.typicalUnits.map((u) => `<tr><th scope="row">${esc([u.type, bedsLabel(u.bedrooms)].filter(Boolean).join(', ') || 'Unit')}</th><td>${esc(range(u.from, u.to, formatAED))}</td></tr>`).join('')
      + '</tbody></table></div>');
  } else parts.push('<p class="lc-none">No unit types in the data.</p>');

  if (o.units && o.units.length) {
    const unit = o.areaUnit ?? 'sq ft';
    parts.push(`<h${h} class="lc-h">Units</h${h}>`);
    parts.push('<div class="table-scroll" tabindex="0"><table class="lc-table lc-table--stack"><caption class="sr-only">Units by type: size, price and availability</caption><thead><tr><th scope="col">Type</th><th scope="col">Size</th><th scope="col">Price</th><th scope="col">Available</th></tr></thead><tbody>'
      + o.units.map((g) => `<tr><th scope="row">${esc([g.type, bedsLabel(g.bedrooms)].filter(Boolean).join(', '))}</th><td data-label="Size">${esc(range(g.sizeMin, g.sizeMax, sizeFmt(unit)))}</td><td data-label="Price">${esc(range(g.priceMin, g.priceMax, formatAED))}</td><td data-label="Available">${g.available} of ${g.count}</td></tr>`).join('')
      + '</tbody></table></div>');
  }

  parts.push(`<h${h} class="lc-h">Documents</h${h}>`);
  parts.push(v.documents.length
    ? `<ul class="lc-docs">${v.documents.map((d) => `<li><a href="${esc(d.url)}" rel="noopener noreferrer" target="_blank">${esc(d.label)}</a></li>`).join('')}</ul>`
    : '<p class="lc-none">No documents in the data.</p>');

  if (o.compliance) {
    const c = o.compliance;
    parts.push(`<div class="lw-permit"><img src="${esc(c.permit_qr)}" alt="${esc(`Permit ${c.permit_number} QR code`)}" width="72" height="72"><span>Permit ${esc(c.permit_number)}<br>${esc(c.agency_name)} · ORN ${esc(c.agency_orn)}</span></div>`);
  }
  if (o.waHref) parts.push(`<p class="lc-actions"><a class="btn" href="${esc(o.waHref)}" rel="noopener" target="_blank">Ask Sharjeel on WhatsApp</a></p>`);
  parts.push(o.sample
    ? '<p class="fine lc-source">Source: built-in demo data for the layout, not from Reelly.</p>'
    : `<p class="fine lc-source">Source: Reelly, a third-party property data aggregator${v.updated ? `, updated ${esc(v.updated)}` : ''}. Its figures are tier 3 under Rules section 3 and are not confirmed by the developer.</p>`);
  return `<div class="lc-project${v.demo ? ' lc-project--demo' : ''}">${parts.join('')}</div>`;
}

/** The wa.me link for a project, to the given number. @param {string} phoneE164 @param {string} project */
export const waHrefFor = (phoneE164, project) => `https://wa.me/${phoneE164}?text=${encodeURIComponent(`Hi Sharjeel, I'd like to know more about ${project}.`)}`;
