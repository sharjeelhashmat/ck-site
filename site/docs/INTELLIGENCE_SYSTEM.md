# Investment Intelligence System v1.0: how the site implements it

Design: the "Sharjeel Hashmat Investment Intelligence System v1.0" doc in the Claude project (decisions 1 to 7 approved 2026-09-21). This file only says where things live.

| Piece | Where |
|---|---|
| Rules (factors, verdicts, freshness windows, gates) | `src/lib/intel.mjs`. One source of truth; the pages, sitemap and tests all import it |
| Loader | `src/lib/intel-data.mjs` (reads `src/data/opportunities/*.json` and `src/data/insights/*.json`) |
| Property Brief (12 sections) | `src/components/Brief.astro`, page `src/pages/opportunities/[slug].astro`, list `src/pages/opportunities/index.astro` |
| Insights | `src/pages/insights.astro`, `src/pages/insights/[slug].astro` |
| Area snapshot | `AreaDetails.snapshot` in `src/lib/areas.ts`, rendered by `src/pages/areas/[slug].astro` |
| Freshness report | `npm run freshness` (`scripts/freshness.mjs`), read-only |
| Tests | `tests/intel.test.mjs`, fixtures in `tests/helpers/fixtures.mjs` (fake data, never shipped) |

## Rules the build enforces
- Only `status: "published"` records are built. `draft`, `verified` and `archived` are never built.
- A published record that breaks a rule fails the build and prints why. A published record that is merely past a review window (price 14 days, income 30, comparables, supply and area 90, or its `reviewBy` date) is stale: opportunities are left out of the build until re-verified; articles stay up with a review banner and stop counting toward the Insights gate.
- No source means Unverified. BUY is refused while any factor is Unverified. Entry needs 3 comparables and Yield needs an income claim, otherwise both must be rated Unverified.
- Property analysis needs both "could work" and "could fail"; every Brief needs risks, what would change my view, and a permit number.
- Insights is noindex and out of the sitemap until 3 non-stale articles are published. An area page is noindex until its three snapshot figures are sourced and inside 90 days. `/opportunities` is noindex while empty.

## Publishing (owner approval first)
1. Draft a record with `status: "draft"`. 2. Every claim gets a source record and is verified. 3. Owner approves. 4. Flip `status` to `published` and deploy (the GitHub production approval applies as always).

## Known limits
- The site is static, so "stale" only takes effect on the next build. A scheduled rebuild needs a workflow change under `.github/`, which is owner-controlled, and a deploy that waits for approval cannot run unattended. See the report to the owner.
- "Save as PDF" uses the browser's print dialog and print stylesheet. A server-generated PDF is not built yet.
- The investor profile step is live in the site source (switched ON 2026-09-21): the Worker route was deployed by the owner (deploy-worker run #9) and the Privacy §2 line is approved. The Worker code is on `main`; the proposal folder `docs/proposals/investor-profile-step2/` is kept as the record.
