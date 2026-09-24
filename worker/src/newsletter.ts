import { isSubdomainSender, outboundBlockers, type Config } from './config';
import { isDisposable } from './firewall';
import type { OutboundMessage } from './pipeline';
import { isApproved, renderTemplate, templateHash, type Template } from './templates';
import { newsletterToken } from './unsub';

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
  if (email.length > 254 || /[\r\n\s]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, field: 'email' };
  if (isDisposable(email)) return { ok: false, field: 'email' };
  const source = typeof r.source === 'string' && SOURCES.test(r.source) ? r.source : null;
  return { ok: true, input: { email, source } };
}

export interface NewsletterDeps {
  now(): Date;
  uuid(): string;
  // Inserts a new subscriber, re-activates one that had unsubscribed, or does nothing for an active one.
  // Returns the row id and whether a confirmation is due (new or re-activated).
  upsertSubscriber(row: { id: string; email: string; source: string | null; subscribed_at: string }): Promise<{ id: string; confirm: boolean }>;
  countSentSince(sinceIso: string): Promise<number>;
  logMessage(row: { id: string; lead_id: string; created_at: string; template_id: string; template_hash: string; provider_id: string; outcome: string }): Promise<void>;
  send(msg: OutboundMessage): Promise<{ provider_id: string }>;
}

export interface NewsletterCtx {
  config: Config;
  templates: Template[];
  approved: Record<string, string>;
  unsubSecret?: string;
}

// Why the confirmation would not be sent right now. Empty = send. Lead-reply go-live blockers apply too, so the
// OUTBOUND kill switch, BRN and sender checks cover the newsletter as well.
export function newsletterBlockers(ctx: NewsletterCtx): string[] {
  const c = ctx.config;
  const b = outboundBlockers(c);
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

  const now = deps.now();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  if ((await deps.countSentSince(dayStart)) >= ctx.config.dailySendCap) return 'skipped:daily_cap';

  const c = ctx.config;
  const unsubscribeUrl = `${c.workerUrl}/api/newsletter/unsubscribe?token=${await newsletterToken(email, ctx.unsubSecret!)}`;
  let rendered: { subject: string; text: string };
  try {
    rendered = renderTemplate(tpl, { affiliation_line: `${c.affiliation} · BRN ${c.brn}`, unsubscribe_url: unsubscribeUrl });
  } catch {
    return 'skipped:render_failed';
  }
  try {
    const res = await deps.send({ stream: 'news', to: email, toName: email, subject: rendered.subject, text: rendered.text, listUnsubscribe: unsubscribeUrl });
    await deps.logMessage({
      id: deps.uuid(), lead_id: subscriberId, created_at: deps.now().toISOString(),
      template_id: tpl.id, template_hash: hash, provider_id: res.provider_id, outcome: 'sent',
    });
    return 'sent';
  } catch {
    return 'failed:send';
  }
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
