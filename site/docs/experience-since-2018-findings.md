# Findings: real estate experience since 2018

Work order: make every statement of when the site owner started in real estate say 2018 (Operating Rules Section 1b, 25 Sept 2026; Notion Website Publishing Queue row "Copy: real estate experience since 2018", Approved).

Result: `site/src/` has no statement of when the owner started in real estate or how long they have worked in it, so no rule-4 match exists and no text was changed.

## Step 1: search

Case-insensitive search of `site/src/` (branch base `phase2-site`) for: "since 20", "years in real estate", "years of experience", "years' experience", "experience in real estate", "in real estate since", "real estate career", "started in real estate", 2019, 2020, 2021, 2022, 2023, 2024, 2025.

Only "since 20", 2019, 2020, 2021, 2024 and 2025 returned matches. The other phrases and 2022 and 2023 returned nothing.

| # | File:line | Matched text |
|---|---|---|
| 1 | `site/src/data/insights/costs-investors-forget-before-yield.json:44` | "Under Article 16(b) of Law No. 6 of **2019**, the owner is liable…" |
| 2 | `site/src/data/insights/costs-investors-forget-before-yield.json:129` | `"publishedOn": "2020-01-06"` (DLD source page) |
| 3 | `site/src/data/insights/costs-investors-forget-before-yield.json:140` | Editorial note: "…the 6 Jan **2020** date…" (the same DLD source date) |
| 4 | `site/src/data/insights/dubai-august-2026-market-view.json:20` | "…35.2% fewer than August **2025**…" |
| 5 | `site/src/data/insights/dubai-august-2026-market-view.json:26` | "…down 1.9% on August **2025**." |
| 6 | `site/src/data/insights/dubai-august-2026-market-view.json:92` | Editorial note: "…-35.2% and -46.5% year on year…" / "…compares with June, not August **2025**…" / DLD page shows "Last updated 26 Apr **2024**" |
| 7 | `site/src/lib/legal.ts:31` | "…Federal Decree-Law No. 45 of **2021**, \"PDPL\"…" |
| 8 | `site/src/lib/legal.ts:103` | "…UAE Civil Code (Federal Decree Law No. 25 of **2025**)…" |
| 9 | `site/src/lib/profile.ts:6` | Code comment: "// ON **since 20**26-09-21: the Worker route POST /profile is deployed…" |

## Step 2: classification

| # | Rule | Action |
|---|---|---|
| 1 | Not covered by rules 1 to 5 (a law citation) | NO CHANGE; Needs owner decision |
| 2 | 1: article source publish date | NO CHANGE |
| 3 | 1: article source publish date | NO CHANGE |
| 4 | 1: market-data period | NO CHANGE |
| 5 | 1: market-data period | NO CHANGE |
| 6 | 1: market-data periods, plus a source dataset's "last updated" date | NO CHANGE |
| 7 | Not covered by rules 1 to 5 (a law citation) | NO CHANGE; Needs owner decision |
| 8 | Not covered by rules 1 to 5 (a law citation) | NO CHANGE; Needs owner decision |
| 9 | Not covered by rules 1 to 5 (a code comment with a deployment date) | NO CHANGE; Needs owner decision |

Rule 2 (brokerage), rule 3 (banking) and rule 5 (years of experience with no field named): no matches.
Rule 4 (when the owner started in real estate or how long they have worked in it): **no matches**.

## Needs owner decision

None of these are about the owner's experience. They are listed only because the fixed rules do not cover them. The recommendation is to leave them as they are.

- #1, #7, #8: years inside UAE law names (Law No. 6 of 2019; Federal Decree-Law No. 45 of 2021; Federal Decree Law No. 25 of 2025).
- #9: an internal code comment recording a feature switch-on date (2026-09-21). Visitors never see it.

## Note

The site says nothing today about when the owner started in real estate or how long they have worked in it. The only brokerage wording is "Working with {SITE.brokerage}" plus the BRN (the footer, About, FAQ, Brief and PrintFrame pages, and the Privacy policy). If the owner wants the "in UAE real estate since 2018" line on the site, it would be new copy. That is a separate item for the Publishing Queue.
