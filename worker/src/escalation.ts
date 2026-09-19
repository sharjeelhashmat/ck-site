// Policy file. Any hit means: neutral acknowledgment only, instant alert to the owner.
const PATTERNS: Array<[string, RegExp]> = [
  ['complaint', /\bcomplain(t|ts|ing)?\b/i],
  ['refund', /\brefunds?\b/i],
  ['fraud', /\b(scam|fraud|cheat(ed|ing)?)\b/i],
  ['legal', /\b(lawyer|attorney|legal|court|sue|suing|lawsuit|dispute|litigation)\b/i],
  ['guarantee', /\bguarantee(d|s)?\b/i],
  ['negotiation', /\b(negotiat\w*|discount|best price|lowest price)\b/i],
  ['commission', /\bcommission\b/i],
  ['other_broker', /\b(another|other|my|previous) (broker|agent|agency)\b/i],
  ['urgent', /\b(urgent(ly)?|asap|immediately)\b/i],
  ['arabic_sensitive', /(شكوى|احتيال|محامي|نصب)/],
];

export function escalationReasons(message: string): string[] {
  return PATTERNS.filter(([, re]) => re.test(message)).map(([name]) => name);
}
