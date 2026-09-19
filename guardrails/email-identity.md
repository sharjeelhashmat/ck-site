# Email identity plan (owner-approved defaults, 2026-09-19)

## Address map
| Purpose | From | Reply-To | Automated |
|---|---|---|---|
| Your public address (site, LinkedIn, card) | `hello@sharjeelhashmat.com` (mailbox) | n/a | Never through the system |
| Direct correspondence (optional alias, if the free plan allows) | `sh@sharjeelhashmat.com` | n/a | Never |
| Lead replies | `hello@mail.sharjeelhashmat.com` ("Sharjeel Hashmat") | `hello@sharjeelhashmat.com` | Yes, approved templates only |
| Your lead alerts | `alerts@mail.sharjeelhashmat.com` ("Lead desk") | n/a | Yes, to you only |
| Newsletter (reserved; opt-in, Phase 2) | `brief@news.sharjeelhashmat.com` ("The Investor's Brief") | `hello@sharjeelhashmat.com` | Later |
| Billing / finance | none. Finance email stays manual. | n/a | No |

Rules: root domain = human mail only. Automated senders must be on a subdomain (the Worker refuses otherwise).
Automated sender addresses need no mailbox; only the subdomain is authenticated. No `no-reply`.

## Mailbox
Zoho Mail Free (default). Free plan: web and Zoho apps, no IMAP/POP. Verify at signup: mobile app on the free plan, and whether aliases are allowed.
Paid fallbacks: Zoho Mail Lite (about $1/user/month, restores IMAP), Google Workspace or Microsoft 365 (about $6-8/user/month).

## DNS plan (DNS is the owner's hard stop; providers give the exact values)
| Name | Type | Purpose | Source of values |
|---|---|---|---|
| root | MX (x3) | Zoho inbound | Zoho setup wizard |
| root | TXT SPF | Zoho as sender for human mail | Zoho |
| `zmail._domainkey` (name given by Zoho) | TXT DKIM | Human mail signing | Zoho |
| `mail` | records for SPF, DKIM, return path | Lead replies + alerts via the email provider | Provider (Brevo default) |
| `news` | same set | Newsletter, when it launches | Provider |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:hello@sharjeelhashmat.com` | Start at none; move to quarantine, then reject once reports are clean |
| root | TXT | Search Console domain verification | Google |

## Recovery and account rules
- Registrar, Cloudflare and GitHub logins use a PRIVATE recovery address that is not on this domain (the existing Gmail, unpublished, or a new free address at another provider). Circular dependency otherwise: a DNS or renewal problem would block the reset email.
- Business tools (email provider, Notion, Search Console) use `hello@sharjeelhashmat.com`.
- Domain: auto-renew on, renew for multiple years, registrar lock on, MFA on every account.

## Gmail exit checklist (do after the mailbox exists)
- [ ] Website contact section and email links
- [ ] LinkedIn contact info
- [ ] Instagram contact info
- [ ] Google Business Profile, if any
- [ ] DLD/RERA broker registration and Royals Field records (ask them to update)
- [ ] Property portals, if any
- [ ] Email signature, business card, proposal headers
- [ ] WhatsApp Business profile email
- [ ] Any account created with Gmail that is not infra recovery
- [ ] Keep Gmail only as unpublished infra recovery

## Optional anti-fraud footer (NOT enabled)
"I never ask for payment or bank details by email." Add to templates only if the owner confirms it is true. It changes template text, so it needs re-approval.

## Verified state (2026-09-19)
- Root DNS live (read from Namecheap's authoritative servers and Google/Cloudflare resolvers): MX `mx`, `mx2`, `mx3.zoho.com` (10/20/50); SPF `v=spf1 include:zohomail.com ~all` (single record); DKIM `zmail._domainkey` (RSA 1024-bit, key parses); DMARC `p=none; rua=mailto:hello@sharjeelhashmat.com`.
- Site records untouched: apex A, `www` CNAME (Vercel), Zoho verification CNAME.
- Zoho "Verify all records": green.
- Outbound test from `hello@` to Gmail: SPF PASS (Zoho IP), DKIM PASS (domain sharjeelhashmat.com), DMARC PASS.
- Namecheap forwarding: none defined, nothing lost in the switch.
- Optional later: replace the 1024-bit DKIM key with a 2048-bit one; move DMARC from `p=none` to `quarantine` after clean reports.
- Still to do: `mail.` subdomain records from the email provider (needed for automated replies and alerts).
