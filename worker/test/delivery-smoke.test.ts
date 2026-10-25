// PR 2c item 7b (gap G11): scripts/delivery-smoke.ts, run by the owner only. It starts this Worker LOCALLY (wrangler dev
// --local, a throwaway local D1 and KV), so production D1 is never touched, and sends one lead reply to Resend's
// delivered@ test inbox, one to bounced@ and one newsletter welcome to delivered@, through the owner's real Resend key.
// These tests cover its guards and its verdicts; nothing here starts wrangler or calls Resend.
import { describe, expect, it } from 'vitest';
import { assertSafe, judge, RESEND_TEST_INBOXES, smokeRecipients, smokeVars } from '../scripts/delivery-smoke';

describe('delivery smoke: guards', () => {
  it('runs only with --confirm staging-local and refuses anything that could reach a remote resource', () => {
    expect(() => assertSafe(['--confirm', 'staging-local'])).not.toThrow();
    for (const argv of [[], ['--confirm'], ['--confirm', 'yes'], ['--confirm', 'staging-local', '--remote'], ['--confirm', 'staging-local', '--env', 'production'], ['--confirm', 'staging-local', '--x-remote-bindings']]) {
      expect(() => assertSafe(argv), argv.join(' ')).toThrow();
    }
  });

  it('every recipient is a Resend test inbox (delivered@ or bounced@ with a +label), never a person', () => {
    const r = smokeRecipients('run1');
    expect(Object.values(r)).toEqual(['delivered+reply-run1@resend.dev', 'bounced+reply-run1@resend.dev', 'delivered+welcome-run1@resend.dev']);
    expect(RESEND_TEST_INBOXES).toEqual(['delivered@resend.dev', 'bounced@resend.dev']);
    for (const to of Object.values(r)) expect(to).toMatch(/^(delivered|bounced)\+[a-z0-9-]+@resend\.dev$/);
  });

  it('the local Worker gets the test switch, replies and the welcome on, owner alerts off, no staging origin', () => {
    const v = smokeVars('secret-for-this-run');
    expect(v).toMatchObject({ ALLOW_TEST_TURNSTILE: 'yes', TURNSTILE_SECRET: '1x0000000000000000000000000000000AA', OUTBOUND_REPLIES: 'on', OUTBOUND_NEWSLETTER: 'on', OUTBOUND_ALERTS: 'off', EMAIL_PROVIDER: 'resend', STAGING_ORIGIN: '' });
    expect(v.ALERT_EMAIL).toMatch(/@resend\.dev$/);
    expect(Object.keys(v)).not.toContain('RESEND_API_KEY');
  });
});

describe('delivery smoke: verdict', () => {
  const sent = (kind: string) => ({ kind, status: 'sent', has_id: 1, error: null });
  it('PASS needs two lead replies and one welcome, all sent with a provider id', () => {
    expect(judge([sent('lead_reply'), sent('lead_reply'), sent('newsletter_welcome')])).toEqual({ ok: true, lines: ['lead reply (delivered): PASS', 'lead reply (bounced): PASS', 'newsletter welcome: PASS'] });
  });
  it('a missing, failed or id-less row fails its line', () => {
    const r = judge([sent('lead_reply'), { kind: 'lead_reply', status: 'failed', has_id: 0, error: 'email_provider_403' }]);
    expect(r.ok).toBe(false);
    expect(r.lines).toEqual(['lead reply (delivered): PASS', 'lead reply (bounced): FAIL (failed email_provider_403)', 'newsletter welcome: FAIL (no row)']);
    expect(judge([sent('lead_reply'), { kind: 'lead_reply', status: 'sent', has_id: 0, error: null }, sent('newsletter_welcome')]).ok).toBe(false);
  });
});
