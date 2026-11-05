# PR 5: Rules 1c v5.8 (type, spacing, corners) for owner approval

Visual COPY HOLD: no copy, colour, logo, brand file or legal text changed. Every change below is type, spacing or corners.

- `before/` is the untouched `phase2-site` build, `after/` this branch; both noindex builds, Chromium, full page, 375 and
  1280 px wide, the lead Worker answered with the same invented fixture figures the a11y check uses (never real data).
  File names match between the two folders.
- `contact-sheet-375.png` and `contact-sheet-1280.png`: every page as a before | after pair (the top of each page).

## Decisions taken while mapping (check these first)

1. **Nearest step, ties round up.** Every margin, padding and gap went to the nearest of the nine steps; a value exactly
   between two (20, 40, 56 px) took the larger one. 249 declarations changed.
2. **Type roles.** Text in capitals maps to label (Inter 400, 12/16, 0.18em). Other Inter text below 16px maps to small
   (14/20) whatever its size, so sentences are never set in capitals. Text at about 15 to 18px maps to body (16/28).
   Tables are data (16/24, Inter 500) with their headers as labels (400). `strong` and `b` are 500.
3. **Inter subheads** (`.prose h3`, the card titles on /invest, and the FAQ questions, owner approved 2026-11-05) use
   the data style (Inter 500, 16/24, -0.011em) rather than Cormorant, so they stay below the 28px H2s. The FAQ "+"
   marker stays Inter 400.
4. **Big figures** are Inter 500, lining and tabular. Stat (48/52) where the figure is short and has room: `.way-num`,
   the /areas year-to-date tiles and the area guide figure. Data (16/24) where it cannot fit at 320px or has no upper
   bound: the two-column top-area cards (`.mk-card .mk-value`), the ROI calculator outputs (`.stat`, amounts the visitor
   types), the launch panel lead line (`.mk-lead`) and the rank (`.mk-rank`).
5. **Layout changes caused by the type change:** the /areas tiles stack to one column below 60rem (was 40rem) so three
   48px figures never overflow; `.mk-value` may wrap between "AED" and the number. The header is 64px tall (was 68px) so
   `main`'s top padding is a spacing step; the logo is unchanged.
6. **Corners.** Buttons, nav links, the skip link, the preferred-contact options and the back-to-top button are
   `--radius-md`. Tags, chips, badges, verdicts, the sell steps, the market bars, fields and checkboxes are
   `--radius-sm`; the hero trust dot (6px) is `--radius-sm`, which still draws a circle. Cards, alerts, notes, the
   newsletter card, the stale banner and the mobile menu are `--radius-lg`. `--radius-full` is 9999px and is used only by
   the floating WhatsApp button. `--radius-xl` is defined; nothing in the site is a large panel, image, hero block or
   modal with corners today. The permit QR image (hidden until go-live) is `--radius-sm`: 24px would clip its finder
   patterns.
7. **About lead line and footer title.** The About lead line ("Numbers first. Straight answers. No pitch.") is the
   heading style, upright: Cormorant Garamond 600, 28/36 (owner approved 2026-11-05), the nearest v5.8 step to the
   upright 24 to 32px Cormorant display line the owner approved on 2026-10-10. The footer title beside the logo is the
   tagline style (Cormorant Italic 400, 22/32).
8. **Scrollable tables** (`.table-scroll`) take `tabindex="0"` so a keyboard can scroll them (axe
   scrollable-region-focusable; the insight figures table now scrolls at 375px, and already did at 320px on the base).

## Cormorant below 22px on the base, and what each became

| selector | base | now |
|---|---|---|
| `.brand` (header lockup) | Cormorant 1.35rem (21.6px); the header shows only the logo | no font set; the header has no brand text |
| `.site-footer .brand` text "Property Consultant · UAE" | Cormorant 1.05rem (16.8px) | tagline: Cormorant Italic 400, 22/32 |
| `.faq summary` (the questions) | Cormorant 600, 1.35rem (21.6px) | data: Inter 500, 16/24, -0.011em (owner approved 2026-11-05) |
| `.print-head` (print only) | Cormorant 600, 1.15rem (18.4px) | Inter 400, body 16/28 |
| `.mk-area` (/areas top-area names) | Cormorant 1.3rem (20.8px), 1.1rem (17.6px) below 30rem | heading: Cormorant 600, 28/36 at every width |

Figures that were Cormorant and are now Inter 500: `.way-num` (46px), `.stat` (32px), `.mk-tile-value` and `.mk-value`
(up to 36px and 40px), `.mk-lead` (24px).

## Fonts

Cormorant Garamond 600 normal and 400 italic only (the 400 normal face is no longer loaded; nothing uses it). Inter is
the variable font already in use (`@fontsource-variable/inter`): one file per subset carries the whole weight axis, so
there are no 300, 600 or 700 files to drop; the CSS uses 400 and 500 only. Same package versions (5.3.0), no CDN.
Preloads: Cormorant latin 600 normal (replaces 400 normal) and 400 italic (kept: the italic is in the above-the-fold H1
on 12 of the 35 pages, the home page among them).

## Guards

- `tests/design-rules.test.mjs` (in `npm test`): weights per face, labels at 400, the type scale (sizes only as
  `--fs-*` tokens or a clamp() between two), Cormorant never below 22px, the nine spacing steps (0 and auto allowed), the
  five corner tokens (0 allowed; `--radius-full` only on the WhatsApp button, avatars or a headshot frame), the removed
  `--r-*` tokens, no `font` shorthand, the token values, the allowed @fontsource files, the font files in the build, the
  same rules on the built CSS and inline styles, and the Design System sample button text nowhere.
- `qa/design-audit.mjs` (run by hand: `CHROMIUM=... node design-audit.mjs ../dist`): the rendered faces, weights, sizes
  and corners of every element on all 35 pages at 320, 375 and 1280, and no horizontal scroll. Base build: 6290
  problems; this branch: none. Wiring it into CI needs a workflow change, which PR 5 does not make.

## Tests made mode-aware (pass after a noindex build and after the public test build)

They read the build mode from the same environment the build reads (`tests/helpers/build-mode.mjs`): noindex with empty
go-live values, or PUBLIC_INDEXABLE=true with GOLIVE_OVERRIDES=GOLIVE_TEST. Each still asserts the noindex expectation
exactly as before on a noindex build, and asserts the public expectation on a public build.

| test | before (public build) | after |
|---|---|---|
| audit-pr2 `22: ... robots.txt allows crawling, X-Robots-Tag: noindex, no sitemap` | failed: expected the noindex robots.txt | public: robots.txt with the Sitemap line, no X-Robots-Tag, `sitemap-index.xml` and `sitemap-0.xml`, home indexed, every page index or noindex |
| audit-pr2 `16: ... one Person node, no RealEstateAgent` | failed: expected no identifiers on `dist` | `dist`'s identifiers equal this build's BRN and permit (none when empty) |
| brand `JSON-LD: a Person ... on every page` | failed: no "BRN" allowed | no RealEstateAgent and no ORN in both modes; the Person's identifiers equal this build's |
| enquiry-forms `new launches: no empty card ... noindex` | failed: expected noindex | noindex, or indexed when the build is public and the launch cards are allowed |
| finish-all `B: with GOLIVE empty, no page shows an agency ...` | failed: expected no agency line | empty: unchanged; public: the exact footer disclosure and JSON-LD identifiers on every page, robots.txt with the Sitemap line |
| launch-readiness `links: an <a> wrapping #lead-next fails` | failed: the seeded copy was checked as non-indexable | seeded copies are checked in this build's mode (and the text it seeds now reads `margin-top:var(--space-4)`) |
| launch-readiness `links: an unclosed <a> fails, and a nested <a> fails` | failed: extra "noindex" | same fix: exactly `links` |
| launch-readiness `insights: an archived insight ... fails` | failed: extra "noindex" | same fix: exactly `insights` |
| launch-readiness `meta: a title over 60 characters ...` | failed: extra "noindex" | same fix: exactly `meta`, or none |
| launch-readiness `privacy: missing retention periods ...` | failed: extra "noindex" | same fix |
| launch-readiness `wording: "Book a call" ...` | failed: extra "noindex" | same fix: exactly `wording` |
| launch-readiness `whatsapp: an extra WhatsApp link ...` | failed: extra "noindex" | same fix: exactly `whatsapp` |
| site `every page has one title, one h1, is noindex ...` | failed: expected noindex and no canonical | noindex build: unchanged; public: canonical and og:url exactly on the indexed pages, home indexed, robots.txt with the Sitemap line |
| site `a noindex build has no sitemap at all` | failed: sitemap present | none on a noindex build; exactly the index and one sitemap on a public build |
| site `print: ... no agency line while the agency is unconfirmed` | failed: the print footer has the agency line | the print footer equals the contact line plus this build's agency line (none when empty) |
| site `with the agency (GOLIVE.agencyName) empty, no page renders a "Working with" line` | failed: the line shows | the committed agency stays empty (unchanged); empty build: no line, no disclosure, no BRN; public: the line and the BRN on every page |

Four other tests asserted the old values and now assert v5.8: brand `radius tokens exist ...` and `built CSS: buttons,
fields ... resolve to the right token`, enquiry-forms `new launches: five H2s ...` (spacing token) and `preferred contact:
button-like options` (`--radius-md`).

## Every token change

| file | selector | property | base | now |
|---|---|---|---|---|
| `styles/global.css` | `:root` | `--r-pill` | `999px` | `(none)` |
| `styles/global.css` | `:root` | `--r-field` | `10px` | `(none)` |
| `styles/global.css` | `:root` | `--r-card` | `14px` | `(none)` |
| `styles/global.css` | `:root` | `--radius-sm` | `(none)` | `8px` |
| `styles/global.css` | `:root` | `--radius-md` | `(none)` | `12px` |
| `styles/global.css` | `:root` | `--radius-lg` | `(none)` | `16px` |
| `styles/global.css` | `:root` | `--radius-xl` | `(none)` | `24px` |
| `styles/global.css` | `:root` | `--radius-full` | `(none)` | `9999px` |
| `styles/global.css` | `:root` | `--space-1` | `(none)` | `4px` |
| `styles/global.css` | `:root` | `--space-2` | `(none)` | `8px` |
| `styles/global.css` | `:root` | `--space-3` | `(none)` | `12px` |
| `styles/global.css` | `:root` | `--space-4` | `(none)` | `16px` |
| `styles/global.css` | `:root` | `--space-6` | `(none)` | `24px` |
| `styles/global.css` | `:root` | `--space-8` | `(none)` | `32px` |
| `styles/global.css` | `:root` | `--space-12` | `(none)` | `48px` |
| `styles/global.css` | `:root` | `--space-16` | `(none)` | `64px` |
| `styles/global.css` | `:root` | `--space-24` | `(none)` | `96px` |
| `styles/global.css` | `:root` | `--fs-display-xl` | `(none)` | `4rem` |
| `styles/global.css` | `:root` | `--lh-display-xl` | `(none)` | `4.25rem` |
| `styles/global.css` | `:root` | `--ls-display-xl` | `(none)` | `-0.01em` |
| `styles/global.css` | `:root` | `--fs-display-lg` | `(none)` | `2.75rem` |
| `styles/global.css` | `:root` | `--lh-display-lg` | `(none)` | `3.25rem` |
| `styles/global.css` | `:root` | `--fs-heading` | `(none)` | `1.75rem` |
| `styles/global.css` | `:root` | `--lh-heading` | `(none)` | `2.25rem` |
| `styles/global.css` | `:root` | `--fs-tagline` | `(none)` | `1.375rem` |
| `styles/global.css` | `:root` | `--lh-tagline` | `(none)` | `2rem` |
| `styles/global.css` | `:root` | `--fs-label` | `(none)` | `.75rem` |
| `styles/global.css` | `:root` | `--lh-label` | `(none)` | `1rem` |
| `styles/global.css` | `:root` | `--ls-label` | `(none)` | `.18em` |
| `styles/global.css` | `:root` | `--fs-body` | `(none)` | `1rem` |
| `styles/global.css` | `:root` | `--lh-body` | `(none)` | `1.75rem` |
| `styles/global.css` | `:root` | `--ls-body` | `(none)` | `-0.011em` |
| `styles/global.css` | `:root` | `--fs-data` | `(none)` | `1rem` |
| `styles/global.css` | `:root` | `--lh-data` | `(none)` | `1.5rem` |
| `styles/global.css` | `:root` | `--ls-data` | `(none)` | `-0.011em` |
| `styles/global.css` | `:root` | `--fs-stat` | `(none)` | `3rem` |
| `styles/global.css` | `:root` | `--lh-stat` | `(none)` | `3.25rem` |
| `styles/global.css` | `:root` | `--ls-stat` | `(none)` | `-0.022em` |
| `styles/global.css` | `:root` | `--fs-small` | `(none)` | `.875rem` |
| `styles/global.css` | `:root` | `--lh-small` | `(none)` | `1.25rem` |
| `styles/global.css` | `:root` | `--ls-small` | `(none)` | `-0.006em` |

## Every selector whose value changed (674 declarations)

From a declaration-by-declaration diff of site/src (stylesheets, <style> blocks and style attributes) against phase2-site. (none) means the property was added or removed.

| file | selector | property | base | now |
|---|---|---|---|---|
| `components/Brief.astro` | `p` | `margin-top` | `.5rem` | `var(--space-2)` |
| `components/Brief.astro` | `p (#2)` | `margin-top` | `2rem` | `var(--space-8)` |
| `components/LeadForm.astro` | `.lead-err` | `font-size` | `.875rem` | `var(--fs-small)` |
| `components/LeadForm.astro` | `.lead-err` | `margin-top` | `.5rem` | `var(--space-2)` |
| `components/LeadForm.astro` | `.lead-err` | `line-height` | `(none)` | `var(--lh-small)` |
| `components/LeadForm.astro` | `.lead-err` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `components/LeadForm.astro` | `.lead-alert:not(:empty)` | `margin-top` | `1rem` | `var(--space-4)` |
| `components/LeadForm.astro` | `.lead-alert:not(:empty)` | `padding` | `.9rem 1rem` | `var(--space-4) var(--space-4)` |
| `components/LeadForm.astro` | `.lead-alert:not(:empty)` | `border-radius` | `var(--r-card)` | `var(--radius-lg)` |
| `components/LeadForm.astro` | `.lead-alert:not(:empty)` | `font-size` | `.95rem` | `var(--fs-body)` |
| `components/LeadForm.astro` | `.lead-alert:not(:empty)` | `line-height` | `(none)` | `var(--lh-body)` |
| `components/LeadForm.astro` | `.lead-alert:not(:empty)` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `components/LeadForm.astro` | `.lead-success` | `scroll-margin-top` | `6rem` | `var(--space-24)` |
| `components/LeadForm.astro` | `.lead-success > p:first-child` | `font-size` | `1.05rem` | `var(--fs-body)` |
| `components/LeadForm.astro` | `.lead-success > p:first-child` | `font-weight` | `500` | `400` |
| `components/LeadForm.astro` | `.lead-success > p:first-child` | `line-height` | `(none)` | `var(--lh-body)` |
| `components/LeadForm.astro` | `.lead-success > p:first-child` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `components/LeadForm.astro` | `.pref legend` | `margin-bottom` | `.4rem` | `var(--space-2)` |
| `components/LeadForm.astro` | `.pref .pills` | `gap` | `.5rem` | `var(--space-2)` |
| `components/LeadForm.astro` | `.pref .pill` | `letter-spacing` | `normal` | `var(--ls-body)` |
| `components/LeadForm.astro` | `.pref .pill` | `font-size` | `.95rem` | `var(--fs-body)` |
| `components/LeadForm.astro` | `.pref .pill` | `font-weight` | `500` | `400` |
| `components/LeadForm.astro` | `.pref .pill` | `line-height` | `(none)` | `var(--lh-body)` |
| `components/LeadForm.astro` | `.pref .pill span` | `padding` | `0 1.15rem` | `0 var(--space-4)` |
| `components/LeadForm.astro` | `.pref .pill span` | `border-radius` | `var(--r-pill)` | `var(--radius-md)` |
| `components/LeadForm.astro` | `div` | `gap` | `.75rem` | `var(--space-3)` |
| `components/LeadForm.astro` | `div` | `margin-top` | `1.25rem` | `var(--space-6)` |
| `components/LeadForm.astro` | `span` | `font-size` | `.8rem` | `var(--fs-small)` |
| `components/LeadForm.astro` | `span` | `line-height` | `(none)` | `var(--lh-small)` |
| `components/LeadForm.astro` | `span` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `components/LeadForm.astro` | `p` | `margin-top` | `1rem` | `var(--space-4)` |
| `components/LeadForm.astro` | `p (#2)` | `margin-top` | `1rem` | `var(--space-4)` |
| `components/Legal.astro` | `h1` | `font-size` | `clamp(2rem,4vw,2.75rem)` | `clamp(var(--fs-heading),1.25rem + 2vw,var(--fs-display-lg))` |
| `components/Legal.astro` | `h1` | `line-height` | `(none)` | `clamp(var(--lh-heading),1.75rem + 2vw,var(--lh-display-lg))` |
| `components/NewsletterSignup.astro` | `.nl--article` | `margin-top` | `3rem` | `var(--space-12)` |
| `components/NewsletterSignup.astro` | `.nl--article` | `padding` | `1.75rem` | `var(--space-8)` |
| `components/NewsletterSignup.astro` | `.nl--article` | `border-radius` | `var(--r-card)` | `var(--radius-lg)` |
| `components/NewsletterSignup.astro` | `.nl--footer` | `padding-bottom` | `1.5rem` | `var(--space-6)` |
| `components/NewsletterSignup.astro` | `.nl--footer` | `margin-bottom` | `1.25rem` | `var(--space-6)` |
| `components/NewsletterSignup.astro` | `.nl-lede` | `margin-top` | `.4rem` | `var(--space-2)` |
| `components/NewsletterSignup.astro` | `.nl-lede` | `font-size` | `.95rem` | `var(--fs-body)` |
| `components/NewsletterSignup.astro` | `.nl-lede` | `line-height` | `(none)` | `var(--lh-body)` |
| `components/NewsletterSignup.astro` | `.nl-lede` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `components/NewsletterSignup.astro` | `.nl-form` | `margin-top` | `.9rem` | `var(--space-4)` |
| `components/NewsletterSignup.astro` | `.nl-row` | `gap` | `.6rem` | `var(--space-2)` |
| `components/NewsletterSignup.astro` | `.nl-row input` | `font` | `400 1rem var(--sans)` | `(none)` |
| `components/NewsletterSignup.astro` | `.nl-row input` | `border-radius` | `var(--r-field)` | `var(--radius-sm)` |
| `components/NewsletterSignup.astro` | `.nl-row input` | `padding` | `.75rem .8rem` | `var(--space-3) var(--space-3)` |
| `components/NewsletterSignup.astro` | `.nl-row input` | `font-family` | `(none)` | `var(--sans)` |
| `components/NewsletterSignup.astro` | `.nl-row input` | `font-weight` | `(none)` | `400` |
| `components/NewsletterSignup.astro` | `.nl-row input` | `font-size` | `(none)` | `var(--fs-body)` |
| `components/NewsletterSignup.astro` | `.nl-row input` | `line-height` | `(none)` | `var(--lh-body)` |
| `components/NewsletterSignup.astro` | `.nl-row input` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `components/NewsletterSignup.astro` | `.nl-form .status` | `margin-top` | `.6rem` | `var(--space-2)` |
| `components/NewsletterSignup.astro` | `.nl-form .status` | `font-size` | `.9rem` | `var(--fs-small)` |
| `components/NewsletterSignup.astro` | `.nl-form .status` | `line-height` | `(none)` | `var(--lh-small)` |
| `components/NewsletterSignup.astro` | `.nl-form .status` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `components/NewsletterSignup.astro` | `.nl-form .fine` | `margin-top` | `.6rem` | `var(--space-2)` |
| `components/NewsletterSignup.astro` | `.nl-done` | `margin-top` | `.9rem` | `var(--space-4)` |
| `components/NewsletterSignup.astro` | `.nl-done` | `font-size` | `1rem` | `var(--fs-body)` |
| `components/NewsletterSignup.astro` | `.nl-done` | `line-height` | `(none)` | `var(--lh-body)` |
| `components/NewsletterSignup.astro` | `.nl-done` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `components/ROICalc.astro` | `div` | `margin-top` | `1.5rem` | `var(--space-6)` |
| `components/ROICalc.astro` | `div (#2)` | `margin-top` | `2rem` | `var(--space-8)` |
| `components/ROICalc.astro` | `div (#2)` | `padding-top` | `1.5rem` | `var(--space-6)` |
| `components/ROICalc.astro` | `p (#2)` | `margin-top` | `1.5rem` | `var(--space-6)` |
| `components/ROICalc.astro` | `a` | `margin-top` | `1.25rem` | `var(--space-6)` |
| `pages/about.astro` | `.about .lede` | `margin-top` | `2rem` | `var(--space-8)` |
| `pages/about.astro` | `.about .about-lead` | `font-weight` | `400` | `600` |
| `pages/about.astro` | `.about .about-lead` | `font-size` | `clamp(1.5rem, 1.2rem + 1.5vw, 2rem)` | `var(--fs-heading)` |
| `pages/about.astro` | `.about .about-lead` | `line-height` | `1.2` | `var(--lh-heading)` |
| `pages/about.astro` | `.about .about-lead` | `letter-spacing` | `(none)` | `0` |
| `pages/about.astro` | `.about-h2` | `margin-top` | `3rem` | `var(--space-12)` |
| `pages/about.astro` | `.about-checks` | `margin` | `1rem 0 0` | `var(--space-4) 0 0` |
| `pages/about.astro` | `.about-checks` | `padding-left` | `1.25rem` | `var(--space-6)` |
| `pages/about.astro` | `.about-checks` | `gap` | `.5rem` | `var(--space-2)` |
| `pages/about.astro` | `.about .about-close` | `margin-top` | `3rem` | `var(--space-12)` |
| `pages/about.astro` | `p` | `margin-top` | `.5rem` | `var(--space-2)` |
| `pages/about.astro` | `p (#2)` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/areas/[slug].astro` | `.guide .lede` | `margin-top` | `1.25rem` | `var(--space-6)` |
| `pages/areas/[slug].astro` | `.guide-h2` | `margin-top` | `3rem` | `var(--space-12)` |
| `pages/areas/[slug].astro` | `.guide-list` | `margin` | `1rem 0 0` | `var(--space-4) 0 0` |
| `pages/areas/[slug].astro` | `.guide-list` | `padding-left` | `1.25rem` | `var(--space-6)` |
| `pages/areas/[slug].astro` | `.guide-list` | `gap` | `.5rem` | `var(--space-2)` |
| `pages/areas/[slug].astro` | `.guide .guide-close` | `margin-top` | `3rem` | `var(--space-12)` |
| `pages/areas/[slug].astro` | `.changes-list` | `margin` | `1rem 0 0` | `var(--space-4) 0 0` |
| `pages/areas/[slug].astro` | `.changes-list` | `gap` | `1.5rem` | `var(--space-6)` |
| `pages/areas/[slug].astro` | `.change .change-summary` | `margin-top` | `.4rem` | `var(--space-2)` |
| `pages/areas/[slug].astro` | `.change-head` | `gap` | `.25rem .6rem` | `var(--space-1) var(--space-2)` |
| `pages/areas/[slug].astro` | `.change-title` | `font-weight` | `600` | `400` |
| `pages/buy.astro` | `div` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/buy.astro` | `div (#3)` | `margin-top` | `3rem` | `var(--space-12)` |
| `pages/buy.astro` | `div (#4)` | `margin-top` | `1.5rem` | `var(--space-6)` |
| `pages/buy.astro` | `div (#5)` | `margin-top` | `3rem` | `var(--space-12)` |
| `pages/buy.astro` | `div (#5)` | `padding-top` | `2rem` | `var(--space-8)` |
| `pages/buy.astro` | `h2` | `font-size` | `1.75rem` | `var(--fs-heading)` |
| `pages/buy.astro` | `h2` | `line-height` | `(none)` | `var(--lh-heading)` |
| `pages/buy.astro` | `p (#2)` | `font-size` | `1rem` | `var(--fs-body)` |
| `pages/contact.astro` | `div` | `margin-top` | `2rem` | `var(--space-8)` |
| `pages/faq.astro` | `p` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/index.astro` | `section` | `padding-top` | `5rem` | `var(--space-24)` |
| `pages/index.astro` | `div` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/index.astro` | `div (#2)` | `margin` | `2rem auto 0` | `var(--space-8) auto 0` |
| `pages/index.astro` | `p (#3)` | `margin-top` | `.5rem` | `var(--space-2)` |
| `pages/insights/[slug].astro` | `div` | `margin-top` | `2rem` | `var(--space-8)` |
| `pages/insights/[slug].astro` | `p` | `margin-top` | `2rem` | `var(--space-8)` |
| `pages/insights.astro` | `div` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/insights.astro` | `div (#3)` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/insights.astro` | `p (#2)` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/invest.astro` | `div` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/invest.astro` | `h2` | `font-size` | `1.25rem` | `var(--fs-data)` |
| `pages/invest.astro` | `h2` | `font-weight` | `600` | `500` |
| `pages/invest.astro` | `h2` | `line-height` | `(none)` | `var(--lh-data)` |
| `pages/invest.astro` | `h2` | `letter-spacing` | `(none)` | `var(--ls-data)` |
| `pages/invest.astro` | `div (#2)` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/invest.astro` | `div (#3)` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/investment-approach.astro` | `ol` | `margin-top` | `1.5rem` | `var(--space-6)` |
| `pages/investment-approach.astro` | `div` | `margin-top` | `2rem` | `var(--space-8)` |
| `pages/investment-approach.astro` | `p` | `margin-top` | `2rem` | `var(--space-8)` |
| `pages/investor-profile.astro` | `.other-area` | `margin-top` | `1rem` | `var(--space-4)` |
| `pages/investor-profile.astro` | `.other-area .hint` | `font-size` | `.8rem` | `var(--fs-small)` |
| `pages/investor-profile.astro` | `.other-area .hint` | `line-height` | `(none)` | `var(--lh-small)` |
| `pages/investor-profile.astro` | `.other-area .hint` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `pages/investor-profile.astro` | `.profile-actions` | `gap` | `.75rem 1rem` | `var(--space-3) var(--space-4)` |
| `pages/investor-profile.astro` | `.profile-actions` | `margin-top` | `1.5rem` | `var(--space-6)` |
| `pages/investor-profile.astro` | `.profile-skip` | `font-size` | `.9rem` | `var(--fs-small)` |
| `pages/investor-profile.astro` | `.profile-skip` | `line-height` | `(none)` | `var(--lh-small)` |
| `pages/investor-profile.astro` | `.profile-skip` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `pages/investor-profile.astro` | `#profile-status` | `margin-top` | `.75rem` | `var(--space-3)` |
| `pages/investor-profile.astro` | `.profile-alert:not(:empty)` | `margin-top` | `1rem` | `var(--space-4)` |
| `pages/investor-profile.astro` | `.profile-alert:not(:empty)` | `padding` | `.9rem 1rem` | `var(--space-4) var(--space-4)` |
| `pages/investor-profile.astro` | `.profile-alert:not(:empty)` | `border-radius` | `var(--r-card)` | `var(--radius-lg)` |
| `pages/investor-profile.astro` | `.profile-alert:not(:empty)` | `font-size` | `.95rem` | `var(--fs-body)` |
| `pages/investor-profile.astro` | `.profile-alert:not(:empty)` | `line-height` | `(none)` | `var(--lh-body)` |
| `pages/investor-profile.astro` | `.profile-alert:not(:empty)` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `pages/investor-profile.astro` | `#profile-form .profile-alert p` | `font-size` | `.95rem` | `var(--fs-body)` |
| `pages/investor-profile.astro` | `#profile-form .profile-alert p` | `line-height` | `(none)` | `var(--lh-body)` |
| `pages/investor-profile.astro` | `#profile-form .profile-alert p` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `pages/investor-profile.astro` | `#profile-form .profile-privacy` | `margin-top` | `1rem` | `var(--space-4)` |
| `pages/investor-profile.astro` | `#profile-form .profile-privacy` | `font-size` | `14px` | `var(--fs-small)` |
| `pages/investor-profile.astro` | `#profile-form .profile-privacy` | `line-height` | `(none)` | `var(--lh-small)` |
| `pages/investor-profile.astro` | `#profile-form .profile-privacy` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `pages/investor-profile.astro` | `.profile-success` | `scroll-margin-top` | `6rem` | `var(--space-24)` |
| `pages/investor-profile.astro` | `.card.profile-success > p` | `font-size` | `1.05rem` | `var(--fs-body)` |
| `pages/investor-profile.astro` | `.card.profile-success > p` | `font-weight` | `500` | `400` |
| `pages/investor-profile.astro` | `.card.profile-success > p` | `line-height` | `(none)` | `var(--lh-body)` |
| `pages/investor-profile.astro` | `.card.profile-success > p` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `pages/investor-profile.astro` | `form` | `margin-top` | `2rem` | `var(--space-8)` |
| `pages/investor-profile.astro` | `legend` | `font-size` | `.85rem` | `var(--fs-small)` |
| `pages/investor-profile.astro` | `legend` | `font-weight` | `600` | `400` |
| `pages/investor-profile.astro` | `legend` | `margin-bottom` | `.5rem` | `var(--space-2)` |
| `pages/investor-profile.astro` | `legend` | `line-height` | `(none)` | `var(--lh-small)` |
| `pages/investor-profile.astro` | `legend` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `pages/investor-profile.astro` | `div` | `gap` | `.5rem` | `var(--space-2)` |
| `pages/investor-profile.astro` | `label` | `letter-spacing` | `normal` | `var(--ls-small)` |
| `pages/investor-profile.astro` | `label` | `font-size` | `.9rem` | `var(--fs-small)` |
| `pages/investor-profile.astro` | `label` | `line-height` | `(none)` | `var(--lh-small)` |
| `pages/new-launches.astro` | `.launches .lede` | `margin-top` | `2rem` | `var(--space-8)` |
| `pages/new-launches.astro` | `.nl-h2` | `margin-top` | `3rem` | `var(--space-12)` |
| `pages/new-launches.astro` | `.nl-h2` | `scroll-margin-top` | `6rem` | `var(--space-24)` |
| `pages/new-launches.astro` | `.nl-list` | `margin` | `1rem 0 0` | `var(--space-4) 0 0` |
| `pages/new-launches.astro` | `.nl-list` | `padding-left` | `1.25rem` | `var(--space-6)` |
| `pages/new-launches.astro` | `.nl-list` | `gap` | `.5rem` | `var(--space-2)` |
| `pages/new-launches.astro` | `.nl-ref` | `font-size` | `.7em` | `var(--fs-label)` |
| `pages/new-launches.astro` | `.nl-ref` | `margin-left` | `.15em` | `var(--space-1)` |
| `pages/new-launches.astro` | `.nl-ref` | `letter-spacing` | `(none)` | `var(--ls-label)` |
| `pages/new-launches.astro` | `.launch-form` | `margin-top` | `1.5rem` | `var(--space-6)` |
| `pages/new-launches.astro` | `.nl-sources` | `margin-top` | `3rem` | `var(--space-12)` |
| `pages/new-launches.astro` | `.nl-sources` | `font-size` | `.85rem` | `var(--fs-small)` |
| `pages/new-launches.astro` | `.nl-sources` | `line-height` | `(none)` | `var(--lh-small)` |
| `pages/new-launches.astro` | `.nl-sources` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `pages/new-launches.astro` | `.nl-sources .nl-sources-title` | `font-size` | `.85rem` | `var(--fs-small)` |
| `pages/new-launches.astro` | `.nl-sources .nl-sources-title` | `font-weight` | `600` | `400` |
| `pages/new-launches.astro` | `.nl-sources .nl-sources-title` | `line-height` | `1.4` | `var(--lh-small)` |
| `pages/new-launches.astro` | `.nl-sources .nl-sources-title` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `pages/new-launches.astro` | `.nl-sources ol` | `margin` | `.5rem 0 0` | `var(--space-2) 0 0` |
| `pages/new-launches.astro` | `.nl-sources ol` | `padding-left` | `1.25rem` | `var(--space-6)` |
| `pages/new-launches.astro` | `.nl-sources ol` | `gap` | `.25rem` | `var(--space-1)` |
| `pages/new-launches.astro` | `.nl-sources li` | `scroll-margin-top` | `6rem` | `var(--space-24)` |
| `pages/new-launches.astro` | `.nl-sources p:last-child` | `margin-top` | `1rem` | `var(--space-4)` |
| `pages/new-launches.astro` | `.nl-sources p:last-child` | `font-size` | `.85rem` | `var(--fs-small)` |
| `pages/new-launches.astro` | `.nl-sources p:last-child` | `line-height` | `(none)` | `var(--lh-small)` |
| `pages/new-launches.astro` | `.nl-sources p:last-child` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `pages/new-launches.astro` | `.launch-close` | `margin-top` | `1.25rem` | `var(--space-6)` |
| `pages/opportunities/index.astro` | `div` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/opportunities/index.astro` | `div (#3)` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/projects/[slug].astro` | `p` | `margin-top` | `2rem` | `var(--space-8)` |
| `pages/projects/index.astro` | `div` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/projects/index.astro` | `div (#2)` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `pages/projects/index.astro` | `p (#2)` | `margin-top` | `2rem` | `var(--space-8)` |
| `pages/sell.astro` | `div` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `styles/global.css` | `body` | `font-size` | `1rem` | `var(--fs-body)` |
| `styles/global.css` | `body` | `line-height` | `1.65` | `var(--lh-body)` |
| `styles/global.css` | `body` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/global.css` | `main` | `padding-top` | `4.25rem` | `var(--space-16)` |
| `styles/global.css` | `:focus-visible` | `border-radius` | `4px` | `var(--radius-sm)` |
| `styles/global.css` | `.skip` | `padding` | `.75rem 1rem` | `var(--space-3) var(--space-4)` |
| `styles/global.css` | `.skip` | `border-radius` | `var(--r-pill)` | `var(--radius-md)` |
| `styles/global.css` | `.wrap` | `padding` | `0 1.5rem` | `0 var(--space-6)` |
| `styles/global.css` | `.narrow` | `padding` | `0 1.5rem` | `0 var(--space-6)` |
| `styles/global.css` | `.section` | `padding` | `4rem 0` | `var(--space-16) 0` |
| `styles/global.css` | `.eyebrow` | `font-size` | `.72rem` | `var(--fs-label)` |
| `styles/global.css` | `.eyebrow` | `letter-spacing` | `.16em` | `var(--ls-label)` |
| `styles/global.css` | `.eyebrow` | `font-weight` | `600` | `400` |
| `styles/global.css` | `.eyebrow` | `gap` | `.75rem` | `var(--space-3)` |
| `styles/global.css` | `.eyebrow` | `margin` | `0 0 .75rem` | `0 0 var(--space-3)` |
| `styles/global.css` | `.eyebrow` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/global.css` | `h1, h2, h3` | `font-weight` | `400` | `600` |
| `styles/global.css` | `h1, h2, h3` | `line-height` | `1.12` | `var(--lh-heading)` |
| `styles/global.css` | `h1, h2, h3` | `font-size` | `(none)` | `var(--fs-heading)` |
| `styles/global.css` | `h1, h2, h3` | `letter-spacing` | `(none)` | `0` |
| `styles/global.css` | `h1` | `font-size` | `clamp(2.4rem, 5.5vw, 4rem)` | `clamp(var(--fs-display-lg), 2.125rem + 2.5vw, var(--fs-display-xl))` |
| `styles/global.css` | `h1` | `letter-spacing` | `-0.01em` | `var(--ls-display-xl)` |
| `styles/global.css` | `h1` | `line-height` | `(none)` | `clamp(var(--lh-display-lg), 2.75rem + 2vw, var(--lh-display-xl))` |
| `styles/global.css` | `h2` | `font-size` | `clamp(1.9rem, 3.6vw, 2.75rem)` | `clamp(var(--fs-heading), 1.25rem + 2vw, var(--fs-display-lg))` |
| `styles/global.css` | `h2` | `line-height` | `(none)` | `clamp(var(--lh-heading), 1.75rem + 2vw, var(--lh-display-lg))` |
| `styles/global.css` | `h3` | `font-size` | `1.5rem` | `(none)` |
| `styles/global.css` | `h1 em, h2 em` | `font-weight` | `(none)` | `400` |
| `styles/global.css` | `.lede` | `font-size` | `1.125rem` | `var(--fs-body)` |
| `styles/global.css` | `.lede` | `margin` | `1.25rem 0 0` | `var(--space-6) 0 0` |
| `styles/global.css` | `.lede` | `line-height` | `(none)` | `var(--lh-body)` |
| `styles/global.css` | `.lede` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/global.css` | `p` | `margin` | `1rem 0 0` | `var(--space-4) 0 0` |
| `styles/global.css` | `.small` | `font-size` | `.875rem` | `var(--fs-small)` |
| `styles/global.css` | `.small` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.small` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `.fine` | `font-size` | `.75rem` | `var(--fs-small)` |
| `styles/global.css` | `.fine` | `line-height` | `1.55` | `var(--lh-small)` |
| `styles/global.css` | `.fine` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `.btn` | `font` | `600 .875rem/1 var(--sans)` | `(none)` |
| `styles/global.css` | `.btn` | `letter-spacing` | `.03em` | `var(--ls-small)` |
| `styles/global.css` | `.btn` | `padding` | `.95rem 1.5rem` | `var(--space-4) var(--space-6)` |
| `styles/global.css` | `.btn` | `border-radius` | `var(--r-pill)` | `var(--radius-md)` |
| `styles/global.css` | `.btn` | `font-family` | `(none)` | `var(--sans)` |
| `styles/global.css` | `.btn` | `font-weight` | `(none)` | `400` |
| `styles/global.css` | `.btn` | `font-size` | `(none)` | `var(--fs-small)` |
| `styles/global.css` | `.btn` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.actions` | `gap` | `1rem` | `var(--space-4)` |
| `styles/global.css` | `.actions` | `margin-top` | `2rem` | `var(--space-8)` |
| `styles/global.css` | `.card` | `border-radius` | `var(--r-card)` | `var(--radius-lg)` |
| `styles/global.css` | `.card` | `padding` | `1.5rem` | `var(--space-6)` |
| `styles/global.css` | `.card h2, .card h3` | `font-size` | `1.5rem` | `var(--fs-heading)` |
| `styles/global.css` | `.card h2, .card h3` | `line-height` | `(none)` | `var(--lh-heading)` |
| `styles/global.css` | `.card h2, .card h3` | `letter-spacing` | `(none)` | `0` |
| `styles/global.css` | `.card p` | `font-size` | `.95rem` | `var(--fs-body)` |
| `styles/global.css` | `.card p` | `margin-top` | `.5rem` | `var(--space-2)` |
| `styles/global.css` | `.card p` | `line-height` | `(none)` | `var(--lh-body)` |
| `styles/global.css` | `.card p` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/global.css` | `.ways` | `gap` | `22px` | `var(--space-6)` |
| `styles/global.css` | `.card.way` | `padding` | `34px` | `var(--space-8)` |
| `styles/global.css` | `.card.way` | `border-radius` | `var(--r-card)` | `var(--radius-lg)` |
| `styles/global.css` | `.way-num` | `font-family` | `var(--serif)` | `var(--sans)` |
| `styles/global.css` | `.way-num` | `font-size` | `46px` | `var(--fs-stat)` |
| `styles/global.css` | `.way-num` | `line-height` | `1` | `var(--lh-stat)` |
| `styles/global.css` | `.way-num` | `font-variant-numeric` | `lining-nums` | `lining-nums tabular-nums` |
| `styles/global.css` | `.way-num` | `font-weight` | `(none)` | `500` |
| `styles/global.css` | `.way-num` | `letter-spacing` | `(none)` | `var(--ls-stat)` |
| `styles/global.css` | `.card.way .way-label` | `margin` | `1.25rem 0 0` | `var(--space-6) 0 0` |
| `styles/global.css` | `.card.way .way-label` | `font` | `500 11px/1.4 var(--sans)` | `(none)` |
| `styles/global.css` | `.card.way .way-label` | `letter-spacing` | `.22em` | `var(--ls-label)` |
| `styles/global.css` | `.card.way .way-label` | `font-family` | `(none)` | `var(--sans)` |
| `styles/global.css` | `.card.way .way-label` | `font-weight` | `(none)` | `400` |
| `styles/global.css` | `.card.way .way-label` | `font-size` | `(none)` | `var(--fs-label)` |
| `styles/global.css` | `.card.way .way-label` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/global.css` | `.card.way h3` | `font-size` | `30px` | `var(--fs-heading)` |
| `styles/global.css` | `.card.way h3` | `margin-top` | `.45rem` | `var(--space-2)` |
| `styles/global.css` | `.card.way h3` | `line-height` | `(none)` | `var(--lh-heading)` |
| `styles/global.css` | `.card.way h3` | `letter-spacing` | `(none)` | `0` |
| `styles/global.css` | `.way-arrow` | `padding-top` | `1rem` | `var(--space-4)` |
| `styles/global.css` | `.way-arrow` | `font-size` | `1.4rem` | `var(--fs-body)` |
| `styles/global.css` | `.way-arrow` | `line-height` | `1` | `var(--lh-body)` |
| `styles/global.css` | `.way-arrow` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/global.css` | `.grid` | `gap` | `1.25rem` | `var(--space-6)` |
| `styles/global.css` | `.split` | `gap` | `2.5rem` | `var(--space-12)` |
| `styles/global.css` | `.list-plain` | `margin` | `1rem 0 0` | `var(--space-4) 0 0` |
| `styles/global.css` | `.list-plain` | `gap` | `.5rem` | `var(--space-2)` |
| `styles/global.css` | `.trust` | `gap` | `12px` | `var(--space-3)` |
| `styles/global.css` | `.trust` | `padding` | `1.25rem 1.5rem` | `var(--space-6) var(--space-6)` |
| `styles/global.css` | `.trust span` | `gap` | `8px` | `var(--space-2)` |
| `styles/global.css` | `.trust span` | `padding` | `10px 18px` | `var(--space-3) var(--space-4)` |
| `styles/global.css` | `.trust span` | `border-radius` | `var(--r-pill)` | `var(--radius-sm)` |
| `styles/global.css` | `.trust span` | `font` | `500 13px/1.2 var(--sans)` | `(none)` |
| `styles/global.css` | `.trust span` | `font-family` | `(none)` | `var(--sans)` |
| `styles/global.css` | `.trust span` | `font-weight` | `(none)` | `400` |
| `styles/global.css` | `.trust span` | `font-size` | `(none)` | `var(--fs-small)` |
| `styles/global.css` | `.trust span` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.trust span` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `.trust span::before` | `border-radius` | `50%` | `var(--radius-sm)` |
| `styles/global.css` | `.steps` | `gap` | `.6rem` | `var(--space-2)` |
| `styles/global.css` | `.steps` | `margin-top` | `1.75rem` | `var(--space-8)` |
| `styles/global.css` | `.steps li` | `border-radius` | `var(--r-card)` | `var(--radius-sm)` |
| `styles/global.css` | `.steps li` | `padding` | `.4rem .75rem` | `var(--space-2) var(--space-3)` |
| `styles/global.css` | `.steps li` | `font-size` | `.72rem` | `var(--fs-label)` |
| `styles/global.css` | `.steps li` | `letter-spacing` | `.1em` | `var(--ls-label)` |
| `styles/global.css` | `.steps li` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/global.css` | `.stat` | `font-family` | `var(--serif)` | `var(--sans)` |
| `styles/global.css` | `.stat` | `font-size` | `2rem` | `var(--fs-data)` |
| `styles/global.css` | `.stat` | `line-height` | `1.1` | `var(--lh-data)` |
| `styles/global.css` | `.stat` | `font-weight` | `(none)` | `500` |
| `styles/global.css` | `.stat` | `letter-spacing` | `(none)` | `var(--ls-data)` |
| `styles/global.css` | `.stat` | `font-variant-numeric` | `(none)` | `lining-nums tabular-nums` |
| `styles/global.css` | `.stat-label` | `font-size` | `.68rem` | `var(--fs-label)` |
| `styles/global.css` | `.stat-label` | `letter-spacing` | `.12em` | `var(--ls-label)` |
| `styles/global.css` | `.stat-label` | `margin-top` | `.3rem` | `var(--space-1)` |
| `styles/global.css` | `.stat-label` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/global.css` | `.empty` | `padding` | `3rem 1.5rem` | `var(--space-12) var(--space-6)` |
| `styles/global.css` | `.kicker` | `font-size` | `.68rem` | `var(--fs-label)` |
| `styles/global.css` | `.kicker` | `font-weight` | `600` | `400` |
| `styles/global.css` | `.kicker` | `letter-spacing` | `.15em` | `var(--ls-label)` |
| `styles/global.css` | `.kicker` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/global.css` | `.site-nav` | `height` | `4.25rem` | `4rem` |
| `styles/global.css` | `.site-nav .wrap` | `gap` | `10px` | `var(--space-3)` |
| `styles/global.css` | `.brand` | `gap` | `.7rem` | `var(--space-3)` |
| `styles/global.css` | `.brand` | `font-family` | `var(--serif)` | `(none)` |
| `styles/global.css` | `.brand` | `font-size` | `1.35rem` | `(none)` |
| `styles/global.css` | `.brand` | `letter-spacing` | `.01em` | `(none)` |
| `styles/global.css` | `.site-menu` | `gap` | `10px` | `var(--space-3)` |
| `styles/global.css` | `.site-menu` | `font` | `500 14px/1 var(--sans)` | `(none)` |
| `styles/global.css` | `.site-menu` | `font-family` | `(none)` | `var(--sans)` |
| `styles/global.css` | `.site-menu` | `font-weight` | `(none)` | `400` |
| `styles/global.css` | `.site-menu` | `font-size` | `(none)` | `var(--fs-small)` |
| `styles/global.css` | `.site-menu` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.site-menu` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `.site-nav .nav-seg` | `gap` | `2px` | `var(--space-1)` |
| `styles/global.css` | `.site-nav .nav-seg` | `padding` | `4px` | `var(--space-1)` |
| `styles/global.css` | `.site-nav .nav-seg` | `border-radius` | `var(--r-pill)` | `var(--radius-md)` |
| `styles/global.css` | `.site-nav .nav-seg a` | `padding` | `9px 16px` | `var(--space-2) var(--space-4)` |
| `styles/global.css` | `.site-nav .nav-seg a` | `border-radius` | `var(--r-pill)` | `var(--radius-md)` |
| `styles/global.css` | `.site-nav .nav-pills` | `gap` | `8px` | `var(--space-2)` |
| `styles/global.css` | `.site-nav .nav-pills a` | `padding` | `10px 16px` | `var(--space-3) var(--space-4)` |
| `styles/global.css` | `.site-nav .nav-pills a` | `border-radius` | `var(--r-pill)` | `var(--radius-md)` |
| `styles/global.css` | `.site-nav .nav-plain` | `gap` | `6px` | `var(--space-2)` |
| `styles/global.css` | `.site-nav .nav-plain a` | `padding` | `10px 8px` | `var(--space-3) var(--space-2)` |
| `styles/global.css` | `.site-nav .nav-plain a` | `border-radius` | `4px` | `var(--radius-md)` |
| `styles/global.css` | `.site-nav .nav-wa` | `padding` | `12px 22px` | `var(--space-3) var(--space-6)` |
| `styles/global.css` | `.site-nav .nav-wa` | `border-radius` | `var(--r-pill)` | `var(--radius-md)` |
| `styles/global.css` | `.site-nav .nav-wa` | `font-weight` | `600` | `400` |
| `styles/global.css` | `.menu-btn` | `gap` | `5px` | `var(--space-1)` |
| `styles/global.css` | `.menu-btn` | `border-radius` | `var(--r-pill)` | `var(--radius-md)` |
| `styles/global.css` | `.site-menu.open` | `inset` | `4.25rem 0 0 0` | `4rem 0 0 0` |
| `styles/global.css` | `.site-menu.open` | `padding` | `1.5rem` | `var(--space-6)` |
| `styles/global.css` | `.site-menu.open` | `gap` | `14px` | `var(--space-4)` |
| `styles/global.css` | `.site-menu.open` | `border-radius` | `0 0 var(--r-card) var(--r-card)` | `0 0 var(--radius-lg) var(--radius-lg)` |
| `styles/global.css` | `.site-menu.open .nav-plain a` | `padding-inline` | `4px` | `var(--space-1)` |
| `styles/global.css` | `.site-footer` | `padding` | `2.5rem 0 3rem` | `var(--space-12) 0 var(--space-12)` |
| `styles/global.css` | `.site-footer .brand` | `font-size` | `1.05rem` | `(none)` |
| `styles/global.css` | `.foot-row` | `gap` | `1rem 2rem` | `var(--space-4) var(--space-8)` |
| `styles/global.css` | `.foot-row + .foot-row` | `margin-top` | `1.25rem` | `var(--space-6)` |
| `styles/global.css` | `.foot-row + .foot-row` | `padding-top` | `1.25rem` | `var(--space-6)` |
| `styles/global.css` | `.foot-links` | `gap` | `.75rem 1.5rem` | `var(--space-3) var(--space-6)` |
| `styles/global.css` | `.foot-links` | `font-size` | `.85rem` | `var(--fs-small)` |
| `styles/global.css` | `.foot-links` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.foot-links` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `.social` | `gap` | `10px` | `var(--space-3)` |
| `styles/global.css` | `.site-footer .social-label` | `font` | `500 11px/1 var(--sans)` | `(none)` |
| `styles/global.css` | `.site-footer .social-label` | `letter-spacing` | `.2em` | `var(--ls-label)` |
| `styles/global.css` | `.site-footer .social-label` | `margin-right` | `4px` | `var(--space-1)` |
| `styles/global.css` | `.site-footer .social-label` | `font-family` | `(none)` | `var(--sans)` |
| `styles/global.css` | `.site-footer .social-label` | `font-weight` | `(none)` | `400` |
| `styles/global.css` | `.site-footer .social-label` | `font-size` | `(none)` | `var(--fs-label)` |
| `styles/global.css` | `.site-footer .social-label` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/global.css` | `.site-footer .social a` | `padding` | `0 14px` | `0 var(--space-4)` |
| `styles/global.css` | `.site-footer .social a` | `border-radius` | `var(--r-pill)` | `var(--radius-md)` |
| `styles/global.css` | `.site-footer .social a` | `font` | `500 13px/1 var(--sans)` | `(none)` |
| `styles/global.css` | `.site-footer .social a` | `font-family` | `(none)` | `var(--sans)` |
| `styles/global.css` | `.site-footer .social a` | `font-weight` | `(none)` | `400` |
| `styles/global.css` | `.site-footer .social a` | `font-size` | `(none)` | `var(--fs-small)` |
| `styles/global.css` | `.site-footer .social a` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.site-footer .social a` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `.disclosure` | `font-size` | `.75rem` | `var(--fs-small)` |
| `styles/global.css` | `.disclosure` | `margin-top` | `1.25rem` | `var(--space-6)` |
| `styles/global.css` | `.disclosure` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.disclosure` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `form.card` | `padding` | `1.75rem` | `var(--space-8)` |
| `styles/global.css` | `.fields` | `gap` | `1rem` | `var(--space-4)` |
| `styles/global.css` | `.field` | `gap` | `.4rem` | `var(--space-2)` |
| `styles/global.css` | `.field label, .field .lbl` | `font-size` | `.72rem` | `var(--fs-label)` |
| `styles/global.css` | `.field label, .field .lbl` | `letter-spacing` | `.12em` | `var(--ls-label)` |
| `styles/global.css` | `.field label, .field .lbl` | `font-weight` | `600` | `400` |
| `styles/global.css` | `.field label, .field .lbl` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/global.css` | `.field input, .field select, .field textarea` | `font` | `400 1rem var(--sans)` | `(none)` |
| `styles/global.css` | `.field input, .field select, .field textarea` | `border-radius` | `var(--r-field)` | `var(--radius-sm)` |
| `styles/global.css` | `.field input, .field select, .field textarea` | `padding` | `.7rem .8rem` | `var(--space-3) var(--space-3)` |
| `styles/global.css` | `.field input, .field select, .field textarea` | `font-family` | `(none)` | `var(--sans)` |
| `styles/global.css` | `.field input, .field select, .field textarea` | `font-weight` | `(none)` | `400` |
| `styles/global.css` | `.field input, .field select, .field textarea` | `font-size` | `(none)` | `var(--fs-body)` |
| `styles/global.css` | `.field input, .field select, .field textarea` | `line-height` | `(none)` | `var(--lh-body)` |
| `styles/global.css` | `.field input, .field select, .field textarea` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/global.css` | `.field .err` | `font-size` | `.8rem` | `var(--fs-small)` |
| `styles/global.css` | `.field .err` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.field .err` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `.phone-row` | `gap` | `.5rem` | `var(--space-2)` |
| `styles/global.css` | `.cc-display` | `gap` | `.4rem` | `var(--space-2)` |
| `styles/global.css` | `.cc-display` | `font` | `400 1rem var(--sans)` | `(none)` |
| `styles/global.css` | `.cc-display` | `border-radius` | `var(--r-field)` | `var(--radius-sm)` |
| `styles/global.css` | `.cc-display` | `padding` | `.7rem .7rem` | `var(--space-3) var(--space-3)` |
| `styles/global.css` | `.cc-display` | `font-family` | `(none)` | `var(--sans)` |
| `styles/global.css` | `.cc-display` | `font-weight` | `(none)` | `400` |
| `styles/global.css` | `.cc-display` | `font-size` | `(none)` | `var(--fs-body)` |
| `styles/global.css` | `.cc-display` | `line-height` | `(none)` | `var(--lh-body)` |
| `styles/global.css` | `.cc-display` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/global.css` | `.field .cc-control select` | `border-radius` | `var(--r-field)` | `var(--radius-sm)` |
| `styles/global.css` | `.check` | `gap` | `.7rem` | `var(--space-3)` |
| `styles/global.css` | `.check` | `font-size` | `.875rem` | `var(--fs-small)` |
| `styles/global.css` | `.check` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.check` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `.check input[type='checkbox']` | `margin` | `.3rem 0 0` | `var(--space-1) 0 0` |
| `styles/global.css` | `.check input[type='checkbox']` | `border-radius` | `4px` | `var(--radius-sm)` |
| `styles/global.css` | `.form-foot` | `gap` | `1rem` | `var(--space-4)` |
| `styles/global.css` | `.form-foot` | `margin-top` | `1.25rem` | `var(--space-6)` |
| `styles/global.css` | `.status` | `font-size` | `.95rem` | `var(--fs-body)` |
| `styles/global.css` | `.status` | `line-height` | `(none)` | `var(--lh-body)` |
| `styles/global.css` | `.status` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/global.css` | `.turnstile` | `margin-top` | `1rem` | `var(--space-4)` |
| `styles/global.css` | `.prose h2` | `font-size` | `1.75rem` | `var(--fs-heading)` |
| `styles/global.css` | `.prose h2` | `margin-top` | `2.25rem` | `var(--space-8)` |
| `styles/global.css` | `.prose h2` | `line-height` | `(none)` | `var(--lh-heading)` |
| `styles/global.css` | `.prose h2` | `letter-spacing` | `(none)` | `0` |
| `styles/global.css` | `.prose h3` | `font-size` | `1.25rem` | `var(--fs-data)` |
| `styles/global.css` | `.prose h3` | `margin-top` | `1.5rem` | `var(--space-6)` |
| `styles/global.css` | `.prose h3` | `font-weight` | `600` | `500` |
| `styles/global.css` | `.prose h3` | `line-height` | `(none)` | `var(--lh-data)` |
| `styles/global.css` | `.prose h3` | `letter-spacing` | `(none)` | `var(--ls-data)` |
| `styles/global.css` | `.prose p, .prose li` | `font-size` | `1rem` | `var(--fs-body)` |
| `styles/global.css` | `.prose p, .prose li` | `line-height` | `(none)` | `var(--lh-body)` |
| `styles/global.css` | `.prose p, .prose li` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/global.css` | `.prose ul` | `padding-left` | `1.25rem` | `var(--space-6)` |
| `styles/global.css` | `.prose ul` | `margin` | `.75rem 0 0` | `var(--space-3) 0 0` |
| `styles/global.css` | `.prose li` | `margin-top` | `.4rem` | `var(--space-2)` |
| `styles/global.css` | `.src` | `font-size` | `.78rem` | `var(--fs-small)` |
| `styles/global.css` | `.src` | `margin-top` | `.5rem` | `var(--space-2)` |
| `styles/global.css` | `.src` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.src` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `.verdict` | `border-radius` | `var(--r-pill)` | `var(--radius-sm)` |
| `styles/global.css` | `.verdict` | `font-size` | `.72rem` | `var(--fs-label)` |
| `styles/global.css` | `.verdict` | `font-weight` | `700` | `400` |
| `styles/global.css` | `.verdict` | `letter-spacing` | `.14em` | `var(--ls-label)` |
| `styles/global.css` | `.verdict` | `padding` | `.35rem .8rem` | `var(--space-1) var(--space-3)` |
| `styles/global.css` | `.verdict` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/global.css` | `.badge` | `border-radius` | `var(--r-pill)` | `var(--radius-sm)` |
| `styles/global.css` | `.badge` | `font-size` | `.7rem` | `var(--fs-label)` |
| `styles/global.css` | `.badge` | `font-weight` | `600` | `400` |
| `styles/global.css` | `.badge` | `letter-spacing` | `.08em` | `var(--ls-label)` |
| `styles/global.css` | `.badge` | `padding` | `.2rem .55rem` | `var(--space-1) var(--space-2)` |
| `styles/global.css` | `.badge` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/global.css` | `.brief h2` | `font-size` | `1.6rem` | `var(--fs-heading)` |
| `styles/global.css` | `.brief h2` | `margin-top` | `2.5rem` | `var(--space-12)` |
| `styles/global.css` | `.brief h2` | `padding-top` | `1.25rem` | `var(--space-6)` |
| `styles/global.css` | `.brief h2` | `line-height` | `(none)` | `var(--lh-heading)` |
| `styles/global.css` | `.brief h2` | `letter-spacing` | `(none)` | `0` |
| `styles/global.css` | `.brief ul` | `padding-left` | `1.2rem` | `var(--space-4)` |
| `styles/global.css` | `.brief li` | `margin` | `.35rem 0` | `var(--space-1) 0` |
| `styles/global.css` | `.brief table` | `font-size` | `.92rem` | `var(--fs-data)` |
| `styles/global.css` | `.brief table` | `margin-top` | `1rem` | `var(--space-4)` |
| `styles/global.css` | `.brief table` | `line-height` | `(none)` | `var(--lh-data)` |
| `styles/global.css` | `.brief table` | `letter-spacing` | `(none)` | `var(--ls-data)` |
| `styles/global.css` | `.brief table` | `font-weight` | `(none)` | `500` |
| `styles/global.css` | `.brief th, .brief td` | `padding` | `.6rem .75rem` | `var(--space-2) var(--space-3)` |
| `styles/global.css` | `.brief th` | `font-size` | `.68rem` | `var(--fs-label)` |
| `styles/global.css` | `.brief th` | `letter-spacing` | `.12em` | `var(--ls-label)` |
| `styles/global.css` | `.brief th` | `font-weight` | `600` | `400` |
| `styles/global.css` | `.brief th` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/global.css` | `.brief .meta` | `font-size` | `.8rem` | `var(--fs-small)` |
| `styles/global.css` | `.brief .meta` | `gap` | `.5rem 1.5rem` | `var(--space-2) var(--space-6)` |
| `styles/global.css` | `.brief .meta` | `margin-top` | `1rem` | `var(--space-4)` |
| `styles/global.css` | `.brief .meta` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.brief .meta` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `.stale-banner` | `border-radius` | `var(--r-card)` | `var(--radius-lg)` |
| `styles/global.css` | `.stale-banner` | `padding` | `1rem 1.25rem` | `var(--space-4) var(--space-6)` |
| `styles/global.css` | `.stale-banner` | `margin-top` | `1.5rem` | `var(--space-6)` |
| `styles/global.css` | `.stale-banner` | `font-size` | `.9rem` | `var(--fs-small)` |
| `styles/global.css` | `.stale-banner` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.stale-banner` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `.cite` | `font-size` | `.7rem` | `var(--fs-label)` |
| `styles/global.css` | `.cite` | `margin-left` | `.15rem` | `var(--space-1)` |
| `styles/global.css` | `.cite` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/global.css` | `.cite` | `letter-spacing` | `(none)` | `var(--ls-label)` |
| `styles/global.css` | `.src a + a` | `margin-left` | `.4rem` | `var(--space-2)` |
| `styles/global.css` | `.fab-stack` | `gap` | `.75rem` | `var(--space-3)` |
| `styles/global.css` | `.fab` | `border-radius` | `50%` | `(none)` |
| `styles/global.css` | `.fab--wa` | `border-radius` | `(none)` | `var(--radius-full)` |
| `styles/global.css` | `.fab--top` | `border-radius` | `(none)` | `var(--radius-md)` |
| `styles/global.css` | `.faq` | `margin-top` | `2rem` | `var(--space-8)` |
| `styles/global.css` | `.faq summary` | `gap` | `1.5rem` | `var(--space-6)` |
| `styles/global.css` | `.faq summary` | `padding` | `1.25rem 0` | `var(--space-6) 0` |
| `styles/global.css` | `.faq summary` | `font-family` | `var(--serif)` | `var(--sans)` |
| `styles/global.css` | `.faq summary` | `font-size` | `1.35rem` | `var(--fs-data)` |
| `styles/global.css` | `.faq summary` | `line-height` | `1.3` | `var(--lh-data)` |
| `styles/global.css` | `.faq summary` | `font-weight` | `(none)` | `500` |
| `styles/global.css` | `.faq summary` | `letter-spacing` | `(none)` | `var(--ls-data)` |
| `styles/global.css` | `.faq summary::after` | `font-size` | `1.4rem` | `var(--fs-body)` |
| `styles/global.css` | `.faq summary::after` | `font-weight` | `300` | `400` |
| `styles/global.css` | `.faq summary::after` | `line-height` | `(none)` | `var(--lh-body)` |
| `styles/global.css` | `.faq summary::after` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/global.css` | `.faq .answer` | `padding` | `0 0 1.5rem` | `0 0 var(--space-6)` |
| `styles/global.css` | `.print-head` | `gap` | `.6rem` | `var(--space-2)` |
| `styles/global.css` | `.print-head` | `font-family` | `var(--serif)` | `var(--sans)` |
| `styles/global.css` | `.print-head` | `font-size` | `1.15rem` | `var(--fs-body)` |
| `styles/global.css` | `.print-head` | `padding-bottom` | `.75rem` | `var(--space-3)` |
| `styles/global.css` | `.print-head` | `margin-bottom` | `1rem` | `var(--space-4)` |
| `styles/global.css` | `.print-head` | `font-weight` | `(none)` | `400` |
| `styles/global.css` | `.print-head` | `line-height` | `(none)` | `var(--lh-body)` |
| `styles/global.css` | `.print-head` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/global.css` | `.print-foot` | `margin-top` | `2rem` | `var(--space-8)` |
| `styles/global.css` | `.print-foot` | `padding-top` | `.75rem` | `var(--space-3)` |
| `styles/global.css` | `.print-foot` | `font-size` | `.8rem` | `var(--fs-small)` |
| `styles/global.css` | `.print-foot` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/global.css` | `.print-foot` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/global.css` | `.print-foot p` | `margin` | `.2rem 0 0` | `var(--space-1) 0 0` |
| `styles/global.css` | `.sr-only` | `margin` | `-1px` | `0` |
| `styles/market.css` | `.mk-h2` | `font-size` | `clamp(1.6rem, 3vw, 2.25rem)` | `(none)` |
| `styles/market.css` | `.mk-block` | `margin-top` | `3rem` | `var(--space-12)` |
| `styles/market.css` | `.mk-block > .mk-h2 + *` | `margin-top` | `1.25rem` | `var(--space-6)` |
| `styles/market.css` | `.mk-src` | `font-size` | `.8rem` | `var(--fs-small)` |
| `styles/market.css` | `.mk-src` | `margin-top` | `.9rem` | `var(--space-4)` |
| `styles/market.css` | `.mk-src` | `line-height` | `1.55` | `var(--lh-small)` |
| `styles/market.css` | `.mk-src` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/market.css` | `.mk-label` | `font-size` | `.8rem` | `var(--fs-small)` |
| `styles/market.css` | `.mk-label` | `line-height` | `1.35` | `var(--lh-small)` |
| `styles/market.css` | `.mk-label` | `margin` | `.2rem 0 0` | `var(--space-1) 0 0` |
| `styles/market.css` | `.mk-label` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/market.css` | `.mk-change` | `font-weight` | `600` | `500` |
| `styles/market.css` | `.mk-h2, .mk-area, .mk-value, .mk-tile-value, .mk-lead, .mk-guide h3` | `font-variant-numeric` | `lining-nums` | `(none)` |
| `styles/market.css` | `.mk-switch-bar` | `top` | `var(--mk-header, 4.25rem)` | `var(--mk-header, 4rem)` |
| `styles/market.css` | `.mk-switch-bar` | `margin-top` | `2rem` | `var(--space-8)` |
| `styles/market.css` | `.mk-switch-bar` | `padding` | `.75rem 0` | `var(--space-3) 0` |
| `styles/market.css` | `.mk-switch-row` | `gap` | `.75rem 1rem` | `var(--space-3) var(--space-4)` |
| `styles/market.css` | `.mk-switch-label` | `font-size` | `.875rem` | `var(--fs-small)` |
| `styles/market.css` | `.mk-switch-label` | `font-weight` | `500` | `400` |
| `styles/market.css` | `.mk-switch-label` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/market.css` | `.mk-switch-label` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/market.css` | `.mk-pills` | `gap` | `.5rem` | `var(--space-2)` |
| `styles/market.css` | `.mk-pill` | `padding` | `0 1.25rem` | `0 var(--space-6)` |
| `styles/market.css` | `.mk-pill` | `border-radius` | `var(--r-pill)` | `var(--radius-md)` |
| `styles/market.css` | `.mk-pill` | `font` | `500 .95rem/1 var(--sans)` | `(none)` |
| `styles/market.css` | `.mk-pill` | `font-family` | `(none)` | `var(--sans)` |
| `styles/market.css` | `.mk-pill` | `font-weight` | `(none)` | `400` |
| `styles/market.css` | `.mk-pill` | `font-size` | `(none)` | `var(--fs-body)` |
| `styles/market.css` | `.mk-pill` | `line-height` | `(none)` | `var(--lh-body)` |
| `styles/market.css` | `.mk-pill` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/market.css` | `.mk-tiles` | `gap` | `1rem` | `var(--space-4)` |
| `styles/market.css` | `.mk-tile` | `border-radius` | `var(--r-card)` | `var(--radius-lg)` |
| `styles/market.css` | `.mk-tile` | `padding` | `1.25rem 1.25rem 1.1rem` | `var(--space-6) var(--space-6) var(--space-4)` |
| `styles/market.css` | `.mk-tile-value` | `font-family` | `var(--serif)` | `var(--sans)` |
| `styles/market.css` | `.mk-tile-value` | `font-size` | `clamp(1.6rem, 3vw, 2.25rem)` | `var(--fs-stat)` |
| `styles/market.css` | `.mk-tile-value` | `line-height` | `1.1` | `var(--lh-stat)` |
| `styles/market.css` | `.mk-tile-value` | `font-weight` | `(none)` | `500` |
| `styles/market.css` | `.mk-tile-value` | `letter-spacing` | `(none)` | `var(--ls-stat)` |
| `styles/market.css` | `.mk-tile-label` | `font-size` | `.875rem` | `var(--fs-small)` |
| `styles/market.css` | `.mk-tile-label` | `margin` | `.35rem 0 0` | `var(--space-1) 0 0` |
| `styles/market.css` | `.mk-tile-label` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/market.css` | `.mk-tile-label` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/market.css` | `.mk-chip` | `padding` | `.4rem .85rem` | `var(--space-2) var(--space-3)` |
| `styles/market.css` | `.mk-chip` | `border-radius` | `var(--r-pill)` | `var(--radius-sm)` |
| `styles/market.css` | `.mk-chip` | `font-size` | `.72rem` | `var(--fs-label)` |
| `styles/market.css` | `.mk-chip` | `font-weight` | `600` | `400` |
| `styles/market.css` | `.mk-chip` | `letter-spacing` | `.12em` | `var(--ls-label)` |
| `styles/market.css` | `.mk-chip` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/market.css` | `.mk-note` | `margin` | `.9rem 0 0` | `var(--space-4) 0 0` |
| `styles/market.css` | `.mk-note` | `padding` | `.8rem 1rem` | `var(--space-3) var(--space-4)` |
| `styles/market.css` | `.mk-note` | `border-radius` | `var(--r-field)` | `var(--radius-lg)` |
| `styles/market.css` | `.mk-note` | `font-size` | `.875rem` | `var(--fs-small)` |
| `styles/market.css` | `.mk-note` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/market.css` | `.mk-note` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/market.css` | `.mk-cards` | `gap` | `1rem` | `var(--space-4)` |
| `styles/market.css` | `.mk-cards` | `margin-top` | `1.25rem` | `var(--space-6)` |
| `styles/market.css` | `.mk-cards (#2)` | `gap` | `.75rem` | `var(--space-3)` |
| `styles/market.css` | `.mk-card` | `border-radius` | `var(--r-card)` | `var(--radius-lg)` |
| `styles/market.css` | `.mk-card` | `padding` | `1.1rem` | `var(--space-4)` |
| `styles/market.css` | `.mk-rank` | `font-size` | `.8rem` | `var(--fs-data)` |
| `styles/market.css` | `.mk-rank` | `font-weight` | `600` | `500` |
| `styles/market.css` | `.mk-rank` | `line-height` | `(none)` | `var(--lh-data)` |
| `styles/market.css` | `.mk-rank` | `letter-spacing` | `(none)` | `var(--ls-data)` |
| `styles/market.css` | `.mk-area` | `font-size` | `1.3rem` | `var(--fs-heading)` |
| `styles/market.css` | `.mk-area` | `margin-top` | `.35rem` | `var(--space-1)` |
| `styles/market.css` | `.mk-area` | `line-height` | `(none)` | `var(--lh-heading)` |
| `styles/market.css` | `.mk-area` | `letter-spacing` | `(none)` | `0` |
| `styles/market.css` | `.mk-value` | `font-family` | `var(--serif)` | `var(--sans)` |
| `styles/market.css` | `.mk-value` | `font-size` | `clamp(1.45rem, 2.4vw, 2rem)` | `var(--fs-stat)` |
| `styles/market.css` | `.mk-value` | `line-height` | `1.1` | `var(--lh-stat)` |
| `styles/market.css` | `.mk-value` | `margin` | `.75rem 0 0` | `var(--space-3) 0 0` |
| `styles/market.css` | `.mk-value` | `white-space` | `nowrap` | `(none)` |
| `styles/market.css` | `.mk-value` | `font-weight` | `(none)` | `500` |
| `styles/market.css` | `.mk-value` | `letter-spacing` | `(none)` | `var(--ls-stat)` |
| `styles/market.css` | `.mk-card .mk-value` | `padding-top` | `.75rem` | `var(--space-3)` |
| `styles/market.css` | `.mk-card .mk-value` | `font-size` | `(none)` | `var(--fs-data)` |
| `styles/market.css` | `.mk-card .mk-value` | `line-height` | `(none)` | `var(--lh-data)` |
| `styles/market.css` | `.mk-card .mk-value` | `letter-spacing` | `(none)` | `var(--ls-data)` |
| `styles/market.css` | `.mk-bar` | `border-radius` | `var(--r-pill)` | `var(--radius-sm)` |
| `styles/market.css` | `.mk-bar` | `margin-top` | `.6rem` | `var(--space-2)` |
| `styles/market.css` | `.mk-bar span` | `border-radius` | `var(--r-pill)` | `var(--radius-sm)` |
| `styles/market.css` | `.mk-foot` | `gap` | `.25rem .75rem` | `var(--space-1) var(--space-3)` |
| `styles/market.css` | `.mk-foot` | `margin` | `.6rem 0 0` | `var(--space-2) 0 0` |
| `styles/market.css` | `.mk-foot` | `font-size` | `.85rem` | `var(--fs-small)` |
| `styles/market.css` | `.mk-foot` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/market.css` | `.mk-foot` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/market.css` | `.mk-card (#2)` | `padding` | `.9rem` | `var(--space-4)` |
| `styles/market.css` | `.mk-area (#2)` | `font-size` | `1.1rem` | `(none)` |
| `styles/market.css` | `.mk-table-card` | `border-radius` | `var(--r-card)` | `var(--radius-lg)` |
| `styles/market.css` | `.mk-table` | `font-size` | `.95rem` | `var(--fs-data)` |
| `styles/market.css` | `.mk-table` | `line-height` | `(none)` | `var(--lh-data)` |
| `styles/market.css` | `.mk-table` | `letter-spacing` | `(none)` | `var(--ls-data)` |
| `styles/market.css` | `.mk-table` | `font-weight` | `(none)` | `500` |
| `styles/market.css` | `.mk-table th, .mk-table td` | `padding` | `.7rem 1rem` | `var(--space-3) var(--space-4)` |
| `styles/market.css` | `.mk-table th` | `font-size` | `.7rem` | `var(--fs-label)` |
| `styles/market.css` | `.mk-table th` | `letter-spacing` | `.12em` | `var(--ls-label)` |
| `styles/market.css` | `.mk-table th` | `font-weight` | `600` | `400` |
| `styles/market.css` | `.mk-table th` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/market.css` | `.mk-ask` | `margin-top` | `3rem` | `var(--space-12)` |
| `styles/market.css` | `.mk-ask` | `font-size` | `1.125rem` | `var(--fs-body)` |
| `styles/market.css` | `.mk-ask` | `line-height` | `(none)` | `var(--lh-body)` |
| `styles/market.css` | `.mk-ask` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/market.css` | `.mk-guides` | `margin-top` | `3.5rem` | `var(--space-16)` |
| `styles/market.css` | `.mk-guide-grid` | `gap` | `1rem` | `var(--space-4)` |
| `styles/market.css` | `.mk-guide-grid` | `margin-top` | `1.25rem` | `var(--space-6)` |
| `styles/market.css` | `.mk-guide h3` | `font-size` | `1.5rem` | `var(--fs-heading)` |
| `styles/market.css` | `.mk-guide h3` | `line-height` | `(none)` | `var(--lh-heading)` |
| `styles/market.css` | `.mk-guide h3` | `letter-spacing` | `(none)` | `0` |
| `styles/market.css` | `.mk-guide-card` | `margin-top` | `2rem` | `var(--space-8)` |
| `styles/market.css` | `.mk-guide-card` | `border-radius` | `var(--r-card)` | `var(--radius-lg)` |
| `styles/market.css` | `.mk-guide-card` | `padding` | `1.4rem 1.5rem` | `var(--space-6) var(--space-6)` |
| `styles/market.css` | `.mk-guide-card .mk-value` | `font-size` | `clamp(1.9rem, 4vw, 2.5rem)` | `(none)` |
| `styles/market.css` | `.mk-launch-grid` | `gap` | `1rem` | `var(--space-4)` |
| `styles/market.css` | `.mk-launch-grid` | `margin-top` | `1.25rem` | `var(--space-6)` |
| `styles/market.css` | `.mk-launch` | `border-radius` | `var(--r-card)` | `var(--radius-lg)` |
| `styles/market.css` | `.mk-launch` | `padding` | `1.4rem 1.5rem` | `var(--space-6) var(--space-6)` |
| `styles/market.css` | `.mk-launch h3` | `font-size` | `1.5rem` | `var(--fs-heading)` |
| `styles/market.css` | `.mk-launch h3` | `line-height` | `(none)` | `var(--lh-heading)` |
| `styles/market.css` | `.mk-launch h3` | `letter-spacing` | `(none)` | `0` |
| `styles/market.css` | `.mk-lead` | `font-family` | `var(--serif)` | `var(--sans)` |
| `styles/market.css` | `.mk-lead` | `font-size` | `1.5rem` | `var(--fs-data)` |
| `styles/market.css` | `.mk-lead` | `line-height` | `1.2` | `var(--lh-data)` |
| `styles/market.css` | `.mk-lead` | `margin` | `.6rem 0 0` | `var(--space-2) 0 0` |
| `styles/market.css` | `.mk-lead` | `font-weight` | `(none)` | `500` |
| `styles/market.css` | `.mk-lead` | `letter-spacing` | `(none)` | `var(--ls-data)` |
| `styles/market.css` | `.mk-sub` | `margin` | `1rem 0 0` | `var(--space-4) 0 0` |
| `styles/market.css` | `.mk-sub` | `font-size` | `.72rem` | `var(--fs-label)` |
| `styles/market.css` | `.mk-sub` | `letter-spacing` | `.12em` | `var(--ls-label)` |
| `styles/market.css` | `.mk-sub` | `font-weight` | `600` | `400` |
| `styles/market.css` | `.mk-sub` | `line-height` | `(none)` | `var(--lh-label)` |
| `styles/market.css` | `.mk-list` | `margin` | `.4rem 0 0` | `var(--space-2) 0 0` |
| `styles/market.css` | `.mk-list li` | `gap` | `1rem` | `var(--space-4)` |
| `styles/market.css` | `.mk-list li` | `padding` | `.45rem 0` | `var(--space-2) 0` |
| `styles/market.css` | `.mk-list li` | `font-size` | `.95rem` | `var(--fs-body)` |
| `styles/market.css` | `.mk-list li` | `line-height` | `(none)` | `var(--lh-body)` |
| `styles/market.css` | `.mk-list li` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/market.css` | `.mk-list .mk-label` | `margin-left` | `.35rem` | `var(--space-1)` |
| `styles/market.css` | `.mk-line` | `margin` | `.6rem 0 0` | `var(--space-2) 0 0` |
| `styles/market.css` | `.mk-line` | `font-size` | `1rem` | `var(--fs-body)` |
| `styles/market.css` | `.mk-line` | `line-height` | `(none)` | `var(--lh-body)` |
| `styles/market.css` | `.mk-line` | `letter-spacing` | `(none)` | `var(--ls-body)` |
| `styles/market.css` | `.lw-grid` | `gap` | `1rem` | `var(--space-4)` |
| `styles/market.css` | `.lw-grid` | `margin-top` | `1.25rem` | `var(--space-6)` |
| `styles/market.css` | `.lw-card` | `border-radius` | `var(--r-card)` | `var(--radius-lg)` |
| `styles/market.css` | `.lw-card` | `padding` | `1.25rem` | `var(--space-6)` |
| `styles/market.css` | `.lw-card h3` | `font-size` | `1.4rem` | `var(--fs-heading)` |
| `styles/market.css` | `.lw-card h3` | `line-height` | `(none)` | `var(--lh-heading)` |
| `styles/market.css` | `.lw-card h3` | `letter-spacing` | `(none)` | `0` |
| `styles/market.css` | `.lw-permit` | `gap` | `.75rem` | `var(--space-3)` |
| `styles/market.css` | `.lw-permit` | `margin-top` | `1rem` | `var(--space-4)` |
| `styles/market.css` | `.lw-permit` | `font-size` | `.8rem` | `var(--fs-small)` |
| `styles/market.css` | `.lw-permit` | `line-height` | `(none)` | `var(--lh-small)` |
| `styles/market.css` | `.lw-permit` | `letter-spacing` | `(none)` | `var(--ls-small)` |
| `styles/market.css` | `.lw-permit img` | `border-radius` | `4px` | `var(--radius-sm)` |
| `styles/global.css` | `b, strong` | `font-weight` | `(none)` | `500` |
| `styles/global.css` | `th` | `font-weight` | `(none)` | `400` |
| `styles/global.css` | `.site-footer .brand span` | `font-family` | `(none)` | `var(--serif)` |
| `styles/global.css` | `.site-footer .brand span` | `font-style` | `(none)` | `italic` |
| `styles/global.css` | `.site-footer .brand span` | `font-weight` | `(none)` | `400` |
| `styles/global.css` | `.site-footer .brand span` | `font-size` | `(none)` | `var(--fs-tagline)` |
| `styles/global.css` | `.site-footer .brand span` | `line-height` | `(none)` | `var(--lh-tagline)` |
| `styles/global.css` | `.site-footer .brand span` | `letter-spacing` | `(none)` | `0` |
| `styles/market.css` | `.mk-h2, .mk-area, .mk-guide h3` | `font-variant-numeric` | `(none)` | `lining-nums` |
| `styles/market.css` | `.mk-value, .mk-tile-value, .mk-lead, .mk-rank` | `font-variant-numeric` | `(none)` | `lining-nums tabular-nums` |
