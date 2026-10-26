// PR 2c item 5 (gap G07): one switch per channel instead of the single OUTBOUND. OUTBOUND_REPLIES and OUTBOUND_NEWSLETTER
// are "off" in wrangler.toml, OUTBOUND_ALERTS "on" (owner alerts were never gated by OUTBOUND). The go-live checks (BRN,
// AGENCY_ORN, affiliation, booking, senders) apply to replies and the newsletter, not to owner alerts. The old OUTBOUND is read for
// one release, only for a channel whose own switch is unset, and the Worker then logs a deprecation line.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outboundBlockers, readConfig } from '../src/config';
import { newsletterBlockers } from '../src/newsletter';
import { processLead } from '../src/pipeline';
import { baseLead, ctx, goodEnv, makeFake, TEMPLATES, approveAll } from './helpers';

// goodEnv with no switch at all.
const { OUTBOUND_REPLIES: _r, OUTBOUND_NEWSLETTER: _n, OUTBOUND_ALERTS: _a, ...noOld } = goodEnv;
const channels = (r: string, n: string, a: string) => ({ ...noOld, OUTBOUND_REPLIES: r, OUTBOUND_NEWSLETTER: n, OUTBOUND_ALERTS: a });

describe('switches: config', () => {
  it('each channel reads its own switch', () => {
    const c = readConfig(channels('on', 'off', 'off'));
    expect([c.outboundReplies, c.outboundNewsletter, c.outboundAlerts, c.deprecatedOutbound]).toEqual([true, false, false, false]);
    const d = readConfig(channels('off', 'on', 'on'));
    expect([d.outboundReplies, d.outboundNewsletter, d.outboundAlerts]).toEqual([false, true, true]);
  });

  it('defaults with nothing set: replies off, newsletter off, alerts on (today\'s behaviour)', () => {
    const c = readConfig({});
    expect([c.outboundReplies, c.outboundNewsletter, c.outboundAlerts, c.deprecatedOutbound]).toEqual([false, false, true, false]);
  });

  it('the old OUTBOUND is a fallback only for an unset channel switch, and flags the deprecation', () => {
    const c = readConfig({ ...noOld, OUTBOUND: 'on' });
    expect([c.outboundReplies, c.outboundNewsletter, c.outboundAlerts, c.deprecatedOutbound]).toEqual([true, true, true, true]);
    const set = readConfig({ ...noOld, OUTBOUND: 'on', OUTBOUND_REPLIES: 'off', OUTBOUND_NEWSLETTER: 'off' });
    expect([set.outboundReplies, set.outboundNewsletter, set.deprecatedOutbound]).toEqual([false, false, false]);
    const half = readConfig({ ...noOld, OUTBOUND: 'on', OUTBOUND_REPLIES: 'off' });
    expect([half.outboundReplies, half.outboundNewsletter, half.deprecatedOutbound]).toEqual([false, true, true]);
    // OUTBOUND never governed owner alerts: it is not read for them.
    expect(readConfig({ ...noOld, OUTBOUND: 'off' }).outboundAlerts).toBe(true);
  });
});

describe('switches: blockers per channel', () => {
  it('replies: only the replies switch and the go-live checks', () => {
    expect(outboundBlockers(readConfig(channels('on', 'off', 'off')), 'replies')).toEqual([]);
    expect(outboundBlockers(readConfig(channels('off', 'on', 'on')), 'replies')).toEqual(['OUTBOUND_REPLIES is off']);
    expect(outboundBlockers(readConfig({ ...channels('on', 'on', 'on'), BRN: '' }), 'replies')).toEqual(['BRN not set']);
    expect(outboundBlockers(readConfig({ ...channels('on', 'on', 'on'), AGENCY_ORN: '' }), 'replies')).toEqual(['AGENCY_ORN not set']);
  });

  it('newsletter: only the newsletter switch and the go-live checks', () => {
    const news = { FROM_NEWS_EMAIL: 'brief@news.sharjeelhashmat.com' };
    const nctx = (env: Record<string, string>) => ({ config: readConfig({ ...env, ...news }), templates: TEMPLATES, approved: {}, unsubSecret: 's' });
    expect(newsletterBlockers(nctx(channels('off', 'on', 'off')))).toEqual([]);
    expect(newsletterBlockers(nctx(channels('on', 'off', 'on')))).toEqual(['OUTBOUND_NEWSLETTER is off']);
    expect(newsletterBlockers(nctx({ ...channels('off', 'on', 'off'), AFFILIATION: '' }))).toEqual(['AFFILIATION not set']);
  });

  it('alerts: the alerts switch and what an alert needs to send; no BRN, ORN, affiliation or booking check', () => {
    expect(outboundBlockers(readConfig(channels('off', 'off', 'on')), 'alerts')).toEqual([]);
    expect(outboundBlockers(readConfig({ ...channels('off', 'off', 'on'), BRN: '', AGENCY_ORN: '', AFFILIATION: '', BOOKING_URL: '' }), 'alerts')).toEqual([]);
    expect(outboundBlockers(readConfig(channels('on', 'on', 'off')), 'alerts')).toEqual(['OUTBOUND_ALERTS is off']);
    expect(outboundBlockers(readConfig({ ...channels('off', 'off', 'on'), ALERT_EMAIL: '' }), 'alerts')).toEqual(['ALERT_EMAIL not set']);
  });
});

describe('switches: the lead pipeline', () => {
  const run = async (env: Record<string, string>, staging = false) => {
    const f = makeFake();
    const r = await processLead(baseLead(), { ...(await ctx(env, await approveAll())), staging }, f.deps);
    return { f, r };
  };

  it('replies on, alerts off: the reply goes, no owner alert', async () => {
    const { f, r } = await run(channels('on', 'off', 'off'));
    expect(r.internal?.outbound).toBe('sent');
    expect(f.sent).toHaveLength(1);
    expect(f.alerts).toHaveLength(0);
    expect(f.events).toContain('alert_skipped:blocked');
  });

  it('replies off, alerts on: no reply, the owner is alerted', async () => {
    const { f, r } = await run(channels('off', 'on', 'on'));
    expect(r.internal?.outbound).toBe('skipped:blocked');
    expect(f.sent).toHaveLength(0);
    expect(f.alerts).toHaveLength(1);
  });

  it('the newsletter switch does not open replies', async () => {
    const { f } = await run(channels('off', 'on', 'off'));
    expect(f.sent).toHaveLength(0);
    expect(f.alerts).toHaveLength(0);
  });

  it('staging quarantine is unchanged: every switch on, a staging lead gets no reply and no alert', async () => {
    const { f, r } = await run(channels('on', 'on', 'on'), true);
    expect(r.internal).toMatchObject({ status: 'TEST', outbound: 'none' });
    expect(f.sent).toHaveLength(0);
    expect(f.alerts).toHaveLength(0);
  });
});

describe('switches: wrangler.toml', () => {
  const toml = readFileSync(join(import.meta.dirname, '..', 'wrangler.toml'), 'utf8');
  it('replies and newsletter off, alerts on, and the single OUTBOUND is gone', () => {
    expect(toml).toMatch(/^OUTBOUND_REPLIES = "off"/m);
    expect(toml).toMatch(/^OUTBOUND_NEWSLETTER = "off"/m);
    expect(toml).toMatch(/^OUTBOUND_ALERTS = "on"/m);
    expect(toml).not.toMatch(/^OUTBOUND = /m);
  });
});
