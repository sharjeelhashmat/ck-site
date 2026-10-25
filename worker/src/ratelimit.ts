// Per-route, per-IP rate limits (PR 2c item 4b, gap G05) with the Workers Rate Limiting binding ([[ratelimits]] in
// wrangler.toml; no charge of its own, its calls are ordinary Workers usage; the plan check is in the README). Counts are kept per Cloudflare location and are
// approximate by design: this stops floods from one address, it is not an exact quota. Turnstile stays the real gate
// on the form routes. A missing or failing limiter lets the request through (logged), so a limiter fault never blocks
// a real enquiry.
import { sha256Hex } from './hash';

export const RATE_LIMITS = { RL_FORMS: 5, RL_UNSUB: 20, RL_FEEDBACK: 10, RL_READ: 60 } as const;
export type LimiterName = keyof typeof RATE_LIMITS;
export const RETRY_AFTER_SECONDS = 60;

/** Which limiter a request counts against, and its route key. null = not limited (/health, preflights). */
export function limiterFor(method: string, path: string): { binding: LimiterName; route: string } | null {
  if (method === 'OPTIONS' || path === '/health') return null;
  if (method === 'POST') {
    if (path === '/lead') return { binding: 'RL_FORMS', route: 'lead' };
    if (path === '/profile') return { binding: 'RL_FORMS', route: 'profile' };
    if (path === '/api/newsletter/subscribe') return { binding: 'RL_FORMS', route: 'newsletter' };
    if (path === '/api/newsletter/unsubscribe/feedback') return { binding: 'RL_FEEDBACK', route: 'feedback' };
  }
  if (method === 'GET' || method === 'POST') {
    if (path === '/unsubscribe') return { binding: 'RL_UNSUB', route: 'unsubscribe' };
    if (path === '/api/newsletter/unsubscribe') return { binding: 'RL_UNSUB', route: 'newsletter-unsubscribe' };
  }
  if (method === 'GET') return { binding: 'RL_READ', route: 'get' };
  return null;
}

/** True when this IP is over the route's limit. The key holds a hash of the IP, never the address itself. */
export async function overLimit(limiters: Partial<Record<LimiterName, RateLimit>>, req: Request, path: string): Promise<boolean> {
  const which = limiterFor(req.method, path);
  if (!which) return false;
  const limiter = limiters[which.binding];
  try {
    if (!limiter) throw new Error('missing');
    const ip = req.headers.get('cf-connecting-ip') ?? 'none';
    const { success } = await limiter.limit({ key: `${which.route}:${(await sha256Hex(ip)).slice(0, 32)}` });
    return !success;
  } catch {
    console.warn('ratelimit: limiter unavailable, request allowed');
    return false;
  }
}
