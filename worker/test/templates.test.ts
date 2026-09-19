import { describe, expect, it } from 'vitest';
import { firstName, isApproved, renderTemplate, templateHash } from '../src/templates';
import { TEMPLATES } from './helpers';

const t = (id: string) => TEMPLATES.find((x) => x.id === id)!;
const slots = {
  first_name: 'Amira', sla_hours: '24', booking_url: 'https://cal.example.com/x', resource_url: 'https://sharjeelhashmat.com/investment-approach',
  affiliation_line: 'Royals Field Properties · BRN 12345', unsubscribe_url: 'https://api.example.com/unsubscribe?e=a&t=b',
};

describe('templates', () => {
  it('renders with every slot filled and leaves no braces', () => {
    for (const tpl of TEMPLATES) {
      const r = renderTemplate(tpl, slots);
      expect(r.text).not.toMatch(/\{\{|\}\}/);
      expect(r.text).toContain('BRN 12345');
    }
  });
  it('refuses to render when a slot is empty or missing', () => {
    expect(() => renderTemplate(t('ACK-PRIORITY'), { ...slots, booking_url: '' })).toThrow(/slot_empty/);
    expect(() => renderTemplate(t('ACK-PRIORITY'), { ...slots, affiliation_line: undefined })).toThrow(/slot_empty/);
  });
  it('refuses non-https URL slots and brace injection', () => {
    expect(() => renderTemplate(t('ACK-PRIORITY'), { ...slots, booking_url: 'http://x.com' })).toThrow(/slot_not_https/);
    expect(() => renderTemplate(t('ACK-PRIORITY'), { ...slots, first_name: '{{booking_url}}' })).toThrow(/slot_invalid/);
  });
  it('strips newlines from slot values (no header or body injection)', () => {
    const r = renderTemplate(t('ACK-PRIORITY'), { ...slots, first_name: 'Amira\r\nBcc: x@y.com' });
    expect(r.text.split('\n')[0]).toBe('Amira Bcc: x@y.com,');
  });
  it('hash is stable and any wording change breaks approval', async () => {
    const tpl = t('ACK-COLD');
    const h = await templateHash(tpl);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(isApproved(tpl, h, { [tpl.id]: h })).toBe(true);
    const edited = { ...tpl, body: tpl.body + ' Extra.' };
    expect(isApproved(edited, await templateHash(edited), { [tpl.id]: h })).toBe(false);
  });
  it('first name fallback', () => {
    expect(firstName('amira khan')).toBe('Amira');
    expect(firstName('X')).toBe('Hello');
  });
});
