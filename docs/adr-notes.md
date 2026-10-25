# Architecture decisions: where they live

ADRs are kept in Notion (the owner's ADR list), not in this repository. This file only points there and lists the
decisions a change in this repository relies on, so a reviewer knows which entry to read.

## PR 2c (system hardening, gaps G01 to G12, Coordinator brief 2026-10-25)

| Topic | Decision in this repository | Notion ADR list entry to record or check |
|---|---|---|
| Outbox | One `outbox` table decides every send (claim before send, receipts, daily cap inside the claim, alerts once). `messages` stays as history. | Outbox as source of truth for sends (G01, G02, G06) |
| Switches | `OUTBOUND_REPLIES`, `OUTBOUND_NEWSLETTER`, `OUTBOUND_ALERTS` replace `OUTBOUND`. | Per-channel kill switches (G07) |
| Readiness without a public endpoint | `/health` is exactly `{"ok":true}`; a private, scheduled GitHub workflow reads production D1 with SELECTs only and prints PASS or FAIL. | Readiness check (G08, owner decision 2026-10-19) |
| Rate limits | Workers Rate Limiting binding per route and IP; replaces the planned move to api.sharjeelhashmat.com. | Audit F4 closed |
| Unsubscribe links | Opaque v2 token over the address hash; legacy formats until 2027-01-01. | Unsubscribe token format |
| Owner settings | Turnstile widget hostnames, `REPLIES_LIVE`, the `production` environment's reviewers. | G10 (owner settings) |
| Prompt and Rules | No code. | G09 (Rules / prompt change) |
