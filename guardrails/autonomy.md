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
- `AUTONOMY=off` (repository variable): every maintenance workflow checks it and stops.
- `OUTBOUND=off` (Worker variable): no message is sent to any lead. Default is off.
Both can be flipped from a phone.

## Failure policy
Safe failures retry once, then alert. Dangerous failures stop and alert. Nothing retries indefinitely.
