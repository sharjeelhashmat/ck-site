import { describe, expect, it } from 'vitest';
import { escalationReasons } from '../src/escalation';
import { validateLead } from '../src/firewall';
import { assignLane, templateFor } from '../src/lanes';
import { baseLead } from './helpers';

const lead = (over = {}) => {
  const v = validateLead(baseLead(over));
  if (!v.ok) throw new Error(v.field);
  return v.lead;
};

describe('lanes', () => {
  it('non-VALID leads get no lane and no alert', () => {
    for (const s of ['SPAM', 'SUSPICIOUS', 'DUPLICATE'] as const) expect(assignLane(lead(), s, 90, false)).toEqual({ lane: 'NONE', alert_level: 'none' });
  });
  it('escalation overrides everything', () => expect(assignLane(lead(), 'VALID', 95, true)).toEqual({ lane: 'ESCALATED', alert_level: 'instant' }));
  it('score bands map to lanes', () => {
    expect(assignLane(lead(), 'VALID', 85, false).lane).toBe('PRIORITY');
    expect(assignLane(lead(), 'VALID', 70, false).lane).toBe('QUALIFIED');
    expect(assignLane(lead(), 'VALID', 50, false).lane).toBe('NURTURE');
    expect(assignLane(lead(), 'VALID', 30, false).lane).toBe('COLD');
  });
  it('intent lanes', () => {
    expect(assignLane(lead({ intent: 'sell' }), 'VALID', 70, false)).toEqual({ lane: 'SELLER', alert_level: 'instant' });
    expect(assignLane(lead({ intent: 'abroad' }), 'VALID', 30, false)).toEqual({ lane: 'ABROAD', alert_level: 'digest' });
    expect(assignLane(lead({ intent: 'media' }), 'VALID', 90, false).lane).toBe('ROUTED');
    expect(assignLane(lead({ intent: 'partner' }), 'VALID', 90, false).lane).toBe('ROUTED');
  });
  it('nurture lane without opt-in uses the cold template', () => {
    expect(templateFor('NURTURE', lead({ consent_nurture: false }))).toBe('ACK-COLD');
    expect(templateFor('NURTURE', lead({ consent_nurture: true }))).toBe('ACK-NURTURE');
    expect(templateFor('NONE', lead())).toBeNull();
  });
});

describe('escalation', () => {
  it.each([
    ['I want to negotiate the price', 'negotiation'],
    ['Is the yield guaranteed?', 'guarantee'],
    ['I will call my lawyer', 'legal'],
    ['I am with another broker', 'other_broker'],
    ['This is urgent', 'urgent'],
    ['I have a complaint', 'complaint'],
  ])('flags "%s"', (msg, reason) => expect(escalationReasons(msg)).toContain(reason));
  it('passes ordinary enquiries', () => {
    expect(escalationReasons('Looking for a two-bedroom near the metro, cash buyer.')).toEqual([]);
    expect(escalationReasons('')).toEqual([]);
  });
});
