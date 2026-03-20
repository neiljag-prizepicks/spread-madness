#!/usr/bin/env bash
# Poll ESPN scoreboard and merge into web/public/data/results.json.
# Usage:
#   ./scripts/poll-espn-results.sh
#   POLL_SECONDS=90 ESPN_DATES=auto ./scripts/poll-espn-results.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
INTERVAL="${POLL_SECONDS:-120}"
DATES="${ESPN_DATES:-auto}"
echo "Polling ESPN every ${INTERVAL}s (dates=${DATES}). Ctrl+C to stop."
while true; do
  node scripts/fetch-espn-results.mjs --dates "$DATES" || true
  sleep "$INTERVAL"
done
