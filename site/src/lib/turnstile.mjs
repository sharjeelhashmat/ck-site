// Cloudflare Turnstile, loaded on demand (audit H12/H15). The enquiry form loads it on its first focusin, the same way the
// newsletter signup does (NewsletterSignup.astro), and either finds the other's script tag already in the page. A failed
// attempt is not remembered: the next call tries again. Plain ESM with injectable globals so node:test can drive it.

export const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
export const TURNSTILE_TIMEOUT_MS = 15000;

/**
 * @param {{ win?: any; doc?: any; timeoutMs?: number; pollMs?: number; now?: () => number }} [env]
 * @returns {() => Promise<any>} load(): resolves with window.turnstile, rejects when the script fails or times out
 */
export function turnstileLoader({ win = globalThis.window, doc = globalThis.document, timeoutMs = TURNSTILE_TIMEOUT_MS, pollMs = 100, now = () => Date.now() } = {}) {
  /** @type {Promise<any> | null} */
  let loading = null;
  return function load() {
    if (win.turnstile) return Promise.resolve(win.turnstile);
    loading ??= new Promise((resolve, reject) => {
      let s = doc.querySelector(`script[src^="${TURNSTILE_SRC}"]`);
      const ours = !s;
      if (!s) {
        s = doc.createElement('script');
        s.src = `${TURNSTILE_SRC}?render=explicit`;
        s.async = true;
        doc.head.appendChild(s);
      }
      const script = s;
      const started = now();
      let done = false;
      const fail = () => { if (done) return; done = true; if (ours) script.remove(); reject(new Error('turnstile')); };
      script.addEventListener('error', fail);
      const tick = () => {
        if (done) return;
        if (win.turnstile) { done = true; resolve(win.turnstile); return; }
        if (now() - started > timeoutMs) { fail(); return; }
        setTimeout(tick, pollMs);
      };
      tick();
    }).catch((e) => { loading = null; throw e; });
    return loading;
  };
}
