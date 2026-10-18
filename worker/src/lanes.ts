import type { AlertLevel, FirewallStatus, Lane, Lead } from './types';

// Policy file. Changes to lane routing need the owner's review (see CODEOWNERS).

export function assignLane(
  lead: Lead,
  status: FirewallStatus,
  score: number,
  escalated: boolean,
): { lane: Lane; alert_level: AlertLevel } {
  // Not VALID: never a reply (lane NONE). SUSPICIOUS may still be a real person, so the owner sees it in the digest;
  // a DUPLICATE that escalates (complaint, legal, urgent...) is alerted at once; SPAM (and TEST, set later) stay silent.
  if (status === 'SUSPICIOUS') return { lane: 'NONE', alert_level: 'digest' };
  if (status === 'DUPLICATE' && escalated) return { lane: 'NONE', alert_level: 'instant' };
  if (status !== 'VALID') return { lane: 'NONE', alert_level: 'none' };
  if (escalated) return { lane: 'ESCALATED', alert_level: 'instant' };
  if (lead.intent === 'partner' || lead.intent === 'media' || lead.intent === 'other') {
    return { lane: 'ROUTED', alert_level: 'digest' };
  }
  if (lead.intent === 'sell') return { lane: 'SELLER', alert_level: score >= 61 ? 'instant' : 'digest' };
  if (lead.intent === 'abroad') return { lane: 'ABROAD', alert_level: score >= 61 ? 'instant' : 'digest' };
  if (score >= 81) return { lane: 'PRIORITY', alert_level: 'instant' };
  if (score >= 61) return { lane: 'QUALIFIED', alert_level: 'digest' };
  if (score >= 41) return { lane: 'NURTURE', alert_level: 'digest' };
  return { lane: 'COLD', alert_level: 'digest' };
}

export const TEMPLATE_IDS = [
  'ACK-PRIORITY', 'ACK-QUALIFIED', 'ACK-NURTURE', 'ACK-COLD',
  'ACK-SELLER', 'ACK-ABROAD', 'ACK-ROUTED', 'ACK-ESCALATED',
] as const;

export function templateFor(lane: Lane, lead: Lead): string | null {
  switch (lane) {
    case 'PRIORITY': return 'ACK-PRIORITY';
    case 'QUALIFIED': return 'ACK-QUALIFIED';
    case 'NURTURE': return lead.consent_nurture ? 'ACK-NURTURE' : 'ACK-COLD';
    case 'COLD': return 'ACK-COLD';
    case 'SELLER': return 'ACK-SELLER';
    case 'ABROAD': return 'ACK-ABROAD';
    case 'ROUTED': return 'ACK-ROUTED';
    case 'ESCALATED': return 'ACK-ESCALATED';
    default: return null;
  }
}
