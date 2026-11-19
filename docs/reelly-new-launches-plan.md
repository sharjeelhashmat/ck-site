# Reelly launch cards on /new-launches: design

Status: design only. The code for the public cards and project pages exists but is OFF (see "Gating"). Nothing from
Reelly is on any public page, in the sitemap or in any public API response. Owner request 2026-11-19; written with the
private research tool PR.

## What it is

Public project cards on /new-launches, each linking to a project page, fed from Reelly (a third-party property data
aggregator, Clients API v2, docs.reelly.ai). The same renderer and styles as the owner's private research tool
(`site/src/lib/launch-cards.mjs`, `site/src/styles/launch-cards.css`), so what the owner previews privately is exactly
what would go public.

## Gating (in code now, off)

A card or project page is built only when all of these hold:

1. `LAUNCH_CARDS_ALLOWED` in `site/src/lib/golive.ts`: the agency, its ORN, the broker's BRN and the advertiser permit
   are set. This is the same switch as "Launches I'm watching".
2. Per project, the existing launch-reviews rules (`checkLaunchReviews` in `site/src/lib/market.mjs`):
   - a Trakheesi permit number, and its QR as a self-hosted `/permits/<name>.png` or `.svg`;
   - the agency name and ORN;
   - `emirate` is `dubai`, or `abu_dhabi` only once `GOLIVE.abuDhabiLicensed`.
3. The project is listed in `site/src/data/reelly-launches.json` (ships empty). Each entry carries the Reelly payload
   (`reelly`, with its numeric `id`) and the compliance values above. The build checks every entry even while the gate is
   closed, and a bad entry stops the build (`site/src/lib/reelly-gate.mjs`).

The WhatsApp button on a project page also needs `LEAD_CAPTURE` (no service call to action in soft launch).

Tests (`site/tests/reelly-gate.test.mjs`) prove that the soft-launch and lead-capture builds contain no Reelly card,
project page (`/new-launches/<id>`), WhatsApp link for a launch, or Reelly text.

## Fields shown

**Card:**
- image;
- project name (links to the project page);
- area (district, region);
- developer;
- starting price (`min_price`, AED).

**Project page:**
- key facts: starting price and highest price, developer, area, handover (quarter from `completion_date`), sale status,
  construction status, escrow account number and service charge when given;
- payment plans: each plan's name and steps with percentages, noting payments after handover;
- unit types with price ranges (`typical_units`: type, bedrooms, from and to price in AED);
- units grouped by type and bedrooms: size range, price range, how many available (`GET /projects/{id}/units`);
- documents: marketing brochure, floor plans, general plan (https links only);
- the permit block: QR, permit number, agency and ORN;
- the WhatsApp button (only with `LEAD_CAPTURE`);
- the source line.

Fields that Reelly leaves empty are shown as "Not given" or left out. Nothing is estimated or filled in.

**Not shown publicly:**
- Reelly's own image URLs. The public CSP allows images from this site only, so a public card uses a self-hosted copy
  (`image`: `/launch-images/<name>.webp`, `.jpg` or `.png`) or no image.
- Reelly's free-text `overview`. It is marketing copy and would need its own review before publication.

## Source line wording

Proposed, on every card group and project page:

> Source: Reelly, a third-party property data aggregator, updated {date}. Its figures are tier 3 under Rules section 3
> and are not confirmed by the developer.

Where the developer confirms a figure (price list, payment plan, handover date), that figure can be raised to its proper
tier and its line changed to name the developer document. Until then every Reelly figure is labelled tier 3.

## Refresh cadence

- **Build-time snapshot, not live:** the public site is static, so the data is a snapshot taken when the site is built.
  The owner copies selected projects into `reelly-launches.json`, or a later script pulls them with the key held as a
  build secret.
- **Weekly refresh**, matching "Launch activity", plus a refresh before any project is first published.
- **Stale data:** a project whose Reelly `updated_at` is older than 30 days at build time should be flagged, or held back,
  before publication. This is to be added with the publishing script.
- **Prices:** Reelly's prices change without notice, so the public page shows the snapshot date in the source line.

## Open question: Reelly's display and attribution terms

Reelly's API docs (read 19 November 2026) say the key must stay server side. They do not say:
- whether listing data may be shown publicly on a consultant's own website;
- whether attribution to Reelly is required or allowed, and in what form ("Source: Reelly", logo, link);
- whether project images and documents may be copied and self-hosted;
- whether data shown publicly must be refreshed within a set time.

**Ask Reelly support in writing before go-live.** Until they answer, the proposed source line names Reelly in text with
no logo and no link. External links stay limited to the owner's LinkedIn, Instagram and Facebook (Rules 8d).

## Other prerequisites before go-live

- The public card copy (section heading "Launch details", button text "Ask Sharjeel on WhatsApp") needs owner approval.
  In this PR it is a placeholder that renders nowhere.
- Images: a way to download and self-host each project's cover image at build time, and the rights to do so (see the
  open question).
- Sitemap and noindex: the project pages follow /new-launches (noindex until `LAUNCH_CARDS_ALLOWED`; `astro.config.mjs`
  sitemap filter).
