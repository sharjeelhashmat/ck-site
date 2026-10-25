// Turnstile server-side check (PR 2c item 2, gap G03). A token passes only when siteverify says success, the widget ran on
// one of our hosts and its action is the one the route's form sets. The answer carries a reason code for the log; the
// token itself is never logged.

/** The action each form's widget sets (site: data-action on the widget, passed to turnstile.render). */
export const TURNSTILE_ACTIONS = { lead: 'lead', newsletter: 'newsletter' } as const;

// Cloudflare's documented Turnstile test secrets (always pass / always fail / token already spent). Refused unless
// ALLOW_TEST_TURNSTILE === 'yes', which is for local and staging tests only and is never set in production.
export const TURNSTILE_TEST_SECRETS = ['1x0000000000000000000000000000000AA', '2x0000000000000000000000000000000AA', '3x0000000000000000000000000000000AA'];

export interface TurnstileCheck {
  /** Hostnames the widget may run on (lower case, no scheme). */
  hosts: string[];
  action: string;
  allowTest?: boolean;
}

export interface TurnstileResult { ok: boolean; reason: string }

/** Production bare and www hosts from SITE_URL, plus the STAGING_ORIGIN host when it is set. */
export function turnstileHosts(siteUrl: string, stagingOrigin: string): string[] {
  const hosts: string[] = [];
  try {
    const bare = new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, '');
    if (bare) hosts.push(bare, `www.${bare}`);
  } catch { /* no SITE_URL: no production host */ }
  try {
    if (stagingOrigin) hosts.push(new URL(stagingOrigin).hostname.toLowerCase());
  } catch { /* malformed: ignored */ }
  return hosts;
}

export async function verifyTurnstile(secret: string | undefined, token: unknown, ip: string | null, check: TurnstileCheck): Promise<TurnstileResult> {
  if (!secret) return { ok: false, reason: 'no_secret' };
  const testSecret = TURNSTILE_TEST_SECRETS.includes(secret.trim());
  if (testSecret && !check.allowTest) return { ok: false, reason: 'test_secret' };
  if (typeof token !== 'string' || !token) return { ok: false, reason: 'no_token' };
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  // 5 s cap: a slow or unreachable siteverify counts as a failed check, never as a pass.
  let out: { success?: unknown; hostname?: unknown; action?: unknown };
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(5000) });
    out = (await res.json().catch(() => ({}))) as typeof out;
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  }
  if (out.success !== true) return { ok: false, reason: 'not_success' };
  // The test secrets answer with Cloudflare's dummy hostname and no action; they are reachable only with ALLOW_TEST_TURNSTILE.
  if (testSecret) return { ok: true, reason: 'ok' };
  if (typeof out.hostname !== 'string' || !check.hosts.includes(out.hostname.toLowerCase())) return { ok: false, reason: 'hostname_mismatch' };
  if (out.action !== check.action) return { ok: false, reason: 'action_mismatch' };
  return { ok: true, reason: 'ok' };
}
