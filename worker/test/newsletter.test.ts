import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config';
import { FEEDBACK_DETAIL_MAX, NEWS_WELCOME_ID, UNSUBSCRIBE_REASONS, newsletterBlockers, subscribe, unsubscribeFeedbackForm, validateFeedback, validateSubscribe, type NewsletterCtx, type NewsletterDeps } from '../src/newsletter';
import type { OutboundMessage } from '../src/pipeline';
import { templateHash } from '../src/templates';
import { newsletterToken, unsubToken, verifyNewsletterToken } from '../src/unsub';
import { TEMPLATES, approveAll, goodEnv } from './helpers';

const newsEnv = { ...goodEnv, FROM_NEWS_EMAIL: 'brief@news.sharjeelhashmat.com' };

async function nctx(env: Record<string, string> = newsEnv, approved?: Record<string, string>): Promise<NewsletterCtx> {
  return { config: readConfig(env), templates: TEMPLATES, approved: approved ?? (await approveAll()), unsubSecret: env.UNSUB_SECRET };
}

function fake(existing: 'none' | 'active' | 'unsubscribed' = 'none') {
  const f = { sent: [] as OutboundMessage[], upserts: 0, logged: [] as string[], sentToday: 0, deps: undefined as unknown as NewsletterDeps };
  let n = 0;
  f.deps = {
    now: () => new Date('2026-09-24T08:00:00Z'),
    uuid: () => `id-${++n}`,
    upsertSubscriber: async (r) => { f.upserts += 1; return { id: existing === 'none' ? r.id : 'sub-1', confirm: existing !== 'active' }; },
    countSentSince: async () => f.sentToday,
    logMessage: async (m) => { f.logged.push(`${m.lead_id}:${m.template_id}`); f.sentToday += 1; },
    send: async (m) => { f.sent.push(m); return { provider_id: 'p1' }; },
  };
  return f;
}

const body = (over: Record<string, unknown> = {}) => ({ email: 'Amira@Example.com ', source: 'footer', company_website: '', turnstile_token: 'ok', ...over });

describe('newsletter: validation', () => {
  it('normalises the email and keeps a clean source label', () => {
    expect(validateSubscribe(body())).toEqual({ ok: true, input: { email: 'amira@example.com', source: 'footer' } });
    expect(validateSubscribe(body({ source: 'insights/dubai-q1-2026-who-is-buying' }))).toMatchObject({ ok: true, input: { source: 'insights/dubai-q1-2026-who-is-buying' } });
    expect(validateSubscribe(body({ source: '<script>' }))).toMatchObject({ ok: true, input: { source: null } });
  });
  it('rejects bad, header-injected and disposable addresses', () => {
    for (const email of ['', 'nope', 'a@b', 'a b@c.com', 'a@b.com\r\nBcc: x@y.com', 'x@mailinator.com', `${'a'.repeat(250)}@b.com`]) {
      expect(validateSubscribe(body({ email }))).toEqual({ ok: false, field: 'email' });
    }
  });
});

describe('newsletter: subscribe', () => {
  it('go-live incomplete (default config): subscriber stored, nothing sent', async () => {
    const f = fake();
    const r = await subscribe(body(), await nctx({ ...newsEnv, OUTBOUND: 'off' }), f.deps);
    expect(r).toMatchObject({ status: 200, body: { ok: true }, internal: { confirm: true, outbound: 'skipped:blocked' } });
    expect(f.upserts).toBe(1);
    expect(f.sent).toHaveLength(0);
  });

  it('live and approved: one welcome on the news stream with a working unsubscribe link, logged against the subscriber', async () => {
    const f = fake();
    const c = await nctx();
    const r = await subscribe(body(), c, f.deps);
    expect(r.internal?.outbound).toBe('sent');
    expect(f.sent).toHaveLength(1);
    const m = f.sent[0]!;
    expect(m.stream).toBe('news');
    expect(m.to).toBe('amira@example.com');
    expect(m.text).toContain('Royals Field Properties · BRN 12345');
    expect(m.text).toContain(m.listUnsubscribe!);
    const token = new URL(m.listUnsubscribe!).searchParams.get('token')!;
    expect(m.listUnsubscribe!.startsWith('https://api.sharjeelhashmat.com/api/newsletter/unsubscribe?token=')).toBe(true);
    expect(await verifyNewsletterToken(token, c.unsubSecret!)).toBe('amira@example.com');
    expect(f.logged).toEqual([`id-1:${NEWS_WELCOME_ID}`]);
  });

  it('already subscribed: no second welcome, same success answer', async () => {
    const f = fake('active');
    const r = await subscribe(body(), await nctx(), f.deps);
    expect(r.body).toEqual({ ok: true });
    expect(r.internal?.outbound).toBe('skipped:already_subscribed');
    expect(f.sent).toHaveLength(0);
  });

  it('coming back after unsubscribing counts as a fresh opt-in and gets the welcome', async () => {
    const f = fake('unsubscribed');
    expect((await subscribe(body(), await nctx(), f.deps)).internal?.outbound).toBe('sent');
  });

  it('honeypot: success answer, nothing stored, nothing sent', async () => {
    const f = fake();
    const r = await subscribe(body({ company_website: 'http://spam.example' }), await nctx(), f.deps);
    expect(r.body).toEqual({ ok: true });
    expect(f.upserts).toBe(0);
    expect(f.sent).toHaveLength(0);
  });

  it('invalid email: 400 naming the field, nothing stored', async () => {
    const f = fake();
    const r = await subscribe(body({ email: 'nope' }), await nctx(), f.deps);
    expect(r).toMatchObject({ status: 400, body: { ok: false, error: 'invalid_input', field: 'email' } });
    expect(f.upserts).toBe(0);
  });

  it('welcome not approved, or edited after approval: stored, not sent', async () => {
    const approved = await approveAll();
    delete approved[NEWS_WELCOME_ID];
    expect((await subscribe(body(), await nctx(newsEnv, approved), fake().deps)).internal?.outbound).toBe('skipped:not_approved');

    const tpl = TEMPLATES.find((t) => t.id === NEWS_WELCOME_ID)!;
    const edited = { ...(await nctx()), templates: TEMPLATES.map((t) => (t.id === NEWS_WELCOME_ID ? { ...t, body: t.body + ' Extra.' } : t)) };
    edited.approved = { ...edited.approved, [NEWS_WELCOME_ID]: await templateHash(tpl) };
    expect((await subscribe(body(), edited, fake().deps)).internal?.outbound).toBe('skipped:not_approved');
  });

  it('daily send cap is shared with lead replies', async () => {
    const f = fake();
    f.sentToday = 80;
    expect((await subscribe(body(), await nctx(), f.deps)).internal?.outbound).toBe('skipped:daily_cap');
  });
});

describe('newsletter: blockers', () => {
  it('needs every lead go-live item plus a news sender on a subdomain', async () => {
    expect(newsletterBlockers(await nctx())).toEqual([]);
    expect(newsletterBlockers(await nctx({ ...newsEnv, FROM_NEWS_EMAIL: '' }))).toContain('FROM_NEWS_EMAIL not set');
    expect(newsletterBlockers(await nctx({ ...newsEnv, FROM_NEWS_EMAIL: 'brief@sharjeelhashmat.com' }))).toContain('FROM_NEWS_EMAIL must be on a subdomain, not the root domain');
    expect(newsletterBlockers(await nctx({ ...newsEnv, BRN: '' }))).toContain('BRN not set');
    expect(newsletterBlockers(await nctx({ ...newsEnv, OUTBOUND: 'off' }))).toContain('OUTBOUND is off');
  });
});

describe('newsletter: unsubscribe token', () => {
  it('round-trips, rejects tampering, a wrong secret, and a lead-reply signature', async () => {
    const t = await newsletterToken('Amira@Example.com', 's');
    expect(await verifyNewsletterToken(t, 's')).toBe('amira@example.com');
    expect(await verifyNewsletterToken(t, 'other')).toBeNull();
    const [enc, sig] = t.split('.');
    const otherEnc = (await newsletterToken('someone@example.com', 's')).split('.')[0];
    expect(await verifyNewsletterToken(`${otherEnc}.${sig}`, 's')).toBeNull();
    expect(await verifyNewsletterToken(`${enc}.${await unsubToken('amira@example.com', 's')}`, 's')).toBeNull();
    for (const bad of ['', 'x', 'a.b', `${enc}.`, `.${sig}`, `${enc}.${sig}.x`]) expect(await verifyNewsletterToken(bad, 's')).toBeNull();
  });
});

describe('newsletter: unsubscribe feedback', () => {
  const f = (o: Record<string, string>) => validateFeedback(new URLSearchParams(o));

  it('offers exactly the five agreed reasons', () => {
    expect(UNSUBSCRIBE_REASONS.map(([, label]) => label)).toEqual([
      'Too frequent', "Content isn't relevant to me", "Didn't mean to subscribe / don't recognize this", 'Just decluttering my inbox', 'Other',
    ]);
  });

  it('accepts a listed reason with optional free text, collapsed and capped', () => {
    expect(f({ action: 'send', reason: 'too_frequent' })).toEqual({ kind: 'answer', reason: 'too_frequent', detail: null });
    expect(f({ action: 'send', reason: 'other', detail: '  weekly\n is  a lot ' })).toEqual({ kind: 'answer', reason: 'other', detail: 'weekly is a lot' });
    const long = f({ action: 'send', reason: 'other', detail: 'x'.repeat(2000) });
    expect(long.kind === 'answer' && long.detail!.length).toBe(FEEDBACK_DETAIL_MAX);
  });

  it('free text alone counts as Other; nothing chosen, an unknown reason, or Skip is a skip', () => {
    expect(f({ action: 'send', detail: 'moved abroad' })).toEqual({ kind: 'answer', reason: 'other', detail: 'moved abroad' });
    expect(f({ action: 'send' })).toEqual({ kind: 'skip' });
    expect(f({ action: 'send', reason: 'hacked' })).toEqual({ kind: 'skip' });
    expect(f({ action: 'skip', reason: 'too_frequent', detail: 'x' })).toEqual({ kind: 'skip' });
  });

  it('Skip and Send are identical buttons, side by side; no field is required', () => {
    const html = unsubscribeFeedbackForm('abc.def');
    const buttons = [...html.matchAll(/<button type="submit" name="action" value="(send|skip)" style="([^"]+)">/g)];
    expect(buttons.map((b) => b[1])).toEqual(['send', 'skip']);
    expect(buttons[0]![2]).toBe(buttons[1]![2]);
    expect(html).not.toContain('required');
    expect(html).toContain('already unsubscribed');
  });

  it('escapes the token into the form', () => {
    expect(unsubscribeFeedbackForm('"><script>')).toContain('value="&quot;&gt;&lt;script&gt;"');
  });
});
