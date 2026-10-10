// About page rewrite (owner-approved copy and layout, 2026-10-10). Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const read = (p) => readFileSync(join(dist, p), 'utf8');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
// Scoped styles add data-astro-cid-* attributes; drop them so the markup compares as written.
const bare = (h) => h.replace(/ data-astro-cid-[a-z0-9]+/g, '');
const about = () => bare(read('about.html'));
const main = () => about().match(/<main id="main">([\s\S]*?)<\/main>/)[1];
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const items = (html) => [...html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/)[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());

test('about: the approved copy is all there, in order', () => {
  const t = text(main());
  const lines = [
    'Numbers first. Straight answers. No pitch.',
    'I work with buyers, investors, sellers and international clients across the UAE — on ready properties, off-plan launches, and the secondary market.',
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
    "Serious about UAE property? Let's talk. Still deciding? I'll tell you exactly where you stand.",
    'Get in touch',
  ];
  let at = 0;
  for (const l of lines) {
    const i = t.indexOf(l, at);
    assert.ok(i >= 0, `missing or out of order: ${l}`);
    at = i + l.length;
  }
  assert.match(main(), /<a href="\/investment-approach">The method in full →<\/a>/);
  assert.match(main(), /<a class="btn" href="\/contact">Get in touch<\/a>/);
  assert.match(t, /since 2018/);
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
  assert.match(h, /<title>About — Sharjeel Hashmat<\/title>/);
  assert.match(h, /<meta property="og:title" content="About — Sharjeel Hashmat">/);
  const desc = 'Sharjeel Hashmat, Property Consultant in the UAE since 2018. Numbers first, straight answers, and the five checks behind every recommendation.';
  assert.ok(h.includes(`<meta name="description" content="${desc}">`));
  assert.ok(h.includes(`<meta property="og:description" content="${desc}">`));
});

test('JSON-LD knowsLanguage is ["English","Urdu"] on every page', () => {
  const pages = walk(dist).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length > 10);
  for (const f of pages) {
    const m = readFileSync(f, 'utf8').match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    assert.ok(m, `${f}: JSON-LD`);
    assert.deepEqual(JSON.parse(m[1]).knowsLanguage, ['English', 'Urdu'], f);
  }
});
