import type { BudgetBand, Funding, Intent, Lead, SourceType, Timeline } from './types';
import { isDisposable } from './firewall';

// Policy file. Default weights; production weights are supplied via the SCORING_JSON secret.
// Intake maximum is 90. The remaining 10 points are earned after intake (reply, click).

export interface ScoringWeights {
  contact: { email: number; nonDisposable: number; phone: number; name: number };
  budget: Record<BudgetBand, number>;
  funding: Record<Funding, number>;
  intent: Record<Intent, number>;
  timeline: Record<Timeline, number>;
  source: Record<SourceType, number>;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  contact: { email: 5, nonDisposable: 3, phone: 5, name: 2 },
  budget: { over_5m: 20, '2m_5m': 16, '1m_2m': 12, under_1m: 6, unspecified: 3 },
  funding: { cash: 5, mortgage: 3, unsure: 1 },
  intent: { invest: 20, abroad: 18, buy: 16, sell: 14, other: 4, partner: 0, media: 0 },
  timeline: { now: 20, '3m': 15, '6m': 8, '12m_plus': 3, exploring: 2 },
  source: { referral: 10, linkedin: 7, organic: 7, instagram: 5, direct: 4, other: 3 },
};

function mergeNumeric<T extends object>(base: T, over: unknown): T {
  if (typeof over !== 'object' || over === null) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const cur = out[k];
    if (typeof cur === 'number' && typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) out[k] = v;
    else if (typeof cur === 'object' && cur !== null) out[k] = mergeNumeric(cur, v);
  }
  return out as T;
}

export function parseWeights(json: string | undefined): ScoringWeights {
  if (!json) return DEFAULT_WEIGHTS;
  try {
    return mergeNumeric(DEFAULT_WEIGHTS, JSON.parse(json));
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

export function scoreLead(lead: Lead, w: ScoringWeights = DEFAULT_WEIGHTS): { score: number; parts: Record<string, number> } {
  const parts: Record<string, number> = {
    contact: w.contact.email + (isDisposable(lead.email) ? 0 : w.contact.nonDisposable) + (lead.phone ? w.contact.phone : 0) + w.contact.name,
    financial: Math.min(25, w.budget[lead.budget_band] + w.funding[lead.funding]),
    intent: w.intent[lead.intent],
    timeline: w.timeline[lead.timeline],
    source: w.source[lead.attribution.source_type],
  };
  const score = Math.max(0, Math.min(100, Object.values(parts).reduce((a, b) => a + b, 0)));
  return { score, parts };
}

export function engagementBonus(replies: number, clicks: number): number {
  return Math.min(10, Math.max(0, replies) * 5 + Math.max(0, clicks) * 2);
}

export function band(score: number): 'junk' | 'cold' | 'potential' | 'qualified' | 'priority' {
  if (score >= 81) return 'priority';
  if (score >= 61) return 'qualified';
  if (score >= 41) return 'potential';
  if (score >= 21) return 'cold';
  return 'junk';
}
