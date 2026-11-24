# Compass Key card kit

The one way to make Sharjeel Hashmat social cards (owner approved 2026-11-23). Every content producer (the scheduled
Content task, Brand review chats) renders cards with this kit, so every card looks the same as the approved set in
`proof/approved/`. Do not draw cards any other way, and do not edit the kit's fonts, assets or styles in a producer.

- Templates: `cover`, `list` (numbered), `quote`, `chart` (Rules 1c v6.9), `closing` (lockup).
- Sizes: `feed` 1080 x 1350 (feed and carousel, the default) and `reel` 1080 x 1920 (same header and footer).
- Palette: Ink #14252F, Ivory #F3F0E7, Brass #C6A272, Brass Deep #7E6034, Slate Light #8FA3AB (small secondary text).
- Fonts (bundled, OFL): Cormorant Garamond 500, 600 and 500 italic; Inter (variable). Never a fallback font.

## Render a card

Needs Python 3 (tested with 3.11, 3.12 and 3.13) and Pillow from PyPI (`pip install pillow`, which includes the raqm text shaping the kit needs;
the renderer refuses a Pillow without it). Nothing else.

```bash
python3 render_cards.py examples/1_cover.json -o cover.png
```

One card per JSON object; a JSON list renders a carousel into a folder (`-o out/`, files named after each card's `name`
field, or `1_cover.png`, `2_list.png` and so on). For one card, `-o` takes a `.png` file path, or a folder (an existing
one, or a path ending in `/`), which gets `<name>.png` (the card's `name` field, or the spec file's name). The renderer checks the spec first and refuses, with a reason, when:
a field is unknown or missing, any text has an em or en dash, a character is not in the kit fonts, or the text does
not fit the card. Fix the spec; never work around a refusal.

Two engines, one layout: `--engine pillow` (the default, Python and Pillow only) and `--engine html` (the HTML templates
in `templates/`, screenshotted by Playwright; only where Playwright is installed). Both take positions from the same
layout code; `proof/` shows how close they are.

## Fields

Every card: `template`, optional `size` (`feed` or `reel`), optional `page` (footer, for example `"2 / 5"`), optional
`name` (file name in a carousel). The header label and the footer are on every card except `closing` (no header). The
footer text is fixed: SHARJEEL HASHMAT / PROPERTY CONSULTANT · UAE.

Labels, kickers, the chart period and the closing pillars are set in capitals by the kit; write them in any case.
`\n` in a title or quote forces a line break; everything else wraps at the card width.

### cover

`label`, `kicker`, `title`, `lede`.

```json
{"template": "cover", "label": "Market insight", "kicker": "Jebel Ali Hills · Dubai",
 "title": "Land to\nbuild on.", "lede": "What a villa here really costs, and what to check before you buy a plot.",
 "page": "1 / 5"}
```

### list

`label`, `title`, `items`: 1 to 6 entries, each a string or `{"text", "source"}` (the source line sits under that point,
in Slate Light, when the point carries a fact). Numbers are added by the kit.

```json
{"template": "list", "label": "Before you buy the land", "title": "Check these first.",
 "items": ["The design guidelines, floor area ratio and approval fees, in writing.",
           "What the plot is zoned for, and what is planned next door.",
           "The street at peak hours and on a windy day.",
           {"text": "A fixed-price build quote from two contractors, before you pay for the plot.",
            "source": "Source line sits here when a point carries a fact"}],
 "page": "2 / 5"}
```

### quote

`label`, `quote`, `source`, optional `context` (the supporting sentence under the quote).

```json
{"template": "quote", "label": "When not to buy",
 "quote": "A metro opening in 2031 is doing a lot of selling work in 2026.",
 "context": "Route 2020 extension to Al Maktoum Airport City named in a Dh11bn transport package. No stations or route length published.",
 "source": "The National, 10 Nov 2026 (press-reported)", "page": "3 / 5"}
```

### chart (Rules 1c v6.9)

`label`, `title`, `period` (the small period label), `source` (the source line at the bottom), `areas`: 1 to 4, each
`{"name", "dld", "now": {"year", "value_bn"}, "before": {"year", "value_bn"}, "change_pct"}`.

- Common name first, `DLD: <dld>` under it.
- Thin rounded bars: the current period solid Brass, the earlier period a Brass Deep outline with no fill; the largest
  value on the card is 560 px and every other bar is to the same scale.
- The value (`AED 10.57bn`) at the end of each bar; the change on the current row, in Ivory when up and Brass when down.
- `change_pct` is the source's own figure; when it is left out, the kit computes it from the two values.
- No legend, no grey, nothing outside the palette (check_kit.py tests the pixels).

```json
{"template": "chart", "label": "Same city, different markets", "title": "Sales value, two Dubai areas",
 "period": "Jan to Oct · 2026 vs 2025",
 "areas": [
   {"name": "Dubai Marina", "dld": "Marsa Dubai", "now": {"year": 2026, "value_bn": 10.57},
    "before": {"year": 2025, "value_bn": 24.35}, "change_pct": -56.6},
   {"name": "Dubai Islands", "dld": "Palm Deira", "now": {"year": 2026, "value_bn": 11.94},
    "before": {"year": 2025, "value_bn": 9.89}, "change_pct": 20.7}],
 "source": "Source: Dubai Land Department transaction data via the Compass Key DLD sync, as of 18 Nov 2026. Residential sales value, January to October.",
 "page": "4 / 5"}
```

Two areas fit a feed card with room to spare; more need a reel, or the renderer says the chart does not fit.

### closing

No required fields. Optional `tagline` (default "Clarity before commitment.") and `pillars` (default "NUMBERS FIRST ·
STRAIGHT ANSWERS · NO PITCH").

```json
{"template": "closing", "page": "5 / 5"}
```

### reel

Any template with `"size": "reel"`: the same header and footer, the content in the same place, the frame 1080 x 1920.

```json
{"template": "cover", "size": "reel", "label": "Market insight", "kicker": "Jebel Ali Hills · Dubai",
 "title": "Land to\nbuild on.", "lede": "What a villa here really costs, and what to check before you buy a plot."}
```

All six examples are in `examples/`.

## Use from the scheduled Content task (raw.githubusercontent.com)

The repository is public, so a sandbox reads the kit without a token. Base:
`https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/`

Needed for the Pillow engine:

- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/render_cards.py
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/fonts/cormorant-garamond-latin-500-normal.ttf
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/fonts/cormorant-garamond-latin-600-normal.ttf
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/fonts/cormorant-garamond-latin-500-italic.ttf
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/fonts/inter-latin-wght-normal.ttf
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/assets/mark-ivory-36x34.png
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/assets/logo-horizontal-ivory-760.png

Also in the kit (the HTML engine, the vector files and the licences):

- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/fonts/cormorant-garamond-latin-500-normal.woff2
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/fonts/cormorant-garamond-latin-600-normal.woff2
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/fonts/cormorant-garamond-latin-500-italic.woff2
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/fonts/inter-latin-wght-normal.woff2
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/fonts/OFL-Cormorant-Garamond.txt
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/fonts/OFL-Inter.txt
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/assets/logo-horizontal-ivory.svg
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/assets/mark-ivory.svg
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/templates/card.css
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/templates/_page.html (and `_header.html`, `_footer.html`, `cover.html`, `list.html`, `quote.html`, `chart.html`, `closing.html` in the same folder)
- https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit/README.md

Fetch and render in a sandbox (keeps the kit's folder layout; the renderer finds its files next to itself):

```bash
base=https://raw.githubusercontent.com/sharjeelhashmat/ck-site/phase2-site/brand/card-kit
mkdir -p card-kit/fonts card-kit/assets
for f in render_cards.py fonts/cormorant-garamond-latin-500-normal.ttf fonts/cormorant-garamond-latin-600-normal.ttf fonts/cormorant-garamond-latin-500-italic.ttf fonts/inter-latin-wght-normal.ttf assets/mark-ivory-36x34.png assets/logo-horizontal-ivory-760.png; do curl -fsSL "$base/$f" -o "card-kit/$f"; done
python3 card-kit/render_cards.py my-carousel.json -o cards/
```

## Brand assets

- `assets/logo-horizontal-ivory.svg`: the Brand Package horizontal lockup, byte for byte the same file as
  `site/public/logo-horizontal-ivory.svg`.
- `assets/mark-ivory.svg`: the Navigator mark alone. The Brand Package has no mark-only artwork, so this is the
  horizontal lockup file with only its viewBox cropped to the mark (`210 225 540 510`, the same vertical crop as the
  Brand Package's own `logo-web-ivory.svg`); every path is unchanged, nothing is redrawn.
- `assets/mark-ivory-36x34.png` and `assets/logo-horizontal-ivory-760.png`: the two SVGs drawn by Chromium at the exact
  size and position the cards use, for the Pillow engine (Pillow cannot draw SVG). Rebuild them with
  `tools/rasterize_assets.py` only if an SVG changes.

## Checks

`python3 check_kit.py` (CI job `card-kit`) renders every example and fails on a wrong size, a font that did not load or
would fall back, a chart colour outside the palette, an em or en dash, or a layout that no longer matches the kit's
HTML rendering. `python3 check_kit.py --html` does the same with the HTML engine too. `tools/make_proof.py` rebuilds
`proof/` (needs Playwright).

## Differences from the approved reference

One, on purpose: in the list template the number column no longer shrinks (`.n{flex:none}` in `templates/card.css`).
In the approved reference the column shrank by a different amount on each row, so the text of items 1 to 4 started at
x = 154, 160, 164 and 150. Now every item's text starts at x = 164, as item 3 already did. If the owner prefers the
approved card exactly as it was, that is a kit change in both engines, not a producer setting.
