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
