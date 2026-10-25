async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function unsubToken(email: string, secret: string): Promise<string> {
  return hmac(secret, email.trim().toLowerCase());
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyUnsubToken(email: string, token: string, secret: string): Promise<boolean> {
  return sameString(await unsubToken(email, secret), token);
}

// Newsletter unsubscribe: a single self-contained token, `base64url(email).hmac`. The HMAC input is prefixed so a
// lead-reply unsubscribe signature can never be replayed as a newsletter one, or the other way round.
const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export async function newsletterToken(email: string, secret: string): Promise<string> {
  const e = email.trim().toLowerCase();
  return `${b64url(e)}.${await hmac(secret, `newsletter\n${e}`)}`;
}

// Returns the email the token was issued for, or null if the token is malformed or not signed with this secret.
export async function verifyNewsletterToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [enc, sig] = parts as [string, string];
  if (!enc || !sig || !/^[A-Za-z0-9_-]+$/.test(enc) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  let email: string;
  try { email = unb64url(enc); } catch { return null; }
  return sameString(await hmac(secret, `newsletter\n${email}`), sig) ? email : null;
}

// Version 2 (PR 2c item 8a): the link carries no address. v2.<list>.<sha256 hex of the address>.<HMAC hex over
// "unsub-v2", list and hash>. Lists: "leads" (lead-reply suppression, keyed by the same hash) and the newsletter's
// list. The list is signed, so a token cannot be moved from one list to another.
export const UNSUB_LISTS = ['leads', 'monthly'] as const;
export type UnsubList = (typeof UNSUB_LISTS)[number];

export async function linkToken(emailHash: string, list: UnsubList, secret: string): Promise<string> {
  return `v2.${list}.${emailHash}.${await hmac(secret, `unsub-v2\n${list}\n${emailHash}`)}`;
}

/** The address hash a v2 token was issued for, when it is well formed, for this list, and signed with this secret. */
export async function verifyLinkToken(token: string, list: UnsubList, secret: string): Promise<string | null> {
  const m = /^v2\.([a-z]+)\.([0-9a-f]{64})\.([0-9a-f]{64})$/.exec(token);
  if (!m || m[1] !== list) return null;
  const hash = m[2]!;
  return sameString(await hmac(secret, `unsub-v2\n${list}\n${hash}`), m[3]!) ? hash : null;
}

// The old formats (lead: ?e=<address>&t=<hmac>; newsletter: base64url(address).hmac) are accepted until this moment:
// 60 days from the planned deploy of PR 2c (early November 2026). No link in either format has been sent by the Worker
// (replies and the newsletter were never switched on), so this only covers a link sent by hand.
export const LEGACY_UNSUB_UNTIL = '2027-01-01T00:00:00.000Z';
export const legacyAccepted = (now: Date) => now.getTime() < Date.parse(LEGACY_UNSUB_UNTIL);
