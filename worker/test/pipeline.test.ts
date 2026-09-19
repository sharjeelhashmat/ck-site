import { describe, expect, it } from 'vitest';
import { processLead } from '../src/pipeline';
import { sha256Hex } from '../src/hash';
import { templateHash } from '../src/templates';
import { approveAll, baseLead, ctx, goodEnv, makeFake, TEMPLATES } from './helpers';

describe('pipeline', () => {
  it('returns 400 on invalid input and stores nothing', async () => {
    const f = makeFake();
    const r = await processLead({ name: 'x' }, await ctx(), f.deps);
    expect(r.status).toBe(400);
    expect(f.rows).toHaveLength(0);
  });

  it('priority lead: stores, sends the approved acknowledgment once, alerts instantly', async () => {
    const f = makeFake();
    const r = await processLead(baseLead(), await ctx(), f.deps);
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ ok: true, id: 'id-1' });
    expect(r.internal).toMatchObject({ lane: 'PRIORITY', outbound: 'sent' });
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]!.text).toContain('BRN 12345');
    expect(f.sent[0]!.text).toContain('within 24 hours');
    expect(f.alerts[0]!.alert_level).toBe('instant');
    expect(f.rows[0]!.lead.attribution.source_type).toBe('linkedin');
  });

  it('OUTBOUND off: lead is stored and alerted, nothing is sent', async () => {
    const f = makeFake();
    const r = await processLead(baseLead(), await ctx({ ...goodEnv, OUTBOUND: 'off' }), f.deps);
    expect(r.internal?.outbound).toBe('skipped:blocked');
    expect(f.sent).toHaveLength(0);
    expect(f.rows).toHaveLength(1);
    expect(f.alerts).toHaveLength(1);
  });

  it('BRN pending: nothing is sent even with outbound on and templates approved', async () => {
    const f = makeFake();
    const r = await processLead(baseLead(), await ctx({ ...goodEnv, BRN: '' }), f.deps);
    expect(r.internal?.outbound).toBe('skipped:blocked');
    expect(f.sent).toHaveLength(0);
  });

  it('unapproved template: nothing is sent', async () => {
    const f = makeFake();
    const r = await processLead(baseLead(), await ctx(goodEnv, {}), f.deps);
    expect(r.internal?.outbound).toBe('skipped:not_approved');
    expect(f.sent).toHaveLength(0);
  });

  it('a template edited after approval is not sent', async () => {
    const f = makeFake();
    const approved = await approveAll();
    approved['ACK-PRIORITY'] = 'deadbeef';
    const r = await processLead(baseLead(), await ctx(goodEnv, approved), f.deps);
    expect(r.internal?.outbound).toBe('skipped:not_approved');
  });

  it('honeypot: stored as SPAM, no reply, no alert, same client response', async () => {
    const f = makeFake();
    const r = await processLead(baseLead({ company_website: 'spam.com' }), await ctx(), f.deps);
    expect(r.status).toBe(202);
    expect(r.body.ok).toBe(true);
    expect(r.internal).toMatchObject({ status: 'SPAM', lane: 'NONE', outbound: 'none' });
    expect(f.sent).toHaveLength(0);
    expect(f.alerts).toHaveLength(0);
    expect(f.rows).toHaveLength(1);
  });

  it('duplicate within 24h: no second acknowledgment', async () => {
    const f = makeFake();
    f.state.duplicate = true;
    const r = await processLead(baseLead(), await ctx(), f.deps);
    expect(r.internal).toMatchObject({ status: 'DUPLICATE', lane: 'NONE' });
    expect(f.sent).toHaveLength(0);
  });

  it('escalation: neutral template plus instant alert', async () => {
    const f = makeFake();
    const r = await processLead(baseLead({ message: 'Can you guarantee the return? I want to negotiate.' }), await ctx(), f.deps);
    expect(r.internal?.lane).toBe('ESCALATED');
    expect(f.sent[0]!.text).toContain('needs me personally');
    expect(f.alerts[0]!.escalation).toEqual(expect.arrayContaining(['guarantee', 'negotiation']));
  });

  it('suppressed email: no reply', async () => {
    const f = makeFake();
    f.suppressed.add(await sha256Hex('amira@example.com'));
    const r = await processLead(baseLead(), await ctx(), f.deps);
    expect(r.internal?.outbound).toBe('skipped:suppressed');
  });

  it('daily send cap stops replies', async () => {
    const f = makeFake();
    f.state.sentToday = 80;
    const r = await processLead(baseLead(), await ctx(), f.deps);
    expect(r.internal?.outbound).toBe('skipped:daily_cap');
  });

  it('nurture lane without opt-in gets the cold template, with opt-in gets the unsubscribe link', async () => {
    const mid = { intent: 'buy', budget_band: '1m_2m', timeline: '3m', funding: 'mortgage', utm_source: '', phone: '' };
    const f1 = makeFake();
    const r1 = await processLead(baseLead({ ...mid, consent_nurture: false }), await ctx(), f1.deps);
    expect(r1.internal?.lane).toBe('NURTURE');
    expect(f1.sent[0]!.text).not.toContain('unsubscribe');

    const f2 = makeFake();
    await processLead(baseLead({ ...mid, consent_nurture: true }), await ctx(), f2.deps);
    expect(f2.sent[0]!.text).toContain('https://api.sharjeelhashmat.com/unsubscribe?e=');
    expect(f2.sent[0]!.listUnsubscribe).toContain('/unsubscribe');
  });

  it('seller reply never states a valuation', async () => {
    const f = makeFake();
    await processLead(baseLead({ intent: 'sell' }), await ctx(), f.deps);
    expect(f.sent[0]!.text).toContain('will not name a number');
    expect(f.sent[0]!.text).not.toMatch(/AED|\$/);
  });

  it('send failure is contained: lead stored, alert still sent, client gets 202', async () => {
    const f = makeFake();
    f.deps.send = async () => { throw new Error('boom'); };
    const r = await processLead(baseLead(), await ctx(), f.deps);
    expect(r.status).toBe(202);
    expect(r.internal?.outbound).toBe('failed:send');
    expect(f.alerts).toHaveLength(1);
  });

  it('alert failure is contained', async () => {
    const f = makeFake();
    f.deps.alertOwner = async () => { throw new Error('boom'); };
    const r = await processLead(baseLead(), await ctx(), f.deps);
    expect(r.status).toBe(202);
    expect(f.events).toContain('alert_failed:owner alert could not be sent');
  });

  it('every lane template is on the leads stream and the message says so', async () => {
    expect(TEMPLATES.every((t) => t.stream === 'leads')).toBe(true);
    const f = makeFake();
    await processLead(baseLead(), await ctx(), f.deps);
    expect(f.sent[0]!.stream).toBe('leads');
  });

  it('a news-stream template can never be sent through the lead pipeline, even if approved', async () => {
    const f = makeFake();
    const tpls = TEMPLATES.map((t) => (t.id === 'ACK-PRIORITY' ? { ...t, stream: 'news' as const } : t));
    const approved: Record<string, string> = {};
    for (const t of tpls) approved[t.id] = await templateHash(t);
    const c = await ctx(goodEnv, approved);
    const r = await processLead(baseLead(), { ...c, templates: tpls }, f.deps);
    expect(r.internal?.outbound).toBe('skipped:wrong_stream');
    expect(f.sent).toHaveLength(0);
  });

  it('mailbox not confirmed: nothing is sent', async () => {
    const f = makeFake();
    const r = await processLead(baseLead(), await ctx({ ...goodEnv, MAILBOX_CONFIRMED: 'no' }), f.deps);
    expect(r.internal?.outbound).toBe('skipped:blocked');
  });
});
