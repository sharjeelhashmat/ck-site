# Compass Key: foundation pack, Phase 1 (lead engine + guardrails)

> **Current state (2026-09-20)** — this README's tables below are from 2026-09-19 and partly stale. Now: email provider is **Resend** (not Brevo), `EMAIL_PROVIDER="resend"`, `DAILY_SEND_CAP="45"`, 88 tests (71 unit + 17 workerd), `OUTBOUND` still off. Free hosting for the site is **Cloudflare Workers Static Assets** (not Pages, and not Vercel Hobby, which is non-commercial only). Phase 2 website: `site/` (static Astro), see `site/docs/MIGRATION.md`.

## Verification status
| Check | Result |
|---|---|
| Unit tests (Node) | 62 pass |
| **Runtime tests inside workerd (Cloudflare's runtime), real D1 SQLite + KV bindings** | **15 pass** |
| Typecheck (3 configs), template lint, workflow lint (actionlint), `npm audit` | clean |
| Bundle (`wrangler deploy --dry-run`) | 30.8 KiB / 9.6 KiB gzip; bindings recognised |
| Gates broken on purpose (BRN, template approval, CORS, Turnstile, stream guard, subdomain-sender guard) | tests fail, as they should |
| **Live on Cloudflare** | **Not yet.** Sandbox has no route to Cloudflare or the email provider (blocked hosts). First live run = deploy workflow + `worker/scripts/live-smoke.sh`. |

## What it does
`POST /lead` -> Turnstile -> validation -> firewall -> deterministic score (0-90 at intake) -> lane -> D1 with
attribution -> one acknowledgment from an approved template -> alert to you. No LLM in this path.

| Lane | Reply | You |
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
1. `OUTBOUND` is off by default. 2. Outbound stays blocked until BRN, affiliation, URLs, sender addresses, Reply-To, alert address, email key, unsubscribe secret and `MAILBOX_CONFIRMED=yes` are set. **BRN and the mailbox are pending, so nothing sends.** Automated senders must be on a subdomain, never the root domain. Newsletter-stream templates can never go out through the lead pipeline. 3. A template sends only if its hash is in the approved list; one edited word voids approval. 4. Unsubscribes honored; daily cap 80; failures contained. 5. Lead free text never reaches a model or a reply.

## Free-plan facts (official Cloudflare docs, checked 2026-09-19)
Workers Free: 100,000 requests/day, **10 ms CPU per invocation** (I/O wait not counted). D1 Free: 5M rows read/day, 100k rows written/day, 5 GB. KV Free: 100k reads/day, 1,000 writes/day (this Worker only reads KV). Turnstile Free: up to 20 widgets, unlimited challenges, 10 hostnames per widget. A lead writes roughly 7 D1 rows, so the write cap allows over 10,000 leads a day. Handler CPU has not been measured on Cloudflare: check the Worker's CPU-time metric after the first live leads.

## Run it on Cloudflare (owner steps; DNS, credentials and billing are hard stops)
1. Create a free Cloudflare account. In Workers & Pages, register your free `workers.dev` subdomain (one-time; CI cannot do it).
2. Create an API token (custom): Account > Workers Scripts: Edit, Workers KV Storage: Edit, D1: Edit, Account Settings: Read. [Likely sufficient; if a deploy fails on a permission, the log names it.]
3. GitHub repo (public, `ck-site`, this folder as contents): Settings > Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. `.github/CODEOWNERS` already names `@sharjeelhashmat`. Turn on branch protection on `main` only AFTER the first successful deploy: require PR, require the `worker` check, require Code Owner review.
4. Run the **deploy-worker** workflow (Actions > Run workflow). It type-checks, runs all 77 tests, deploys, applies D1 migrations, smoke-tests `/health` at the `WORKER_URL` in `wrangler.toml` (already set to `https://ck-lead-worker.sharjeelhashmat.workers.dev`), and rolls back on failure. If deploy refuses to auto-provision D1/KV, run **bootstrap-cloudflare** and paste the printed IDs into `wrangler.toml`.
5. Worker secrets (Cloudflare dashboard > Worker > Settings > Variables and Secrets): `TURNSTILE_SECRET`, `RESEND_API_KEY`, `UNSUB_SECRET` (random, 32+ bytes), `ALERT_EMAIL`, optional `SCORING_JSON`.
6. First live test: follow the header of `worker/scripts/live-smoke.sh` (uses a honeypot lead, so no reply or alert is triggered).
7. Go-live, in this order: create the mailbox and follow `guardrails/email-identity.md` (DNS, then `MAILBOX_CONFIRMED = "yes"`), approve templates (`TEMPLATES_FOR_APPROVAL.md`, then store hashes in KV key `approved_templates`), set `BOOKING_URL`, share BRN, set `OUTBOUND = "on"`.

## Known limits
- Pause-on-reply arrives with the nurture job (Phase 2). Until then no follow-up exists beyond the single acknowledgment.
- Brevo free-plan branding and triggered-send behavior unverified (fallback: Resend).
- Auto-provisioning of D1/KV on deploy is confirmed to parse, not to run.
- Escalation keywords: English plus four Arabic terms; extend from real messages.
- `npm` peer-set bug on npm 10 required `legacy-peer-deps=true` (`worker/.npmrc`) and a `sharp` override (patched advisory).
