// About page rewrite (owner-approved copy and layout, 2026-10-10). Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD, leadCaptureDist } from './helpers/build-mode.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const read = (p) => readFileSync(join(dist, p), 'utf8');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
// Scoped styles add data-astro-cid-* attributes; drop them so the markup compares as written.
const bare = (h) => h.replace(/ data-astro-cid-[a-z0-9]+/g, '');
const about = (dir = dist) => bare(readFileSync(join(dir, 'about.html'), 'utf8'));
const main = (dir = dist) => about(dir).match(/<main id="main">([\s\S]*?)<\/main>/)[1];
// The closing line and "Get in touch" exist only with lead capture (golive.ts LEAD_CAPTURE); a lead-capture build is checked
// for them, and site/dist (soft launch) for their absence.
const LEAD = leadCaptureDist().dir;
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const items = (html) => [...html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/)[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());

const LINES = [
    'Numbers first. Straight answers. No pitch.',
    'I work with buyers, investors, sellers and international clients across the UAE, on ready properties, off-plan launches, and the secondary market.',
    'Most property conversations start with the brochure. Mine start with the numbers.',
    'I have worked in UAE real estate since 2018, with local and international investors.',
    'I hold a Bachelor of Commerce from the University of Karachi, and I speak English, Urdu and basic Arabic, which covers most of the conversations that actually happen in this market.',
    'The Compass Key Method',
    'Every property I put in front of you goes through the same five checks:',
    'The method in full →',
    'How I work',
    'From offer to transfer, I coordinate the developer, the seller, the legal side and the Dubai Land Department',
    "A deal I talk you out of is still a good day's work.",
    'What you can expect',
    "Straight answers, including the ones you'd rather not hear. No inflated promises. No wasted time.",
];
const CLOSE = ["Serious about UAE property? Let's talk. Still deciding? I'll tell you exactly where you stand.", 'Get in touch'];
const inOrder = (t, lines) => {
  let at = 0;
  for (const l of lines) {
    const i = t.indexOf(l, at);
    assert.ok(i >= 0, `missing or out of order: ${l}`);
    at = i + l.length;
  }
};

test('about: the approved copy is all there, in order (lead-capture build)', () => {
  const t = text(main(LEAD));
  inOrder(t, [...LINES, ...CLOSE]);
  assert.match(main(LEAD), /<a href="\/investment-approach">The method in full →<\/a>/);
  assert.match(main(LEAD), /<a class="btn" href="\/contact">Get in touch<\/a>/);
  assert.match(t, /since 2018/);
});

test('about: in this build, the approved copy in order; in soft launch without the closing line and its button', () => {
  const t = text(main());
  inOrder(t, BUILD.leadCapture ? [...LINES, ...CLOSE] : LINES);
  assert.match(main(), /<a href="\/investment-approach">The method in full →<\/a>/);
  assert.match(t, /since 2018/);
  if (!BUILD.leadCapture) {
    assert.doesNotMatch(t, /Let's talk|Serious about UAE property/, 'soft launch: no closing invitation');
    assert.doesNotMatch(main(), /class="btn"|href="\/contact"|about-close/, 'soft launch: no button, no contact link');
  }
});

test('about: the five checks are word for word the ones on /investment-approach', () => {
  const mine = items(main()), theirs = items(bare(read('investment-approach.html')));
  assert.equal(mine.length, 5);
  assert.deepEqual(mine, theirs);
});

test('about: no cards, no Track record, and exactly three H2s with the same class', () => {
  const m = main();
  assert.doesNotMatch(m, /class="[^"]*\bcard\b/, 'no .card');
  assert.doesNotMatch(m, /track record/i);
  const h2 = [...m.matchAll(/<h2([^>]*)>([^<]*)<\/h2>/g)];
  assert.deepEqual(h2.map((x) => x[2]), ['The Compass Key Method', 'How I work', 'What you can expect']);
  const classes = h2.map((x) => x[1].match(/class="([^"]*)"/)?.[1]);
  assert.ok(classes.every((c) => c && c === classes[0] && /\babout-h2\b/.test(c)), JSON.stringify(classes));
});

test('about: no banned wording', () => {
  const t = text(about());
  for (const banned of ["I don't sell", 'advisor', 'advising', 'advisory', 'protect capital', 'Capital Protection', 'Real Estate Consultant', 'guarantee']) {
    assert.doesNotMatch(t, new RegExp(banned, 'i'), banned);
  }
});

test('about: title and description', () => {
  const h = about();
  assert.match(h, /<title>About · Sharjeel Hashmat<\/title>/);
  assert.match(h, /<meta property="og:title" content="About · Sharjeel Hashmat">/);
  const desc = 'Sharjeel Hashmat, Property Consultant in the UAE since 2018. Numbers first, straight answers, and the five checks behind every recommendation.';
  assert.ok(h.includes(`<meta name="description" content="${desc}">`));
  assert.ok(h.includes(`<meta property="og:description" content="${desc}">`));
});

test('about: the lead line is the display line straight after the kicker; the closing line stays plain', () => {
  for (const dir of new Set([dist, LEAD])) checkLeadLine(main(dir), dir === LEAD || BUILD.leadCapture);
});

function checkLeadLine(m, hasClose) {
  const after = m.match(/<p class="kicker"[^>]*>[\s\S]*?<\/p>\s*<p class="([^"]*)">([^<]*)<\/p>/);
  assert.ok(after, 'a paragraph follows the kicker');
  assert.ok(after[1].split(' ').includes('about-lead'), after[1]);
  assert.equal(after[2], 'Numbers first. Straight answers. No pitch.');
  assert.equal((m.match(/\babout-lead\b/g) || []).length, 1, 'only the lead line');
  const close = m.match(/<p class="([^"]*)">Serious about UAE property\?/);
  if (!hasClose) { assert.equal(close, null, 'soft launch: no closing line'); return; }
  assert.ok(close, 'closing line');
  const cls = close[1].split(' ');
  assert.ok(cls.includes('about-close') && !cls.includes('about-lead'), close[1]);
}

test('JSON-LD knowsLanguage is ["English","Urdu"] on every page', () => {
  const pages = walk(dist).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length > 10);
  for (const f of pages) {
    const m = readFileSync(f, 'utf8').match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    assert.ok(m, `${f}: JSON-LD`);
    const ld = JSON.parse(m[1]);
    const person = ld['@graph'] ? ld['@graph'].find((n) => n['@type'] === 'Person') : ld;
    assert.deepEqual(person.knowsLanguage, ['English', 'Urdu'], f);
  }
});
