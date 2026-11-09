// Site sweep (owner 2026-11-08): soft launch removes the remaining service invitations, gated behind LEAD_CAPTURE so they
// return when lead capture is switched on; the 404 page points to the homepage and the area guides; /sell shows its six
// steps as the shared numbered chips; two FAQ answers are corrected; every five checks list ends "My view." with a full
// stop. Run after `npm run build`; the lead-capture assertions read leadCaptureDist() (tests/helpers/build-mode.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeEntities, stripScripts, stripStyles, stripTags } from '../scripts/html-text.mjs';
import { disallowedExternalHrefs } from '../src/lib/links.mjs';
import { BUILD, leadCaptureDist } from './helpers/build-mode.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const siteDist = join(root, 'dist');
const { dir: leadDist } = leadCaptureDist();
const bare = (h) => h.replace(/ data-astro-cid-[a-z0-9]+/g, '');
const read = (p, dir = siteDist) => bare(readFileSync(join(dir, p), 'utf8'));
const main = (p, dir = siteDist) => { const h = read(p, dir); return h.slice(h.indexOf('<main id="main">'), h.indexOf('</main>')); };
const text = (h) => decodeEntities(stripTags(stripStyles(stripScripts(h)), ' ')).replace(/\s+/g, ' ').replace(/ ([.,?])/g, '$1').trim();

// Every sentence the sweep hides in soft launch, by page; each returns with LEAD_CAPTURE.
const HIDDEN = {
  'index.html': ["Send me any UAE property and I'll run the numbers: price, returns, risk, exit, my view.", 'The Compass Key Brief'],
  'investment-approach.html': [
    'How a Compass Key Brief is built',
    'Send me any UAE property, by link or name. I run it through the five checks using sourced, dated figures and send you a short brief with the numbers and my recommendation. There is no obligation.',
    "Send me any UAE property and I'll run the numbers: price, returns, risk, exit, my view. You can also run your own numbers on the ROI Calculator.",
  ],
  'new-launches.html': ['Ask me anything about a launch.', "Not sure of the answer for the launch you're looking at? Ask me."],
  'contact.html': ['Get in touch', "Tell me what you're looking for.", "Your budget. Your objective. Your timeline. I'll take it from there, within 24 hours."],
  'buy.html': ['No live sale listings yet. Real listings, photos and compliance data are being added as they come in.'],
};

test('soft launch: none of the hidden sentences render; the replacements do', () => {
  if (BUILD.leadCapture) return; // a lead-capture build is checked by the next test
  for (const [p, lines] of Object.entries(HIDDEN)) {
    const t = text(main(p));
    for (const l of lines) assert.ok(!t.includes(l), `${p}: "${l}" is hidden`);
  }
  // Homepage: the block is "The Compass Key Method", the kicker is kept, the two links stay.
  assert.match(main('index.html'), /<h3 style="color:var\(--navy\)">The Compass Key Method<\/h3>\s*<p class="kicker" style="margin-top:var\(--space-2\)">Price · Returns · Risk · Exit · My View<\/p>\s*<p class="small">You can run your own numbers on the <a href="\/invest">ROI Calculator<\/a>\. My method is set out on the <a href="\/investment-approach">investment approach<\/a> page\.<\/p>/);
  // /investment-approach: "Why this approach", the closing card's one sentence, the source line.
  const ia = main('investment-approach.html');
  assert.deepEqual([...ia.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]), ['The five checks', 'Why this approach']);
  assert.match(ia, /<h3 style="color:var\(--navy\)">The Compass Key Brief<\/h3>\s*<p class="small">You can run your own numbers on the <a href="\/invest">ROI Calculator<\/a>\.<\/p>/);
  assert.ok(text(ia).includes('Figures are sourced and dated. This is property analysis, not financial advice.'));
  // /new-launches: the lede keeps its first two sentences.
  assert.match(main('new-launches.html'), /<p class="lede">Every launch comes with a brochure\. Few come with straight answers\.<\/p>/);
  // /contact: "Contact", the direct line, the phone and email links.
  assert.match(main('contact.html'), /<p class="eyebrow">Contact<\/p>\s*<h1>Contact<\/h1>\s*<p class="lede">You can reach me directly by phone or email\.<\/p>\s*<div class="foot-links"[^>]*>\s*<a href="tel:\+971555414468">/);
  // /buy: no empty listings card.
  assert.doesNotMatch(main('buy.html'), /class="card empty"/);
});

test('lead capture on: every hidden sentence renders again', () => {
  for (const [p, lines] of Object.entries(HIDDEN)) {
    const t = text(main(p, leadDist));
    for (const l of lines) assert.ok(t.includes(l), `${p} (lead capture): "${l}"`);
  }
  assert.doesNotMatch(main('index.html', leadDist), /The Compass Key Method/, 'the homepage block is the Brief again');
  assert.match(main('contact.html', leadDist), /<p class="eyebrow">Get in touch<\/p>\s*<h1>Tell me what you're <em>looking for\.<\/em><\/h1>/);
});

test('404: "Try the homepage or the area guides." with Home and Area guides; no Contact button', () => {
  for (const dir of [siteDist, leadDist]) {
    const m = main('404.html', dir);
    assert.match(m, /<p class="lede" style="margin-inline:auto">Try the homepage or the area guides\.<\/p>\s*<div class="actions"><a class="btn" href="\/">Home<\/a><a class="btn btn--ghost" href="\/areas">Area guides<\/a><\/div>/);
    assert.doesNotMatch(m, /href="\/contact"|tell me what you were looking for/i);
  }
});

test('FAQ: the off-plan answer links "New Launches page" to /new-launches; the mortgage answer reads "case by case for each buyer"', () => {
  const h = read('faq.html');
  assert.match(main('faq.html'), /Trade-offs \(price, timeline, certainty\) are covered on the <a href="\/new-launches">New Launches page<\/a>\./);
  assert.doesNotMatch(h, /Insights articles|case-by-case|during consultation/);
  const ld = [...h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((x) => JSON.parse(x[1])).find((j) => j['@type'] === 'FAQPage');
  const ans = (q) => ld.mainEntity.find((e) => e.name === q).acceptedAnswer.text;
  assert.ok(ans("What's the difference between off-plan and secondary market?").endsWith('are covered on the New Launches page.'));
  assert.ok(ans('How do I get a mortgage as a non-resident?').endsWith('assessed case by case for each buyer.'));
});

test('/sell: the six steps as the shared numbered chips, sentence case, left aligned', () => {
  const m = main('sell.html');
  const ol = m.slice(m.indexOf('<ol'), m.indexOf('</ol>') + 5);
  assert.match(ol, /^<ol class="step-chips step-chips--start" role="list">/);
  const items = [...ol.matchAll(/<li class="step-chip"><span class="step-num" aria-hidden="true">(\d)<\/span>([^<]+)<\/li>/g)].map((x) => [Number(x[1]), x[2]]);
  assert.deepEqual(items, ['Comparable analysis', 'Pricing strategy', 'Marketing', 'Qualified buyers', 'Negotiation', 'Completion'].map((s, i) => [i + 1, s]));
  assert.doesNotMatch(m, /class="steps"/, 'the old tags are gone');
  const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
  assert.ok(css.includes('.step-chips--start { justify-content: flex-start; }'));
  // The same component renders the abroad steps (centred).
  assert.match(main('buy.html'), /<ol class="step-chips" role="list">\s*<li class="step-chip"><span class="step-num" aria-hidden="true">1<\/span>Briefing<\/li>/);
});

test('five checks: "My view." with a full stop, like the other four, everywhere the list renders', () => {
  for (const p of ['about.html', 'investment-approach.html']) {
    const items = [...main(p).matchAll(/<li><strong>([^<]+)<\/strong> ([^<]+)<\/li>/g)].map((x) => x[1]);
    assert.deepEqual(items, ['Price.', 'Returns.', 'Risk.', 'Exit.', 'My view.'], p);
    assert.match(decodeEntities(main(p)), /<strong>My view\.<\/strong> Buy, watch, or pass\./, p);
    assert.doesNotMatch(main(p), /My view:/, p);
  }
});

test('the swept pages: no external links but the three profiles, no em or en dashes in the text', () => {
  const pages = ['index.html', 'investment-approach.html', 'new-launches.html', 'contact.html', '404.html', 'buy.html', 'sell.html', 'faq.html', 'about.html'];
  for (const p of pages) {
    const h = readFileSync(join(siteDist, p), 'utf8');
    assert.deepEqual(disallowedExternalHrefs(h, { whatsapp: BUILD.leadCapture }), [], p);
    assert.doesNotMatch(text(main(p)), /[\u2013\u2014]/, `${p}: no dashes`);
  }
});
