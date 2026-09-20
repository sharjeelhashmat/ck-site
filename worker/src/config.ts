import { parseWeights, type ScoringWeights } from './scoring';
import type { EmailProvider } from './send';

export interface Sender {
  email: string;
  name: string;
}

export interface Config {
  outbound: boolean;
  brn: string;
  affiliation: string;
  bookingUrl: string;
  siteUrl: string;
  workerUrl: string;
  slaHours: string;
  senders: { leads: Sender; alerts: Sender; news: Sender };
  replyTo: string;
  mailboxConfirmed: boolean;
  alertEmail: string;
  dailySendCap: number;
  emailProvider: EmailProvider;
  emailProviderValid: boolean;
  hasEmailKey: boolean;
  hasUnsubSecret: boolean;
  weights: ScoringWeights;
}

export function readConfig(env: Record<string, string | undefined>): Config {
  const cap = Number.parseInt(env.DAILY_SEND_CAP ?? '', 10);
  const rawProvider = (env.EMAIL_PROVIDER ?? 'brevo').trim().toLowerCase();
  const emailProvider: EmailProvider = rawProvider === 'resend' ? 'resend' : 'brevo';
  return {
    outbound: (env.OUTBOUND ?? 'off').toLowerCase() === 'on',
    brn: (env.BRN ?? '').trim(),
    affiliation: (env.AFFILIATION ?? '').trim(),
    bookingUrl: (env.BOOKING_URL ?? '').trim(),
    siteUrl: (env.SITE_URL ?? '').trim().replace(/\/$/, ''),
    workerUrl: (env.WORKER_URL ?? '').trim().replace(/\/$/, ''),
    slaHours: (env.SLA_HOURS ?? '24').trim(),
    senders: {
      leads: { email: (env.FROM_LEADS_EMAIL ?? '').trim().toLowerCase(), name: (env.FROM_LEADS_NAME ?? 'Sharjeel Hashmat').trim() },
      alerts: { email: (env.FROM_ALERTS_EMAIL ?? '').trim().toLowerCase(), name: (env.FROM_ALERTS_NAME ?? 'Lead desk').trim() },
      news: { email: (env.FROM_NEWS_EMAIL ?? '').trim().toLowerCase(), name: (env.FROM_NEWS_NAME ?? "The Investor's Brief").trim() },
    },
    replyTo: (env.REPLY_TO ?? '').trim().toLowerCase(),
    mailboxConfirmed: (env.MAILBOX_CONFIRMED ?? 'no').toLowerCase() === 'yes',
    alertEmail: (env.ALERT_EMAIL ?? '').trim(),
    dailySendCap: Number.isFinite(cap) && cap > 0 ? cap : 80,
    emailProvider,
    emailProviderValid: rawProvider === 'resend' || rawProvider === 'brevo',
    hasEmailKey: emailProvider === 'resend' ? Boolean(env.RESEND_API_KEY) : Boolean(env.BREVO_API_KEY),
    hasUnsubSecret: Boolean(env.UNSUB_SECRET),
    weights: parseWeights(env.SCORING_JSON),
  };
}

function rootHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Automated mail must come from a subdomain, never the root domain (root = human mail only).
export function isSubdomainSender(email: string, siteUrl: string): boolean {
  const root = rootHost(siteUrl);
  const host = email.split('@')[1] ?? '';
  return Boolean(root) && host.endsWith(`.${root}`);
}

// Outbound to leads stays OFF until every item here is satisfied. BRN is the pending item.
export function outboundBlockers(c: Config): string[] {
  const b: string[] = [];
  if (!c.outbound) b.push('OUTBOUND is off');
  if (!c.brn) b.push('BRN not set');
  else if (!/^[A-Za-z0-9-]{3,20}$/.test(c.brn)) b.push('BRN format invalid');
  if (!c.affiliation) b.push('AFFILIATION not set');
  if (!/^https:\/\//.test(c.bookingUrl)) b.push('BOOKING_URL must be https');
  if (!/^https:\/\//.test(c.siteUrl)) b.push('SITE_URL must be https');
  if (!/^https:\/\//.test(c.workerUrl)) b.push('WORKER_URL must be https');
  if (!c.senders.leads.email) b.push('FROM_LEADS_EMAIL not set');
  else if (!isSubdomainSender(c.senders.leads.email, c.siteUrl)) b.push('FROM_LEADS_EMAIL must be on a subdomain, not the root domain');
  if (!c.senders.alerts.email) b.push('FROM_ALERTS_EMAIL not set');
  else if (!isSubdomainSender(c.senders.alerts.email, c.siteUrl)) b.push('FROM_ALERTS_EMAIL must be on a subdomain, not the root domain');
  if (c.senders.news.email && !isSubdomainSender(c.senders.news.email, c.siteUrl)) b.push('FROM_NEWS_EMAIL must be on a subdomain, not the root domain');
  if (!c.replyTo) b.push('REPLY_TO not set');
  if (!c.mailboxConfirmed) b.push('MAILBOX_CONFIRMED is not yes (Reply-To mailbox must exist first)');
  if (!c.alertEmail) b.push('ALERT_EMAIL not set');
  if (!c.emailProviderValid) b.push('EMAIL_PROVIDER must be resend or brevo');
  if (!c.hasEmailKey) b.push(c.emailProvider === 'resend' ? 'RESEND_API_KEY not set' : 'BREVO_API_KEY not set');
  if (!c.hasUnsubSecret) b.push('UNSUB_SECRET not set');
  return b;
}
