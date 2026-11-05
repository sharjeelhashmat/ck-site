# Colours v2 (Rules 1c v6.0): before and after, for owner approval

Owner: "EXECUTE v2 colours, background C" (2026-11-05). Only the colour palette changes: logo artwork, wordmark, title,
fonts, type scale, spacing, corners, layout and copy are unchanged.

- `before/` is the untouched `phase2-site` build, `after/` this branch: both noindex builds, Chromium, full page, every
  built page at 375 and 1280 px wide (same file names). The lead Worker answers with invented fixture figures.
- `contact-sheet-375.png`, `contact-sheet-1280.png`: every page as a before | after pair (the top of each page).
- `brand-sheet.png`: every brand file before | after; the files themselves are in `brand/before/` and `brand/after/`.

## Tokens (site/src/styles/global.css), named by role

| v5 token (value) | v6.0 token | value | role |
|---|---|---|---|
| `--navy` (#14252F) | `--navy` | #0C3B6E | Deep Navy: headlines, primary buttons, links on light, logo on light |
| `--ink` (#14252F) | `--night` | #071E38 | Night: dark backgrounds; body text on light |
| `--navy-deep` (#14252F) | `--night` (backgrounds), `--navy` (headings, brand, FAQ questions, print head) | | by role |
| `--muted` (#14252F) | `--night` | #071E38 | small text on light |
| `--gold` (#C6A272) | `--sky` | #5B9BD5 | Sky: rules, lines, icons, accent buttons; text only on Night |
| `--brass-deep` (#7E6034) | `--navy` | #0C3B6E | accent text and links on light |
| `--sky` (#627982, Slate) | `--slate` | #6B7A90 | Slate: lines, borders, icons; text only 24px+ or 19px bold |
| `--slate-light` (#8FA3AB) | `--sky` | #5B9BD5 | small text on Night |
| `--ivory` (#F3F0E7), page and band background | `--ivory` | #F3F0E7 | kept: light page background |
| `--ivory` (#F3F0E7), text and fills on dark | `--mist` | #EEF4FB | Mist: text and logo on dark |
| `--line` (#CFD2CE) | `--line` | #D1D3D1 | tint: Slate 25% over Ivory |
| `--band` (#EAE8E0) | `--band` | #EAE8E0 | tint: Night 4% over Ivory (rounds to the same value) |
| `--brass-tint` (#ECE4D5) | `--sky-tint` | #E3E3E4 | tint: Sky 15% over Ivory |
| `--paper`, `--ok`, `--err`, `--wa`, `--wa-hover` | unchanged | | utility |

No alias is kept: every old name is gone from `site/src` (a test checks it). Class names such as `way--ink` and
`band--navy` are structure, not colour tokens, and are unchanged. `theme-color` is #071E38 (the header colour).

Buttons by role: the primary button is Deep Navy with Mist text on light (hover Night). On Night surfaces (hero, dark
band, footer) Deep Navy would not stand out (1.5:1), so the primary button there is the Sky accent with Night text (hover
Mist). The WhatsApp nav button and the current Buy/Invest/Sell segment are Sky with Night text.

Contrast (WCAG, from the tokens): Night on Ivory 14.7:1, Deep Navy on Ivory 9.9:1, Mist on Night 15.2:1, Sky on Night
5.67:1; Sky on Ivory 2.6:1 (never text), Slate on Ivory 3.8:1 (24px+ or 19px bold only).

## Brand files and how each was produced

- `logo-web-ink.svg`, `logo-horizontal-ink.svg`: hex values swapped in place, nothing else: #14252F to #0C3B6E,
  #C6A272 to #5B9BD5, #7E6034 to #6B7A90 (same byte length).
- `logo-web-ivory.svg`, `logo-horizontal-ivory.svg`: #F3F0E7 to #EEF4FB, #C6A272 to #5B9BD5.
- `icon-32.png`, `icon-48.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon.ico` (its 48, 32 and 16
  frames) and `og.png`: recoloured from the same files with one affine colour map, fitted exactly on four pairs: Ink
  #14252F to Night #071E38, Ivory #F3F0E7 to Mist #EEF4FB, Brass #C6A272 to Sky #5B9BD5, and Slate #627982 to Slate
  #6B7A90. Each of those colours maps exactly; a blend of two of them (anti-aliased edges, the og gradient and its faint
  circles) maps to the same blend of the new colours. Pixel positions, sizes and the alpha channel (the rounded tab icon
  corners) are unchanged. `og.png` stays a 256-colour palette PNG: its palette entries were recoloured one for one, so no
  colour was lost (about 88 KB).
- The two horizontal logo SVGs carry an embedded C2PA content-credentials manifest; recolouring changes the file, so that
  manifest no longer matches its hash. It is left in place, unchanged.
