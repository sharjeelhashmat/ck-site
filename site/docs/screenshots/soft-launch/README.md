# Soft launch: before and after, for owner approval

Soft launch mode (Rules v5.9 section 8d, owner 2026-11-05): a public, indexable site with no lead capture, no legal pages
and no agency, ORN, BRN or permit. One switch, `softLaunch` in `site/src/lib/golive.ts` (`LEAD_CAPTURE = !softLaunch`),
drives every removal below; setting it to `false` restores all of them.

- `before/` is the untouched `phase2-site` build, `after/` this branch. Both are noindex builds in Chromium, full page,
  375 and 1280 px wide. The lead Worker's market endpoints answer with the same invented fixture figures the a11y check
  uses (never real data). File names match between the two folders. The 6 files missing from `after/` are the 3 pages
  that are no longer built.
- `contact-sheet-375.png` and `contact-sheet-1280.png`: every page as a before | after pair (the top of each page). Pages
  no longer built show "not built (404)".

No copy was reworded and no colour, type, spacing, logo or legal text changed. Every change is a removal.

## Pages no longer built (404, not in the sitemap)

| page | why |
|---|---|
| /privacy | legal page, hidden in soft launch |
| /terms | legal page, hidden in soft launch |
| /investor-profile | exists only for its form (step 2 after an enquiry) |

There is no separate thank-you or confirmation page: the enquiry and newsletter confirmations are shown inside the forms,
which are gone.

## Removed elements by page

| page | removed |
|---|---|
| every page | nav "WhatsApp" button; floating WhatsApp icon button (back-to-top stays); footer newsletter sign-up; footer "Privacy" and "Terms" links; first-touch attribution script (form script) |
| / (home) | hero buttons "Get the numbers on a property" and "Speak with Sharjeel →"; the four "ways" cards are no longer links (same text and styling, the arrow "→" dropped); "Start the conversation →"; the whole "Ready to talk?" block (heading, text and "Get in touch") |
| /about | closing line "Serious about UAE property? Let's talk. Still deciding? I'll tell you exactly where you stand." (it invites contact) and "Get in touch" |
| /contact | the enquiry form (with Turnstile); replaced by the footer's existing phone and email links, same text |
| /sell | the valuation form ("Request My Valuation") and the lede sentence "A short valuation request below gets a comparable analysis started." |
| /buy | "Tell me what you're looking for" and "WhatsApp me instead →" |
| /invest | ROI calculator "Discuss this with Sharjeel"; "Get my investment shortlist" |
| /investment-approach | "Get the numbers on a property" |
| /faq | "Get in touch"; the questions "How do I start working with you?" and "How quickly do you respond to enquiries?" (page and FAQPage JSON-LD), whose answers describe the form |
| /new-launches | hero "Ask me about a launch →"; under Launch activity, "Want to know what they mean for a specific launch? Ask me." (keeps "Updated weekly."); the "Ask me about a launch" block (heading, "Tell me what you want to know. I'll answer within 24 hours." and the question form) |
| /areas | "Want to know what these numbers mean for a specific unit? Ask me." |
| /areas/* (16 guides) | "Ask me about <guide>." |
| /insights/* (articles) | article newsletter sign-up |
| /insights | empty-state "Ask Sharjeel →" (not shown today: articles are published) |
| /opportunities | empty-state "Ask Sharjeel →" (keeps its text and "The investment approach") |

Kept on purpose (owner 2026-11-05): the nav "Contact" link and the 404 page "Contact" button (navigation, not an ask).

Unchanged: no agency line, RealEstateAgent JSON-LD, ORN, BRN or permit anywhere (every agency value is empty). The
three Dubai guides' "holiday home permit from Dubai's Department of Economy" sentence is approved copy about short-stay
letting, not an advertiser permit, and stays.
