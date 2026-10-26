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
| Market events and project trackers | Rules `src/lib/changes.mjs`, loader `loadChanges()` in `src/lib/intel-data.mjs`; see the section below |

## Rules the build enforces
- Only `status: "published"` records are built. `draft`, `verified` and `archived` are never built.
- A published record that breaks a rule fails the build and prints why. A published record that is merely past a review window (price 14 days, income 30, comparables, supply and area 90, or its `reviewBy` date) is stale: opportunities are left out of the build until re-verified; articles stay up with a review banner and stop counting toward the Insights gate.
- No source means Unverified. BUY is refused while any factor is Unverified. Entry needs 3 comparables and Yield needs an income claim, otherwise both must be rated Unverified.
- Property analysis needs both "could work" and "could fail"; every Brief needs risks, what would change my view, and a permit number.
- Insights is noindex and out of the sitemap until 3 non-stale articles are published. An area page is noindex until its three snapshot figures are sourced and inside 90 days. `/opportunities` is noindex while empty.

## Publishing (owner approval first)
1. Draft a record with `status: "draft"`. 2. Every claim gets a source record and is verified. 3. Owner approves. 4. Flip `status` to `published` and deploy (the GitHub production approval applies as always).

## Market events and project trackers ("What's changing here")
Government announcements that affect property (metro, rail, roads, airports, regulation, master plans), shown on every area page they name and on one tracker page per major project (PR 3, owner decision 2026-10-18). The site records official announcements only and never predicts prices or values.

| Piece | Where |
|---|---|
| Events | `src/data/market-events.json`: one JSON array of events |
| Projects | `src/data/projects/<slug>.json`: one file per project; the file name is the slug |
| Rules | `src/lib/changes.mjs` (one source of truth: the loader, the sitemap filter and the tests import it) |
| Area pages | "What's changing here" section in `src/pages/areas/[slug].astro` |
| Trackers | `src/pages/projects/index.astro` (`/projects`) and `src/pages/projects/[slug].astro` |
| Tests | `tests/changes.test.mjs`; browser check `tests/e2e/changes.e2e.mjs` (fixtures only) |

Event fields: `id` (kebab-case), `title`, `emirate` ("Dubai", "Abu Dhabi" or "UAE federal"), `category` ("Metro/tram", "Rail", "Roads/bridges", "Airport", "Regulation/fees", "Visa/ownership", "Master plan/zone" or "Public facility"), `status` ("Announced", "Approved", "Under construction", "Opening", "Open" or "Cancelled"), `officialDate` (free text exactly as the source states it; may be empty), `announcedOn` (YYYY-MM-DD), `areas` (area slugs), `project` (optional project slug), `summary` (at most 280 characters), `source` (`name`, `url`, `publishedOn`, `verifiedOn`, `tier`).

Project fields: `slug`, `name` (at most 60 characters: it is the page title), `emirate`, `category`, `operator`, `summary` (at most 280 characters), `areas`, `timeline` (entries of `date` YYYY-MM-DD, `status`, `note`, `source`), `reviewBy` (YYYY-MM-DD).

### Rules the build enforces
Any broken rule fails the build and every reason is printed.
- Every source (events and timeline entries) is tier 1, its url is https, its dates are real YYYY-MM-DD dates and `verifiedOn` is not in the future.
- Every area slug is one of the 16 area guide pages (`src/data/area-guides.json`). Every `event.project` matches a `projects/*.json` slug. An event names at least one area or a project, so it always appears somewhere.
- Banned claims (owner rule: no price predictions from infrastructure news), case-insensitive, as whole words with their plurals and the listed stems, in every event title and summary and every project name, summary and timeline note: price, prices, appreciat, value will, boost, surge, ROI, yield, investment opportunity, best area, must-buy, guaranteed.
- Ids and slugs are unique; emirate, category and status come from the lists above.
- A "Cancelled" event is valid and stays listed with a Cancelled badge. Nothing is deleted silently.

### What the pages do
- Area page: events that name the area, newest `announcedOn` first, at most 6, each with its status, official date (when given), summary, source and verified date, and a link to the project tracker when it has one. An event verified more than 180 days ago shows "last checked <date>" instead. No events: no section.
- `/projects`: noindex and out of the sitemap until at least one tracker is current. Linked from the bottom of `/insights` only; no header link.
- `/projects/<slug>`: status (the latest timeline entry), operator, emirate, areas served, timeline oldest first with sources, the fixed line "This page records official announcements only. It does not predict prices or values." and the standard advice line. Past `reviewBy`: the stale banner, noindex, out of the sitemap, until it is updated.

### Publishing
Publishing = the Coordinator adds owner-approved register rows (the Notion register) as data in a PR; the owner merges and deploys. No event or project is written from any other source, and the data shipped with PR 3 is empty.

## Known limits
- The site is static, so "stale" only takes effect on the next build. A scheduled rebuild needs a workflow change under `.github/`, which is owner-controlled, and a deploy that waits for approval cannot run unattended. See the report to the owner.
- "Save as PDF" uses the browser's print dialog and print stylesheet. A server-generated PDF is not built yet.
- The investor profile step is live in the site source (switched ON 2026-09-21): the Worker route was deployed by the owner (deploy-worker run #9) and the Privacy §2 line is approved. The Worker code is on `main`; the proposal folder `docs/proposals/investor-profile-step2/` is kept as the record.
