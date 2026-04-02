#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RPC_HOST="${ANCHOR_TEST_RPC_HOST:-127.0.0.1}"
RPC_PORT="${ANCHOR_TEST_RPC_PORT:-28999}"
FAUCET_PORT="${ANCHOR_TEST_FAUCET_PORT:-29900}"
RPC_URL="http://${RPC_HOST}:${RPC_PORT}"

LEDGER_DIR="${ANCHOR_TEST_LEDGER_DIR:-$ROOT_DIR/.anchor/manual-test-ledger}"
VALIDATOR_LOG="$LEDGER_DIR/validator.log"

WALLET_PATH="${ANCHOR_TEST_WALLET:-$ROOT_DIR/wallets/localnet.json}"
PROGRAM_SO="${ANCHOR_TEST_PROGRAM_SO:-$ROOT_DIR/target/deploy/policy_pay.so}"
PROGRAM_KEYPAIR="${ANCHOR_TEST_PROGRAM_KEYPAIR:-$ROOT_DIR/target/deploy/policy_pay-keypair.json}"

VALIDATOR_PID=""

cleanup() {
  if [[ -n "$VALIDATOR_PID" ]]; then
    kill "$VALIDATOR_PID" >/dev/null 2>&1 || true
    wait "$VALIDATOR_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

require_file() {
  local path="$1"
  local name="$2"

  if [[ ! -f "$path" ]]; then
    echo "Missing ${name}: $path" >&2
    exit 1
  fi
}

kill_if_test_validator() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"

  if [[ -z "$pids" ]]; then
    return
  fi

  while IFS= read -r pid; do
    if [[ -z "$pid" ]]; then
      continue
    fi

    local cmd
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"

    if [[ "$cmd" == *"solana-test-validator"* ]]; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    else
      echo "Port $port is in use by non-validator process: PID=$pid CMD=$cmd" >&2
      exit 1
    fi
  done <<< "$pids"
}

wait_for_validator_ready() {
  local healthy_streak=0

  for _ in {1..90}; do
    if solana slot --url "$RPC_URL" >/dev/null 2>&1; then
      local health_json
      health_json="$(curl -sS -X POST "$RPC_URL" \
        -H 'Content-Type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' || true)"

      local blockhash_json
      blockhash_json="$(curl -sS -X POST "$RPC_URL" \
        -H 'Content-Type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"getLatestBlockhash"}' || true)"

      if [[ "$health_json" == *'"result":"ok"'* ]] && [[ "$blockhash_json" == *'"result"'* ]]; then
        healthy_streak=$((healthy_streak + 1))
      else
        healthy_streak=0
      fi

      if (( healthy_streak >= 5 )); then
        return 0
      fi
    else
      healthy_streak=0
    fi

    sleep 1
  done

  return 1
}

require_file "$WALLET_PATH" "wallet"

kill_if_test_validator "$RPC_PORT"
kill_if_test_validator "$FAUCET_PORT"

rm -rf "$LEDGER_DIR"
mkdir -p "$LEDGER_DIR"

solana-test-validator \
  --reset \
  --rpc-port "$RPC_PORT" \
  --faucet-port "$FAUCET_PORT" \
  --ledger "$LEDGER_DIR" >"$VALIDATOR_LOG" 2>&1 &
VALIDATOR_PID=$!

if ! wait_for_validator_ready; then
  echo "validator did not become healthy in time: $RPC_URL" >&2
  tail -n 200 "$VALIDATOR_LOG" >&2 || true
  exit 1
fi

(
  cd "$ROOT_DIR"
  anchor build
)

require_file "$PROGRAM_SO" "program artifact"
require_file "$PROGRAM_KEYPAIR" "program keypair"

solana airdrop 100 "$(solana address -k "$WALLET_PATH")" --url "$RPC_URL" >/dev/null
solana program deploy "$PROGRAM_SO" \
  --program-id "$PROGRAM_KEYPAIR" \
  --keypair "$WALLET_PATH" \
  --url "$RPC_URL" >/dev/null

(
  cd "$ROOT_DIR"
  ANCHOR_PROVIDER_URL="$RPC_URL" \
  ANCHOR_WALLET="$WALLET_PATH" \
    yarn run test:anchor:ts
)
