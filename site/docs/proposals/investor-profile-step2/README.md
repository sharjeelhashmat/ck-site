# Investor profile, step 2: Worker change for your review

Status: PROPOSAL. Nothing here is deployed. The Worker, its tests, its migrations and its config are CODEOWNERS-protected, so I cannot commit them. Everything is ready to copy.

## What it does
After an enquiry (buy, invest or abroad) the site shows an optional link: "answer five short questions so I can match properties to you". The page (`/investor-profile`, already built on the site, noindex) posts five fixed-choice answers to a new Worker route `POST /profile`:
objective, property type, preferred areas (from the 8 area pages), risk tolerance, holding period. These are the same fields as section 11 of the Property Brief ("Investor fit").

## Rules built in (all tested)
- Write-only. The route never reads anything back, so it cannot leak a lead.
- Access is the random lead id returned by `POST /lead` (a UUID shown only to the person who just enquired). Unknown ids and quarantined (spam or suspicious) leads get the identical 404.
- Enquiry must be under 7 days old. CORS: your two site origins only. Body limit 4 KB.
- Fixed choices only, no free text, so nothing personal beyond the enquiry is stored.
- Does not touch the lead row, score or lane. Second save updates in place.
- You get one alert email on the first save (sent with the existing alerts sender, not a lead-reply template, so no template re-approval is needed).
- Data class Confidential: stored in D1 only.

## Apply (one commit to `main`)
Copy from this folder, from the repo root:

| From | To |
|---|---|
| `profile.ts.proposed` | `worker/src/profile.ts` (drop the `.proposed`) |
| `index.ts.patch` | apply with `patch -p1 < site/docs/proposals/investor-profile-step2/index.ts.patch` (changes `worker/src/index.ts`) |
| `0002_investor_profiles.sql` | `worker/migrations/0002_investor_profiles.sql` |
| `profile.test.ts.proposed` | `worker/test/profile.test.ts` |
| `profile.runtime.test.ts.proposed` | `worker/runtime/profile.test.ts` |

The patch was generated against `worker/src/index.ts` as it is on `main` today (SHA-256 starts `716fd925e8fb`) and applies cleanly.

`deploy.yml` then does the rest: typecheck, all tests, `wrangler deploy`, `wrangler d1 migrations apply ck-leads --remote` (the migration is additive: one new table, no existing table touched), smoke test, auto-rollback.

Checked locally on a copy of the Worker: `tsc` clean on all three tsconfigs; 114 of 114 tests pass (91 unit incl. 23 new, 23 on workerd with real D1 incl. 6 new). Breaking the quarantine check or the 7-day check makes the new tests fail.

## Then (me, after your Worker deploy is green)
1. Change `PROFILE_DEFAULT` to `true` in `site/src/lib/profile.ts`. That switches on the link after enquiries and adds the Privacy §2 line (and moves the Privacy date to 21 September 2026).
2. Staging deploy for your Approve click.

## Two deviations from the design doc
- The design says the acknowledgement EMAIL links to the profile page. The email templates are approved by hash, so changing them means re-approval. I put the link on the confirmation shown right after the form is sent instead. If you want it in the email too, that is a template change through your approval process.
- The link shows only on that confirmation screen. Someone who closes the tab does not get it. The alternative is the email link above.

## Privacy §2 line (needs your approval; appears only when the feature is switched on)
"If you choose to complete the optional investor profile, I also collect your investment objective, preferred property type, preferred areas, risk tolerance and intended holding period. It is stored with your enquiry, used only to match properties to you, and is never published or sent to social media or advertising tools."

## Not decided by me
Whether profiles are shared with Royals Field Properties. The line above does not say either way. It stays consistent with your open question on whether enquiries are shared with the brokerage.
