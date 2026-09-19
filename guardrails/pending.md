# Pending before going live

| Item | Owner | Blocks |
|---|---|---|
| ~~Zoho mailbox `hello@`~~ DONE 2026-09-19: DNS live and verified, outbound test PASS on SPF, DKIM, DMARC; `MAILBOX_CONFIRMED = "yes"` | n/a | n/a |
| Zoho housekeeping: display name to "Sharjeel Hashmat" (currently "Sharjeel"), MFA on, mobile app sign-in check | Owner | Polish and account security |
| BRN number | Owner (to share later) | Outbound (Worker refuses while `BRN` is empty), disclosure line, property-specific content |
| Template approval (8 templates, hashes changed in this version) | Owner | Outbound |
| Cloudflare account, API token, GitHub secrets (register infra accounts with the PRIVATE recovery address) | Owner | First live run |
| workers.dev subdomain registration | Owner (one-time, dashboard) | First deploy |
| GitHub account name, Notion workspace | Owner | Repo setup, approval queue |
| DNS: Zoho MX/SPF/DKIM on root; provider records on `mail.`; DMARC `p=none` | Owner (hard stop) | Email deliverability |
| Verify at signup: Zoho free-plan mobile app and aliases; Brevo free-plan authenticated-domain limit and branding | System | Provider choices |
| Confirm whether the anti-fraud footer line is true for you | Owner | Optional footer |
| Measure Worker CPU time on first live leads (free limit is 10 ms) | System | Confidence in the free plan |
