# Compass Key (sharjeelhashmat.com)

Personal real estate brand site and lead engine for Sharjeel Hashmat, Real Estate Consultant, UAE. Private repo.

## State (2026-09-21)

| Part | State |
|---|---|
| `site/` static Astro site | Built and tested. Staging live on Cloudflare Workers at `ck-site-web.sharjeelhashmat.workers.dev` (noindex). |
| `worker/` lead API (`ck-lead-worker`) | Live on Cloudflare (D1 `ck-leads`, KV `ck-kv`, email via Resend). Routes `POST /lead` and `POST /profile`. `OUTBOUND` gate still controls sending. |
| Public launch | **Blocked only by the BRN.** The public build refuses `PUBLIC_INDEXABLE=true` without `PUBLIC_BRN`. |
| Old site (Next.js on Vercel) | In maintenance mode until cutover. |
| Real end-to-end enquiry test | Not done. Turnstile and the Worker CORS only allow the real domains, so it happens right after cutover. |

Tests run in CI on every change (`npm test` in `site/`; `npx vitest run` in `worker/`). Numbers are not repeated here because they drift; the workflow logs are the source.

## Layout

- `site/` Astro site. `site/src/data/` holds Insights articles and opportunities; `npm run freshness` reports stale records. `site/docs/` holds the migration doc and the approval record.
- `worker/` Cloudflare Worker: intake, scoring, lanes, D1, acknowledgment templates, investor-profile route.
- `guardrails/` owner-controlled policy (autonomy boundary, email identity). Claude may not edit `guardrails/` or `.github/`.
- `.github/workflows/` `ci.yml` (worker checks), `deploy.yml` (worker deploy), `deploy-site.yml` (site build, test, deploy behind the `production` environment approval).

## What the lead engine does

`POST /lead` -> Turnstile -> validation -> firewall -> deterministic score -> lane -> D1 with attribution -> one acknowledgment from an approved template -> alert to the owner. No LLM in this path. Enquiries and investor profiles are not shared with any brokerage.

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

1. `OUTBOUND` is off by default. 2. Outbound stays blocked until BRN, affiliation, URLs, sender addresses, Reply-To, alert address, email key, unsubscribe secret and `MAILBOX_CONFIRMED=yes` are set. Automated senders use a subdomain, never the root domain. Newsletter-stream templates can never go out through the lead pipeline. 3. A template sends only if its hash is in the approved list; one edited word voids approval. 4. Unsubscribes honoured; daily cap 45 (Resend free allows 100 a day); failures contained. 5. Lead free text never reaches a model or a reply.

## Site rules enforced by tests

Title "Real Estate Consultant" only. Public email hello@sharjeelhashmat.com only. Royals Field Properties named beside the BRN (`SITE.brokerage`). Seven-factor methodology wording. No trademark symbol. Figure-source rule: every figure in an article carries a numbered source and at least one tier 1 or tier 2 source. Insights is indexable only after 3 non-stale published articles.

## Free-plan facts (Cloudflare docs, checked 2026-09-19)

Workers Free: 100,000 requests/day, 10 ms CPU per invocation (I/O wait not counted). D1 Free: 5M rows read/day, 100k rows written/day, 5 GB. KV Free: 100k reads/day, 1,000 writes/day. Turnstile Free: up to 20 widgets, 10 hostnames per widget. A lead writes roughly 7 D1 rows.

## Release (owner steps; DNS, credentials and billing are hard stops for the system)

1. Worker secrets in the Cloudflare dashboard: `TURNSTILE_SECRET`, `RESEND_API_KEY`, `UNSUB_SECRET` (32+ random bytes), `ALERT_EMAIL`, optional `SCORING_JSON`. Repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
2. Staging: Actions > deploy-site > Run workflow with `public` off. The `production` environment approval is the publishing gate.
3. Public: set repo variable `BRN`, run deploy-site with `public` on, approve `production`.
4. Cutover: custom domains on Worker `ck-site-web`, Turnstile widget hostnames (`sharjeelhashmat.com`, `www.sharjeelhashmat.com`), submit `sitemap-index.xml` in Search Console, turn on branch protection on `main` (require PR, require checks, require Code Owner review), decide the legacy Firestore leads.
5. Verify: a real enquiry and a real investor profile end to end, then check the D1 rows. Then take the old Vercel site out of maintenance.
6. Before every rebuild run `npm run freshness` in `site/` and re-check undated DLD fee pages.

Kill switches: repository variable `AUTONOMY=off` stops maintenance workflows; Worker variable `OUTBOUND=off` stops all outbound messages.

## Known limits

- Pause-on-reply arrives with the nurture job (later phase). Until then only the single acknowledgment exists.
- Escalation keywords: English plus four Arabic terms; extend from real messages.
- `worker/.npmrc` sets `legacy-peer-deps=true` (npm 10 peer-set bug) and a `sharp` override.
- The Brief PDF is browser print only; no server-generated PDF.
- Legacy leads in Firebase project `personal-brand-a6154` must be exported to D1 and Firebase retired before the 4 Dec 2026 billing cliff.
