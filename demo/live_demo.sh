#!/usr/bin/env bash
set -euo pipefail

CONTROL_PLANE_URL="${CONTROL_PLANE_URL:-http://127.0.0.1:24010}"
RELAYER_URL="${RELAYER_URL:-http://127.0.0.1:24020}"
INDEXER_URL="${INDEXER_URL:-http://127.0.0.1:24030}"
DASHBOARD_URL="${DASHBOARD_URL:-http://127.0.0.1:24040}"

INTENT_OK="${DEMO_INTENT_OK:-9001}"
INTENT_FAIL="${DEMO_INTENT_FAIL:-9002}"

request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"

  echo
  echo "[$method] $url"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "$url" -H 'Content-Type: application/json' -d "$body"
  else
    curl -fsS -X "$method" "$url"
  fi
  echo
}

echo "== PolicyPay live demo script =="
echo "control-plane: $CONTROL_PLANE_URL"
echo "relayer:       $RELAYER_URL"
echo "indexer:       $INDEXER_URL"
echo "dashboard:     $DASHBOARD_URL"

request GET "$CONTROL_PLANE_URL/health"
request GET "$RELAYER_URL/health"
request GET "$INDEXER_URL/health"
request GET "$DASHBOARD_URL/api/summary"

request POST "$RELAYER_URL/executions/batch" "{
  \"mode\": \"continue-on-error\",
  \"items\": [
    {
      \"policy\": \"demo-policy\",
      \"intentId\": $INTENT_OK,
      \"paymentIntent\": \"demo-intent-$INTENT_OK\"
    },
    {
      \"policy\": \"demo-policy\",
      \"intentId\": $INTENT_FAIL,
      \"paymentIntent\": \"demo-intent-$INTENT_FAIL\",
      \"shouldFail\": true,
      \"failureReason\": \"simulated relayer failure\"
    }
  ]
}"

request POST "$RELAYER_URL/executions/$INTENT_OK/confirm" "{}"
request GET "$RELAYER_URL/executions?status=failed"

request POST "$INDEXER_URL/timeline/chain" "{
  \"intentId\": $INTENT_OK,
  \"status\": \"approved\",
  \"details\": {\"policy\": \"demo-policy\"}
}"

request POST "$INDEXER_URL/timeline/relayer" "{
  \"intentId\": $INTENT_OK,
  \"status\": \"confirmed\",
  \"details\": {\"signature\": \"demo-sig-$INTENT_OK\"}
}"

request GET "$INDEXER_URL/timeline?intentId=$INTENT_OK"
request GET "$DASHBOARD_URL/api/summary"

echo
echo "Demo calls completed. Open $DASHBOARD_URL to capture UI state in your video."
