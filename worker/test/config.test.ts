import { describe, expect, it } from 'vitest';
import { outboundBlockers, readConfig } from '../src/config';
import { goodEnv } from './helpers';

describe('outbound gate', () => {
  it('is open only when everything is set', () => expect(outboundBlockers(readConfig(goodEnv))).toEqual([]));
  it('defaults to off', () => expect(outboundBlockers(readConfig({}))).toContain('OUTBOUND is off'));
  it('BRN pending keeps outbound blocked', () => {
    const b = outboundBlockers(readConfig({ ...goodEnv, BRN: '' }));
    expect(b).toEqual(['BRN not set']);
  });
  it('rejects non-https URLs', () => expect(outboundBlockers(readConfig({ ...goodEnv, BOOKING_URL: 'http://x.com' }))).toContain('BOOKING_URL must be https'));
  it('blocks when the Reply-To mailbox is not confirmed', () => {
    expect(outboundBlockers(readConfig({ ...goodEnv, MAILBOX_CONFIRMED: 'no' }))).toEqual(['MAILBOX_CONFIRMED is not yes (Reply-To mailbox must exist first)']);
  });
  it('blocks when REPLY_TO is missing', () => {
    expect(outboundBlockers(readConfig({ ...goodEnv, REPLY_TO: '' }))).toContain('REPLY_TO not set');
  });
  it('automated senders must be on a subdomain, never the root domain', () => {
    expect(outboundBlockers(readConfig({ ...goodEnv, FROM_LEADS_EMAIL: 'hello@sharjeelhashmat.com' }))).toContain('FROM_LEADS_EMAIL must be on a subdomain, not the root domain');
    expect(outboundBlockers(readConfig({ ...goodEnv, FROM_ALERTS_EMAIL: 'alerts@www.sharjeelhashmat.com' }))).toEqual([]);
    expect(outboundBlockers(readConfig({ ...goodEnv, FROM_LEADS_EMAIL: 'hello@evil-sharjeelhashmat.com' }))).toContain('FROM_LEADS_EMAIL must be on a subdomain, not the root domain');
    expect(outboundBlockers(readConfig({ ...goodEnv, FROM_NEWS_EMAIL: 'brief@sharjeelhashmat.com' }))).toContain('FROM_NEWS_EMAIL must be on a subdomain, not the root domain');
  });
  it('the reserved news sender is optional and default names are set', () => {
    const c = readConfig(goodEnv);
    expect(outboundBlockers(c)).toEqual([]);
    expect(c.senders.alerts.name).toBe('Lead desk');
    expect(c.senders.news.name).toBe("The Investor's Brief");
  });
});
