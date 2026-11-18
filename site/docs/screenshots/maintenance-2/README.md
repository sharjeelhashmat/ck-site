# Maintenance PR 2: visual proof

Astro 5.18.2 to 7.4.7 and the open Dependabot updates must change nothing a visitor sees. These files prove it page by page.

- `before/`: the current phase2-site (commit 5be29e3), built in CI mode (noindex).
- `after/`: this branch, built the same way.
- `diff/`: one image per pair. The after shot in light grey; every pixel that differs in any colour channel in red.
- `harness/`: the scripts that made them, and the recorded Worker responses they replay.

## How the shots were made

Chromium (the same binary for both runs), 375 and 1280 CSS pixels wide, device scale factor 2, full page.
To make the two runs differ only by the code under test, `harness/shots.mjs`:

- replays the lead Worker's `/market` responses recorded once from the live Worker (`harness/fixtures/`), so the
  Dubai figures are identical in both runs; every other external request is blocked;
- fixes the clock (18 November 2026, 08:00 UTC);
- turns off animations and transitions, loads every lazy image, and waits for the web fonts;
- takes the fixed header and the back-to-top button out of the flow (as in every earlier PR's screenshots).

/areas is shot four times: Dubai and Abu Dhabi, each sorted by value and by change (the sort buttons are clicked and
checked). Every Insights article in the build is included.

Self check: the harness run twice on the same before build gives 0.0000% on all 40 pairs. Negative check: a 100 by 50
pixel block painted into one shot is reported as exactly 5,000 changed pixels (0.1085%) and all 5,000 are red in the diff.

Reproduce (from site/):

```bash
PLAYWRIGHT=<playwright index.mjs> CHROMIUM=<chrome> node docs/screenshots/maintenance-2/harness/shots.mjs <dist> <out> docs/screenshots/maintenance-2/harness/fixtures replay
```

```bash
python3 -I docs/screenshots/maintenance-2/harness/diff.py <beforeDir> <afterDir> <diffDir>
```

## Pixels changed per page

Share of pixels that differ in any channel (a change in page height would count every pixel outside the shared area).
Threshold for an explanation: 0.1%.

| page | 375 | 1280 | files |
|---|---|---|---|
| / | 0.0000% | 0.0000% | `home-375.png`, `home-1280.png` |
| /buy | 0.0000% | 0.0000% | `buy-375.png`, `buy-1280.png` |
| /invest (calculator defaults) | 0.0000% | 0.0000% | `invest-375.png`, `invest-1280.png` |
| /sell | 0.0000% | 0.0000% | `sell-375.png`, `sell-1280.png` |
| /areas, Dubai, sorted by value | 0.0000% | 0.0000% | `areas-dubai-value-375.png`, `areas-dubai-value-1280.png` |
| /areas, Dubai, sorted by change | 0.0000% | 0.0000% | `areas-dubai-change-375.png`, `areas-dubai-change-1280.png` |
| /areas, Abu Dhabi, sorted by value | 0.0000% | 0.0000% | `areas-abu-dhabi-value-375.png`, `areas-abu-dhabi-value-1280.png` |
| /areas, Abu Dhabi, sorted by change | 0.0000% | 0.0000% | `areas-abu-dhabi-change-375.png`, `areas-abu-dhabi-change-1280.png` |
| Dubai guide: /areas/dubai-marina | 0.0000% | 0.0000% | `guide-dubai-marina-375.png`, `guide-dubai-marina-1280.png` |
| Abu Dhabi guide: /areas/saadiyat-island | 0.0000% | 0.0000% | `guide-saadiyat-island-375.png`, `guide-saadiyat-island-1280.png` |
| /new-launches | 0.0000% | 0.0000% | `new-launches-375.png`, `new-launches-1280.png` |
| /insights | 0.0000% | 0.0000% | `insights-375.png`, `insights-1280.png` |
| /insights/costs-investors-forget-before-yield | 0.0000% | 0.0000% | `insights-costs-investors-forget-before-yield-375.png`, `insights-costs-investors-forget-before-yield-1280.png` |
| /insights/does-rising-transaction-value-mean-rising-prices | 0.0000% | 0.0000% | `insights-does-rising-transaction-value-mean-rising-prices-375.png`, `insights-does-rising-transaction-value-mean-rising-prices-1280.png` |
| /insights/dubai-2026-so-far-official-numbers | 0.0000% | 0.0000% | `insights-dubai-2026-so-far-official-numbers-375.png`, `insights-dubai-2026-so-far-official-numbers-1280.png` |
| /about | 0.0000% | 0.0000% | `about-375.png`, `about-1280.png` |
| /contact | 0.0000% | 0.0000% | `contact-375.png`, `contact-1280.png` |
| /faq | 0.0000% | 0.0000% | `faq-375.png`, `faq-1280.png` |
| /investment-approach | 0.0000% | 0.0000% | `investment-approach-375.png`, `investment-approach-1280.png` |
| 404 (an unknown path) | 0.0000% | 0.0000% | `404-375.png`, `404-1280.png` |

All 40 pairs: 0.0000%. Nothing to explain.

Print layout (the print-only header and footer): /, /contact, /new-launches, /areas/dubai-marina, /faq and
/insights/dubai-2026-so-far-official-numbers rendered with print media at 1280, before and after: 0.0000% on all six.

## Lighthouse

LIGHTHOUSE_TABLE
