# Card kit proof

The five example specs (`../examples/1_cover.json` to `5_closing.json`) rendered with `render_cards.py` and compared
with the five approved PNGs (`approved/`, the files the owner approved on 2026-11-23). Rebuilt by
`../tools/make_proof.py`; the numbers are in `stats.json`.

- `approved/`: the approved PNGs, unchanged.
- `pillow/`: the Pillow engine (Python and Pillow only, what the Content task's sandbox produces), plus the reel example.
- `html/`: the HTML engine (Chromium). `../check_kit.py` compares every Pillow render with these.
- `side-by-side/`: approved | Pillow | the Pillow card faded, with every pixel that differs from the approved one by
  more than 64 in a channel in red (half size).

## Where the approved PNGs come from

The approved PNGs are exactly what Chromium draws for `kit_reference.html` with the kit's woff2 fonts and the Brand
Package logo: rendering that file again gives the five PNGs with 0 pixels different. The kit's CSS is that file's CSS.

## Results

| card | HTML engine vs approved | Pillow engine vs approved | text lines placed differently (Pillow) |
|---|---|---|---|
| 1 cover | identical (0 px) | 1.25% of pixels differ, 0.38% by more than 64 | none |
| 2 list | differs: list text x (the one change, below) | differs: list text x | items 1, 2 and 4 (the change) |
| 3 quote | identical (0 px) | 2.19%, 0.66% by more than 64 | the three quote lines sit 1 px lower |
| 4 chart | identical (0 px) | 2.38%, 0.61% by more than 64 | none |
| 5 closing | 0.03% (see below), none by more than 64 | 1.11%, 0.21% by more than 64 | the pillars line sits 1 px higher |

What the Pillow differences are: the same text in the same places, drawn by a different rasteriser. Pillow (FreeType)
and Chromium (Skia) anti-alias glyph edges differently, so edge pixels change shade; that is all of the 1 to 2.4%. In two
places FreeType's hinting snaps a font size to the next whole pixel, so one text block sits 1 px lower (the quote) or
higher (the closing pillars). Line breaks, letter spacing, bar lengths, colours and every other position are the same.

## Differences from the approved PNGs

1. **List: every item's text now starts at x = 164.** In the approved card the number column shrank by a different
   amount on each row (a flexbox effect), so items 1 to 4 started at x = 154, 160, 164 and 150. The kit fixes the
   column (`.n{flex:none}`); item 3 was already at 164. This is the only intended change.
2. **Closing: 0.03% of pixels (455), inside the logo's wordmark, by at most 60 of 255.** Not a kit change: in
   `kit_reference.html` the same logo file is also drawn small on cards 1 to 4, and Chromium draws the large copy a
   shade differently in that page. The reference's closing card rendered on its own is identical (0 px) to the kit's.
3. **Pillow engine only:** the anti-aliasing and 1 px hinting differences above.
