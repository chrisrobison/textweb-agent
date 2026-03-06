#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://textweb.net:1015}"
URL="${URL:-https://example.com}"
MODE="${MODE:-brief}"

# Use either PAYMENT_SIGNATURE (nevermined) or API_KEY (dummy).
API_KEY="${API_KEY:-}"
PAYMENT_SIGNATURE="${PAYMENT_SIGNATURE:-}"
NVM_API_KEY="${NVM_API_KEY:-}"
NVM_ENVIRONMENT="${NVM_ENVIRONMENT:-sandbox}"
NVM_PLAN_ID="${NVM_PLAN_ID:-}"
NVM_AGENT_ID="${NVM_AGENT_ID:-}"

say() { echo; echo "== $* =="; }

auth_headers=()
if [[ -n "$PAYMENT_SIGNATURE" ]]; then
  auth_headers+=(-H "payment-signature: $PAYMENT_SIGNATURE")
elif [[ -n "$NVM_API_KEY" && -n "$NVM_PLAN_ID" ]]; then
  say "Generating Nevermined x402 token"
  PAYMENT_SIGNATURE=$(node --input-type=module -e "import { Payments } from '@nevermined-io/payments'; const p=Payments.getInstance({ nvmApiKey: process.env.NVM_API_KEY, environment: process.env.NVM_ENVIRONMENT || 'sandbox' }); const t=await p.x402.getX402AccessToken(process.env.NVM_PLAN_ID, process.env.NVM_AGENT_ID || undefined); console.log(t.accessToken);")
  auth_headers+=(-H "payment-signature: $PAYMENT_SIGNATURE")
elif [[ -n "$API_KEY" ]]; then
  auth_headers+=(-H "x-api-key: $API_KEY")
else
  echo "Set PAYMENT_SIGNATURE, or API_KEY, or (NVM_API_KEY + NVM_PLAN_ID) before running this script."
  exit 1
fi

say "Health"
curl -sS "$BASE_URL/healthz" | python3 -m json.tool

say "Agent definition"
curl -sS "$BASE_URL/.well-known/agent.json" | python3 -c '
import json,sys
d=json.load(sys.stdin)
spec=d.get("spec_url","")
assert spec.startswith("http://") or spec.startswith("https://"), "spec_url must be absolute"
print(json.dumps({"name":d.get("name"),"version":d.get("version"),"spec_url":spec}, indent=2))
'

say "OpenAPI routes"
curl -sS "$BASE_URL/openapi.json" | python3 -c '
import json,sys
d=json.load(sys.stdin)
paths=d.get("paths",{})
required=["/v1/render","/v1/summarize","/.well-known/agent.json","/openapi.json","/healthz"]
missing=[p for p in required if p not in paths]
assert not missing, f"missing paths: {missing}"
print(json.dumps({"openapi":d.get("openapi"),"path_count":len(paths)}, indent=2))
'

say "Summarize"
curl -sS -X POST "$BASE_URL/v1/summarize" \
  -H 'content-type: application/json' \
  "${auth_headers[@]}" \
  -d "{\"url\":\"$URL\",\"mode\":\"$MODE\",\"cache\":true}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({"title":d.get("title"),"cost":d.get("cost"),"meta":d.get("meta"),"bullets":d.get("summaryBullets",[])[:3]}, indent=2))'

say "Render"
curl -sS -X POST "$BASE_URL/v1/render" \
  -H 'content-type: application/json' \
  "${auth_headers[@]}" \
  -d "{\"url\":\"$URL\",\"cache\":true}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({"title":d.get("title"),"source":d.get("meta",{}).get("source"),"links":len(d.get("links",[])),"chars":len(d.get("view",""))}, indent=2))'

say "Deployed smoke test passed"
