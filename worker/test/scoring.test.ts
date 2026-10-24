import { describe, expect, it } from 'vitest';
import { validateLead } from '../src/firewall';
import { DEFAULT_WEIGHTS, parseWeights, scoreLead } from '../src/scoring';
import { baseLead } from './helpers';

const lead = (over = {}) => {
  const v = validateLead(baseLead(over));
  if (!v.ok) throw new Error(v.field);
  return v.lead;
};

describe('scoring', () => {
  it('best possible intake lead scores 90 (10 points are earned after intake)', () => {
    expect(scoreLead(lead({ utm_source: 'referral' })).score).toBe(90);
  });
  it('weak lead scores low', () => {
    const s = scoreLead(lead({ intent: 'other', budget_band: 'unspecified', timeline: 'exploring', funding: 'unsure', phone: '', utm_source: '' })).score;
    expect(s).toBeLessThan(41);
  });
  it('financial component is capped at 25', () => {
    const w = parseWeights(JSON.stringify({ budget: { over_5m: 30 } }));
    expect(w.budget.over_5m).toBe(30);
    expect(scoreLead(lead(), w).parts.financial).toBe(25);
  });
  it('ignores malformed or out-of-range overrides', () => {
    expect(parseWeights('not json')).toEqual(DEFAULT_WEIGHTS);
    expect(parseWeights(JSON.stringify({ intent: { invest: 9999 } })).intent.invest).toBe(DEFAULT_WEIGHTS.intent.invest);
  });
});
