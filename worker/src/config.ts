import { parseWeights, type ScoringWeights } from './scoring';
import type { EmailProvider } from './send';

export interface Sender {
  email: string;
  name: string;
}

export type Channel = 'replies' | 'newsletter' | 'alerts';

export interface Config {
  // One switch per channel (PR 2c item 5, gap G07). "on" opens a channel; the go-live checks below still apply.
  outboundReplies: boolean;
  outboundNewsletter: boolean;
  outboundAlerts: boolean;
  // The old single OUTBOUND was read because a channel switch is unset (one release only; the Worker logs it).
  deprecatedOutbound: boolean;
  // BRN = the broker's own Broker Registration Number (RERA broker card); AGENCY_ORN = the agency's Office Registration
  // Number. Both appear in the email affiliation line (affiliationLine).
  brn: string;
  agencyOrn: string;
  affiliation: string;
  bookingUrl: string;
  siteUrl: string;
  extraOrigins: string[];
  // The staging site. Admitted on /lead (and /health) only; its enquiries are stored quarantined as TEST. "" = off.
  stagingOrigin: string;
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
  leadStrict: boolean;
}

export function readConfig(env: Record<string, string | undefined>): Config {
  const cap = Number.parseInt(env.DAILY_SEND_CAP ?? '', 10);
  const rawProvider = (env.EMAIL_PROVIDER ?? 'brevo').trim().toLowerCase();
  const emailProvider: EmailProvider = rawProvider === 'resend' ? 'resend' : 'brevo';
  const on = (v: string) => v.trim().toLowerCase() === 'on';
  // Fallback for one release: a reply or newsletter switch that is unset follows the old OUTBOUND, when that is set.
  // Owner alerts were never gated by OUTBOUND, so an unset OUTBOUND_ALERTS stays "on".
  const legacy = env.OUTBOUND;
  const channel = (v: string | undefined) => (v !== undefined ? on(v) : legacy !== undefined ? on(legacy) : false);
  return {
    outboundReplies: channel(env.OUTBOUND_REPLIES),
    outboundNewsletter: channel(env.OUTBOUND_NEWSLETTER),
    outboundAlerts: env.OUTBOUND_ALERTS !== undefined ? on(env.OUTBOUND_ALERTS) : true,
    deprecatedOutbound: legacy !== undefined && (env.OUTBOUND_REPLIES === undefined || env.OUTBOUND_NEWSLETTER === undefined),
    brn: (env.BRN ?? '').trim(),
    agencyOrn: (env.AGENCY_ORN ?? '').trim(),
    affiliation: (env.AFFILIATION ?? '').trim(),
    bookingUrl: (env.BOOKING_URL ?? '').trim(),
    siteUrl: (env.SITE_URL ?? '').trim().replace(/\/$/, ''),
    extraOrigins: parseExtraOrigins(env.EXTRA_ORIGINS),
    stagingOrigin: parseExtraOrigins(env.STAGING_ORIGIN)[0] ?? '',
    workerUrl: (env.WORKER_URL ?? '').trim().replace(/\/$/, ''),
    slaHours: (env.SLA_HOURS ?? '24').trim(),
    senders: {
      leads: { email: (env.FROM_LEADS_EMAIL ?? '').trim().toLowerCase(), name: (env.FROM_LEADS_NAME ?? 'Sharjeel Hashmat').trim() },
      alerts: { email: (env.FROM_ALERTS_EMAIL ?? '').trim().toLowerCase(), name: (env.FROM_ALERTS_NAME ?? 'Lead desk').trim() },
      news: { email: (env.FROM_NEWS_EMAIL ?? '').trim().toLowerCase(), name: (env.FROM_NEWS_NAME ?? 'The Compass Key Monthly').trim() },
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
    // Package B: when "true", a lead must carry a valid phone. Stays "false" until the domain cutover.
    leadStrict: (env.LEAD_STRICT ?? 'false').trim().toLowerCase() === 'true',
  };
}

// The {{affiliation_line}} slot in replies and the newsletter welcome: "<agency> · ORN <agency ORN> · BRN <broker BRN>".
// Only rendered once outboundBlockers is empty, so all three values are set.
export function affiliationLine(c: Config): string {
  return `${c.affiliation} · ORN ${c.agencyOrn} · BRN ${c.brn}`;
}

// Extra browser origins allowed to POST to the Worker (e.g. the staging site before cutover).
// Comma-separated; each entry must be a bare https origin (no path, no wildcard). Anything else is ignored.
export function parseExtraOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s));
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

// Why a channel would not send right now. Empty = it may send. Replies and the newsletter stay off until every go-live
// item here is satisfied (BRN and AGENCY_ORN are the pending items); owner alerts need only their switch, their sender,
// the alert address and the email key.
export function outboundBlockers(c: Config, channel: Channel): string[] {
  const b: string[] = [];
  if (channel === 'alerts') {
    if (!c.outboundAlerts) b.push('OUTBOUND_ALERTS is off');
    if (!c.alertEmail) b.push('ALERT_EMAIL not set');
    if (!c.senders.alerts.email) b.push('FROM_ALERTS_EMAIL not set');
    if (!c.hasEmailKey) b.push(c.emailProvider === 'resend' ? 'RESEND_API_KEY not set' : 'BREVO_API_KEY not set');
    return b;
  }
  if (channel === 'replies' && !c.outboundReplies) b.push('OUTBOUND_REPLIES is off');
  if (channel === 'newsletter' && !c.outboundNewsletter) b.push('OUTBOUND_NEWSLETTER is off');
  if (!c.brn) b.push('BRN not set');
  else if (!/^[A-Za-z0-9-]{3,20}$/.test(c.brn)) b.push('BRN format invalid');
  if (!c.agencyOrn) b.push('AGENCY_ORN not set');
  else if (!/^[A-Za-z0-9-]{3,20}$/.test(c.agencyOrn)) b.push('AGENCY_ORN format invalid');
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
