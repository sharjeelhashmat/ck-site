// Investor profile, step 2 of the enquiry flow (Investment Intelligence System v1.0, decision 6).
// The five fields are the same ones as section 11 of the Property Brief ("Investor fit").
// Values must match the Worker's validation (worker/src/profile.ts). tests/profile.test.mjs checks that they do.
import { AREAS } from './areas';

// ON since 2026-09-21: the Worker route POST /profile is deployed (deploy-worker run #9) and the owner approved the wording.
// While off: no link is shown after an enquiry, and the Privacy page does not mention the profile.
// PUBLIC_PROFILE_ENABLED=true/false overrides it for a build (the tests use this).
const PROFILE_DEFAULT = true;
const flag = (import.meta.env.PUBLIC_PROFILE_ENABLED as string | undefined) ?? '';
export const PROFILE_ENABLED = flag === 'true' ? true : flag === 'false' ? false : PROFILE_DEFAULT;

export const PROFILE_INTENTS = ['buy', 'invest', 'abroad'] as const;

export const PROFILE_OPTIONS = {
  objective: [
    { value: 'rental_income', label: 'Rental income' },
    { value: 'capital_growth', label: 'Capital growth' },
    { value: 'mix', label: 'A mix of both' },
    { value: 'residency', label: 'Residency' },
  ],
  property_type: [
    { value: 'apartment', label: 'Apartment' },
    { value: 'townhouse', label: 'Townhouse' },
    { value: 'villa', label: 'Villa' },
    { value: 'no_preference', label: 'No preference' },
  ],
  risk_tolerance: [
    { value: 'low', label: 'Low: protect the capital' },
    { value: 'moderate', label: 'Moderate: some ups and downs' },
    { value: 'high', label: 'High: accept risk of loss' },
  ],
  holding_period: [
    { value: 'under_2y', label: 'Under 2 years' },
    { value: '2_5y', label: '2 to 5 years' },
    { value: '5_10y', label: '5 to 10 years' },
    { value: '10y_plus', label: '10 years or more' },
  ],
} as const;

export const PROFILE_AREAS = AREAS.map((a) => ({ value: a.slug, label: a.name }));

export const PROFILE_PRIVACY_LINE =
  'If you choose to complete the optional investor profile, I also collect your investment objective, preferred property type, preferred areas, risk tolerance and intended holding period. It is stored with your enquiry, used only to match properties to you, and is never published or sent to social media or advertising tools.';
