# Label fix: Jabal Ali First (owner 2026-11-21)

DLD area Jabal Ali First was labelled "Jumeirah Lake Towers"; it is now "Jebel Ali Village, Al Furjan, Discovery Gardens".
before/ is phase2-site at 1da8d27, after/ is this PR, both the noindex build, at 375 and 1280 (device scale 2). The sticky
site header and the emirate switch bar are unpinned while capturing so they do not cover the cards.

- insights-dubai-2026-so-far-q3-cards and q3-table: the November article's Q3 top 8, built into the page.
- areas-dubai-top-areas and areas-dubai-top-areas-sorted-by-change: /areas, Dubai. The page reads the Worker in the
  browser, so the Worker answer is replaced with the live GET /market/areas?period=2026-Q3 body (real figures; Jabal Ali
  First is #3 there). before/ shows it as served today; after/ changes only the Jabal Ali First label to the new text,
  which is what the Worker serves once the next successful DLD sync rebuilds its cached answers. The live year to date
  view does not show Jabal Ali First today (it ranks 9th, outside the top 8).
