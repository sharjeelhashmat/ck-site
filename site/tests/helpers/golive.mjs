// Test-only go-live values for builds that must be public (indexable). Production never sets GOLIVE_OVERRIDES; the
// committed golive.ts values stay empty (tests/golive.test.mjs checks that).
export const GOLIVE_TEST = JSON.stringify({ indexing: true, agencyName: 'Example Agency', agencyBrn: 'TEST-BRN', advertiserPermitNo: 'TEST-PERMIT' });
