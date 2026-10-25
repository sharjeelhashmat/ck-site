import { outboundBlockers, type Config } from './config';
import { escalationReasons } from './escalation';
import { classify, validateLead } from './firewall';
import { phonePresent, rawPhone, validE164 } from './phone';
import { assignLane, templateFor } from './lanes';
import { scoreLead } from './scoring';
import { firstName, isApproved, renderTemplate, templateHash, type Stream, type Template } from './templates';
import type { AlertLevel, FirewallStatus, Lane, Lead } from './types';
import { unsubToken } from './unsub';

export interface LeadRow {
  id: string;
  created_at: string;
  email_hash: string;
  lead: Lead;
  status: FirewallStatus;
  reasons: string[];
  escalation: string[];
  score: number;
  lane: Lane;
  alert_level: AlertLevel;
}

export interface OutboundMessage {
  stream: Stream;
  to: string;
  toName: string;
  subject: string;
  text: string;
  listUnsubscribe?: string;
}

export interface AlertPayload {
  id: string;
  lane: Lane;
  alert_level: AlertLevel;
  score: number;
  status: FirewallStatus;
  escalation: string[];
  lead: Lead;
  outbound: string;
}

export interface Deps {
  now(): Date;
  uuid(): string;
  hash(input: string): Promise<string>;
  findRecentByEmailHash(hash: string, sinceIso: string): Promise<boolean>;
  isSuppressed(hash: string): Promise<boolean>;
  countSentSince(sinceIso: string): Promise<number>;
  insertLead(row: LeadRow): Promise<void>;
  logMessage(row: { id: string; lead_id: string; created_at: string; template_id: string; template_hash: string; provider_id: string; outcome: string }): Promise<void>;
  logEvent(type: string, leadId: string | null, detail: string): Promise<void>;
  send(msg: OutboundMessage): Promise<{ provider_id: string }>;
  alertOwner(payload: AlertPayload): Promise<void>;
}

export interface PipelineCtx {
  config: Config;
  templates: Template[];
  approved: Record<string, string>;
  unsubSecret?: string;
  // The request came from STAGING_ORIGIN: store it as a quarantined TEST lead, whatever OUTBOUND or any other flag says.
  staging?: boolean;
}

export interface PipelineResult {
  status: number;
  body: { ok: boolean; id?: string; error?: string; field?: string };
  // Internal-only detail for tests and logs. Never returned to the client.
  internal?: { lane: Lane; status: FirewallStatus; score: number; outbound: string };
}

async function attemptOutbound(lead: Lead, lane: Lane, emailHash: string, leadId: string, ctx: PipelineCtx, deps: Deps): Promise<string> {
  const tplId = templateFor(lane, lead);
  if (!tplId) return 'skipped:no_template';
  if (outboundBlockers(ctx.config, 'replies').length > 0) return 'skipped:blocked';
  const tpl = ctx.templates.find((t) => t.id === tplId);
  if (!tpl) return 'skipped:template_missing';
  // Newsletter-stream copy can never go out through the lead-reply pipeline.
  if (tpl.stream !== 'leads') return 'skipped:wrong_stream';
  const hash = await templateHash(tpl);
  if (!isApproved(tpl, hash, ctx.approved)) return 'skipped:not_approved';
  if (await deps.isSuppressed(emailHash)) return 'skipped:suppressed';

  const now = deps.now();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  if ((await deps.countSentSince(dayStart)) >= ctx.config.dailySendCap) return 'skipped:daily_cap';

  const c = ctx.config;
  let unsubscribeUrl: string | undefined;
  if (tpl.marketing) {
    if (!ctx.unsubSecret) return 'skipped:blocked';
    const token = await unsubToken(lead.email, ctx.unsubSecret);
    unsubscribeUrl = `${c.workerUrl}/unsubscribe?e=${encodeURIComponent(lead.email)}&t=${token}`;
  }

  let rendered: { subject: string; text: string };
  try {
    rendered = renderTemplate(tpl, {
      first_name: firstName(lead.name),
      sla_hours: c.slaHours,
      booking_url: c.bookingUrl,
      resource_url: `${c.siteUrl}/investment-approach`,
      affiliation_line: `${c.affiliation} · BRN ${c.brn}`,
      unsubscribe_url: unsubscribeUrl,
    });
  } catch {
    return 'skipped:render_failed';
  }

  try {
    const res = await deps.send({
      stream: tpl.stream,
      to: lead.email,
      toName: lead.name,
      subject: rendered.subject,
      text: rendered.text,
      listUnsubscribe: unsubscribeUrl,
    });
    await deps.logMessage({
      id: deps.uuid(),
      lead_id: leadId,
      created_at: deps.now().toISOString(),
      template_id: tpl.id,
      template_hash: hash,
      provider_id: res.provider_id,
      outcome: 'sent',
    });
    return 'sent';
  } catch {
    return 'failed:send';
  }
}

export async function processLead(raw: unknown, ctx: PipelineCtx, deps: Deps): Promise<PipelineResult> {
  const v = validateLead(raw);
  if (!v.ok) return { status: 400, body: { ok: false, error: 'invalid_input', field: v.field } };
  const lead = v.lead;
  // Package B. A valid phone is stored as E.164. LEAD_STRICT="true": a phone is required and an invalid one is rejected.
  // LEAD_STRICT="false" (until the domain cutover): a phone that cannot be parsed is kept as typed in phone_raw, flagged
  // phone_invalid, for the owner alert only (PR 2c item 3); phone stays empty and replies never use it.
  const typed = (raw as Record<string, unknown>).phone;
  const e164 = phonePresent(typed) ? validE164(typed) : null;
  if (ctx.config.leadStrict && !e164) return { status: 400, body: { ok: false, error: 'invalid_phone' } };
  lead.phone = e164;
  lead.phone_raw = e164 ? null : phonePresent(typed) ? rawPhone(typed) : null;
  lead.phone_invalid = lead.phone_raw !== null;

  const now = deps.now();
  const emailHash = await deps.hash(lead.email);
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const duplicate = await deps.findRecentByEmailHash(emailHash, since);

  const firewall = classify(lead, { duplicate });
  const escalation = escalationReasons(lead.message);
  const { score } = scoreLead(lead, ctx.config.weights);
  const assigned = assignLane(lead, firewall.status, score, escalation.length > 0);
  // A staging enquiry is a test: lane NONE means no outbound (so nothing counts toward DAILY_SEND_CAP), alert none means no
  // owner alert, and status TEST stores it quarantined.
  const status: FirewallStatus = ctx.staging ? 'TEST' : firewall.status;
  const reasons = ctx.staging ? [...firewall.reasons, 'staging_origin'] : firewall.reasons;
  const { lane, alert_level }: { lane: Lane; alert_level: AlertLevel } = ctx.staging ? { lane: 'NONE', alert_level: 'none' } : assigned;
  const id = deps.uuid();

  // An event row is a log line: failing to write one never stops the enquiry or its alert.
  const logEvent = async (type: string, detail: string) => {
    try { await deps.logEvent(type, id, detail); } catch { /* non-fatal */ }
  };

  try {
    await deps.insertLead({ id, created_at: now.toISOString(), email_hash: emailHash, lead, status, reasons, escalation, score, lane, alert_level });
  } catch {
    // Never lose an enquiry: when it cannot be stored, the owner gets all of it by email (real enquiries only; a
    // staging TEST, SPAM or DUPLICATE is not alerted), no reply is attempted, and the visitor is asked to retry or
    // use WhatsApp. The answer is the same whatever the classification.
    if ((status === 'VALID' || status === 'SUSPICIOUS') && outboundBlockers(ctx.config, 'alerts').length === 0) {
      try {
        await deps.alertOwner({ id, lane, alert_level: 'instant', score, status, escalation, lead, outbound: 'not_stored' });
      } catch { /* nothing else can be done here */ }
    }
    await logEvent('lead_not_stored', JSON.stringify({ status, lane, score }));
    return { status: 503, body: { ok: false, error: 'temporarily_unavailable' }, internal: { lane, status, score, outbound: 'not_stored' } };
  }
  await logEvent('lead_received', JSON.stringify({ status, lane, score }));

  let outbound = 'none';
  if (lane !== 'NONE') {
    outbound = await attemptOutbound(lead, lane, emailHash, id, ctx, deps);
    await logEvent('outbound', outbound);
  }

  if (alert_level !== 'none') {
    if (outboundBlockers(ctx.config, 'alerts').length > 0) {
      await logEvent('alert_skipped', 'blocked');
    } else {
      try {
        await deps.alertOwner({ id, lane, alert_level, score, status, escalation, lead, outbound });
      } catch {
        await logEvent('alert_failed', 'owner alert could not be sent');
      }
    }
  }

  // The client always gets the same answer, so probing cannot reveal classification.
  return { status: 202, body: { ok: true, id }, internal: { lane, status, score, outbound } };
}
