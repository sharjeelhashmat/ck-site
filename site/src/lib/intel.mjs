// Investment Intelligence System v1.0: schema, validation and freshness rules.
// Plain ESM with JSDoc so the Astro build, the freshness script and node:test all share one source of truth.
// Design decisions 1-7 approved by the owner 2026-09-21 (see docs/INTELLIGENCE_SYSTEM.md).

export const FACTORS = [
  { key: 'location', label: 'Location', question: 'Where is the asset and what is changing around it?' },
  { key: 'entry', label: 'Entry', question: 'Is the acquisition price rational?' },
  { key: 'fundamentals', label: 'Fundamentals', question: 'What supports actual demand?' },
  { key: 'yield', label: 'Yield', question: 'What does it produce after realistic costs?' },
  { key: 'supply', label: 'Supply', question: 'What competing inventory is coming?' },
  { key: 'liquidity', label: 'Liquidity', question: 'Who is likely to buy later?' },
  { key: 'risk', label: 'Risk', question: 'What could invalidate the thesis?' },
];

export const RATINGS = ['Strong', 'Adequate', 'Weak', 'Unverified'];
// Decision 1: BUY, WATCH, PASS.
export const VERDICTS = ['BUY', 'WATCH', 'PASS'];
export const SOURCE_TYPES = ['GOVERNMENT_DATA', 'DEVELOPER_SHEET', 'LEASE_REGISTER', 'RESEARCH_REPORT', 'PRESS'];
export const VERIFICATION = ['VERIFIED', 'PENDING_REVIEW', 'EXPIRED'];
export const CLAIM_CATEGORIES = ['price', 'income', 'comps', 'supply', 'area'];

// Decision 4: review windows in days, by claim category.
export const FRESHNESS_DAYS = { price: 14, income: 30, comps: 90, supply: 90, area: 90 };

// Decision 5: Insights becomes indexable only once this many non-stale articles are published.
export const INSIGHTS_MIN = 3;
export const MIN_COMPARABLES = 3;

// Shown instead of an unsourced number. Nothing is ever estimated.
export const FALLBACKS = {
  price: 'Pending Assessment',
  income: 'Guidance on Request',
  comps: 'Pending Assessment',
  supply: 'Under Advisory Review',
  risk: 'Under Advisory Review',
};

const DAY = 86_400_000;
const asDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00Z') : null);
export const daysBetween = (fromIso, toIso) => {
  const a = asDate(fromIso), b = asDate(toIso);
  return a && b ? Math.round((b.getTime() - a.getTime()) / DAY) : NaN;
};
export const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const nonEmptyList = (v) => Array.isArray(v) && v.length > 0 && v.every(nonEmpty);

/**
 * Check one claim (a sourced number). Returns { errors, stale }.
 * errors = structurally wrong. stale = correct but past its review window.
 */
export function checkClaim(c, today) {
  const errors = [];
  const where = `claim ${c?.key ?? '?'}`;
  if (!c || typeof c !== 'object') return { errors: ['claim is not an object'], stale: false };
  for (const f of ['key', 'label', 'value', 'sourceName', 'sourceUrl', 'publishedOn', 'verifiedBy', 'verifiedOn']) {
    if (!nonEmpty(c[f])) errors.push(`${where}: missing ${f}`);
  }
  if (!CLAIM_CATEGORIES.includes(c.category)) errors.push(`${where}: category must be one of ${CLAIM_CATEGORIES.join(', ')}`);
  if (!SOURCE_TYPES.includes(c.sourceType)) errors.push(`${where}: sourceType must be one of ${SOURCE_TYPES.join(', ')}`);
  if (!VERIFICATION.includes(c.verification)) errors.push(`${where}: verification must be one of ${VERIFICATION.join(', ')}`);
  if (nonEmpty(c.sourceUrl) && !/^https:\/\//.test(c.sourceUrl)) errors.push(`${where}: sourceUrl must be https`);
  for (const f of ['publishedOn', 'verifiedOn']) if (nonEmpty(c[f]) && !asDate(c[f])) errors.push(`${where}: ${f} must be YYYY-MM-DD`);
  let stale = false;
  if (!errors.length) {
    if (c.verification !== 'VERIFIED') stale = true;
    else if (daysBetween(c.verifiedOn, today) > FRESHNESS_DAYS[c.category]) stale = true;
  }
  return { errors, stale };
}

const claimsOf = (o) => [...(o.numbers ?? []), ...(o.income ?? []), ...(o.comparables ?? []), ...(o.supply ?? [])];

/**
 * Check a full opportunity record.
 * Only records with status "published" are held to the publication rules; drafts and verified records are never built.
 * Returns { errors, stale, publishable }.
 */
export function checkOpportunity(o, today) {
  const errors = [];
  let stale = false;
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  need(nonEmpty(o.slug) && /^[a-z0-9-]+$/.test(o.slug), 'slug must be lowercase letters, digits, hyphens');
  need(['draft', 'verified', 'published', 'archived'].includes(o.status), 'status must be draft, verified, published or archived');
  if (o.status !== 'published') return { errors, stale: false, publishable: false };

  for (const f of ['project', 'developer', 'location', 'propertyType', 'thesis', 'verdictNote', 'exitNote', 'publishedOn', 'lastVerified', 'reviewBy', 'version']) {
    need(nonEmpty(String(o[f] ?? '')), `missing ${f}`);
  }
  need(VERDICTS.includes(o.verdict), `verdict must be one of ${VERDICTS.join(', ')}`);
  need(nonEmptyList(o.risks), 'risks: at least one named risk');
  need(nonEmptyList(o.couldWork), 'couldWork is mandatory');
  need(nonEmptyList(o.couldFail), 'couldFail is mandatory');
  need(nonEmptyList(o.changeMyView), 'changeMyView is mandatory');
  need(o.investorFit && ['objective', 'budgetBand', 'timeline', 'riskTolerance'].every((k) => nonEmpty(o.investorFit[k])), 'investorFit needs objective, budgetBand, timeline, riskTolerance');
  need(nonEmpty(o.compliance?.permitNumber), 'compliance.permitNumber is required to advertise');
  for (const f of ['publishedOn', 'lastVerified', 'reviewBy']) need(!nonEmpty(o[f]) || asDate(o[f]), `${f} must be YYYY-MM-DD`);

  const claims = claimsOf(o);
  const keys = new Set();
  for (const c of claims) {
    const r = checkClaim(c, today);
    errors.push(...r.errors);
    if (r.stale) stale = true;
    if (c?.key) { if (keys.has(c.key)) errors.push(`duplicate claim key ${c.key}`); keys.add(c.key); }
  }
  if ((o.numbers ?? []).length === 0) errors.push('numbers: at least the price claim is required');

  // Methodology rules (owner decisions 1 and 3, sections 2 and 3 of the design).
  const factors = o.factors ?? {};
  const comps = (o.comparables ?? []).length;
  for (const f of FACTORS) {
    const x = factors[f.key];
    if (!x || !RATINGS.includes(x.rating) || !nonEmpty(x.note)) { errors.push(`factor ${f.key}: needs rating (${RATINGS.join('/')}) and a note`); continue; }
    const ev = x.evidence ?? [];
    for (const k of ev) if (!keys.has(k)) errors.push(`factor ${f.key}: evidence key ${k} matches no claim`);
    if (x.rating !== 'Unverified' && ev.length === 0) errors.push(`factor ${f.key}: rated ${x.rating} with no evidence. No source means Unverified`);
  }
  if (factors.entry && factors.entry.rating !== 'Unverified' && comps < MIN_COMPARABLES) errors.push(`factor entry: needs ${MIN_COMPARABLES} comparable transactions, has ${comps}. Otherwise rate it Unverified`);
  if (factors.yield && factors.yield.rating !== 'Unverified' && (o.income ?? []).length === 0) errors.push('factor yield: rated without any income claim. Otherwise rate it Unverified');
  const unverified = FACTORS.filter((f) => factors[f.key]?.rating === 'Unverified').map((f) => f.key);
  if (o.verdict === 'BUY' && unverified.length) errors.push(`verdict BUY is not allowed while factors are Unverified: ${unverified.join(', ')}`);

  if (asDate(o.reviewBy) && daysBetween(today, o.reviewBy) < 0) stale = true;
  return { errors, stale, publishable: errors.length === 0 && !stale };
}

/** Insights article. Drafts are never built. Published articles past reviewBy stay live with a banner but stop counting toward the launch gate. */
// What counts as "a figure": a percentage, an AED amount, a bn/billion/million/thousand quantity, or a number written with thousands separators.
const FIGURE_RE = /\d[\d.]*\s?%|AED\s?[\d,.]+|\d[\d,.]*\s?(bn|billion|million|thousand)\b|\b\d{1,3}(,\d{3})+\b/i;
function blockText(b) {
  if (!b || typeof b !== 'object') return '';
  if (typeof b.p === 'string') return b.p;
  if (Array.isArray(b.ul)) return b.ul.join(' ');
  if (b.table) return [...(b.table.head ?? []), ...(b.table.rows ?? []).flat()].join(' ');
  return '';
}

export function checkArticle(a, today) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  need(nonEmpty(a.slug) && /^[a-z0-9-]+$/.test(a.slug), 'slug must be lowercase letters, digits, hyphens');
  need(['draft', 'published'].includes(a.status), 'status must be draft or published');
  if (a.status !== 'published') return { errors: errors.filter((e) => e.startsWith('slug') || e.startsWith('status')), stale: false, publishable: false };
  for (const f of ['series', 'title', 'description', 'author', 'reviewer', 'publishedOn', 'updatedOn', 'reviewBy', 'geography', 'topic', 'confidence']) need(nonEmpty(a[f]), `missing ${f}`);
  need(['High', 'Medium', 'Low'].includes(a.confidence), 'confidence must be High, Medium or Low');
  need(Array.isArray(a.body) && a.body.length > 0, 'body is empty');
  need(Array.isArray(a.sources) && a.sources.length > 0, 'at least one source citation');
  for (const s of a.sources ?? []) {
    // A source page with no publication date (a government service page, say) is marked undated: true and shown as such.
    for (const f of s.undated === true ? ['name', 'url', 'verifiedOn'] : ['name', 'url', 'publishedOn', 'verifiedOn']) need(nonEmpty(s[f]), `source ${s.name ?? '?'}: missing ${f}`);
    need(s.undated === true || !nonEmpty(s.publishedOn) || asDate(s.publishedOn), `source ${s.name ?? '?'}: publishedOn must be YYYY-MM-DD`);
    need(!nonEmpty(s.verifiedOn) || asDate(s.verifiedOn), `source ${s.name ?? '?'}: verifiedOn must be YYYY-MM-DD`);
    need([1, 2, 3].includes(s.tier), `source ${s.name ?? '?'}: tier must be 1, 2 or 3`);
    need(!nonEmpty(s.url) || /^https:\/\//.test(s.url), `source ${s.name ?? '?'}: url must be https`);
  }
  // A number carried by tier 3 sources only cannot stand alone (source tiers, section 5).
  if ((a.sources ?? []).length && (a.sources ?? []).every((s) => s.tier === 3)) errors.push('sources are all tier 3: at least one tier 1 or 2 source is required for a headline number');
  // Owner rule 2026-09-21: every number is verified and carries its source. A paragraph, list or table that states a figure
  // must name the sources it comes from (src: [1, 2], 1-based positions in sources), and at least one of them must be tier 1
  // or 2, so a tier 3 source alone can never carry a headline number. A made-up worked example is marked illustration: true.
  (a.body ?? []).forEach((blk, i) => {
    const text = blockText(blk);
    if (!blk || blk.illustration === true || !FIGURE_RE.test(text)) return;
    const where = `body block ${i + 1}`;
    const refs = Array.isArray(blk.src) ? blk.src : [];
    if (refs.length === 0) { errors.push(`${where} states a figure but names no source (add src: [n])`); return; }
    const bad = refs.filter((n) => !Number.isInteger(n) || n < 1 || n > (a.sources ?? []).length);
    if (bad.length) { errors.push(`${where}: src ${bad.join(', ')} does not match a listed source`); return; }
    if (!refs.some((n) => (a.sources ?? [])[n - 1].tier <= 2)) errors.push(`${where} states a figure that rests on tier 3 sources only. It needs a tier 1 or 2 source`);
  });
  // Property analysis must carry both sides (owner content rule).
  if (['Would I Buy It?', 'Opportunity vs Risk'].includes(a.series)) {
    need(nonEmptyList(a.couldWork), 'property analysis needs couldWork');
    need(nonEmptyList(a.couldFail), 'property analysis needs couldFail');
  }
  const stale = asDate(a.reviewBy) ? daysBetween(today, a.reviewBy) < 0 : false;
  return { errors, stale, publishable: errors.length === 0 };
}

/** Decision 5: Insights is indexable after INSIGHTS_MIN non-stale published articles. */
export const insightsLive = (articles, today) => articles.filter((a) => checkArticle(a, today).publishable && !checkArticle(a, today).stale).length >= INSIGHTS_MIN;

/** Decision 5: an area page is indexable only when every snapshot figure is sourced, verified and inside its 90-day window. */
export const SNAPSHOT_FIELDS = [
  { key: 'priceSqft', label: 'Price per sq ft' },
  { key: 'rent', label: 'Rent range' },
  { key: 'netYield', label: 'Net yield range' },
];
export function areaSnapshotState(area, today) {
  const snap = area.details?.snapshot ?? {};
  const errors = [];
  let stale = false;
  let present = 0;
  for (const f of SNAPSHOT_FIELDS) {
    const c = snap[f.key];
    if (!c) continue;
    present++;
    const r = checkClaim({ key: f.key, label: f.label, category: 'area', verification: 'VERIFIED', verifiedBy: 'Sharjeel Hashmat', ...c }, today);
    errors.push(...r.errors);
    if (r.stale) stale = true;
  }
  const complete = present === SNAPSHOT_FIELDS.length;
  return { errors, stale, present, complete, live: complete && errors.length === 0 && !stale };
}
