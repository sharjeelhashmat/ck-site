#!/usr/bin/env bash
# Smoke test for the lead Worker. It never needs, and must never be given, a change to production secrets.
#
# TARGET=local (default): the full path against `wrangler dev`, with Cloudflare's always-pass TEST secret, which the
#   Worker accepts only when ALLOW_TEST_TURNSTILE=yes (never set in production). In worker/, in another terminal:
#     npx wrangler dev --var ALLOW_TEST_TURNSTILE:yes --var TURNSTILE_SECRET:1x0000000000000000000000000000000AA
#   then:  ./scripts/live-smoke.sh
#   A honeypot lead is used on purpose: it is stored as SPAM in the LOCAL D1 and never triggers a reply or an alert.
#
# TARGET=staging: read-only checks against the deployed Worker from the staging site's origin. /health must answer with
#   the staging CORS header, and a lead carrying Turnstile's dummy token must be REFUSED (403): that proves the live
#   secret is a real one. Nothing is stored.
#     TARGET=staging WORKER_URL=https://ck-lead-worker.sharjeelhashmat.workers.dev \
#       SITE_ORIGIN=https://ck-site-web.sharjeelhashmat.workers.dev ./scripts/live-smoke.sh
set -euo pipefail
TARGET="${TARGET:-local}"
DUMMY_TOKEN='XXXX.DUMMY.TOKEN.XXXX'
LEAD='{"name":"Smoke Test","email":"smoke-test@example.com","intent":"other","budget_band":"unspecified","timeline":"exploring","funding":"unsure","consent_contact":true,"company_website":"smoke.example","turnstile_token":"'"$DUMMY_TOKEN"'"}'

case "$TARGET" in
  local)
    WORKER_URL="${WORKER_URL:-http://127.0.0.1:8787}"
    SITE_ORIGIN="${SITE_ORIGIN:-https://sharjeelhashmat.com}"
    case "$WORKER_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "TARGET=local only talks to wrangler dev on localhost"; exit 2 ;; esac
    echo "health:"; curl -sS "$WORKER_URL/health"; echo
    echo "lead (honeypot, test secret):"
    curl -sS -X POST "$WORKER_URL/lead" -H "content-type: application/json" -H "origin: $SITE_ORIGIN" -d "$LEAD"; echo
    echo "Expect: {\"ok\":true,\"id\":\"...\"}. Then confirm one SPAM row in the LOCAL database:"
    echo "  npx wrangler d1 execute ck-leads --local --command \"SELECT id,status,lane,quarantined FROM leads ORDER BY created_at DESC LIMIT 1\""
    ;;
  staging)
    : "${WORKER_URL:?set WORKER_URL}" "${SITE_ORIGIN:?set SITE_ORIGIN to the staging site origin}"
    echo "health (expect the staging origin in access-control-allow-origin):"
    curl -sS -D - -o /dev/null -H "origin: $SITE_ORIGIN" "$WORKER_URL/health" | grep -i '^access-control-allow-origin' || { echo "FAIL: no CORS header for $SITE_ORIGIN"; exit 1; }
    code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$WORKER_URL/lead" -H "content-type: application/json" -H "origin: $SITE_ORIGIN" -d "$LEAD")
    [ "$code" = "403" ] || { echo "FAIL: a dummy Turnstile token got HTTP $code (expected 403)"; exit 1; }
    echo "PASS: dummy token refused (403); nothing stored."
    ;;
  *) echo "TARGET must be local or staging"; exit 2 ;;
esac
