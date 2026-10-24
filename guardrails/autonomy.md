# Autonomy boundary (owner-controlled file)

Rule: **claims are the owner's; mechanics are the system's.**

## Autonomous (no approval; reported in the daily digest)
Dependency and security updates, headers and CSP, performance and accessibility fixes, broken links,
sitemap and schema mechanics, backups, lead verification / scoring / quarantine, rollback on failed
deploys, regenerating media assets.

## Owner consent required
Anything public that makes a claim or speaks in the owner's name: articles, site copy, disclosures,
titles, verdict labels, social posts (the owner posts by hand), and every reply template.
- Website publishing executes only after the owner sets the Notion card to "Approved".
- Lead replies: consent is per template, not per message. Only approved template hashes can be sent.

## Hard stops (the system never does these)
DNS and registrar changes, billing or plan changes, creating or rotating credentials, account or
permission settings, permanent deletion of data, and editing this folder, `.github/`, templates,
lane routing, scoring policy, or the outbound code (see CODEOWNERS).

## Kill switches
- To stop the weekly market-data sync: Actions > market-data-sync > Disable workflow (Enable workflow turns it back on).
  There is no `AUTONOMY` variable: no workflow reads one (audit item 13, Coordinator decision 2026-10-18).
- `OUTBOUND=off` (Worker variable): no message is sent to any lead. Default is off.
Both can be done from a phone (GitHub app or github.com; Cloudflare dashboard).

## Failure policy
Safe failures retry once, then alert. Dangerous failures stop and alert. Nothing retries indefinitely.
