import { isSubdomainSender, outboundBlockers, type Config } from './config';
import { isDisposable, isValidEmail } from './firewall';
import type { OutboundMessage } from './pipeline';
import { isApproved, renderTemplate, templateHash, type Template } from './templates';
import { linkToken } from './unsub';
import { sha256Hex } from './hash';
import { dedupeKey, NEWSLETTER_LIST, sendOnce, type Outbox } from './outbox';

// Standalone newsletter signup, single opt-in (owner decision 2026-09-24). The subscriber row is written as soon as the
// request is valid; the confirmation email is a separate, fully gated step that stays silent until go-live is complete.

export const NEWS_WELCOME_ID = 'NEWS-WELCOME';
// Where the signup came from: "footer" or "insights/<slug>". Anything else is stored as null.
const SOURCES = /^[a-z0-9/_-]{1,120}$/;

export interface SubscribeInput {
  email: string;
  source: string | null;
}

export function validateSubscribe(raw: unknown): { ok: true; input: SubscribeInput } | { ok: false; field: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, field: 'body' };
  const r = raw as Record<string, unknown>;
  // Honeypot: same field name as the enquiry form.
  if (typeof r.company_website === 'string' && r.company_website.trim() !== '') return { ok: false, field: 'company_website' };
  const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) return { ok: false, field: 'email' };
  if (isDisposable(email)) return { ok: false, field: 'email' };
  const source = typeof r.source === 'string' && SOURCES.test(r.source) ? r.source : null;
  return { ok: true, input: { email, source } };
}

export interface NewsletterDeps {
  now(): Date;
  uuid(): string;
  // Inserts a new subscriber; does nothing for an existing one, active or unsubscribed (an unsubscribe is never undone
  // by a signup form). Returns the row id and whether a confirmation is due (a new row only).
  upsertSubscriber(row: { id: string; email: string; source: string | null; subscribed_at: string }): Promise<{ id: string; confirm: boolean }>;
  logMessage(row: { id: string; lead_id: string; created_at: string; template_id: string; template_hash: string; provider_id: string; outcome: string }): Promise<void>;
  outbox: Outbox;
  send(msg: OutboundMessage, idempotencyKey: string): Promise<{ provider_id: string }>;
}

export interface NewsletterCtx {
  config: Config;
  templates: Template[];
  approved: Record<string, string>;
  unsubSecret?: string;
}

// Why the confirmation would not be sent right now. Empty = send. The newsletter's own switch (OUTBOUND_NEWSLETTER) and the
// same go-live checks as replies (BRN, sender checks) apply.
export function newsletterBlockers(ctx: NewsletterCtx): string[] {
  const c = ctx.config;
  const b = outboundBlockers(c, 'newsletter');
  if (!c.senders.news.email) b.push('FROM_NEWS_EMAIL not set');
  else if (!isSubdomainSender(c.senders.news.email, c.siteUrl)) b.push('FROM_NEWS_EMAIL must be on a subdomain, not the root domain');
  if (!ctx.unsubSecret) b.push('UNSUB_SECRET not set');
  return [...new Set(b)];
}

async function sendWelcome(email: string, subscriberId: string, ctx: NewsletterCtx, deps: NewsletterDeps): Promise<string> {
  if (newsletterBlockers(ctx).length > 0) return 'skipped:blocked';
  const tpl = ctx.templates.find((t) => t.id === NEWS_WELCOME_ID);
  if (!tpl) return 'skipped:template_missing';
  if (tpl.stream !== 'news' || !tpl.marketing) return 'skipped:wrong_stream';
  const hash = await templateHash(tpl);
  if (!isApproved(tpl, hash, ctx.approved)) return 'skipped:not_approved';

  const c = ctx.config;
  const emailHash = await sha256Hex(email);
  const unsubscribeUrl = `${c.workerUrl}/api/newsletter/unsubscribe?token=${await linkToken(emailHash, NEWSLETTER_LIST, ctx.unsubSecret!)}`;
  let rendered: { subject: string; text: string };
  try {
    rendered = renderTemplate(tpl, { affiliation_line: `${c.affiliation} · BRN ${c.brn}`, unsubscribe_url: unsubscribeUrl });
  } catch {
    return 'skipped:render_failed';
  }
  // Claim, then send: one welcome per address and list (the key holds the address's hash). Welcomes and replies together
  // stay within DAILY_SEND_CAP, so welcomes never use up the Resend allowance that replies and alerts need.
  const now = deps.now();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const row = { id: deps.uuid(), dedupe_key: dedupeKey.welcome(emailHash), kind: 'newsletter_welcome' as const, lead_id: null, template_id: tpl.id, template_hash: hash, created_at: now.toISOString() };
  let res;
  try {
    res = await sendOnce(deps.outbox, row, { capKinds: ['lead_reply', 'newsletter_welcome'], cap: c.dailySendCap, since: dayStart }, deps.now,
      (key) => deps.send({ stream: 'news', to: email, toName: email, subject: rendered.subject, text: rendered.text, listUnsubscribe: unsubscribeUrl }, key));
  } catch {
    return 'failed:claim';
  }
  if (res.outcome === 'skipped') return `skipped:${res.reason}`;
  if (res.outcome === 'failed') return 'failed:send';
  try {
    await deps.logMessage({ id: deps.uuid(), lead_id: subscriberId, created_at: deps.now().toISOString(), template_id: tpl.id, template_hash: hash, provider_id: res.provider_id, outcome: 'sent' });
  } catch { /* history only: the outbox row is the receipt */ }
  return 'sent';
}

export interface SubscribeResult {
  status: number;
  body: { ok: boolean; error?: string; field?: string };
  internal?: { confirm: boolean; outbound: string };
}

// The response never says whether the address was already subscribed (no list enumeration).
export async function subscribe(raw: unknown, ctx: NewsletterCtx, deps: NewsletterDeps): Promise<SubscribeResult> {
  const v = validateSubscribe(raw);
  // A filled honeypot gets the normal success answer and nothing is stored, so a bot learns nothing.
  if (!v.ok && v.field === 'company_website') return { status: 200, body: { ok: true }, internal: { confirm: false, outbound: 'skipped:honeypot' } };
  if (!v.ok) return { status: 400, body: { ok: false, error: 'invalid_input', field: v.field } };
  const { email, source } = v.input;
  const row = await deps.upsertSubscriber({ id: deps.uuid(), email, source, subscribed_at: deps.now().toISOString() });
  const outbound = row.confirm ? await sendWelcome(email, row.id, ctx, deps) : 'skipped:already_subscribed';
  return { status: 200, body: { ok: true }, internal: { confirm: row.confirm, outbound } };
}

// Optional feedback after a newsletter unsubscribe. The unsubscribe has already happened by the time this form is
// shown; nothing here can undo, delay or gate it. Skipping is a button identical to "Send", side by side.
export const UNSUBSCRIBE_REASONS = [
  ['too_frequent', 'Too frequent'],
  ['not_relevant', "Content isn't relevant to me"],
  ['did_not_subscribe', "Didn't mean to subscribe / don't recognize this"],
  ['decluttering', 'Just decluttering my inbox'],
  ['other', 'Other'],
] as const;
export type UnsubscribeReason = (typeof UNSUBSCRIBE_REASONS)[number][0];
const REASON_IDS = new Set<string>(UNSUBSCRIBE_REASONS.map(([id]) => id));
export const FEEDBACK_DETAIL_MAX = 500;

export type FeedbackInput = { kind: 'skip' } | { kind: 'answer'; reason: UnsubscribeReason; detail: string | null };

// Anything that is not a clear answer counts as a skip: no field is required, and an empty "Send" is never an error.
export function validateFeedback(form: URLSearchParams): FeedbackInput {
  if (form.get('action') === 'skip') return { kind: 'skip' };
  const raw = form.get('reason') ?? '';
  const detail = (form.get('detail') ?? '').replace(/\s+/g, ' ').trim().slice(0, FEEDBACK_DETAIL_MAX) || null;
  if (REASON_IDS.has(raw)) return { kind: 'answer', reason: raw as UnsubscribeReason, detail };
  if (detail) return { kind: 'answer', reason: 'other', detail };
  return { kind: 'skip' };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function unsubscribeFeedbackForm(token: string): string {
  const options = UNSUBSCRIBE_REASONS.map(([id, label]) => `<label style="display:block;margin:.35rem 0"><input type="radio" name="reason" value="${id}"> ${esc(label)}</label>`).join('');
  const button = 'font:inherit;padding:.5rem 1.25rem;border:1px solid #333;border-radius:4px;background:#fff;color:#111;cursor:pointer';
  return `<form method="post" action="/api/newsletter/unsubscribe/feedback" style="margin-top:2rem">`
    + `<input type="hidden" name="token" value="${esc(token)}">`
    + `<fieldset style="border:0;padding:0;margin:0"><legend style="padding:0;margin-bottom:.5rem">Optional: why did you leave? You are already unsubscribed; answering or skipping changes nothing.</legend>`
    + options
    + `<label style="display:block;margin-top:.75rem">In your own words (optional)<textarea name="detail" maxlength="${FEEDBACK_DETAIL_MAX}" rows="3" style="display:block;width:100%;font:inherit;margin-top:.25rem"></textarea></label>`
    + `</fieldset>`
    + `<p style="display:flex;gap:.75rem;margin-top:1rem"><button type="submit" name="action" value="send" style="${button}">Send</button><button type="submit" name="action" value="skip" style="${button}">Skip</button></p>`
    + `</form>`;
}
