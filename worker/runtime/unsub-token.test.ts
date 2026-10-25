// PR 2c item 8a (Coordinator carry-over from the PR 2b review): unsubscribe links carry no email address. The token is
// v2.<list>.<sha256 of the address>.<HMAC with UNSUB_SECRET over list and hash>, so it names the subscriber without the
// address and cannot be moved to another list. Links in the old formats (lead: ?e=<email>&t=<hmac>; newsletter:
// ?token=<base64 email>.<hmac>) keep working until LEGACY_UNSUB_UNTIL (60 days), and each use logs one fixed line.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';
import { sha256Hex } from '../src/hash';
import { LEGACY_UNSUB_UNTIL, newsletterToken, unsubToken } from '../src/unsub';
import { approveAllInKv, baseEnv, clearDb, emails, lead, LIVE, ORIGIN, rows, stubFetch, toOf, type Call } from './helpers';

let calls: Call[] = [];
let action = 'lead';
beforeEach(async () => {
  calls = [];
  await clearDb();
  stubFetch(calls, { siteverify: () => ({ success: true, hostname: 'sharjeelhashmat.com', action }) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const W = 'https://ck-lead-worker.example.workers.dev';
const local = (u: string) => u.replace(W, 'https://api.test');
const get = (u: string, e: Env) => worker.fetch(new Request(local(u)), e);
const oneClick = (u: string, e: Env) => worker.fetch(new Request(local(u), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }), e);
const live = async () => { const e = baseEnv(LIVE); await approveAllInKv(e); return e; };

async function leadLink(e: Env): Promise<string> {
  action = 'lead';
  const mid = { intent: 'buy', budget_band: '1m_2m', timeline: '3m', funding: 'mortgage', utm_source: '', phone: '', consent_nurture: true };
  await worker.fetch(new Request('https://api.test/lead', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(lead(mid)) }), e);
  const reply = emails(calls).find((c) => toOf(c) === 'amira@example.com')!;
  return ((reply.body as { headers: Record<string, string> }).headers['List-Unsubscribe'] as string).slice(1, -1);
}
async function newsLink(e: Env): Promise<string> {
  action = 'newsletter';
  await worker.fetch(new Request('https://api.test/api/newsletter/subscribe', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email: 'reader@example.com', source: 'footer', company_website: '', turnstile_token: 'ok' }) }), e);
  const mail = emails(calls).find((c) => toOf(c) === 'reader@example.com')!;
  return ((mail.body as { headers: Record<string, string> }).headers['List-Unsubscribe'] as string).slice(1, -1);
}
const noAddress = (link: string, email: string) => {
  expect(link).not.toContain(email);
  expect(link).not.toContain(encodeURIComponent(email));
  expect(link).not.toContain(btoa(email).replace(/=+$/, ''));
  expect(link).not.toMatch(/[?&]e=/);
};

describe('lead-reply unsubscribe links', () => {
  it('carry an opaque v2 token, in the body and the List-Unsubscribe header alike', async () => {
    const e = await live();
    const link = await leadLink(e);
    expect(link).toMatch(new RegExp(`^${W}/unsubscribe\\?t=v2\\.leads\\.[0-9a-f]{64}\\.[0-9a-f]{64}$`));
    noAddress(link, 'amira@example.com');
    const text = (emails(calls).find((c) => toOf(c) === 'amira@example.com')!.body as { text: string }).text;
    expect(text).toContain(link);
    expect(text).not.toMatch(/unsubscribe\?e=/);
  });

  it('GET confirms and changes nothing; POST suppresses the hash', async () => {
    const e = await live();
    const link = await leadLink(e);
    const page = await get(link, e);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('action="/unsubscribe?t=v2.leads.');
    expect(await rows('SELECT * FROM suppression')).toHaveLength(0);
    expect((await oneClick(link, e)).status).toBe(200);
    expect(await rows('SELECT email_hash FROM suppression')).toEqual([{ email_hash: await sha256Hex('amira@example.com') }]);
  });

  it('a tampered token is refused (hash or signature), and so is a newsletter token on this route', async () => {
    const e = await live();
    const link = await leadLink(e);
    const t = new URL(link).searchParams.get('t')!;
    const [, list, hash, sig] = t.split('.') as [string, string, string, string];
    const flip = (s: string) => (s[0] === 'a' ? 'b' : 'a') + s.slice(1);
    for (const bad of [`v2.${list}.${flip(hash)}.${sig}`, `v2.${list}.${hash}.${flip(sig)}`, `v2.monthly.${hash}.${sig}`, `v2.${list}.${hash}`, 'v2']) {
      expect((await oneClick(`${W}/unsubscribe?t=${bad}`, e)).status, bad).toBe(400);
    }
    expect(await rows('SELECT * FROM suppression')).toHaveLength(0);
  });

  it('a legacy link (?e=&t=) still works before LEGACY_UNSUB_UNTIL and logs only "legacy link used"', async () => {
    const e = await live();
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')); });
    const legacy = `${W}/unsubscribe?e=${encodeURIComponent('amira@example.com')}&t=${await unsubToken('amira@example.com', 'unsub-test-secret')}`;
    expect((await get(legacy, e)).status).toBe(200);
    expect((await oneClick(legacy, e)).status).toBe(200);
    spy.mockRestore();
    expect(await rows('SELECT * FROM suppression')).toHaveLength(1);
    expect(lines).toEqual(['unsubscribe: legacy link used', 'unsubscribe: legacy link used']);
  });

  it('a legacy link is refused after LEGACY_UNSUB_UNTIL; a v2 link is not', async () => {
    const e = await live();
    const link = await leadLink(e);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(LEGACY_UNSUB_UNTIL) + 1000));
    const legacy = `${W}/unsubscribe?e=${encodeURIComponent('amira@example.com')}&t=${await unsubToken('amira@example.com', 'unsub-test-secret')}`;
    expect((await oneClick(legacy, e)).status).toBe(400);
    expect((await oneClick(link, e)).status).toBe(200);
  });
});

describe('newsletter unsubscribe links', () => {
  it('carry an opaque v2 token for the list; the welcome row stores the hash', async () => {
    const e = await live();
    const link = await newsLink(e);
    expect(link).toMatch(new RegExp(`^${W}/api/newsletter/unsubscribe\\?token=v2\\.monthly\\.[0-9a-f]{64}\\.[0-9a-f]{64}$`));
    noAddress(link, 'reader@example.com');
    expect(await rows('SELECT email_hash FROM newsletter_subscribers')).toEqual([{ email_hash: await sha256Hex('reader@example.com') }]);
  });

  it('POST unsubscribes; the feedback form takes the same token', async () => {
    const e = await live();
    const link = await newsLink(e);
    const res = await oneClick(link, e);
    expect(res.status).toBe(200);
    const token = new URL(link).searchParams.get('token')!;
    expect(await res.text()).toContain(`name="token" value="${token}"`);
    expect((await rows('SELECT unsubscribed_at FROM newsletter_subscribers'))[0]!.unsubscribed_at).not.toBeNull();
    const fb = await worker.fetch(new Request('https://api.test/api/newsletter/unsubscribe/feedback', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token, action: 'send', reason: 'too_frequent' }).toString(),
    }), e);
    expect(fb.status).toBe(200);
    expect(await rows('SELECT unsubscribe_reason FROM newsletter_subscribers')).toEqual([{ unsubscribe_reason: 'too_frequent' }]);
  });

  it('a lead token cannot unsubscribe from the newsletter; a tampered one is refused', async () => {
    const e = await live();
    const link = await newsLink(e);
    const token = new URL(link).searchParams.get('token')!;
    const asLead = token.replace('v2.monthly.', 'v2.leads.');
    expect((await oneClick(`${W}/api/newsletter/unsubscribe?token=${asLead}`, e)).status).toBe(400);
    expect((await oneClick(`${W}/api/newsletter/unsubscribe?token=${token.slice(0, -1)}0`, e)).status).toBe(400);
    expect((await rows('SELECT unsubscribed_at FROM newsletter_subscribers'))[0]!.unsubscribed_at).toBeNull();
  });

  it('a legacy token (base64 address) works before LEGACY_UNSUB_UNTIL, is refused after', async () => {
    const e = await live();
    await newsLink(e);
    const legacy = `${W}/api/newsletter/unsubscribe?token=${await newsletterToken('reader@example.com', 'unsub-test-secret')}`;
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect((await oneClick(legacy, e)).status).toBe(200);
    spy.mockRestore();
    expect((await rows('SELECT unsubscribed_at FROM newsletter_subscribers'))[0]!.unsubscribed_at).not.toBeNull();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(LEGACY_UNSUB_UNTIL) + 1000));
    expect((await oneClick(legacy, e)).status).toBe(400);
  });
});
