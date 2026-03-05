#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3101}"
API_KEY="${API_KEY:-dev-textweb-key}"
URL="${URL:-https://example.com}"
NONCE="$(date +%s)"
DEMO_URL="${URL}?demo_nonce=${NONCE}"

say() { echo; echo "== $* =="; }

say "Health"
curl -sS "$BASE_URL/healthz" | python3 -m json.tool

say "Unpaid call should fail with payment required"
set +e
UNPAID=$(curl -sS -o /tmp/textweb_unpaid.json -w "%{http_code}" -X POST "$BASE_URL/v1/summarize" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"$DEMO_URL\",\"mode\":\"brief\",\"cache\":true}")
set -e
cat /tmp/textweb_unpaid.json | python3 -m json.tool || true
echo "HTTP: $UNPAID"

say "Paid summarize call #1 (live)"
curl -sS -X POST "$BASE_URL/v1/summarize" \
  -H 'content-type: application/json' \
  -H "x-api-key: $API_KEY" \
  -d "{\"url\":\"$DEMO_URL\",\"mode\":\"brief\",\"cache\":true}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps({"url":d.get("url"),"title":d.get("title"),"cost":d.get("cost"),"meta":d.get("meta"),"summaryBullets":d.get("summaryBullets",[])[:3]}, indent=2))'

say "Paid summarize call #2 (expected cached + cheaper)"
curl -sS -X POST "$BASE_URL/v1/summarize" \
  -H 'content-type: application/json' \
  -H "x-api-key: $API_KEY" \
  -d "{\"url\":\"$DEMO_URL\",\"mode\":\"brief\",\"cache\":true}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps({"url":d.get("url"),"cost":d.get("cost"),"meta":d.get("meta")}, indent=2))'

say "Render endpoint proof"
curl -sS -X POST "$BASE_URL/v1/render" \
  -H 'content-type: application/json' \
  -H "x-api-key: $API_KEY" \
  -d "{\"url\":\"$URL\",\"cache\":true}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps({"url":d.get("url"),"title":d.get("title"),"links":len(d.get("links",[])),"chars":len(d.get("view","")),"source":d.get("meta",{}).get("source")}, indent=2))'

say "Done"
echo "Demo smoke test passed."
