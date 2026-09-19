import { describe, expect, it } from 'vitest';
import { classify, normalizePhone, validateLead } from '../src/firewall';
import { baseLead } from './helpers';

const lead = (over = {}) => {
  const v = validateLead(baseLead(over));
  if (!v.ok) throw new Error('invalid: ' + v.field);
  return v.lead;
};

describe('validation', () => {
  it('accepts a good lead and normalizes phone, email, source', () => {
    const l = lead({ email: '  Amira@Example.COM ' });
    expect(l.email).toBe('amira@example.com');
    expect(l.phone).toBe('+971501234567');
    expect(l.attribution.source_type).toBe('linkedin');
  });
  it('rejects missing consent', () => {
    expect(validateLead(baseLead({ consent_contact: false }))).toEqual({ ok: false, field: 'consent_contact' });
  });
  it('rejects header injection in email', () => {
    expect(validateLead(baseLead({ email: 'a@b.com\r\nBcc: x@y.com' })).ok).toBe(false);
  });
  it('rejects unknown enum values', () => {
    expect(validateLead(baseLead({ intent: 'hack' }))).toEqual({ ok: false, field: 'intent' });
  });
  it('rejects non-object bodies', () => {
    expect(validateLead('x').ok).toBe(false);
    expect(validateLead(null).ok).toBe(false);
  });
  it('drops an invalid phone without rejecting the lead', () => {
    expect(lead({ phone: '12345' }).phone).toBeNull();
    expect(normalizePhone('00971501234567')).toBe('+971501234567');
  });
});

describe('classification', () => {
  it('honeypot is SPAM', () => expect(classify(lead({ company_website: 'x.com' }), { duplicate: false }).status).toBe('SPAM'));
  it('duplicate is DUPLICATE', () => expect(classify(lead(), { duplicate: true }).status).toBe('DUPLICATE'));
  it('disposable email is SUSPICIOUS', () => expect(classify(lead({ email: 'x@mailinator.com' }), { duplicate: false }).status).toBe('SUSPICIOUS'));
  it('spam terms are SUSPICIOUS', () => expect(classify(lead({ message: 'cheap backlinks for you' }), { duplicate: false }).status).toBe('SUSPICIOUS'));
  it('many links are SUSPICIOUS', () => expect(classify(lead({ message: 'see http://a.com and http://b.com' }), { duplicate: false }).status).toBe('SUSPICIOUS'));
  it('clean lead is VALID', () => expect(classify(lead(), { duplicate: false })).toEqual({ status: 'VALID', reasons: [] }));
});
