import { readFileSync, writeFileSync } from 'node:fs';
import { templateHash, type Template } from '../src/templates';

const WHEN: Record<string, string> = {
  'ACK-PRIORITY': 'Score 81+ (buy/invest). You are alerted instantly.',
  'ACK-QUALIFIED': 'Score 61-80 (buy/invest). Digest.',
  'ACK-NURTURE': 'Score 41-60 and the lead ticked the weekly-note opt-in.',
  'ACK-COLD': 'Score below 41, or score 41-60 without the opt-in.',
  'ACK-SELLER': 'Any seller enquiry. Never states a value.',
  'ACK-ABROAD': 'Any overseas-buyer enquiry.',
  'ACK-ROUTED': 'Partner, media, broker or other enquiries. Routed to you.',
  'ACK-ESCALATED': 'Message mentions a complaint, legal wording, a guarantee, negotiation, another broker or urgency. You are alerted instantly.',
  'NEWS-WELCOME': 'Someone subscribes to the newsletter (site footer or end of an article). Single opt-in; sent once per new or returning subscriber, from brief@news.',
};

const tpls = (JSON.parse(readFileSync(new URL('../templates/lead-replies.v1.json', import.meta.url), 'utf8')) as { templates: Template[] }).templates;
let out = '# Reply templates v1: for your approval\n\n';
out += 'The system can send ONLY these texts, and only after you approve them. It fills the {{slots}} and writes nothing else.\n';
out += 'Any wording change creates a new hash and voids the approval until you approve again.\n\n';
out += '{{slots}}: first_name = lead first name. sla_hours = your promised reply window (default 24). booking_url = your booking link. resource_url = your Investment Approach page. affiliation_line = "Royals Field Properties · BRN (pending)". unsubscribe_url = one-click opt-out.\n\n---\n\n';
for (const t of tpls) {
  out += `## ${t.id} (v${t.version})\n**Sent when:** ${WHEN[t.id] ?? t.lane}\n\n**Subject:** ${t.subject}\n\n\`\`\`\n${t.body}\n\`\`\`\n\nHash: \`${(await templateHash(t)).slice(0, 12)}\`\n\n---\n\n`;
}
out += 'Reply per template: APPROVED, or the exact edit you want.\n';
writeFileSync(new URL('../../TEMPLATES_FOR_APPROVAL.md', import.meta.url), out);
console.log('written');
