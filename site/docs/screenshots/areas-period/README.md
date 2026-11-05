# /areas period: before and after, for owner approval

Dubai now shows its own latest year to date (1 January to the last complete month of the DLD data, against the same
months a year earlier); Abu Dhabi keeps the latest period ADREC publishes by area. Owner decision 2026-11-05.

- `before/` is the untouched `phase2-site` build, `after/` this branch. Both are noindex builds in Chromium, full page,
  375 and 1280 px wide. File names match between the two folders.
- The lead Worker answers with invented fixture figures (never real data), in the shape the Worker serves for the period
  the page asks for: `before/` asks for 2026-H1, `after/` asks for `ytd`, answered as 2026-YTD10 (Jan to Oct 2026, data
  dated 2 Nov 2026). The figures are the same in both, so only the period labels and the period sentence differ.
- `areas-dubai-*`: /areas with Dubai selected. `areas-abu-dhabi-*`: the same page after switching to Abu Dhabi.
  `guide-*`: three Dubai area guides (Dubai Marina, Downtown Dubai, Palm Jumeirah) with their live figures card.

## Copy (the one sentence under each "Top areas" chip)

Before (both emirates):

> Both emirates show Jan to Jun 2026: the latest period ADREC publishes by area, so Dubai and Abu Dhabi stay comparable. Both move to a newer period together as soon as ADREC publishes it.

After, Dubai (months follow the data):

> Dubai: Jan to Oct 2026 against the same months of 2025, from DLD open data, updated weekly.

After, Abu Dhabi (follows the ADREC period in `src/data/adrec-areas.json`):

> Abu Dhabi: Jan to Jun 2026, the latest period ADREC publishes by area.

The chips and the guide cards change with the period ("Jan to Oct 2026 vs Jan to Oct 2025" and "residential sales
value, Jan to Oct 2026"); no other copy changed.
