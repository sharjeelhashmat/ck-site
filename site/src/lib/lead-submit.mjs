// Contact form outcomes (owner-approved 2026-10-10): every submit ends in exactly one visible answer.
// Pure logic, so tests can run every branch without a browser; LeadForm.astro only applies the outcome to the page.

export const TIMEOUT_MS = 15000;

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
export async function sendLead(url, payload, { fetchImpl = (...a) => fetch(...a), timeoutMs = TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    return outcomeFor(res.status, body);
  } catch {
    return failure();
  } finally {
    clearTimeout(timer);
  }
}
