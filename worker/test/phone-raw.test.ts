// PR 2c item 3 (gap G04): with LEAD_STRICT "false" an invalid phone is no longer dropped. It is kept as typed (cleaned,
// capped) in phone_raw with phone empty and phone_invalid set; the owner sees it marked unverified; replies never use it.
import { describe, expect, it } from 'vitest';
import { processLead } from '../src/pipeline';
import { baseLead, ctx, makeFake } from './helpers';

describe('pipeline: phone_raw (non-strict)', () => {
  it('valid: E.164 in phone, nothing in phone_raw, not flagged', async () => {
    const f = makeFake();
    await processLead(baseLead({ phone: '+971 50 123 4567' }), await ctx(), f.deps);
    expect(f.rows[0]!.lead).toMatchObject({ phone: '+971501234567', phone_raw: null, phone_invalid: false });
  });

  it('invalid: phone empty, the raw value kept and flagged, the lead still succeeds', async () => {
    for (const [raw, kept] of [['0501234567', '0501234567'], ['call me\u0007 maybe', 'call me maybe'], [12345, '12345'], ['9'.repeat(80), '9'.repeat(40)]] as const) {
      const f = makeFake();
      const r = await processLead(baseLead({ phone: raw }), await ctx(), f.deps);
      expect(r.status, String(raw)).toBe(202);
      expect(f.rows[0]!.lead, String(raw)).toMatchObject({ phone: null, phone_raw: kept, phone_invalid: true });
      expect(f.alerts[0]!.lead.phone_raw).toBe(kept);
    }
  });

  it('empty or absent: nothing stored, not flagged', async () => {
    for (const phone of [undefined, '', '   ']) {
      const f = makeFake();
      await processLead(baseLead({ phone }), await ctx(), f.deps);
      expect(f.rows[0]!.lead, String(phone)).toMatchObject({ phone: null, phone_raw: null, phone_invalid: false });
    }
  });

  it('the reply never carries the raw phone', async () => {
    const f = makeFake();
    await processLead(baseLead({ phone: '0501234567' }), await ctx(), f.deps);
    expect(f.sent).toHaveLength(1);
    expect(JSON.stringify(f.sent[0])).not.toContain('0501234567');
  });

  it('strict mode is unchanged: an invalid phone is still rejected', async () => {
    const f = makeFake();
    const r = await processLead(baseLead({ phone: '0501234567' }), await ctx({ ...(await import('./helpers')).goodEnv, LEAD_STRICT: 'true' }), f.deps);
    expect(r.body).toEqual({ ok: false, error: 'invalid_phone' });
    expect(f.rows).toHaveLength(0);
  });
});
