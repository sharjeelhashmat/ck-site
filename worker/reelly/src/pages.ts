// HTML for the private research tool (owner 2026-11-19). Rendered on the server: no script on any page, so the strict
// CSP holds and nothing from Reelly ever reaches a browser except escaped text and https image and document links.
// The cards and project pages are lib/launch-cards.mjs, the same renderer the public /new-launches cards would use.
import { esc, normaliseProject, renderLaunchGrid, renderProjectDetail, type LaunchView, type UnitGroup } from '../../../site/src/lib/launch-cards.mjs';

export const SALE_STATUSES: readonly (readonly [string, string])[] = [
  ['announced', 'Announced'], ['presale', 'Presale'], ['start_of_sales', 'Start of sales'], ['on_sale', 'On sale'], ['out_of_stock', 'Out of stock'],
];
export const CONSTRUCTION: readonly (readonly [string, string])[] = [['presale', 'Presale'], ['under_construction', 'Under construction'], ['completed', 'Completed']];
export const PAGE_SIZE = 24;

/** Filters from the listing URL, each checked against its allowed form. */
export interface Filters { region: string; district: string; developer: string; sale_status: string; status: string; handover_from: string; handover_to: string; price_from: string; price_to: string; offset: number }
export function readFilters(u: URL): Filters {
  const g = (k: string, re: RegExp) => { const v = (u.searchParams.get(k) ?? '').trim(); return re.test(v) ? v : ''; };
  const off = Number(g('offset', /^\d{1,6}$/) || 0);
  return {
    region: g('region', /^[\p{L} .'-]{1,60}$/u),
    district: g('district', /^\d{1,9}$/),
    developer: g('developer', /^\d{1,9}$/),
    sale_status: g('sale_status', /^(announced|presale|start_of_sales|on_sale|out_of_stock)$/),
    status: g('status', /^(presale|under_construction|completed)$/),
    handover_from: g('handover_from', /^20[2-4]\d$/),
    handover_to: g('handover_to', /^20[2-4]\d$/),
    price_from: g('price_from', /^\d{1,10}$/),
    price_to: g('price_to', /^\d{1,10}$/),
    offset: off - (off % PAGE_SIZE),
  };
}

/** The Reelly /projects query for the filters (prices in AED; handover years as UTC timestamp ranges). */
export function reellyQuery(f: Filters): URLSearchParams {
  const q = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(f.offset), preferred_currency: 'AED' });
  if (f.region) q.set('region', f.region);
  if (f.district) q.set('districts', f.district);
  if (f.developer) q.set('developer', f.developer);
  if (f.sale_status) q.set('sale_status', f.sale_status);
  if (f.status) q.set('status', f.status);
  if (f.handover_from || f.handover_to) {
    const from = Date.UTC(Number(f.handover_from || 2000), 0, 1) / 1000;
    const to = Date.UTC(Number(f.handover_to || 2099), 11, 31, 23, 59, 59) / 1000;
    q.set('completion_date_ranges', `${from}-${to}`);
  }
  if (f.price_from) q.set('unit_price_from', f.price_from);
  if (f.price_to) q.set('unit_price_to', f.price_to);
  return q;
}

export function layout(title: string, body: string): string {
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer">'
    + `<title>${esc(title)} · Private research</title><link rel="stylesheet" href="/assets/app.css"></head><body>`
    + '<header class="rt-bar"><div class="wrap rt-bar-in"><a class="rt-brand" href="/launches">Sharjeel Hashmat</a><span class="rt-tag">Private research · Reelly</span></div></header>'
    + `<main id="main">${body}</main></body></html>`;
}

export function messagePage(title: string, text: string, extra = ''): string {
  return layout(title, `<section class="section"><div class="narrow"><p class="eyebrow">Private research</p><h1>${esc(title)}</h1><p class="lede">${esc(text)}</p>${extra}</div></section>`);
}

const options = (list: readonly (readonly [string, string])[], selected: string, any: string) =>
  `<option value="">${esc(any)}</option>${list.map(([v, l]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('')}`;
const select = (name: string, label: string, list: readonly (readonly [string, string])[], selected: string, any: string) =>
  `<div class="field"><label for="f-${name}">${esc(label)}</label><select id="f-${name}" name="${name}">${options(list, selected, any)}</select></div>`;
const input = (name: string, label: string, value: string, extra: string) =>
  `<div class="field"><label for="f-${name}">${esc(label)}</label><input id="f-${name}" name="${name}" value="${esc(value)}" ${extra}></div>`;

export interface ListingInput {
  views: LaunchView[]; count: number; filters: Filters; demo: boolean; error?: string;
  regions: string[]; districts: [string, string][]; developers: [string, string][];
}

export function listingPage(x: ListingInput): string {
  const f = x.filters;
  const years: [string, string][] = Array.from({ length: 12 }, (_, i) => String(2025 + i)).map((y) => [y, y]);
  const form = '<form class="card rt-filters" method="get" action="/launches">'
    + (x.demo ? '<input type="hidden" name="demo" value="1">' : '')
    + '<div class="fields">'
    + select('region', 'Emirate', x.regions.map((r) => [r, r]), f.region, 'Any emirate')
    + select('district', 'District', x.districts, f.district, 'Any district')
    + select('developer', 'Developer', x.developers, f.developer, 'Any developer')
    + select('sale_status', 'Sale status', SALE_STATUSES, f.sale_status, 'Any sale status')
    + select('status', 'Construction status', CONSTRUCTION, f.status, 'Any stage')
    + select('handover_from', 'Handover from', years, f.handover_from, 'Any year')
    + select('handover_to', 'Handover to', years, f.handover_to, 'Any year')
    + input('price_from', 'Starting price from (AED)', f.price_from, 'inputmode="numeric" pattern="[0-9]*"')
    + input('price_to', 'Starting price to (AED)', f.price_to, 'inputmode="numeric" pattern="[0-9]*"')
    + '</div><div class="actions"><button class="btn" type="submit">Search</button>'
    + `<a class="btn btn--ghost" href="/launches${x.demo ? '?demo=1' : ''}">Clear</a></div></form>`;
  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (k !== 'offset' && v) keep.set(k, String(v));
  if (x.demo) keep.set('demo', '1');
  const pageLink = (offset: number, label: string) => { const q = new URLSearchParams(keep); q.set('offset', String(offset)); return `<a class="btn btn--ghost" href="/launches?${esc(q.toString())}">${label}</a>`; };
  const nav = [f.offset > 0 ? pageLink(Math.max(0, f.offset - PAGE_SIZE), 'Previous page') : '', f.offset + PAGE_SIZE < x.count ? pageLink(f.offset + PAGE_SIZE, 'Next page') : ''].filter(Boolean).join('');
  const href = (v: LaunchView) => `/launches/${v.id}${x.demo ? '?demo=1' : ''}`;
  const body = '<section class="section"><div class="wrap">'
    + '<p class="eyebrow">Private research</p><h1>Launches</h1>'
    + `<p class="lede">New launch projects from Reelly. Only you can open this page. ${x.demo ? 'Showing the built-in demo data.' : ''}</p>`
    + (x.demo ? '<p class="lc-banner">Demo data: placeholder values for layout only, not real projects.</p>' : '')
    + form
    + (x.error ? `<p class="lc-banner" role="alert">${esc(x.error)}</p>` : '')
    + `<p class="rt-count">${x.count.toLocaleString('en-AE')} project${x.count === 1 ? '' : 's'}</p>`
    + (x.views.length ? renderLaunchGrid(x.views, href) : '<p class="lc-none">No projects match these filters.</p>')
    + (nav ? `<div class="actions">${nav}</div>` : '')
    + (x.demo ? '<p class="fine lc-source">Source: built-in demo data for the layout, not from Reelly.</p>'
      : '<p class="fine lc-source">Source: Reelly, a third-party property data aggregator. Its figures are tier 3 under Rules section 3 and are not confirmed by the developer.</p>')
    + '</div></section>';
  return layout('Launches', body);
}

export function projectPage(v: LaunchView, units: UnitGroup[], waHref: string, demo: boolean): string {
  const area = [v.district, v.region].filter(Boolean).join(', ');
  const body = '<section class="section"><div class="wrap">'
    + `<p class="eyebrow"><a href="/launches${demo ? '?demo=1' : ''}">Launches</a></p><h1>${esc(v.name)}</h1>`
    + ((area || v.developer) ? `<p class="lede">${esc([area, v.developer].filter(Boolean).join(' · '))}</p>` : '')
    + renderProjectDetail(v, { units, waHref, sample: demo })
    + '</div></section>';
  return layout(v.name, body);
}

/** A list of Reelly dictionary items as [value, label] pairs for a select, sorted by label. */
export function pairs(items: unknown[]): [string, string][] {
  const out: [string, string][] = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const id = String((it as { id?: unknown }).id ?? '');
    const name = String((it as { name?: unknown }).name ?? '').trim();
    if (/^\d+$/.test(id) && name) out.push([id, name]);
  }
  return out.sort((a, b) => a[1].localeCompare(b[1]));
}

export const views = (items: unknown[], demo: boolean): LaunchView[] => items.map((p) => normaliseProject(p, { demo }));
