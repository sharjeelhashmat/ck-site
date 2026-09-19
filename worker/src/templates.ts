import { sha256Hex } from './hash';

// Approved-template engine. The system may only send text that (a) exists in the repo,
// (b) has a hash present in the owner-approved allow-list. It fills slots and writes nothing else.

export type Stream = 'leads' | 'news';

export interface Template {
  id: string;
  version: number;
  lane: string;
  channel: 'email';
  stream: Stream;
  marketing: boolean;
  subject: string;
  body: string;
  slots: string[];
}

export const KNOWN_SLOTS = [
  'first_name', 'sla_hours', 'booking_url', 'resource_url', 'affiliation_line', 'unsubscribe_url',
] as const;

const URL_SLOTS = new Set(['booking_url', 'resource_url', 'unsubscribe_url']);
const SLOT_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function slotsUsed(text: string): string[] {
  return [...new Set([...text.matchAll(SLOT_RE)].map((m) => m[1] as string))];
}

export async function templateHash(t: Pick<Template, 'id' | 'version' | 'stream' | 'subject' | 'body'>): Promise<string> {
  return sha256Hex(`${t.id}\n${t.version}\n${t.stream}\n${t.subject}\n${t.body}`);
}

export function isApproved(t: Template, hash: string, approved: Record<string, string>): boolean {
  return approved[t.id] === hash;
}

function sanitizeSlot(name: string, value: string | undefined): string {
  const v = (value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!v) throw new Error(`slot_empty:${name}`);
  if (v.includes('{{') || v.includes('}}')) throw new Error(`slot_invalid:${name}`);
  if (URL_SLOTS.has(name) && !/^https:\/\/[^\s]+$/.test(v)) throw new Error(`slot_not_https:${name}`);
  return v;
}

export function renderTemplate(t: Template, slots: Record<string, string | undefined>): { subject: string; text: string } {
  const used = new Set([...slotsUsed(t.subject), ...slotsUsed(t.body)]);
  for (const s of used) {
    if (!(KNOWN_SLOTS as readonly string[]).includes(s)) throw new Error(`slot_unknown:${s}`);
    if (!t.slots.includes(s)) throw new Error(`slot_undeclared:${s}`);
  }
  const fill = (text: string) => text.replace(SLOT_RE, (_m, name: string) => sanitizeSlot(name, slots[name]));
  return { subject: fill(t.subject), text: fill(t.body) };
}

export function firstName(fullName: string): string {
  const first = fullName.split(/\s+/)[0] ?? '';
  const cleaned = first.replace(/[^\p{L}\p{M}'\-]/gu, '');
  return cleaned.length >= 2 ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Hello';
}
