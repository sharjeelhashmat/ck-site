// Lead phone validation (Package B, owner-approved 2026-10-10). libphonenumber-js "min" metadata, pinned exactly.
// Accepts the same light formatting the firewall normaliser accepts (spaces, dashes, dots, brackets, a leading 00),
// so a legacy client sending "+971 50 123 4567" still passes; returns E.164 only when the number is valid.
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

/** True when the payload carries any phone value at all (an empty or whitespace-only string counts as absent). */
export function phonePresent(v: unknown): boolean {
  return v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');
}

export const PHONE_RAW_MAX = 40;

/** A phone value as typed, for the owner only: control characters removed, whitespace collapsed, at most 40 characters. */
export function rawPhone(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PHONE_RAW_MAX).trim();
  return s || null;
}

/** The number in E.164 (e.g. +971501234567) when it is a valid international number, otherwise null. */
export function validE164(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let s = v.replace(/[\s\-.()]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!/^\+[1-9]\d{6,14}$/.test(s)) return null;
  const p = parsePhoneNumberFromString(s);
  return p && p.isValid() ? p.number : null;
}
