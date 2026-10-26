// "What's changing here" and the infrastructure trackers (PR 3, owner decision 2026-10-18): schema and validation rules.
// Plain ESM with JSDoc, like intel.mjs, so the Astro build, the sitemap filter and node:test share one source of truth.
// Records only official announcements. Owner rule: no price or value predictions from infrastructure news.

export const EMIRATES = ['Dubai', 'Abu Dhabi', 'UAE federal'];
export const CATEGORIES = ['Metro/tram', 'Rail', 'Roads/bridges', 'Airport', 'Regulation/fees', 'Visa/ownership', 'Master plan/zone', 'Public facility'];
export const STATUSES = ['Announced', 'Approved', 'Under construction', 'Opening', 'Open', 'Cancelled'];

export const SUMMARY_MAX = 280;
// A tracker page's title is the project name alone, so it follows the site's 60-character title rule.
export const NAME_MAX = 60;
// An event whose source was last verified longer ago than this shows "last checked <date>".
export const EVENT_RECHECK_DAYS = 180;
// The area page shows at most this many events, newest first.
export const AREA_EVENTS_MAX = 6;

// Owner rule: wording that predicts prices, values or returns fails the build (case-insensitive, whole words, with the
// listed stems and plurals). Checked on every title, name, summary and timeline note.
export const BANNED_CLAIMS = [
  ['price', /\bprices?\b/i],
  ['appreciat', /\bappreciat/i],
  ['value will', /\bvalues? will\b/i],
  ['boost', /\bboost(s|ed|ing)?\b/i],
  ['surge', /\bsurg(e|es|ed|ing)\b/i],
  ['ROI', /\broi\b/i],
  ['yield', /\byield(s|ed|ing)?\b/i],
  ['investment opportunity', /\binvestment opportunit(y|ies)\b/i],
  ['best area', /\bbest areas?\b/i],
  ['must-buy', /\bmust[- ]buy\b/i],
  ['guaranteed', /\bguaranteed\b/i],
];

const DAY = 86_400_000;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const asDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? d : null;
};
const daysBetween = (fromIso, toIso) => Math.round((asDate(toIso).getTime() - asDate(fromIso).getTime()) / DAY);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/** The banned terms found in a piece of text (empty when it is clean). */
export const bannedIn = (text) => (typeof text === 'string' ? BANNED_CLAIMS.filter(([, re]) => re.test(text)).map(([t]) => t) : []);

function checkBanned(where, field, text, errors) {
  const hits = bannedIn(text);
  if (hits.length) errors.push(`${where}: ${field} contains "${hits.join('", "')}". Infrastructure news must not predict prices or values`);
}

/** A source record: tier 1 only, https, valid dates, verified no later than today. */
function checkSource(where, s, today, errors) {
  if (!s || typeof s !== 'object') { errors.push(`${where}: source is missing`); return; }
  for (const f of ['name', 'url', 'publishedOn', 'verifiedOn']) if (!nonEmpty(s[f])) errors.push(`${where}: source.${f} is missing`);
  if (s.tier !== 1) errors.push(`${where}: source.tier must be 1 (official source), is ${JSON.stringify(s.tier)}`);
  if (nonEmpty(s.url) && !/^https:\/\//.test(s.url)) errors.push(`${where}: source.url must be https`);
  for (const f of ['publishedOn', 'verifiedOn']) if (nonEmpty(s[f]) && !asDate(s[f])) errors.push(`${where}: source.${f} must be a valid YYYY-MM-DD date`);
  if (asDate(s.verifiedOn) && daysBetween(today, s.verifiedOn) > 0) errors.push(`${where}: source.verifiedOn ${s.verifiedOn} is in the future`);
}

function checkAreas(where, areas, areaSlugs, errors) {
  if (!Array.isArray(areas)) { errors.push(`${where}: areas must be a list of area slugs`); return; }
  for (const a of areas) if (!areaSlugs.includes(a)) errors.push(`${where}: unknown area slug "${a}" (not one of the site's area pages)`);
}

/** One event. Returns a list of errors (empty when valid). */
export function checkEvent(e, { today, areaSlugs, projectSlugs }) {
  const errors = [];
  if (!e || typeof e !== 'object') return ['event is not an object'];
  const where = `event ${e.id ?? '?'}`;
  if (!nonEmpty(e.id) || !KEBAB.test(e.id)) errors.push(`${where}: id must be kebab-case (lowercase letters, digits, hyphens)`);
  if (!nonEmpty(e.title)) errors.push(`${where}: title is missing`);
  if (!EMIRATES.includes(e.emirate)) errors.push(`${where}: emirate must be one of ${EMIRATES.join(', ')}`);
  if (!CATEGORIES.includes(e.category)) errors.push(`${where}: category must be one of ${CATEGORIES.join(', ')}`);
  if (!STATUSES.includes(e.status)) errors.push(`${where}: status must be one of ${STATUSES.join(', ')}`);
  if (typeof e.officialDate !== 'string') errors.push(`${where}: officialDate must be text, exactly as the source states it (may be empty)`);
  if (!asDate(e.announcedOn)) errors.push(`${where}: announcedOn must be a valid YYYY-MM-DD date`);
  if (!nonEmpty(e.summary)) errors.push(`${where}: summary is missing`);
  else if (e.summary.length > SUMMARY_MAX) errors.push(`${where}: summary is ${e.summary.length} characters, the limit is ${SUMMARY_MAX}`);
  checkAreas(where, e.areas, areaSlugs, errors);
  if (e.project !== undefined && !projectSlugs.includes(e.project)) errors.push(`${where}: project "${e.project}" matches no projects/*.json slug`);
  // An event must appear somewhere: on an area page or on a tracker.
  if (Array.isArray(e.areas) && e.areas.length === 0 && e.project === undefined) errors.push(`${where}: needs at least one area or a project`);
  checkSource(where, e.source, today, errors);
  checkBanned(where, 'title', e.title, errors);
  checkBanned(where, 'summary', e.summary, errors);
  return errors;
}

/** One project tracker. `file` is its file name under projects/. Returns a list of errors (empty when valid). */
export function checkProject(p, { today, areaSlugs, file }) {
  const errors = [];
  if (!p || typeof p !== 'object') return [`${file ?? 'project'}: not an object`];
  const where = `project ${p.slug ?? file ?? '?'}`;
  if (!nonEmpty(p.slug) || !KEBAB.test(p.slug)) errors.push(`${where}: slug must be kebab-case (lowercase letters, digits, hyphens)`);
  else if (file && file !== `${p.slug}.json`) errors.push(`${where}: file name must be ${p.slug}.json, is ${file}`);
  if (!nonEmpty(p.name)) errors.push(`${where}: name is missing`);
  else if (p.name.length > NAME_MAX) errors.push(`${where}: name is ${p.name.length} characters, the limit is ${NAME_MAX} (it is the page title)`);
  if (!EMIRATES.includes(p.emirate)) errors.push(`${where}: emirate must be one of ${EMIRATES.join(', ')}`);
  if (!CATEGORIES.includes(p.category)) errors.push(`${where}: category must be one of ${CATEGORIES.join(', ')}`);
  if (!nonEmpty(p.operator)) errors.push(`${where}: operator is missing`);
  if (!nonEmpty(p.summary)) errors.push(`${where}: summary is missing`);
  else if (p.summary.length > SUMMARY_MAX) errors.push(`${where}: summary is ${p.summary.length} characters, the limit is ${SUMMARY_MAX}`);
  checkAreas(where, p.areas, areaSlugs, errors);
  if (!asDate(p.reviewBy)) errors.push(`${where}: reviewBy must be a valid YYYY-MM-DD date`);
  if (!Array.isArray(p.timeline) || p.timeline.length === 0) errors.push(`${where}: timeline needs at least one entry`);
  (Array.isArray(p.timeline) ? p.timeline : []).forEach((t, i) => {
    const at = `${where} timeline ${i + 1}`;
    if (!t || typeof t !== 'object') { errors.push(`${at}: not an object`); return; }
    if (!asDate(t.date)) errors.push(`${at}: date must be a valid YYYY-MM-DD date`);
    if (!STATUSES.includes(t.status)) errors.push(`${at}: status must be one of ${STATUSES.join(', ')}`);
    if (!nonEmpty(t.note)) errors.push(`${at}: note is missing`);
    checkSource(at, t.source, today, errors);
    checkBanned(at, 'note', t.note, errors);
  });
  checkBanned(where, 'name', p.name, errors);
  checkBanned(where, 'summary', p.summary, errors);
  return errors;
}

/** Timeline entries oldest first; the status of a project is the status of its latest entry. */
export const timelineOf = (p) => [...p.timeline].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
export const projectStatus = (p) => timelineOf(p).at(-1)?.status ?? '';
/** A tracker past its reviewBy date shows the stale banner and is noindex until it is updated. */
export const projectStale = (p, today) => daysBetween(today, p.reviewBy) < 0;
/** An event whose source was verified more than EVENT_RECHECK_DAYS ago shows "last checked <date>". */
export const eventNeedsRecheck = (e, today) => daysBetween(e.source.verifiedOn, today) > EVENT_RECHECK_DAYS;

/**
 * Validate the whole set: events, projects, and the links between them. Returns every error, so one build run lists
 * every problem. Cancelled events are valid and stay in the data (no silent deletion).
 */
export function checkChanges({ events, projects }, { today, areaSlugs }) {
  const errors = [];
  if (!Array.isArray(events)) errors.push('market-events.json must be a JSON array of events');
  const projectSlugs = [];
  for (const { file, record } of projects) {
    errors.push(...checkProject(record, { today, areaSlugs, file }).map((e) => `projects/${file}: ${e}`));
    if (record?.slug) {
      if (projectSlugs.includes(record.slug)) errors.push(`projects/${file}: duplicate project slug ${record.slug}`);
      projectSlugs.push(record.slug);
    }
  }
  const ids = new Set();
  for (const e of Array.isArray(events) ? events : []) {
    errors.push(...checkEvent(e, { today, areaSlugs, projectSlugs }).map((x) => `market-events.json: ${x}`));
    if (e?.id) {
      if (ids.has(e.id)) errors.push(`market-events.json: duplicate event id ${e.id}`);
      ids.add(e.id);
    }
  }
  return errors;
}

const newestFirst = (a, b) => (a.announcedOn < b.announcedOn ? 1 : a.announcedOn > b.announcedOn ? -1 : a.id < b.id ? -1 : 1);

/** The events shown on one area page: those that name the area, newest first, at most AREA_EVENTS_MAX. */
export const eventsForArea = (events, slug) => events.filter((e) => e.areas.includes(slug)).sort(newestFirst).slice(0, AREA_EVENTS_MAX);
