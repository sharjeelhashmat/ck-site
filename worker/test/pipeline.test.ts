import { describe, expect, it } from 'vitest';
import { processLead } from '../src/pipeline';
import { sha256Hex } from '../src/hash';
import { TEMPLATE_IDS } from '../src/lanes';
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
    // The affiliation line (owner 2026-10-26): the agency, its ORN, then the broker's own BRN.
    expect(f.sent[0]!.text).toContain('\nExample Brokerage · ORN 67890 · BRN 12345\n');
    expect(f.sent[0]!.text).toContain('within 24 hours');
    expect(f.alerts[0]!.alert_level).toBe('instant');
    expect(f.rows[0]!.lead.attribution.source_type).toBe('linkedin');
  });

  it('staging origin: stored as TEST with reason staging_origin, lane NONE, no send, no alert, same client response', async () => {
    const f = makeFake();
    const r = await processLead(baseLead(), { ...(await ctx()), staging: true }, f.deps);
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ ok: true, id: 'id-1' });
    expect(r.internal).toMatchObject({ lane: 'NONE', status: 'TEST', outbound: 'none' });
    expect(f.rows[0]).toMatchObject({ status: 'TEST', lane: 'NONE', alert_level: 'none' });
    expect(f.rows[0]!.reasons).toContain('staging_origin');
    expect(f.sent).toHaveLength(0);
    expect(f.alerts).toHaveLength(0);
  });

  it('OUTBOUND_REPLIES off: lead is stored and alerted, nothing is sent', async () => {
    const f = makeFake();
    const r = await processLead(baseLead(), await ctx({ ...goodEnv, OUTBOUND_REPLIES: 'off' }), f.deps);
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

  it('suspicious lead: stored, no reply, owner sees it in the digest (H7)', async () => {
    const f = makeFake();
    const r = await processLead(baseLead({ email: 'x@mailinator.com' }), await ctx(), f.deps);
    expect(r.status).toBe(202);
    expect(r.internal).toMatchObject({ status: 'SUSPICIOUS', lane: 'NONE', outbound: 'none' });
    expect(f.sent).toHaveLength(0);
    expect(f.alerts).toHaveLength(1);
    expect(f.alerts[0]!).toMatchObject({ alert_level: 'digest', lane: 'NONE', status: 'SUSPICIOUS' });
  });

  it('duplicate that escalates: no reply, instant alert (H7)', async () => {
    const f = makeFake();
    f.state.duplicate = true;
    await processLead(baseLead({ message: 'I want to file a complaint, this is urgent.' }), await ctx(), f.deps);
    expect(f.sent).toHaveLength(0);
    expect(f.alerts.map((a) => [a.status, a.alert_level])).toEqual([['DUPLICATE', 'instant']]);
  });

  describe('never lose an enquiry (B2)', () => {
    const failingInsert = () => {
      const f = makeFake();
      f.deps.insertLead = async () => { throw new Error('D1 down'); };
      return f;
    };

    for (const [label, over, status] of [['VALID', {}, 'VALID'], ['SUSPICIOUS', { email: 'x@mailinator.com' }, 'SUSPICIOUS']] as const) {
      it(`insert fails (${label}): the owner gets the full lead marked not_stored, no reply, 503 temporarily_unavailable`, async () => {
        const f = failingInsert();
        const r = await processLead(baseLead(over), await ctx(), f.deps);
        expect(r.status).toBe(503);
        expect(r.body).toEqual({ ok: false, error: 'temporarily_unavailable' });
        expect(f.sent).toHaveLength(0);
        expect(f.alerts).toHaveLength(1);
        expect(f.alerts[0]!).toMatchObject({ status, outbound: 'not_stored', alert_level: 'instant' });
        expect(f.alerts[0]!.lead).toMatchObject({ name: baseLead().name, email: (over as { email?: string }).email ?? baseLead().email, message: baseLead().message });
      });
    }

    it('insert fails for SPAM, DUPLICATE or a staging TEST: no alert, the same 503', async () => {
      for (const [over, setup, staging] of [[{ company_website: 'bot.example' }, () => {}, false], [{}, (f: ReturnType<typeof makeFake>) => { f.state.duplicate = true; }, false], [{}, () => {}, true]] as const) {
        const f = failingInsert();
        setup(f);
        const r = await processLead(baseLead(over), { ...(await ctx()), staging }, f.deps);
        expect([r.status, r.body, f.alerts.length, f.sent.length]).toEqual([503, { ok: false, error: 'temporarily_unavailable' }, 0, 0]);
      }
    });

    it('insert and alert both fail: still a clean 503, never a throw', async () => {
      const f = failingInsert();
      f.deps.alertOwner = async () => { throw new Error('mail down'); };
      const r = await processLead(baseLead(), await ctx(), f.deps);
      expect(r.status).toBe(503);
    });

    it('logEvent failing is non-fatal: the lead is stored, the reply goes, the alert is not skipped, 202', async () => {
      const f = makeFake();
      f.deps.logEvent = async () => { throw new Error('events table locked'); };
      const r = await processLead(baseLead(), await ctx(), f.deps);
      expect(r.status).toBe(202);
      expect(f.rows).toHaveLength(1);
      expect(f.sent).toHaveLength(1);
      expect(f.alerts).toHaveLength(1);
    });

    it('logEvent failing after an alert failure does not throw either', async () => {
      const f = makeFake();
      f.deps.logEvent = async () => { throw new Error('events table locked'); };
      f.deps.alertOwner = async () => { throw new Error('mail down'); };
      expect((await processLead(baseLead(), await ctx(), f.deps)).status).toBe(202);
    });
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
    f.outbox.extraToday = 80;
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
    expect(f2.sent[0]!.text).toMatch(/https:\/\/api\.sharjeelhashmat\.com\/unsubscribe\?t=v2\.leads\.[0-9a-f]{64}\.[0-9a-f]{64}/);
    expect(f2.sent[0]!.text).not.toContain('amira@example.com');
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
    // Lane templates only: the file also holds the newsletter welcome, which is on the news stream by design.
    const lane = TEMPLATES.filter((t) => (TEMPLATE_IDS as readonly string[]).includes(t.id));
    expect(lane).toHaveLength(TEMPLATE_IDS.length);
    expect(lane.every((t) => t.stream === 'leads')).toBe(true);
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

describe('pipeline: phone (Package B)', () => {
  it('non-strict: valid formatted phone stored as E.164; absent or empty phone keeps the old path', async () => {
    for (const [phone, want] of [['+971 50 123 4567', '+971501234567'], ['00971501234567', '+971501234567'], [undefined, null], ['', null], ['  ', null]] as const) {
      const f = makeFake();
      const r = await processLead({ ...baseLead(), phone }, await ctx(), f.deps);
      expect(r.status, String(phone)).toBe(202);
      expect(f.rows[0]!.lead.phone).toBe(want);
    }
  });

  it('non-strict: a phone that cannot be parsed is stored as empty and the lead still succeeds (today\'s behaviour)', async () => {
    for (const phone of ['12345', '0501234567', '+971 12', '+1 555 0100', 'call me', 12345]) {
      const f = makeFake();
      const r = await processLead({ ...baseLead(), phone }, await ctx(), f.deps);
      expect(r.status, String(phone)).toBe(202);
      expect(f.rows).toHaveLength(1);
      expect(f.rows[0]!.lead.phone, String(phone)).toBeNull();
    }
  });

  it('strict: phone is required and must be valid', async () => {
    const strict = await ctx({ ...goodEnv, LEAD_STRICT: 'true' });
    for (const phone of [undefined, '', '12345', '0501234567', 'call me']) {
      const f = makeFake();
      expect((await processLead({ ...baseLead(), phone }, strict, f.deps)).body, String(phone)).toEqual({ ok: false, error: 'invalid_phone' });
      expect(f.rows).toHaveLength(0);
    }
    const f = makeFake();
    expect((await processLead({ ...baseLead(), phone: '+971501234567' }, strict, f.deps)).status).toBe(202);
  });

  it('other validation errors still come first, unchanged', async () => {
    const f = makeFake();
    const r = await processLead({ ...baseLead(), email: 'nope', phone: '12345' }, await ctx(), f.deps);
    expect(r.body).toEqual({ ok: false, error: 'invalid_input', field: 'email' });
  });
});
