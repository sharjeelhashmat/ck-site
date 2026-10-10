// Investor profile form outcomes (owner-approved 2026-10-10), same pattern as lead-submit.mjs: every submit ends in
// exactly one visible answer. Pure logic, tested in Node; investor-profile.astro only applies it to the page.

export const TIMEOUT_MS = 15000;
export const OTHER_AREA_MAX = 80;

/**
 * @typedef {{ enableSend: boolean; message: string }} Base
 * @typedef {Base & { kind: 'success' }} Success
 * @typedef {Base & { kind: 'other_area' }} OtherArea
 * @typedef {Base & { kind: 'failure' }} Failure
 * @typedef {Success | OtherArea | Failure} Outcome
 */

export const MESSAGES = {
  success: 'Thank you. Your profile has been added to your enquiry.',
  otherArea: 'Please tell me which area, or untick Elsewhere in the UAE.',
  failure: 'Your profile could not be saved. Your enquiry has still been received, and I will reply within 24 hours.',
};

/**
 * "Elsewhere in the UAE": the text field shows, and is required, only while the box is ticked; unticking hides and clears it.
 * @param {boolean} ticked
 */
export function otherAreaState(ticked) {
  return { hidden: !ticked, required: ticked, clear: !ticked };
}

/**
 * Map a /profile response to the one thing the visitor sees. 403 not_allowed, invalid or expired links, 5xx and anything
 * unexpected are the failure panel (the enquiry itself was already received).
 * @param {number} status
 * @param {unknown} body
 * @returns {Outcome}
 */
export function outcomeFor(status, body) {
  const b = /** @type {{ ok?: unknown; error?: unknown }} */ (body && typeof body === 'object' ? body : {});
  if (status >= 200 && status < 300 && b.ok === true) return { kind: 'success', message: MESSAGES.success, enableSend: false };
  if (status === 400 && b.error === 'invalid_other_area') return { kind: 'other_area', message: MESSAGES.otherArea, enableSend: true };
  return failure();
}

/** @returns {Failure} */
export function failure() {
  return { kind: 'failure', message: MESSAGES.failure, enableSend: true };
}

/**
 * POST the profile. Network errors, CORS blocks, unreadable bodies and the timeout all become failure().
 * @param {string} url
 * @param {unknown} payload
 * @param {{ fetchImpl?: typeof fetch; timeoutMs?: number }} [opts]
 * @returns {Promise<Outcome>}
 */
export async function sendProfile(url, payload, { fetchImpl = (...a) => fetch(...a), timeoutMs = TIMEOUT_MS } = {}) {
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
