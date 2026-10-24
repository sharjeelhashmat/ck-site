// The one submit helper for the enquiry and profile forms (audit item 27): POST JSON with a timeout. Network errors,
// CORS blocks, the timeout and an unreadable body never throw: the caller gets null, or the status and whatever body
// could be read ({} when none).

export const TIMEOUT_MS = 15000;

/**
 * @param {string} url
 * @param {unknown} payload
 * @param {{ fetchImpl?: typeof fetch; timeoutMs?: number }} [opts]
 * @returns {Promise<{ status: number; body: unknown } | null>}
 */
export async function postJson(url, payload, { fetchImpl = (...a) => fetch(...a), timeoutMs = TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
