# Copy and claim changes needing owner approval (vs the live site, 2026-09-20)

Rule: claims are the owner's. Nothing below goes public until the owner sets the Notion card to "Approved". Everything not listed here is carried over verbatim.

## A. Decisions already made by the owner (applied)
1. Title is "Real Estate Consultant" only. Removed "& Investment Advisor" from: home title, About subtitle, About meta description, JSON-LD `jobTitle`.
2. Public email is `hello@sharjeelhashmat.com` (footer, form error text). Gmail removed.
3. Footer/About regulatory line now reads `BRN <number>` (was "RERA ORN pending"). Builds that go public refuse to run without a BRN.

## B. New or changed wording (please approve or edit)
| Where | Change |
|---|---|
| Home, Property Brief card | Added: "My method is set out on the investment approach page." |
| Invest intro | Added: "See how I work through them." (link) |
| About, How I work | Added link text: "The approach in full." |
| NEW `/investment-approach` | Page linked from 6 approved reply templates (they point to `/investment-approach`; it did not exist). Every sentence is reused from the live Home, About and Invest pages. |
| Forms | Email is now required (Worker needs it; the old form accepted phone-only). Added a required consent checkbox: "I agree that Sharjeel Hashmat may contact me about my enquiry using the details above." and an optional one: "Send me the occasional market note. I can unsubscribe at any time." Removed the "Verify via WhatsApp" link. Budget, timeline and funding are dropdowns matching the Worker's bands. |
| Privacy §2 | Fields listed now include email, country, budget range; mentions the Turnstile bot check. |
| Privacy §4 | Added: enquiries are sorted by fixed rules to pick the automated acknowledgement and alert speed; follow-up is written by the owner. (Needed because scoring is automated processing.) |
| Privacy §5 | Firebase paragraph replaced: Cloudflare (Workers, D1, Turnstile), Resend (email delivery), Zoho Mail (mailbox); data may be held outside the UAE including Europe. |
| Privacy §7 | Removed the Firestore/Storage rules reference; now "security features of the infrastructure described above". |
| Privacy date | "Last updated: 20 September 2026". Terms unchanged (5 September 2026). |

## C. Existing claims that are not currently supported (kept verbatim; decide)
1. Home and Invest: "A structured report on every listed property — see one on any property page". There are no listings, so no Property Brief can be viewed. Suggest: soften until the first listing exists.
2. "Sharjeel Property Brief™": the ™ asserts a trademark claim. No registration is known to me. Suggest: drop the symbol or keep only if intended.
3. About: "Emirates NBD in Abu Dhabi" and the Track record placeholder are kept as they were.
4. Terms §10 mentions "the Compass Key name, mark" while the site is name-first. Kept.

## D. Regulatory consistency (owner or lawyer decision)
The site shows no brokerage name by an earlier decision, and Privacy §1 says the site is not affiliated with any employer. The Worker's approved reply templates carry `{{affiliation_line}}` = "Royals Field Properties". [Likely] Dubai property marketing rules expect the broker's registration number and the brokerage's identity on advertising. I am not a lawyer; confirm with Royals Field or a UAE lawyer, then align the site, Privacy §1 and the email footer to one position.

## E. SEO mechanics applied without approval (allowed: sitemap and schema mechanics)
`/new-launches` and `/insights` (empty states) and the 8 area pages (one overview sentence, rest "Ask Sharjeel") are `noindex` and left out of the sitemap until they carry real content. Live they are indexable thin pages.
