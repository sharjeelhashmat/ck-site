#!/usr/bin/env bash
# First live test, run by the owner AFTER the first deploy.
# 1. In Cloudflare, temporarily set the Worker secret TURNSTILE_SECRET to Cloudflare's documented
#    always-pass dummy secret (see developers.cloudflare.com/turnstile: "Testing"). Restore the real secret after.
# 2. Run:  WORKER_URL=https://<your>.workers.dev SITE_ORIGIN=https://sharjeelhashmat.com ./scripts/live-smoke.sh
# A honeypot lead is used on purpose: it is stored as SPAM and NEVER triggers a reply or an alert.
set -euo pipefail
: "${WORKER_URL:?set WORKER_URL}" "${SITE_ORIGIN:?set SITE_ORIGIN}"
echo "health:"; curl -sS "$WORKER_URL/health"; echo
echo "lead (honeypot):"
curl -sS -X POST "$WORKER_URL/lead" -H "content-type: application/json" -H "origin: $SITE_ORIGIN" \
  -d '{"name":"Smoke Test","email":"smoke-test@example.com","intent":"other","consent_contact":true,"company_website":"smoke.example","turnstile_token":"dummy"}'
echo
echo "Expect: {\"ok\":true,\"id\":\"...\"}. Then confirm one SPAM row:"
echo "  npx wrangler d1 execute ck-leads --remote --command \"SELECT id,status,lane,quarantined FROM leads ORDER BY created_at DESC LIMIT 1\""
