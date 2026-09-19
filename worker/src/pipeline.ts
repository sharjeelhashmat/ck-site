import { outboundBlockers, type Config } from './config';
import { escalationReasons } from './escalation';
import { classify, validateLead } from './firewall';
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
  if (outboundBlockers(ctx.config).length > 0) return 'skipped:blocked';
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

  const now = deps.now();
  const emailHash = await deps.hash(lead.email);
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const duplicate = await deps.findRecentByEmailHash(emailHash, since);

  const { status, reasons } = classify(lead, { duplicate });
  const escalation = escalationReasons(lead.message);
  const { score } = scoreLead(lead, ctx.config.weights);
  const { lane, alert_level } = assignLane(lead, status, score, escalation.length > 0);
  const id = deps.uuid();

  await deps.insertLead({ id, created_at: now.toISOString(), email_hash: emailHash, lead, status, reasons, escalation, score, lane, alert_level });
  await deps.logEvent('lead_received', id, JSON.stringify({ status, lane, score }));

  let outbound = 'none';
  if (lane !== 'NONE') {
    outbound = await attemptOutbound(lead, lane, emailHash, id, ctx, deps);
    await deps.logEvent('outbound', id, outbound);
  }

  if (alert_level !== 'none') {
    try {
      await deps.alertOwner({ id, lane, alert_level, score, status, escalation, lead, outbound });
    } catch {
      await deps.logEvent('alert_failed', id, 'owner alert could not be sent');
    }
  }

  // The client always gets the same answer, so probing cannot reveal classification.
  return { status: 202, body: { ok: true, id }, internal: { lane, status, score, outbound } };
}
