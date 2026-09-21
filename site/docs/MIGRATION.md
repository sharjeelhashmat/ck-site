# Migration: Vercel/Next.js/Firebase site to Cloudflare Workers Static Assets

Status 2026-09-20: built and tested on branch `phase2-site`. NOT deployed. Nothing public has changed.

## 1. URL map (the "301 map")
The live sitemap (fetched 2026-09-20) lists 19 URLs. All 19 keep the same path on the new site, so there is nothing to redirect for them (test `every legacy URL still resolves` enforces it).

| Legacy | New | Note |
|---|---|---|
| `/`, `/buy`, `/invest`, `/sell`, `/areas`, `/new-launches`, `/insights`, `/about`, `/contact`, `/privacy`, `/terms` | same | |
| `/areas/{8 slugs}` | same | live but `noindex` until real details exist |
| `/admin`, `/admin/*` | 301 `/contact` | Firebase admin removed |
| `/properties`, `/properties/*` | 301 `/buy` | no listings ever published |
| `/new-launches/*` | 301 parent | no launches ever published |
| `/insights/*` | served by the site | no legacy articles existed; the Insights articles live at `/insights/<slug>`, so a wildcard redirect would hide them (found on staging 2026-09-21). Unknown slugs return the 404 page |
| `/opengraph-image` | 301 `/og.png` | |
| apex `sharjeelhashmat.com/*` | 301 `https://www.sharjeelhashmat.com/*` | Cloudflare redirect rule, owner step |
| `/investment-approach` | NEW | linked from 6 approved reply templates |

Canonical host is `www` (v1 decision). Worker CORS already allows both apex and www.

## 2. Cutover steps (owner steps are hard stops)
1. Owner: commit `deploy-site.yml` from `docs/deploy-site.yml.proposed`, create Environment `production` with himself as required reviewer, set repo variable `BRN` when known.
2. Claude: staging build to `ck-site-web.sharjeelhashmat.workers.dev` (noindex). Form posts are rejected by CORS there by design; test lead submission only after step 4.
3. Owner: Turnstile widget hostnames must include `sharjeelhashmat.com` and `www.sharjeelhashmat.com` (add the workers.dev host only if he wants to test forms on staging, and then also add it to the Worker's SITE_URL allow-list, which is owner-controlled code).
4. Owner approves copy in `CHANGES_FOR_APPROVAL.md` (Notion card "Approved").
5. Owner: BRN available, then run `deploy-site` with `public = true`.
6. Owner (DNS): in Cloudflare add the domain, or keep Namecheap DNS and point `www` CNAME to the Worker custom domain; add the apex-to-www redirect. Exact records are given at that moment. Keep the Vercel project untouched until the new site is verified, then it is a one-record rollback.
7. Claude: verify all 19 URLs return 200/301 as mapped, sitemap, robots, headers, one real test lead.
8. Search Console: owner verifies the property (account action); Claude submits the sitemap after that.

## 3. Rollback
DNS record back to Vercel (previous values: apex A 216.198.79.1, www CNAME per Vercel). The workflow also auto-rolls back a failed deploy.

## 4. Firebase decommission (owner decision, not started)
Existing Firestore `leads` documents are not in D1. Before anything is deleted: export them (Firebase console > Firestore > Export, or Claude reads them if given access) and decide whether to import into D1. Deletion is a hard stop.
