// Test-only go-live values for builds that must be public (indexable) with the full go-live set: the agency, its ORN, the
// BRN and the permit, outside soft launch (lead capture on). Production never sets GOLIVE_OVERRIDES; the committed golive.ts
// values stay empty and in soft launch (tests/finish-all.test.mjs checks that).
export const GOLIVE_TEST = JSON.stringify({ indexing: true, softLaunch: false, agencyName: 'Example Agency', agencyOrn: 'TEST-ORN', brokerBrn: 'TEST-BRN', advertiserPermitNo: 'TEST-PERMIT' });
