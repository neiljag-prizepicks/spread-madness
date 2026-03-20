#!/usr/bin/env bash
# Poll scores + spreads: results.json then game_schedule_and_lines.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
INTERVAL="${POLL_SECONDS:-120}"
DATES="${ESPN_DATES:-auto}"
echo "Polling ESPN (results + spreads) every ${INTERVAL}s, dates=${DATES}. Ctrl+C to stop."
while true; do
  node scripts/fetch-espn-results.mjs --dates "$DATES" || true
  node scripts/fetch-espn-spreads.mjs --dates "$DATES" || true
  sleep "$INTERVAL"
done
