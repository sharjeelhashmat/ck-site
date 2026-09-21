import { describe, expect, it } from 'vitest';
import { AREA_SLUGS, PROFILE_WINDOW_DAYS, saveProfile, validateProfile, type LeadRef, type Profile, type ProfileDeps } from '../src/profile';

const ID = '3f2b8c1e-7d4a-4e6b-9c10-2a5d8e9f0b11';
const good = { lead_id: ID, objective: 'rental_income', property_type: 'apartment', risk_tolerance: 'moderate', holding_period: '5_10y', areas: ['dubai-marina', 'downtown-dubai'] };
const NOW = new Date('2026-09-21T10:00:00Z');

function fake(lead: Partial<LeadRef> | null = {}) {
  const f = {
    saved: [] as Array<{ id: string; p: Profile }>, events: [] as string[], mails: [] as Array<{ subject: string; text: string }>,
    existing: false, failMail: false,
    deps: undefined as unknown as ProfileDeps,
  };
  f.deps = {
    now: () => NOW,
    findLead: async () => (lead === null ? null : { created_at: '2026-09-20T08:00:00Z', quarantined: 0, name: 'Amira Khan', email: 'amira@example.com', intent: 'invest', lane: 'QUALIFIED', ...lead }),
    upsertProfile: async (id, p) => { f.saved.push({ id, p }); const was = f.existing; f.existing = true; return was ? 'updated' : 'created'; },
    logEvent: async (t) => { f.events.push(t); },
    notifyOwner: async (subject, text) => { if (f.failMail) throw new Error('mail down'); f.mails.push({ subject, text }); },
  };
  return f;
}

describe('validateProfile', () => {
  it('accepts a complete profile and sorts and dedupes areas', () => {
    const v = validateProfile({ ...good, areas: ['dubai-marina', 'downtown-dubai', 'dubai-marina'] });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.profile.areas).toEqual(['downtown-dubai', 'dubai-marina']);
  });
  it('areas are optional', () => {
    const { areas: _a, ...rest } = good;
    const v = validateProfile(rest);
    expect(v.ok && v.profile.areas).toEqual([]);
  });
  it.each([
    ['lead_id', { lead_id: 'not-a-uuid' }], ['objective', { objective: 'get_rich' }], ['property_type', { property_type: 'castle' }],
    ['risk_tolerance', { risk_tolerance: '' }], ['holding_period', { holding_period: 'forever' }], ['areas', { areas: ['atlantis'] }], ['areas', { areas: 'dubai-marina' }],
    ['areas', { areas: Array(9).fill('dubai-marina') }],
  ])('rejects a bad %s', (field, over) => {
    const v = validateProfile({ ...good, ...over });
    expect(v).toEqual({ ok: false, field });
  });
  it('rejects non-objects and missing fields', () => {
    expect(validateProfile(null).ok).toBe(false);
    expect(validateProfile([]).ok).toBe(false);
    expect(validateProfile({ lead_id: ID }).ok).toBe(false);
  });
  it('ignores unknown extra fields, so no free text can be stored', () => {
    const v = validateProfile({ ...good, message: 'call me', name: 'x' });
    expect(v.ok && Object.keys(v.profile).sort()).toEqual(['areas', 'holding_period', 'objective', 'property_type', 'risk_tolerance']);
  });
  it('has 8 area slugs', () => expect(AREA_SLUGS).toHaveLength(8));
});

describe('saveProfile', () => {
  it('stores the profile and tells the owner once', async () => {
    const f = fake();
    const r = await saveProfile(good, f.deps);
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(f.saved).toHaveLength(1);
    expect(f.events).toEqual(['profile_saved']);
    expect(f.mails).toHaveLength(1);
    expect(f.mails[0]!.subject).toContain('[PROFILE]');
    expect(f.mails[0]!.text).toContain('dubai-marina, downtown-dubai'.split(', ').sort().join(', '));
    await saveProfile({ ...good, objective: 'mix' }, f.deps);
    expect(f.events).toEqual(['profile_saved', 'profile_updated']);
    expect(f.mails).toHaveLength(1); // no second alert on update
  });
  it('unknown and quarantined leads get the same answer', async () => {
    const a = await saveProfile(good, fake(null).deps);
    const b = await saveProfile(good, fake({ quarantined: 1 }).deps);
    expect(a).toEqual({ status: 404, body: { ok: false, error: 'invalid_link' } });
    expect(b).toEqual(a);
  });
  it(`refuses an enquiry older than ${PROFILE_WINDOW_DAYS} days`, async () => {
    const f = fake({ created_at: '2026-09-10T00:00:00Z' });
    expect(await saveProfile(good, f.deps)).toEqual({ status: 410, body: { ok: false, error: 'expired' } });
    expect(f.saved).toHaveLength(0);
  });
  it('refuses an enquiry dated in the future', async () => {
    const f = fake({ created_at: '2027-01-01T00:00:00Z' });
    expect((await saveProfile(good, f.deps)).status).toBe(410);
  });
  it('a failed owner alert does not lose the profile', async () => {
    const f = fake(); f.failMail = true;
    expect((await saveProfile(good, f.deps)).status).toBe(200);
    expect(f.saved).toHaveLength(1);
    expect(f.events).toEqual(['profile_saved', 'profile_alert_failed']);
  });
  it('strips control characters from the name in the alert', async () => {
    const f = fake({ name: 'Amira\r\nBcc: x@evil.com' });
    await saveProfile(good, f.deps);
    expect(f.mails[0]!.subject).not.toMatch(/[\r\n]/);
  });
  it('invalid input never touches storage', async () => {
    const f = fake();
    expect((await saveProfile({ ...good, objective: 'x' }, f.deps)).status).toBe(400);
    expect(f.saved).toHaveLength(0);
  });
});
