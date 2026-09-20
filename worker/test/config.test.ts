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
  it('provider defaults to brevo (backward compatible) and needs its own key', () => {
    const { BREVO_API_KEY: _drop, ...noKey } = goodEnv;
    expect(outboundBlockers(readConfig(noKey))).toEqual(['BREVO_API_KEY not set']);
  });
  it('resend provider uses RESEND_API_KEY, not the Brevo key', () => {
    const { BREVO_API_KEY: _drop, ...noBrevo } = goodEnv;
    expect(outboundBlockers(readConfig({ ...noBrevo, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' }))).toEqual([]);
    expect(outboundBlockers(readConfig({ ...goodEnv, EMAIL_PROVIDER: 'resend' }))).toEqual(['RESEND_API_KEY not set']);
    expect(readConfig({ ...goodEnv, EMAIL_PROVIDER: ' Resend ' }).emailProvider).toBe('resend');
  });
  it('an unknown provider value blocks outbound', () => {
    expect(outboundBlockers(readConfig({ ...goodEnv, EMAIL_PROVIDER: 'mailgun' }))).toContain('EMAIL_PROVIDER must be resend or brevo');
  });
});
