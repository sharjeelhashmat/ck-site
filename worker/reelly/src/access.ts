// Cloudflare Access check for the private research tool (owner 2026-11-19). Cloudflare Access sits in front of the
// Worker's hostname and lets only the owner's email through; this code refuses every request that does not carry a
// valid Access token as well, so a misconfigured or removed Access application still exposes nothing.
// The token is the Cf-Access-Jwt-Assertion header: an RS256 JWT signed by the team's keys
// (https://<team>.cloudflareaccess.com/cdn-cgi/access/certs). Checked: the signature with the key named by "kid", the
// issuer (the team domain), the audience (ACCESS_AUD, the application's AUD tag), the expiry and not-before times, and,
// when OWNER_EMAIL is set, the email claim.

export interface AccessEnv { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; OWNER_EMAIL?: string }
export type AccessResult = { ok: true; email: string | null } | { ok: false; reason: 'not_configured' | 'denied' };

const TEAM_RE = /^[a-z0-9][a-z0-9-]{0,62}\.cloudflareaccess\.com$/;

/** "myteam.cloudflareaccess.com" from what the owner pasted (with or without https:// and a trailing slash), or null. */
export function teamDomain(v: string | undefined): string | null {
  const t = (v ?? '').trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/+$/, '');
  return TEAM_RE.test(t) ? t : null;
}

export const accessConfigured = (env: AccessEnv): boolean => Boolean(teamDomain(env.ACCESS_TEAM_DOMAIN) && (env.ACCESS_AUD ?? '').trim());

const b64urlBytes = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const b64urlJson = (s: string): unknown => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

interface Jwk { kid?: string; kty: string; n?: string; e?: string; alg?: string }
const jwksCache = new Map<string, { keys: Jwk[]; exp: number }>();

/** For tests: forget the cached signing keys. */
export const resetKeyCache = () => jwksCache.clear();

async function keysFor(team: string, fetcher: typeof fetch, now: number, refresh: boolean): Promise<Jwk[]> {
  const c = jwksCache.get(team);
  if (c && c.exp > now && !refresh) return c.keys;
  const res = await fetcher(`https://${team}/cdn-cgi/access/certs`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('could not load the Access signing keys');
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys.filter((k) => k.kty === 'RSA') : [];
  jwksCache.set(team, { keys, exp: now + 60 * 60 * 1000 });
  return keys;
}

/** Verify the request's Access token. Never throws; a failure is "denied" (or "not_configured" without the variables). */
export async function verifyAccess(req: Request, env: AccessEnv, deps: { fetch: typeof fetch; now?: () => number }): Promise<AccessResult> {
  const team = teamDomain(env.ACCESS_TEAM_DOMAIN);
  const aud = (env.ACCESS_AUD ?? '').trim();
  if (!team || !aud) return { ok: false, reason: 'not_configured' };
  const now = (deps.now ?? Date.now)();
  try {
    const token = req.headers.get('Cf-Access-Jwt-Assertion') ?? '';
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((p) => !/^[\w-]+$/.test(p))) return { ok: false, reason: 'denied' };
    const [h, p, s] = parts as [string, string, string];
    const header = b64urlJson(h) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false, reason: 'denied' };
    let jwk = (await keysFor(team, deps.fetch, now, false)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await keysFor(team, deps.fetch, now, true)).find((k) => k.kid === header.kid);
    if (!jwk) return { ok: false, reason: 'denied' };
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const signed = new TextEncoder().encode(`${h}.${p}`);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), signed))) return { ok: false, reason: 'denied' };
    const claims = b64urlJson(p) as { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; email?: string };
    const sec = Math.floor(now / 1000);
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== `https://${team}`) return { ok: false, reason: 'denied' };
    if (!auds.includes(aud)) return { ok: false, reason: 'denied' };
    if (typeof claims.exp !== 'number' || claims.exp <= sec) return { ok: false, reason: 'denied' };
    if (typeof claims.nbf === 'number' && claims.nbf > sec + 60) return { ok: false, reason: 'denied' };
    const owner = (env.OWNER_EMAIL ?? '').trim().toLowerCase();
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
    if (owner && email !== owner) return { ok: false, reason: 'denied' };
    return { ok: true, email };
  } catch {
    return { ok: false, reason: 'denied' };
  }
}
