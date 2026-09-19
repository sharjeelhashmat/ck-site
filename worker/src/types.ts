// Lead intake types. Budget bands are in AED.
export const INTENTS = ['buy', 'invest', 'sell', 'abroad', 'partner', 'media', 'other'] as const;
export const BUDGETS = ['under_1m', '1m_2m', '2m_5m', 'over_5m', 'unspecified'] as const;
export const TIMELINES = ['now', '3m', '6m', '12m_plus', 'exploring'] as const;
export const FUNDINGS = ['cash', 'mortgage', 'unsure'] as const;
export const SOURCES = ['referral', 'linkedin', 'organic', 'instagram', 'direct', 'other'] as const;

export type Intent = (typeof INTENTS)[number];
export type BudgetBand = (typeof BUDGETS)[number];
export type Timeline = (typeof TIMELINES)[number];
export type Funding = (typeof FUNDINGS)[number];
export type SourceType = (typeof SOURCES)[number];

export interface Attribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landing_page: string | null;
  referrer: string | null;
  source_type: SourceType;
}

export interface Lead {
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  intent: Intent;
  budget_band: BudgetBand;
  timeline: Timeline;
  funding: Funding;
  message: string;
  consent_contact: true;
  consent_nurture: boolean;
  attribution: Attribution;
  honeypot: string;
}

export type FirewallStatus = 'VALID' | 'SUSPICIOUS' | 'SPAM' | 'DUPLICATE';
export type Lane =
  | 'PRIORITY'
  | 'QUALIFIED'
  | 'NURTURE'
  | 'COLD'
  | 'SELLER'
  | 'ABROAD'
  | 'ROUTED'
  | 'ESCALATED'
  | 'NONE';
export type AlertLevel = 'instant' | 'digest' | 'none';
