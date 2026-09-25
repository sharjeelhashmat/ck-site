# "Where I operate" component — findings

Work order: remove the "Where I operate" card (Downtown Dubai, Dubai Hills, Dubai Islands, Palm Jebel Ali,
Dubai Marina, Dubai Creek Harbour, Palm Jumeirah, Dubai Maritime City) because it reads as a fixed, limited
service area and contradicts the site's UAE-wide positioning.

## What was found (before any edits, on `phase2-site` at `c3db448`)

- The component existed in exactly one place: the homepage (`/`), in `src/pages/index.astro`, inside the
  "Buying in the UAE from abroad" section. It was a standalone card written directly into that page (a `.card`
  with a "Where I operate" kicker and a list built from `AREAS` in `src/lib/areas.ts`).
- It was not a shared component and was not part of any shared layout. `src/layouts/Base.astro`,
  `src/components/Nav.astro` and `src/components/Footer.astro` do not include it. No other page includes it.
- **It did not render on `/areas`.** `src/pages/areas/index.astro` is an area-guide index: a title, intro copy,
  and a grid of cards that each link to an area guide page (`/areas/<slug>`) with that area's overview. It has
  no "Where I operate" card and nothing that presents the areas as a service area.

## What was done

- Removed the card from the homepage, plus its now-unused `AREAS` import. The "Buying in the UAE from abroad"
  copy and its CTA stay; that section now shows just the text column.
- **Nothing on `/areas` was touched.** The `/areas` page, the `/areas/*` guide pages, the nav item and the
  llms.txt listing are unchanged.
- Individual community names elsewhere (the area guides, `src/lib/areas.ts`, page metadata) are out of scope
  and were left as they are.
