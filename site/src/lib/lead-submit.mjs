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
