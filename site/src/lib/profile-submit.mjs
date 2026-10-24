// Investor profile form outcomes (owner-approved 2026-10-10), same pattern as lead-submit.mjs: every submit ends in
// exactly one visible answer. Pure logic, tested in Node; investor-profile.astro only applies it to the page.

import { postJson, TIMEOUT_MS } from './post-json.mjs';

export { TIMEOUT_MS };
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
export async function sendProfile(url, payload, opts = {}) {
  const r = await postJson(url, payload, opts);
  return r ? outcomeFor(r.status, r.body) : failure();
}

/** The four required questions, in page order. */
export const PROFILE_REQUIRED = ['objective', 'property_type', 'risk_tolerance', 'holding_period'];
export const CHOOSE_ONE = 'Please choose one.';

/**
 * Every unanswered question, in page order (the first one gets focus). Audit H13.
 * @param {Record<string, string>} values the select values by name
 * @param {boolean} otherTicked "Elsewhere in the UAE" is ticked
 * @param {string} otherText what was typed in "Which area or community?"
 * @returns {[string, string][]}
 */
export function profileProblems(values, otherTicked, otherText) {
  /** @type {[string, string][]} */
  const out = PROFILE_REQUIRED.filter((f) => !String(values[f] ?? '').trim()).map((f) => [f, CHOOSE_ONE]);
  if (otherTicked && !String(otherText ?? '').replace(/\s+/g, ' ').trim()) out.push(['other_area', MESSAGES.otherArea]);
  return out;
}
