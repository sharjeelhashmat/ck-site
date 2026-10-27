# Compass Key (sharjeelhashmat.com)

Personal real estate brand site and lead engine for Sharjeel Hashmat, Real Estate Consultant, UAE. Public repo: no secrets, personal data or private account details belong in it.

## State (2026-09-21)

| Part | State |
|---|---|
| `site/` static Astro site | Built and tested. Two Workers serve the same build: `ck-site-web` = production (noindex today; goes public at go-live), `ck-site-staging` = previews (always noindex, behind Cloudflare Access). |
| `worker/` lead API (`ck-lead-worker`) | Live on Cloudflare (D1 `ck-leads`, KV `ck-kv`, email via Resend). Routes `POST /lead` and `POST /profile`. Three channel switches (`OUTBOUND_REPLIES`, `OUTBOUND_NEWSLETTER`, `OUTBOUND_ALERTS`) control sending; replies and the newsletter are off. |
| Public launch | **Blocked by the go-live values.** The public build refuses `PUBLIC_INDEXABLE=true` until `site/src/lib/golive.ts` has indexing, the agency name, the agency's ORN, the broker's own BRN and the advertiser permit. |
| Old site (Next.js on Vercel) | In maintenance mode until cutover. |
| Real end-to-end enquiry test | Not done. Turnstile and the Worker CORS only allow the real domains, so it happens right after cutover. |

Tests run in CI on every change (`npm test` in `site/`; `npx vitest run` in `worker/`). Numbers are not repeated here because they drift; the workflow logs are the source.

## Layout

- `site/` Astro site. `site/src/data/` holds Insights articles and opportunities; `npm run freshness` reports stale records. `site/docs/` holds the migration doc and the approval record.
- `worker/` Cloudflare Worker: intake, scoring, lanes, D1, acknowledgment templates, investor-profile route.
- `guardrails/` owner-controlled policy (autonomy boundary, email identity). Claude may not edit `guardrails/`. Claude Code may change .github/ only when a Coordinator brief names the files; every change passes workflow-guard.
- `.github/workflows/` `ci.yml` (worker checks; site build, tests, launch-readiness check, accessibility and Lighthouse), `deploy.yml` (worker deploy), `deploy-site.yml` (site build, test, deploy to `ck-site-web` behind the `production` environment approval), `deploy-staging.yml` (the same build, always noindex, to `ck-site-staging`, also behind `production`), `uptime.yml` (every 30 minutes, targets in `.github/uptime-targets.json`), `readiness.yml` (daily read-only checks of production D1, see Readiness check).

## Production and staging

| Worker | Config | Deployed by | Role |
|---|---|---|---|
| `ck-site-web` | `site/wrangler.jsonc` | deploy-site (`confirm_target` ck-site-web) | Production. Goes public at go-live (custom domains, `public` on); its workers.dev URL is switched off in the go-live PR. |
| `ck-site-staging` | `site/wrangler.staging.jsonc` | deploy-staging (`confirm_target` ck-site-staging) | Previews. Always built with `PUBLIC_INDEXABLE=false` (workflow-guard R16), workers.dev only, Cloudflare Access for the owner only (ADR-003). |

The Worker's `STAGING_ORIGIN` is `https://ck-site-staging.sharjeelhashmat.workers.dev`: enquiries from staging are stored quarantined as TEST (no alert, no reply). No CI check and no uptime target calls the staging host, so Access breaks nothing.

## What the lead engine does

`POST /lead` -> rate limit -> body limit -> Turnstile (hostname and action) -> validation -> firewall -> deterministic score -> lane -> D1 with attribution -> outbox claim -> one acknowledgment from an approved template -> alert to the owner (after the response). No LLM in this path. Enquiries and investor profiles are not shared with any brokerage.

| Lane | Reply | Owner |
|---|---|---|
| Priority 81+ | Acknowledgment + booking link | Instant alert |
| Qualified 61-80 | Acknowledgment + booking + approach page | Digest |
| Nurture 41-60 | Acknowledgment (+ weekly-note opt-in if ticked) | Digest |
| Cold <41 | One acknowledgment + approach page | Digest |
| Seller | Checklist, never a value | Instant if 61+ |
| Abroad | Time-zone-aware booking | Instant if 61+ |
| Partner / media / other | "If there is a fit, you will hear from me" | Digest |
| Escalated (complaint, legal, guarantee, negotiation, other broker, urgent) | Neutral acknowledgment | Instant |
| Spam / duplicate / suspicious | Nothing; quarantined, not deleted | Weekly sample |

## Gates (enforced in code and tests)

1. `OUTBOUND_REPLIES` and `OUTBOUND_NEWSLETTER` are off by default (`OUTBOUND_ALERTS` is on). 2. Replies and the newsletter stay blocked until BRN, AGENCY_ORN, affiliation, URLs, sender addresses, Reply-To, alert address, email key, unsubscribe secret and `MAILBOX_CONFIRMED=yes` are set (owner alerts need only their switch, sender, address and key). Automated senders use a subdomain, never the root domain. Newsletter-stream templates can never go out through the lead pipeline. 3. A template sends only if its hash is in the approved list; one edited word voids approval. 4. Unsubscribes honoured; daily cap 45 replies, counted in the outbox claim (Resend free allows 100 a day); failures contained and never resent automatically. 5. Lead free text never reaches a model or a reply.

## Site rules enforced by tests

Title "Real Estate Consultant" only. Public email hello@sharjeelhashmat.com only. ORN = the agency (RERA Office Registration Number), BRN = the broker (the number on the RERA broker card). The line "Working with <agency> · ORN <orn> · BRN <brn>" shows only when `agencyName`, `agencyOrn` and `brokerBrn` are all set in `site/src/lib/golive.ts`; today all are empty, so no agency, ORN or BRN line is shown. The Worker's email affiliation line is "<AFFILIATION> · ORN <AGENCY_ORN> · BRN <BRN>". Seven-factor methodology wording. No trademark symbol. Figure-source rule: every figure in an article carries a numbered source and at least one tier 1 or tier 2 source. Insights is indexable only after 3 non-stale published articles.

## Free-plan facts (Cloudflare docs, checked 2026-09-19)

Workers Free: 100,000 requests/day, 10 ms CPU per invocation (I/O wait not counted). D1 Free: 5M rows read/day, 100k rows written/day, 5 GB. KV Free: 100k reads/day, 1,000 writes/day. Turnstile Free: up to 20 widgets, 10 hostnames per widget. A lead writes roughly 7 D1 rows.

## Release (owner steps; DNS, credentials and billing are hard stops for the system)

1. Worker secrets in the Cloudflare dashboard: `TURNSTILE_SECRET`, `RESEND_API_KEY`, `UNSUB_SECRET` (32+ random bytes), `ALERT_EMAIL`, optional `SCORING_JSON`. Repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
2. Staging: Actions > deploy-site > Run workflow with `public` off. The `production` environment approval is the publishing gate.
3. Public: fill in `site/src/lib/golive.ts` (merged through a PR), then run deploy-site with `public` on and approve `production`: one dispatch.
4. Cutover: custom domains on Worker `ck-site-web`, Turnstile widget hostnames (`sharjeelhashmat.com`, `www.sharjeelhashmat.com`, `ck-site-staging.sharjeelhashmat.workers.dev`; the Worker also checks the hostname and action, see Turnstile), submit `sitemap-index.xml` in Search Console, turn on branch protection on `phase2-site`, the branch every deploy runs from (require PR, require the four CI checks, require Code Owner review), decide the legacy Firestore leads.
5. Verify: a real enquiry and a real investor profile end to end, then check the D1 rows. Then take the old Vercel site out of maintenance.
6. Before every rebuild run `npm run freshness` in `site/` and re-check undated DLD fee pages.

Kill switches: to stop the weekly sync, Actions > market-data-sync > Disable workflow; Worker variables `OUTBOUND_REPLIES`, `OUTBOUND_NEWSLETTER` and `OUTBOUND_ALERTS` set to `off` stop each channel (see Switches).

## Data retention and erasure

The Worker's daily cron (`17 1 * * *`, `worker/src/retention.ts`) applies this in one D1 batch (owner decision 2026-10-17):

| Data | Kept |
|---|---|
| Leads with status SPAM, TEST or DUPLICATE | 30 days after `created_at` |
| All other leads | 24 months (730 days) after `created_at` |
| Investor profiles | Deleted once their lead no longer exists |
| Events (log rows) | 12 months |
| Message log (`messages`: one row per email sent) | 24 months (730 days) after `created_at` |
| Outbox (`outbox`: one row per send decision, with its receipt) | 24 months (730 days) after `created_at` |
| Unverified phone as typed (`leads.phone_raw`) | With its lead (part of the lead row) |
| Newsletter subscribers, active | While subscribed |
| Unsubscribe feedback text (`unsubscribe_reason_detail`) | 180 days after the feedback |
| Newsletter subscribers, unsubscribed | 24 months; then the address is replaced by its SHA-256 hash (so the opt-out still holds) and the other personal fields are cleared |

Every run also writes one row to `retention_runs` (migration 0006; `outbox` count added by 0007): run time, the rows each rule removed or cleared, ok, and a redacted error on failure. Rows are kept 400 days. No HTTP route exposes the table (owner decision G08); a private GitHub readiness workflow reads it.

## Worker logs

Workers Logs are on (`[observability]` in `worker/wrangler.toml`, free plan 200,000 events a day). Invocation logs (request URL and headers) are off and query strings are redacted (unsubscribe links from before PR 2c carried the address; current ones carry an opaque token). The Worker's own console lines hold fixed text, counts or an error message with addresses and phone numbers redacted (`worker/src/log.ts`); `worker/test/wrangler-config.test.ts` pins every console call.

Restore and rollback drills (owner runs them): `docs/runbooks/d1-restore-drill.md` and `docs/runbooks/rollback-drill.md`.

Erasure request for one person:
1. In `worker/`: `node scripts/erase-person.mjs person@example.com > erase.sql`. The script only prints SQL; it never connects to D1. It refuses anything that is not a plain address.
2. Read `erase.sql`. It deletes the person's leads and, through their lead ids, investor profiles, events, message log rows and outbox rows (and the outbox welcome row keyed by their hash); the newsletter row keeps only the address's hash, marked unsubscribed.
3. Run it: `npx wrangler d1 execute ck-leads --remote --file erase.sql` (one `--file` import is atomic). Delete `erase.sql` afterwards.

## Outbox (PR 2c item 1; gaps G01, G02, G06)

Every message the Worker sends (lead reply, newsletter welcome, owner alert) first claims one row in `outbox` (migration 0007) with a single `INSERT ... SELECT ... WHERE <cap> AND <guard> ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`. No row back means do not send. The row then holds the receipt: `sent` with the provider id and `sent_at`, or `failed` with an error code (never the payload). A send has an 8 s timeout and carries the row id as idempotency key (Resend `Idempotency-Key` header; Brevo `headers.idempotencyKey`). An answer without a message id is a failure.

| Kind | dedupe_key | Guard in the claim |
|---|---|---|
| `lead_reply` | `lead_reply:<lead id>:<template>` | Daily cap (`DAILY_SEND_CAP`, lead_reply rows claimed or sent since 00:00 UTC); no other reply claimed, sent or failed to the same address in 24 h |
| `newsletter_welcome` | `newsletter_welcome:<sha256 of the address>:monthly` | Same cap, counting replies and welcomes together |
| `owner_alert` | `owner_alert:lead\|not_stored\|profile:<lead id>` | None; not counted against the cap |

Every lead except SPAM and staging TEST leaves a `lead_reply` row: `sent`, or `skipped` with the reason in `error` (`suppressed`, `daily_cap`, `duplicate`, `quarantined` mean no reply was due; `blocked`, `not_approved` and the like mean the gates are shut). Owner alerts go out after the response (`ctx.waitUntil`), except the not-stored alert, which is awaited. No column holds an email address, phone or name. A `failed` row is never resent automatically; the readiness check reports it. The `messages` table stays as send history; the outbox is the source of truth for "was it sent".

## Switches (PR 2c item 5; gap G07)

| Variable | wrangler.toml | Opens | Also needs |
|---|---|---|---|
| `OUTBOUND_REPLIES` | `off` | Replies to leads | Every go-live check (BRN, AGENCY_ORN, affiliation, booking, senders, Reply-To, mailbox, key, unsubscribe secret) |
| `OUTBOUND_NEWSLETTER` | `off` | The newsletter welcome | The same checks plus `FROM_NEWS_EMAIL` |
| `OUTBOUND_ALERTS` | `on` | Owner alerts (lead, investor profile) | Alert sender, `ALERT_EMAIL`, email key |

The old single `OUTBOUND` is no longer set. For one release the Worker still reads it, only for a reply or newsletter switch that is missing, and logs `config: OUTBOUND is deprecated`. Staging enquiries stay quarantined (no reply, no alert) whatever the switches say.

## Turnstile (PR 2c item 2; gap G03)

A token passes only when siteverify says success, the widget ran on `sharjeelhashmat.com`, `www.sharjeelhashmat.com` (from `SITE_URL`) or the `STAGING_ORIGIN` host, and its action matches the form: `lead` on `/lead`, `newsletter` on the signup (the site's widgets set `data-action`). `/profile` has no widget: its capability is the lead id. A rejection logs its reason code only, never the token. The site build that sets the actions must be live before, or with, the Worker that checks them.

## Rate limits and body limit (PR 2c item 4; gap G05)

Per IP and minute, with the Workers Rate Limiting binding (`[[ratelimits]]` in `worker/wrangler.toml`): `/lead`, `/profile` and the newsletter signup 5 each, both unsubscribe routes 20 each, the unsubscribe feedback 10, every other GET 60. `/health` and preflights are exempt. Over the limit: 429 with `Retry-After: 60` and the route's CORS header. Keys hold a hash of the IP. Counts are per Cloudflare location and approximate (Cloudflare's own caveat), so Turnstile stays the gate on the forms; a missing or failing limiter lets the request through and logs one line. Free plan: the binding has no charge of its own (its calls are ordinary Workers requests); see https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ and the PR 2c report for the check. This replaces the planned post-launch move of the API to api.sharjeelhashmat.com (audit F4, closed).

Every POST body is read as a byte stream and cut off at 8192 bytes (`/profile` 4096) with 413 before anything parses it; a larger `Content-Length` is refused without reading. A 413 or 429 carries the route's CORS header.

## Unsubscribe links (PR 2c item 8a)

Links carry `v2.<list>.<sha256 of the address>.<HMAC with UNSUB_SECRET>`, never the address: `/unsubscribe?t=` (list `leads`, the suppression table) and `/api/newsletter/unsubscribe?token=` (list `monthly`, matched on `newsletter_subscribers.email_hash`, migration 0009). The old formats (`?e=<address>&t=` and the base64 newsletter token) work until `LEGACY_UNSUB_UNTIL` (2027-01-01, `worker/src/unsub.ts`) and log only `unsubscribe: legacy link used`.

## Readiness check (PR 2c item 6; gap G08)

No public route shows configuration, switch state or counts: `/health` answers exactly `{"ok":true}`. Instead `.github/workflows/readiness.yml` runs daily at 05:23 UTC (and by hand), unattended in the `market-data` environment (no required reviewer) with its existing D1-only token `CF_D1_TOKEN`, and runs read-only SELECTs (`.github/scripts/readiness.mjs`) against production D1:

| Check | FAIL when |
|---|---|
| `retention` | The newest `retention_runs` row is older than 36 h or not ok (none at all counts as unknown) |
| `outbox-stuck` | An outbox row has been `claimed` for more than 15 min |
| `outbox-failed` | An outbox row failed in the last 24 h |
| `market-data` | The newest written DLD run finished more than 8 days ago (none = unknown) |
| `replies` | Only when the repository variable `REPLIES_LIVE` is `yes` (set at go-live, Runbook step 5.4): a lead that is not TEST or SPAM, 15 min to 24 h old, has no `lead_reply` row that is `sent` or `skipped` for `suppressed`, `daily_cap`, `duplicate` or `quarantined` |

An unknown answer is read again after 60 s; unknown twice is FAIL. Any FAIL fails the job, so GitHub emails the owner. The repository is public and so are the logs: the job prints only `<check>: PASS` or `<check>: FAIL`, with no counts, timestamps, ids or values, no step summary and no artifact (workflow-guard R17, which also pins the `market-data` environment and its two secrets; no other workflow but market-data-sync may use that environment).

## Delivery proof (PR 2c item 7; gap G11)

Tests use a mocked provider for every path. Real delivery is proven by the owner with `worker/scripts/delivery-smoke.ts`:

1. Put `RESEND_API_KEY=<key>` in `worker/.dev.vars` (git-ignored; the script never reads or prints it). The sender domains must be verified in Resend: `mail.sharjeelhashmat.com` for replies, `news.sharjeelhashmat.com` for the welcome.
2. In `worker/`: `npx tsx scripts/delivery-smoke.ts --confirm staging-local`. It starts this Worker locally (`wrangler dev --local`, a throwaway local D1 and KV; production D1 is not touched) with the test switch for that run only (`ALLOW_TEST_TURNSTILE=yes` with Cloudflare's always-pass test secret; replies and the welcome on, owner alerts off), sends one lead reply to `delivered+reply-<run>@resend.dev`, one to `bounced+reply-<run>@resend.dev` and one welcome to `delivered+welcome-<run>@resend.dev` (Resend's test inboxes, https://resend.com/docs/dashboard/emails/send-test-emails), then checks three outbox rows `sent` with provider ids and prints one PASS or FAIL line each.
3. In Resend > Emails, the `bounced+` message must show Bounced (the Worker has no Resend webhook yet, so the bounce is checked there by hand).

Go-live runbook: after the switches go on, send one real email to the owner's own inbox (an enquiry from the live site with the owner's address) to confirm inbox placement, not spam. That send needs the owner's explicit yes at that moment.

## Known limits

- Pause-on-reply arrives with the nurture job (later phase). Until then only the single acknowledgment exists.
- Escalation keywords: English plus four Arabic terms; extend from real messages.
- `worker/.npmrc` sets `legacy-peer-deps=true` (npm 10 peer-set bug) and a `sharp` override.
- The Brief PDF is browser print only; no server-generated PDF.
- Legacy leads in the old Firebase project must be exported to D1 and Firebase retired before the 4 Dec 2026 billing cliff.
