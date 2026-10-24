// Contact form outcomes (owner-approved 2026-10-10): every submit ends in exactly one visible answer.
// Pure logic, so tests can run every branch without a browser; LeadForm.astro only applies the outcome to the page.

import { postJson, TIMEOUT_MS } from './post-json.mjs';

export { TIMEOUT_MS };

/**
 * @typedef {{ enableSend: boolean; resetTurnstile: boolean; message: string }} Base
 * @typedef {Base & { kind: 'success'; id: string | null }} Success
 * @typedef {Base & { kind: 'field'; field: string }} FieldError
 * @typedef {Base & { kind: 'verification' }} Verification
 * @typedef {Base & { kind: 'failure' }} Failure
 * @typedef {Success | FieldError | Verification | Failure} Outcome
 */

export const MESSAGES = {
  success: 'Thank you. Your enquiry has been received. I will reply within 24 hours.',
  phone: 'Please check the mobile number and country code.',
  verification: 'Verification failed. Please try again.',
  field: 'Please check this field.',
  failure: 'Your message could not be sent. Please try again, or contact me directly on WhatsApp or at hello@sharjeelhashmat.com.',
};

// Preferred contact and message composition (owner-approved 2026-10-10). The Worker stores the message on one line
// (it collapses line breaks) and keeps at most 1000 characters, so parts are joined with " | " and the form blocks a
// message that would not fit instead of letting the Worker cut it.
export const CONTACT_CHOICES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
];
export const MESSAGE_MAX = 1000; // the Worker's limit for the whole message
export const BOX_MAX = 970; // the Contact and Sell message box, leaving room for the "Preferred contact" part

export const REPLY_LINES = {
  whatsapp: "I'll answer on WhatsApp within 24 hours.",
  call: "I'll call you within 24 hours.",
  email: "I'll answer by email within 24 hours.",
};
export const REPLY_FALLBACK = 'I will reply within 24 hours.';
export const RECEIVED = {
  enquiry: 'Thank you. Your enquiry has been received.',
  question: 'Thank you. Your question has been received.',
};

export const LIMIT_MESSAGES = {
  box: `Please keep this to ${BOX_MAX} characters or fewer.`,
  total: 'This is too long to send. Please shorten it.',
};

/** @param {unknown} choice @returns {string | null} the visible label for a choice value */
export function contactLabel(choice) {
  return CONTACT_CHOICES.find((c) => c.value === choice)?.label ?? null;
}

/**
 * The confirmation text: the form's first sentence, then the reply line for the chosen contact method.
 * An unreadable choice falls back to the generic line.
 * @param {'enquiry' | 'question'} kind
 * @param {unknown} choice
 */
export function successText(kind, choice) {
  const line = typeof choice === 'string' && Object.hasOwn(REPLY_LINES, choice) ? REPLY_LINES[/** @type {keyof typeof REPLY_LINES} */ (choice)] : REPLY_FALLBACK;
  return `${RECEIVED[kind]} ${line}`;
}

const tidy = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Build the one-line message the form sends.
 *  launch:        "New Launches | Preferred contact: <label> | Project: <name or -> | Question: <text>"
 *  general, sell: "Preferred contact: <label> | <visitor's message>", or just "Preferred contact: <label>" when empty.
 * For sell, the visitor's message is the property details ("Location: … | …") then " || " and the free text, as before.
 * @param {'general' | 'sell' | 'launch'} mode
 * @param {{ choice: string; message?: string; project?: string; question?: string; sellParts?: [string, string][] }} f
 */
export function composeMessage(mode, f) {
  const pref = `Preferred contact: ${contactLabel(f.choice) ?? tidy(f.choice)}`;
  if (mode === 'launch') return ['New Launches', pref, `Project: ${tidy(f.project) || '-'}`, `Question: ${tidy(f.question)}`].join(' | ');
  let body = tidy(f.message);
  if (mode === 'sell') {
    const details = (f.sellParts ?? []).map(([k, v]) => [k, tidy(v)]).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' | ');
    body = [details, body].filter(Boolean).join(' || ');
  }
  return body ? `${pref} | ${body}` : pref;
}

/**
 * Length checks before sending. Returns the problem, or null when the message fits.
 * @param {'general' | 'sell' | 'launch'} mode
 * @param {string} box the visitor's own text (message box, or the question on launch)
 * @param {string} composed the full message from composeMessage
 * @returns {{ kind: 'box' | 'total'; message: string } | null}
 */
export function lengthProblem(mode, box, composed) {
  if (mode !== 'launch' && box.trim().length > BOX_MAX) return { kind: 'box', message: LIMIT_MESSAGES.box };
  if (composed.length > MESSAGE_MAX) return { kind: 'total', message: LIMIT_MESSAGES.total };
  return null;
}

// Fields the Worker can name in an invalid_input error that have an inline message slot on the form.
const FIELDS = new Set(['name', 'email', 'consent_contact', 'phone']);

/**
 * Map a /lead response to the one thing the visitor sees.
 * success: replace the form with the confirmation panel. field / verification: keep the input, show an inline message.
 * failure: keep the input, show the alert with WhatsApp and email. Every non-success outcome re-enables Send and resets
 * Turnstile (a token is single-use).
 * @param {number} status
 * @param {unknown} body
 * @returns {Outcome}
 */
export function outcomeFor(status, body) {
  const b = /** @type {{ ok?: unknown; id?: unknown; error?: unknown; field?: unknown }} */ (body && typeof body === 'object' ? body : {});
  if (status >= 200 && status < 300 && b.ok === true) {
    return { kind: 'success', message: MESSAGES.success, id: typeof b.id === 'string' ? b.id : null, enableSend: false, resetTurnstile: false };
  }
  const retry = { enableSend: true, resetTurnstile: true };
  if (b.error === 'invalid_phone') return { kind: 'field', field: 'phone', message: MESSAGES.phone, ...retry };
  // The Worker answers a failed Turnstile check with 403 verification_failed; it is the visitor's to retry, not a fault.
  if (b.error === 'verification_failed') return { kind: 'verification', message: MESSAGES.verification, ...retry };
  if (status === 400 && b.error === 'invalid_input' && typeof b.field === 'string' && FIELDS.has(b.field)) {
    return { kind: 'field', field: b.field, message: b.field === 'phone' ? MESSAGES.phone : MESSAGES.field, ...retry };
  }
  // Everything else is the failure alert (retry, or WhatsApp / email): 5xx, 429, unknown errors, and the Worker's
  // 503 {error: 'temporarily_unavailable'} when it cannot store the enquiry.
  return failure();
}

/** @returns {Failure} */
export function failure() {
  return { kind: 'failure', message: MESSAGES.failure, enableSend: true, resetTurnstile: true };
}

/**
 * POST the enquiry. Network errors, CORS blocks ("Failed to fetch"), unreadable bodies and the timeout all become failure().
 * @param {string} url
 * @param {unknown} payload
 * @param {{ fetchImpl?: typeof fetch; timeoutMs?: number }} [opts]
 * @returns {Promise<Outcome>}
 */
export async function sendLead(url, payload, opts = {}) {
  const r = await postJson(url, payload, opts);
  return r ? outcomeFor(r.status, r.body) : failure();
}

// ---- Client-side checks before sending (audit H13) ---------------------------------------------------------------------

export const NAME_RE = /^[\p{L}\p{M}' .\-]{2,80}$/u;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The form's error messages, unchanged from the inline checks they replace. */
export const FIELD_MESSAGES = {
  name: 'Enter your name.',
  email: 'Enter a valid email address.',
  phoneMissing: 'Enter your mobile number.',
  phoneInvalid: (/** @type {string} */ country) => `Enter a valid mobile number for ${country || 'the selected country'}.`,
  preferred_contact: 'Please choose how I should contact you.',
  question: 'Enter your question.',
  consent_contact: 'Please confirm so I can reply to you.',
};

/**
 * Every problem with the form's values, in the order the fields appear on the page (so the first one gets focus).
 * Pure: the phone check is passed in (libphonenumber is loaded on demand, lib/phone.mjs toE164).
 * @param {'general' | 'sell' | 'launch'} mode
 * @param {{ name: string; email: string; national: string; country: string; countryLabel?: string; choice: string;
 *   message?: string; project?: string; question?: string; sellParts?: [string, string][]; consent: boolean }} f
 * @param {(national: string, country: string) => string | null} toE164
 * @returns {{ problems: [string, string][]; phone: string | null; message: string }}
 */
export function validateLead(mode, f, toE164) {
  /** @type {[string, string][]} */
  const problems = [];
  const launch = mode === 'launch';
  if (!NAME_RE.test(tidy(f.name))) problems.push(['name', FIELD_MESSAGES.name]);
  if (!EMAIL_RE.test(tidy(f.email))) problems.push(['email', FIELD_MESSAGES.email]);
  const national = tidy(f.national);
  const phone = national ? toE164(national, f.country) : null;
  if (!national) problems.push(['phone', FIELD_MESSAGES.phoneMissing]);
  else if (!phone) problems.push(['phone', FIELD_MESSAGES.phoneInvalid(f.countryLabel ?? '')]);
  if (!contactLabel(f.choice)) problems.push(['preferred_contact', FIELD_MESSAGES.preferred_contact]);
  // The visitor's own text (the question on launch) and the one-line message the Worker receives.
  const box = launch ? tidy(f.question) : tidy(f.message);
  const message = composeMessage(mode, { choice: f.choice, message: f.message, project: f.project, question: f.question, sellParts: f.sellParts });
  const boxField = launch ? 'question' : 'message';
  if (launch && !box) problems.push(['question', FIELD_MESSAGES.question]);
  const tooLong = lengthProblem(mode, box, message);
  if (tooLong) {
    const at = problems.findIndex(([k]) => k === boxField);
    if (at >= 0) problems[at] = [boxField, tooLong.message];
    else problems.push([boxField, tooLong.message]);
  }
  if (!f.consent) problems.push(['consent_contact', FIELD_MESSAGES.consent_contact]);
  return { problems, phone, message };
}

// ---- Turnstile before sending (audit H12) -----------------------------------------------------------------------------

/**
 * What Send does about the security check. 'fallback': the check never loaded (script failed, blocked or timed out) or
 * the widget reported an error and has no token, so the visitor gets the WhatsApp / email alert instead of waiting forever. 'wait': the
 * widget is there but has no token yet. 'send': go.
 * @param {{ loaded: boolean; errored?: boolean; token?: string | null }} s
 * @returns {'fallback' | 'wait' | 'send'}
 */
export function turnstileGate(s) {
  if (s.loaded && s.token) return 'send';
  return !s.loaded || s.errored ? 'fallback' : 'wait';
}
