import {
  BUDGETS,
  FUNDINGS,
  INTENTS,
  TIMELINES,
  type Attribution,
  type FirewallStatus,
  type Lead,
  type SourceType,
} from './types';

// Autonomous-maintainable file: security mechanics only. Routing policy lives elsewhere.

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com',
  'trashmail.com', 'sharklasers.com', 'getnada.com', 'throwawaymail.com', 'maildrop.cc',
  'temp-mail.org', 'dispostable.com', 'fakeinbox.com',
]);

const SPAM_TERMS: RegExp[] = [
  /\bbacklinks?\b/i, /\bseo (services?|expert|agency)\b/i, /\bcasino\b/i, /\bviagra\b/i,
  /\bguest post\b/i, /\bloan offer\b/i, /\bcrypto (giveaway|airdrop)\b/i, /\bwork from home\b/i,
  /\bweb ?design (services?|agency)\b/i, /\bincrease your (traffic|sales)\b/i,
];

export type ValidationResult = { ok: true; lead: Lead } | { ok: false; field: string };

const CTRL = /[\u0000-\u001f\u007f]/g;

function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(CTRL, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function normalizePhone(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let s = v.replace(/[\s\-.()]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
}

export function emailDomain(email: string): string {
  return email.split('@')[1] ?? '';
}

export function isDisposable(email: string): boolean {
  return DISPOSABLE.has(emailDomain(email).toLowerCase());
}

export function deriveSource(a: Omit<Attribution, 'source_type'>): SourceType {
  const src = (a.utm_source ?? '').toLowerCase();
  const med = (a.utm_medium ?? '').toLowerCase();
  if (med === 'referral' || src === 'referral') return 'referral';
  if (src.includes('linkedin')) return 'linkedin';
  if (src === 'ig' || src.includes('instagram')) return 'instagram';
  let host = '';
  try {
    host = a.referrer ? new URL(a.referrer).hostname.toLowerCase() : '';
  } catch {
    host = '';
  }
  if (/(^|\.)(google|bing|duckduckgo|yahoo)\./.test(host) || med === 'organic') return 'organic';
  if (!a.referrer && !a.utm_source) return 'direct';
  return 'other';
}

function oneOf<T extends readonly string[]>(list: T, v: unknown): T[number] | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T[number]) : null;
}

export function validateLead(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, field: 'body' };
  const r = raw as Record<string, unknown>;

  const name = clean(r.name, 80);
  if (!name || !/^[\p{L}\p{M}' .\-]{2,80}$/u.test(name)) return { ok: false, field: 'name' };

  const emailRaw = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';
  if (emailRaw.length > 254 || /[\r\n\s]/.test(emailRaw) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailRaw)) {
    return { ok: false, field: 'email' };
  }

  const intent = oneOf(INTENTS, r.intent);
  if (!intent) return { ok: false, field: 'intent' };
  const budget = oneOf(BUDGETS, r.budget_band ?? 'unspecified');
  if (!budget) return { ok: false, field: 'budget_band' };
  const timeline = oneOf(TIMELINES, r.timeline ?? 'exploring');
  if (!timeline) return { ok: false, field: 'timeline' };
  const funding = oneOf(FUNDINGS, r.funding ?? 'unsure');
  if (!funding) return { ok: false, field: 'funding' };

  if (r.consent_contact !== true) return { ok: false, field: 'consent_contact' };

  const country = clean(r.country, 2)?.toUpperCase() ?? null;
  const message = clean(r.message, 1000) ?? '';

  const base = {
    utm_source: clean(r.utm_source, 100),
    utm_medium: clean(r.utm_medium, 100),
    utm_campaign: clean(r.utm_campaign, 150),
    utm_content: clean(r.utm_content, 150),
    utm_term: clean(r.utm_term, 150),
    landing_page: clean(r.landing_page, 300),
    referrer: clean(r.referrer, 300),
  };

  return {
    ok: true,
    lead: {
      name,
      email: emailRaw,
      phone: normalizePhone(r.phone),
      country: country && /^[A-Z]{2}$/.test(country) ? country : null,
      intent,
      budget_band: budget,
      timeline,
      funding,
      message,
      consent_contact: true,
      consent_nurture: r.consent_nurture === true,
      attribution: { ...base, source_type: deriveSource(base) },
      honeypot: typeof r.company_website === 'string' ? r.company_website.trim() : '',
    },
  };
}

export function classify(lead: Lead, ctx: { duplicate: boolean }): { status: FirewallStatus; reasons: string[] } {
  const reasons: string[] = [];
  if (lead.honeypot) return { status: 'SPAM', reasons: ['honeypot'] };
  if (ctx.duplicate) return { status: 'DUPLICATE', reasons: ['duplicate_24h'] };
  if (isDisposable(lead.email)) reasons.push('disposable_email');
  const urls = (lead.message.match(/https?:\/\/|www\./gi) ?? []).length;
  if (urls >= 2) reasons.push('many_links');
  if (SPAM_TERMS.some((re) => re.test(lead.message))) reasons.push('spam_terms');
  if (/^\d+$/.test(lead.name.replace(/[ .\-']/g, ''))) reasons.push('numeric_name');
  return reasons.length ? { status: 'SUSPICIOUS', reasons } : { status: 'VALID', reasons: [] };
}
