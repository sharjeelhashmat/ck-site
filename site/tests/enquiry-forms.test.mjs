// New Launches ask-me page, preferred contact on the enquiry forms, and the one 24-hour promise (owner-approved
// 2026-10-10). Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOX_MAX, CONTACT_CHOICES, LIMIT_MESSAGES, MESSAGE_MAX, MESSAGES, REPLY_FALLBACK, composeMessage, lengthProblem, successText, validateLead,
} from '../src/lib/lead-submit.mjs';
import { MESSAGES as PROFILE_MESSAGES } from '../src/lib/profile-submit.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
// Scoped styles add data-astro-cid-* attributes; drop them so the markup compares as written.
const bare = (h) => h.replace(/ data-astro-cid-[a-z0-9]+/g, '');
const read = (p) => bare(readFileSync(join(dist, p), 'utf8'));
const src = (p) => readFileSync(join(root, p), 'utf8');
const main = (p) => read(p).match(/<main id="main">([\s\S]*?)<\/main>/)[1];
const text = (html) => html.replace(/<div id="(lead|profile)-alert-tpl" hidden>[\s\S]*?<\/div>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const form = (p) => read(p).match(/<form class="card" id="lead-form"[\s\S]*?<\/form>/)[0];
const FORMS = ['contact.html', 'sell.html', 'new-launches.html'];

// ---------- New Launches page ----------

test('new launches: every approved line is there, verbatim and in order', () => {
  const t = text(main('new-launches.html'));
  const lines = [
    'New Launches', 'New launches, checked.',
    'Every launch comes with a brochure. Few come with straight answers. Ask me anything about a launch.',
    'Ask me about a launch →',
    'Why a launch needs a different check',
    'With a ready home, you can see what you are buying. With a launch, you are paying for a building that does not exist yet. In Dubai, four things change:',
    'You pay before it is built. Payments for off-plan units go into an escrow account opened for that project, not to the developer directly.',
    "The sale must be registered. An off-plan sale is void unless it is entered in the Land Department's Interim Real Property Register.",
    'Paying late has a cost. If a buyer defaults, the developer can keep some or all of what was paid. How much depends on how far construction has progressed.',
    'The service charge is not final. It is set later through a budget that RERA must approve after an audit firm signs it off.',
    'Questions worth asking before you commit',
    'Is the launch price fair against what comparable units nearby actually sold for?',
    'Has this developer delivered on time before?',
    'Which escrow account belongs to this project, and is the sale registered?',
    'Does the payment plan follow construction, or are most payments due early?',
    'What will the service charge really be?',
    'Can I sell before handover, and what will it cost me?',
    'Who buys this unit from me later, and at what price?',
    'What happens if handover is late, or the project is cancelled?',
    "Not sure of the answer for the launch you're looking at? Ask me.",
    'Ask me about a launch',
    "Tell me what you want to know. I'll answer within 24 hours.",
    'Send my question',
    'Law No. 8 of 2007 (escrow accounts), Articles 7 and 9',
    'Law No. 13 of 2008 (Interim Real Property Register), Article 3',
    'Law No. 9 of 2009, amended Article 11',
    'Law No. 6 of 2019 (jointly owned property), Article 27',
    'General information on new launches in Dubai, citing the law as at October 2026. Not a recommendation of any project. Laws change, so check the current text on the Dubai Legislation Portal.',
  ];
  let at = 0;
  for (const l of lines) {
    const i = t.indexOf(l, at);
    assert.ok(i >= 0, `missing or out of order: ${l}`);
    at = i + l.length;
  }
  const m = main('new-launches.html');
  assert.match(m, /<a class="btn" href="#ask">Ask me about a launch →<\/a>/);
  assert.match(m, /<p><strong>Not sure of the answer for the launch you're looking at\? Ask me\.<\/strong><\/p>/);
  // The four facts each end with a superscript link to their source; the eight questions carry none.
  for (let n = 1; n <= 4; n++) assert.match(m, new RegExp(`<sup class="nl-ref"><a href="#source-${n}" id="ref-${n}" aria-label="Source ${n}">${n}</a></sup></li>`));
  const ol = m.match(/<ol class="nl-list">([\s\S]*?)<\/ol>/)[1];
  assert.equal((ol.match(/<li>/g) ?? []).length, 8);
  assert.doesNotMatch(ol, /<sup|<a /, 'questions: no answers, no source marks');
});

test('new launches: five H2s (Launch activity first, Part A); the content H2s use the About rhythm, the fourth is #ask, then Sources', () => {
  const h2 = [...main('new-launches.html').matchAll(/<h2([^>]*)>([^<]*)<\/h2>/g)];
  assert.deepEqual(h2.map((x) => x[2]), ['Launch activity', 'Why a launch needs a different check', 'Questions worth asking before you commit', 'Ask me about a launch', 'Sources']);
  assert.deepEqual(h2.map((x) => x[1].match(/class="([^"]*)"/)?.[1]), ['nl-h2', 'nl-h2', 'nl-h2', 'nl-h2', 'nl-sources-title']);
  assert.match(h2[3][1], /\bid="ask"/);
  const css = src('src/pages/new-launches.astro');
  assert.match(css, /\.nl-h2 \{ margin-top: 3rem; margin-bottom: 0;/, 'same spacing as the About H2s');
  assert.match(src('src/pages/about.astro'), /\.about-h2 \{ margin-top: 3rem; margin-bottom: 0; \}/);
});

test('new launches: the four sources link to the Dubai Legislation Portal, in a new tab', () => {
  const m = main('new-launches.html');
  const urls = [
    'https://dlp.dubai.gov.ae/Legislation%20Reference/2007/Law%20No.%20(8)%20of%202007.html',
    'https://dlp.dubai.gov.ae/Legislation%20Reference/2008/Law%20No.%20(13)%20of%202008.html',
    'https://dlp.dubai.gov.ae/Legislation%20Reference/2009/Law%20No.%20(9)%20of%202009%20Amending%20Law%20No.%20(13)%20of%202008.html',
    'https://dlp.dubai.gov.ae/Legislation%20Reference/2019/Law%20No.%20(6)%20of%202019%20Concerning%20Ownership%20of%20Jointly%20Owned%20Real%20Property%20in%20the%20Emirate%20of%20Dubai.html',
  ];
  const links = [...m.matchAll(/<li id="source-(\d)"><a href="([^"]+)" target="_blank" rel="noopener">/g)];
  assert.deepEqual(links.map((x) => [x[1], x[2]]), urls.map((u, i) => [String(i + 1), u]));
});

test('new launches: no empty card, no WhatsApp link, no images, no banned wording; title, description and noindex', () => {
  const m = main('new-launches.html');
  assert.doesNotMatch(m, /No launches listed/);
  assert.doesNotMatch(m, /What the major developers|Handpicked|Ask Sharjeel/);
  // The failure message template (shown only when sending fails) keeps the contact form's WhatsApp link; nothing else does.
  assert.doesNotMatch(m.replace(/<div id="(lead|profile)-alert-tpl" hidden>[\s\S]*?<\/div>/g, ''), /wa\.me/);
  assert.doesNotMatch(m, /<img\b/);
  assert.equal((m.match(/class="card\b/g) ?? []).length, 1, 'the form is the only card');
  const t = text(read('new-launches.html'));
  for (const banned of ["I don't sell", 'advisor', 'advising', 'advisory', 'guarantee', 'Real Estate Consultant']) {
    assert.doesNotMatch(t, new RegExp(banned, 'i'), banned);
  }
  const h = read('new-launches.html');
  assert.match(h, /<title>New Launches: Ask Before You Commit · Sharjeel Hashmat<\/title>/);
  const desc = 'Thinking about a Dubai off-plan launch? The facts every buyer should know, the questions worth asking, and a straight answer within 24 hours.';
  assert.ok(h.includes(`<meta name="description" content="${desc}">`));
  assert.match(h, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(src('src/pages/new-launches.astro'), /noindex: remove with the site-wide indexing switch at go-live\./);
  assert.match(src('src/pages/new-launches.astro'), /Compliance: this form and "Send my question" are a service call to action\./);
});

// ---------- The New Launches question form ----------

test('new launches form: fields in order, nothing else, and the submit label', () => {
  const f = form('new-launches.html');
  const named = [...new Set([...f.matchAll(/\bname="([a-z_]+)"/g)].map((x) => x[1]))];
  assert.deepEqual(named, ['name', 'email', 'phone_country', 'phone_national', 'preferred_contact', 'intent', 'project', 'question', 'company_website', 'consent_contact', 'consent_nurture']);
  assert.doesNotMatch(f, /name="(country|budget_band|timeline|funding|message)"/);
  assert.match(f, /<input type="hidden" name="intent" value="invest">/);
  assert.match(f, /<input id="f-email" name="email" type="email" autocomplete="email" required/);
  assert.match(f, /<label for="f-project">Project name \(optional\)<\/label>\s*<input id="f-project" name="project" type="text" maxlength="120" placeholder="e\.g\. the project or developer name"/);
  assert.doesNotMatch(f.match(/<input id="f-project"[^>]*>/)[0], /required/);
  assert.match(f, /<label for="f-question">Your question<\/label>\s*<textarea id="f-question" name="question" rows="4" required placeholder="e\.g\. Is the payment plan on this launch fair for a 2-bed\?"/);
  assert.match(f, /<div class="field full">\s*<label for="f-project">/);
  assert.match(f, /<div class="field full">\s*<label for="f-question">/);
  // Consent ticks are the contact form's, word for word.
  const ticks = (h) => [...h.matchAll(/<label class="check">([\s\S]*?)<\/label>/g)].map((x) => x[1]);
  assert.deepEqual(ticks(f), ticks(form('contact.html')));
  assert.match(f, /<button class="btn" type="submit" id="lead-submit">Send my question<\/button>/);
});

test('new launches form: the one-line message, with and without a project, and intent "invest"', () => {
  assert.equal(composeMessage('launch', { choice: 'whatsapp', project: '  Example Tower ', question: ' Is the plan fair? ' }),
    'New Launches | Preferred contact: WhatsApp | Project: Example Tower | Question: Is the plan fair?');
  assert.equal(composeMessage('launch', { choice: 'email', project: '   ', question: 'Who delivers on time?' }),
    'New Launches | Preferred contact: Email | Project: - | Question: Who delivers on time?');
  const js = src('src/components/LeadForm.astro');
  assert.match(js, /intent: sell \? 'sell' : launch \? 'invest' : val\('intent'\) \|\| 'buy',/);
  // An empty question is blocked on the question field (lib/lead-submit.mjs validateLead, used by the form).
  const ok = { name: 'Test Person', email: 'a@b.co', national: '50 123 4567', country: 'AE', choice: 'email', consent: true };
  assert.deepEqual(validateLead('launch', { ...ok, question: '  ' }, () => '+971501234567').problems, [['question', 'Enter your question.']]);
  assert.deepEqual(validateLead('launch', { ...ok, question: 'Fair?' }, () => '+971501234567').problems, []);
  assert.match(js, /validateLead\(mode, v, phoneCheck\)/);
});

test('new launches form: a message over 1000 characters is blocked with an inline message', () => {
  const q = 'x'.repeat(1000);
  const msg = composeMessage('launch', { choice: 'call', project: '', question: q });
  assert.ok(msg.length > MESSAGE_MAX);
  assert.deepEqual(lengthProblem('launch', q, msg), { kind: 'total', message: LIMIT_MESSAGES.total });
  const fits = 'y'.repeat(MESSAGE_MAX - composeMessage('launch', { choice: 'call', project: '', question: '' }).length);
  assert.equal(lengthProblem('launch', fits, composeMessage('launch', { choice: 'call', project: '', question: fits })), null, 'exactly 1000 is sent');
  const ok = { name: 'Test Person', email: 'a@b.co', national: '50 123 4567', country: 'AE', choice: 'call', consent: true };
  assert.deepEqual(validateLead('launch', { ...ok, question: q }, () => '+971501234567').problems, [['question', LIMIT_MESSAGES.total]]);
  assert.deepEqual(validateLead('general', { ...ok, message: 'z'.repeat(971) }, () => '+971501234567').problems, [['message', LIMIT_MESSAGES.box]]);
  assert.match(form('new-launches.html'), /<span class="err" id="f-question-err" data-err="question"><\/span>/);
});

// ---------- Preferred contact on Contact, Sell and New Launches ----------

test('preferred contact: three required pill radios, none checked, next to the mobile number on every enquiry form', () => {
  assert.deepEqual(CONTACT_CHOICES, [{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'call', label: 'Call' }, { value: 'email', label: 'Email' }]);
  for (const p of FORMS) {
    const f = form(p);
    const fs = f.match(/<fieldset class="field pref">([\s\S]*?)<\/fieldset>/);
    assert.ok(fs, `${p}: fieldset`);
    assert.match(fs[1], /<legend class="lbl">Preferred contact<\/legend>/, `${p}: label`);
    const radios = [...fs[1].matchAll(/<label class="pill"><input type="radio" name="preferred_contact" value="([a-z]+)" required aria-describedby="f-pref-err"><span>([^<]+)<\/span><\/label>/g)];
    assert.deepEqual(radios.map((r) => [r[1], r[2]]), [['whatsapp', 'WhatsApp'], ['call', 'Call'], ['email', 'Email']], `${p}: three pills`);
    assert.doesNotMatch(fs[1], /checked/, `${p}: nothing preselected`);
    assert.match(fs[1], /<span class="err" id="f-pref-err" data-err="preferred_contact"><\/span>/, `${p}: error slot`);
    // Straight after the mobile number field, so the two share a row on desktop.
    assert.match(f, /<span class="err" id="f-phone-err" data-err="phone"><\/span>\s*<\/div>\s*<fieldset class="field pref">/, `${p}: placement`);
  }
  const ok = { name: 'Test Person', email: 'a@b.co', national: '50 123 4567', country: 'AE', message: '', consent: true };
  assert.deepEqual(validateLead('general', { ...ok, choice: '' }, () => '+971501234567').problems, [['preferred_contact', 'Please choose how I should contact you.']]);
});

test('preferred contact: pill styling (pill radius, 44px, Ink border, Ink fill when selected, visible focus, radios kept)', () => {
  const css = src('src/components/LeadForm.astro');
  assert.match(css, /\.pref \.pills \{ display: flex; flex-wrap: wrap;/, 'pills wrap on narrow screens');
  assert.match(css, /\.pref \.pill span \{[^}]*min-height: 44px;[^}]*border: 1px solid var\(--ink\); border-radius: var\(--r-pill\); background: var\(--paper\); color: var\(--ink\);/);
  assert.match(css, /\.pref \.pill input:checked \+ span \{ background: var\(--ink\); color: var\(--ivory\); \}/);
  assert.match(css, /\.pref \.pill input:focus-visible \+ span \{ outline: 3px solid/);
  const rule = css.match(/\.pref \.pill input \{([^}]*)\}/)[1];
  assert.match(rule, /opacity: 0/);
  assert.doesNotMatch(rule, /display: none|visibility: hidden/, 'native radios stay focusable and announced');
});

test('preferred contact: the message starts with the choice on Contact and Sell, or is just the choice when empty', () => {
  assert.equal(composeMessage('general', { choice: 'call', message: '  Looking at 2-beds  ' }), 'Preferred contact: Call | Looking at 2-beds');
  assert.equal(composeMessage('general', { choice: 'whatsapp', message: '   ' }), 'Preferred contact: WhatsApp');
  const parts = [['Location', 'JVC'], ['Project', ''], ['Type', 'Apartment'], ['Bedrooms', '2'], ['Size sq ft', ''], ['Occupancy', 'Vacant'], ['Expected AED', '']];
  assert.equal(composeMessage('sell', { choice: 'email', message: 'Relocating', sellParts: parts }),
    'Preferred contact: Email | Location: JVC | Type: Apartment | Bedrooms: 2 | Occupancy: Vacant || Relocating');
  assert.equal(composeMessage('sell', { choice: 'email', message: '', sellParts: [['Location', '']] }), 'Preferred contact: Email');
  for (const mode of ['general', 'sell', 'launch']) {
    assert.ok(composeMessage(mode, { choice: 'call', message: 'm', question: 'q', sellParts: [] }).includes('Preferred contact: Call'), mode);
  }
});

test('preferred contact: the success line follows the choice; an unreadable choice falls back to the old line', () => {
  const lines = { whatsapp: "I'll answer on WhatsApp within 24 hours.", call: "I'll call you within 24 hours.", email: "I'll answer by email within 24 hours." };
  for (const [choice, line] of Object.entries(lines)) {
    assert.equal(successText('enquiry', choice), `Thank you. Your enquiry has been received. ${line}`);
    assert.equal(successText('question', choice), `Thank you. Your question has been received. ${line}`);
  }
  for (const odd of ['', undefined, 'sms', 'toString', '__proto__']) {
    assert.equal(successText('enquiry', odd), 'Thank you. Your enquiry has been received. I will reply within 24 hours.');
  }
  assert.equal(REPLY_FALLBACK, 'I will reply within 24 hours.');
  assert.equal(MESSAGES.success, successText('enquiry', undefined), 'the generic message is unchanged');
  assert.match(src('src/components/LeadForm.astro'), /p\.textContent = successText\(launch \? 'question' : 'enquiry', v\.choice\);/);
});

test('limits: Contact and Sell message boxes take at most 970 characters, with an inline message beyond that', () => {
  assert.equal(BOX_MAX, 970);
  for (const p of ['contact.html', 'sell.html']) {
    assert.match(form(p), /<textarea id="f-message" name="message" maxlength="970"[^>]*aria-describedby="f-message-err"><\/textarea>\s*<span class="err" id="f-message-err" data-err="message"><\/span>/, p);
  }
  const long = 'z'.repeat(971);
  assert.deepEqual(lengthProblem('general', long, composeMessage('general', { choice: 'call', message: long })), { kind: 'box', message: 'Please keep this to 970 characters or fewer.' });
  assert.deepEqual(lengthProblem('sell', long, composeMessage('sell', { choice: 'call', message: long, sellParts: [] })), { kind: 'box', message: 'Please keep this to 970 characters or fewer.' });
  const ok = 'z'.repeat(970);
  assert.equal(lengthProblem('general', ok, composeMessage('general', { choice: 'whatsapp', message: ok })), null, '970 plus the choice fits in 1000');
  // Sell details plus a full box can still pass 1000: blocked, never cut.
  const parts = [['Location', 'l'.repeat(60)], ['Project', 'p'.repeat(60)]];
  assert.equal(lengthProblem('sell', ok, composeMessage('sell', { choice: 'whatsapp', message: ok, sellParts: parts })).kind, 'total');
  assert.doesNotMatch(src('src/components/LeadForm.astro'), /\.slice\(0, 1000\)/, 'Sell no longer relies on cutting');
});

// ---------- One response promise ----------

test('24-hour promise: the Contact intro and the FAQ answer (page and FAQPage JSON-LD)', () => {
  assert.match(main('contact.html'), /<p class="lede">Your budget\. Your objective\. Your timeline\. I'll take it from there, within 24 hours\.<\/p>/);
  const answer = "Enquiries sent through the website's forms are answered within 24 hours, by the contact method you choose.";
  const faq = readFileSync(join(dist, 'faq.html'), 'utf8');
  assert.ok(text(bare(faq)).includes(answer), 'visible FAQ');
  const ld = [...faq.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((x) => JSON.parse(x[1])).find((j) => j['@type'] === 'FAQPage');
  const q = ld.mainEntity.find((e) => e.name === 'How quickly do you respond to enquiries?');
  assert.equal(q.acceptedAnswer.text, answer, 'JSON-LD matches');
  for (const old of ['usually within a day', 'within one business day']) {
    assert.doesNotMatch(faq + read('contact.html'), new RegExp(old), old);
  }
});

// ---------- Left alone ----------

test('unchanged: investor profile, footer newsletter and the ROI calculator have no preferred contact', () => {
  const profile = read('investor-profile.html');
  assert.doesNotMatch(profile, /preferred_contact|Preferred contact/);
  assert.equal(PROFILE_MESSAGES.success, 'Thank you. Your profile has been added to your enquiry.');
  assert.doesNotMatch(src('src/pages/investor-profile.astro'), /preferred/i);
  assert.doesNotMatch(src('src/components/NewsletterSignup.astro'), /preferred/i);
  assert.doesNotMatch(src('src/components/ROICalc.astro'), /preferred/i);
  for (const p of ['index.html', 'invest.html']) assert.doesNotMatch(read(p), /preferred_contact/, p);
});
