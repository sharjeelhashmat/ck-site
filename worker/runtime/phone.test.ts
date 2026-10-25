// PR 2c item 3 (gap G04) in workerd with real D1: leads.phone_raw and leads.phone_invalid (migration 0008), and the owner
// alert line "Phone (unverified): <raw>".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { approveAllInKv, baseEnv, clearDb, emails, lead, LIVE, ORIGIN, rows, stubFetch, toOf, type Call } from './helpers';

let calls: Call[] = [];
beforeEach(async () => { calls = []; await clearDb(); stubFetch(calls, { siteverify: () => ({ success: true, hostname: 'sharjeelhashmat.com', action: 'lead' }) }); });
afterEach(() => vi.unstubAllGlobals());

const post = (body: unknown, e = baseEnv(LIVE)) =>
  worker.fetch(new Request('https://api.test/lead', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) }), e);
const alertText = () => (emails(calls).find((c) => toOf(c) === 'owner@example.com')!.body as { text: string }).text;
const replyText = () => (emails(calls).find((c) => toOf(c) === 'amira@example.com')!.body as { text: string }).text;

describe('phone_raw on workerd', () => {
  it('valid: stored as E.164, alert shows it plainly', async () => {
    const e = baseEnv(LIVE);
    await approveAllInKv(e);
    expect((await post(lead({ phone: '+971 50 123 4567' }), e)).status).toBe(202);
    expect(await rows('SELECT phone, phone_raw, phone_invalid FROM leads')).toEqual([{ phone: '+971501234567', phone_raw: null, phone_invalid: 0 }]);
    expect(alertText()).toContain('Phone: +971501234567');
  });

  it('invalid: phone NULL, raw kept and flagged, alert says unverified, the reply never uses it', async () => {
    const e = baseEnv(LIVE);
    await approveAllInKv(e);
    expect((await post(lead({ phone: '050 123 4567' }), e)).status).toBe(202);
    expect(await rows('SELECT phone, phone_raw, phone_invalid FROM leads')).toEqual([{ phone: null, phone_raw: '050 123 4567', phone_invalid: 1 }]);
    expect(alertText()).toContain('Phone (unverified): 050 123 4567');
    expect(replyText()).not.toContain('050 123 4567');
  });

  it('empty: nothing stored, alert shows "-"', async () => {
    expect((await post(lead({ phone: '' }))).status).toBe(202);
    expect(await rows('SELECT phone, phone_raw, phone_invalid FROM leads')).toEqual([{ phone: null, phone_raw: null, phone_invalid: 0 }]);
    expect(alertText()).toContain('Phone: -');
  });
});
