# Copy and claim changes needing owner approval (vs the live site, 2026-09-20)

Rule: claims are the owner's. Nothing below goes public until the owner sets the Notion card to "Approved". Everything not listed here is carried over verbatim.

## A. Decisions already made by the owner (applied)
1. Title is "Real Estate Consultant" only. Removed "& Investment Advisor" from: home title, About subtitle, About meta description, JSON-LD `jobTitle`.
2. Public email is `hello@sharjeelhashmat.com` (footer, form error text). Gmail removed.
3. Footer/About regulatory line now reads `BRN <number>` (was "RERA ORN pending"). Builds that go public refuse to run without a BRN.

## B. New or changed wording: APPROVED as written by the owner 2026-09-21
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

## C. Previously unsupported claims: DECIDED 2026-09-21 (owner delegated the call; applied)
1. "A structured report on every listed property, see one on any property page" now reads "A structured report on every property I recommend." (Home, /investment-approach). No listings exist, so nothing implies a viewable report.
2. The trademark symbol is removed everywhere ("Sharjeel Property Brief"). No registration is known. Re-add only if the owner registers or holds the mark.
3. About: "Emirates NBD in Abu Dhabi" and the Track record placeholder kept. Owner's own facts; the placeholder is honest.
4. Terms §10 keeps "the Compass Key name, mark" (ownership wording unchanged apart from the removed symbol).

## D. Brokerage and regulatory consistency: DECIDED 2026-09-21 (applied)
The site now names **Royals Field Properties** beside the BRN line (footer and About: "Working with Royals Field Properties · BRN <number>"). Privacy §1 now says the site is operated by Sharjeel Hashmat, a freelance real estate consultant working with Royals Field Properties, replacing "not affiliated with any employer". The name lives in one constant, `SITE.brokerage` in `src/lib/site.ts`; changing brokerage is a one-line edit. The Worker email footer (`{{affiliation_line}}`) already says Royals Field Properties, so site and email now agree.
Open items (not blockers for staging, blockers for public release):
- BRN is not yet available. The public build refuses to run without `PUBLIC_BRN` (kept on purpose). The site cannot go public and indexable until the BRN exists.
- Naming a brokerage in marketing normally needs that brokerage's approval. Get Royals Field's OK before going public. [Likely] Not legal advice.
- Privacy does not say enquiries may be shared with the brokerage. If they are, Privacy needs one more sentence; the owner should confirm the practice first.

## E. SEO mechanics applied without approval (allowed: sitemap and schema mechanics)
`/new-launches` and `/insights` (empty states) and the 8 area pages (one overview sentence, rest "Ask Sharjeel") are `noindex` and left out of the sitemap until they carry real content. Live they are indexable thin pages.
