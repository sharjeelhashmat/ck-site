// Investor profile, step 2 of the enquiry flow (Investment Intelligence System v1.0, decision 6).
// Five fields, the same ones as section 11 of the Property Brief ("Investor fit"). Data class: Confidential.
// Stored only in D1, never sent to a social tool, never published. It does not change the lead score or lane.
//
// Access model: the lead id returned by POST /lead (a random UUID) is the capability. It is shown only to the person who
// just sent the enquiry. The route can only WRITE a profile; it never reads anything back. All five fields are fixed
// choices, so no free text is stored. Quarantined (suspicious/spam) leads and enquiries older than 7 days are refused.

export const OBJECTIVES = ['rental_income', 'capital_growth', 'mix', 'residency'] as const;
export const PROPERTY_TYPES = ['apartment', 'townhouse', 'villa', 'no_preference'] as const;
export const RISK_TOLERANCES = ['low', 'moderate', 'high'] as const;
export const HOLDING_PERIODS = ['under_2y', '2_5y', '5_10y', '10y_plus'] as const;
// Must equal the area slugs on the site (site/src/lib/areas.ts). The site's tests compare the two lists.
export const AREA_SLUGS = [
  'downtown-dubai', 'dubai-marina', 'dubai-hills', 'dubai-creek-harbour', 'dubai-islands', 'palm-jumeirah', 'palm-jebel-ali', 'dubai-maritime-city',
] as const;

export const PROFILE_WINDOW_DAYS = 7;
export const MAX_PROFILE_BODY = 4 * 1024;

export interface Profile {
  objective: (typeof OBJECTIVES)[number];
  property_type: (typeof PROPERTY_TYPES)[number];
  risk_tolerance: (typeof RISK_TOLERANCES)[number];
  holding_period: (typeof HOLDING_PERIODS)[number];
  areas: string[];
}

export type ProfileValidation = { ok: true; leadId: string; profile: Profile } | { ok: false; field: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pick = <T extends readonly string[]>(list: T, v: unknown): T[number] | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T[number]) : null);

export function validateProfile(raw: unknown): ProfileValidation {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, field: 'body' };
  const r = raw as Record<string, unknown>;
  if (typeof r.lead_id !== 'string' || !UUID.test(r.lead_id)) return { ok: false, field: 'lead_id' };
  const objective = pick(OBJECTIVES, r.objective);
  if (!objective) return { ok: false, field: 'objective' };
  const property_type = pick(PROPERTY_TYPES, r.property_type);
  if (!property_type) return { ok: false, field: 'property_type' };
  const risk_tolerance = pick(RISK_TOLERANCES, r.risk_tolerance);
  if (!risk_tolerance) return { ok: false, field: 'risk_tolerance' };
  const holding_period = pick(HOLDING_PERIODS, r.holding_period);
  if (!holding_period) return { ok: false, field: 'holding_period' };
  let areas: string[] = [];
  if (r.areas !== undefined) {
    if (!Array.isArray(r.areas) || r.areas.length > AREA_SLUGS.length) return { ok: false, field: 'areas' };
    for (const a of r.areas) if (!pick(AREA_SLUGS, a)) return { ok: false, field: 'areas' };
    areas = [...new Set(r.areas as string[])].sort();
  }
  return { ok: true, leadId: r.lead_id.toLowerCase(), profile: { objective, property_type, risk_tolerance, holding_period, areas } };
}

export interface LeadRef { created_at: string; quarantined: number; name: string; email: string; intent: string; lane: string | null }

export interface ProfileDeps {
  now(): Date;
  findLead(id: string): Promise<LeadRef | null>;
  upsertProfile(leadId: string, p: Profile, nowIso: string): Promise<'created' | 'updated'>;
  logEvent(type: string, leadId: string | null, detail: string): Promise<void>;
  notifyOwner(subject: string, text: string): Promise<void>;
}

export interface ProfileResult { status: number; body: { ok: boolean; error?: string; field?: string } }

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

export async function saveProfile(raw: unknown, deps: ProfileDeps): Promise<ProfileResult> {
  const v = validateProfile(raw);
  if (!v.ok) return { status: 400, body: { ok: false, error: 'invalid_input', field: v.field } };

  const lead = await deps.findLead(v.leadId);
  // Unknown id and quarantined lead give the same answer, so the route cannot be used to probe which ids exist.
  if (!lead || lead.quarantined) return { status: 404, body: { ok: false, error: 'invalid_link' } };
  const ageMs = deps.now().getTime() - new Date(lead.created_at).getTime();
  if (!(ageMs >= 0) || ageMs > PROFILE_WINDOW_DAYS * 24 * 3600 * 1000) return { status: 410, body: { ok: false, error: 'expired' } };

  const nowIso = deps.now().toISOString();
  const outcome = await deps.upsertProfile(v.leadId, v.profile, nowIso);
  await deps.logEvent(outcome === 'created' ? 'profile_saved' : 'profile_updated', v.leadId, JSON.stringify({ areas: v.profile.areas.length }));

  // Tell the owner once, on first save. Best effort: the profile is already stored.
  if (outcome === 'created') {
    const p = v.profile;
    try {
      await deps.notifyOwner(
        `[PROFILE] ${clean(lead.name)} · ${p.objective}`,
        [
          `Investor profile received for ${clean(lead.name)} (${clean(lead.email)}). Lane: ${lead.lane ?? '-'}   Intent: ${lead.intent}`,
          `Objective: ${p.objective}`, `Property type: ${p.property_type}`, `Risk tolerance: ${p.risk_tolerance}`,
          `Holding period: ${p.holding_period}`, `Preferred areas: ${p.areas.length ? p.areas.join(', ') : 'no preference'}`,
          '', `Lead ID: ${v.leadId}`,
        ].join('\n'),
      );
    } catch {
      await deps.logEvent('profile_alert_failed', v.leadId, 'owner alert could not be sent');
    }
  }
  return { status: 200, body: { ok: true } };
}
