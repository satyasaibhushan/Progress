#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
RUNS="${RUNS:-5}"
COOKIE_HEADER=""

if [[ -n "${SESSION_COOKIE:-}" ]]; then
  COOKIE_HEADER="Cookie: ${SESSION_COOKIE}"
fi

run_benchmark() {
  local name="$1"
  local path="$2"
  local total_ms=0

  echo "Benchmarking ${name} (${path})"
  for _ in $(seq 1 "$RUNS"); do
    local time_s
    if [[ -n "$COOKIE_HEADER" ]]; then
      time_s=$(curl -sS -o /dev/null -H "$COOKIE_HEADER" -w "%{time_total}" "${BASE_URL}${path}")
    else
      time_s=$(curl -sS -o /dev/null -w "%{time_total}" "${BASE_URL}${path}")
    fi

    local time_ms
    time_ms=$(awk -v t="$time_s" 'BEGIN { printf "%.0f", t * 1000 }')
    total_ms=$((total_ms + time_ms))
  done

  local avg_ms=$((total_ms / RUNS))
  echo "  avg: ${avg_ms}ms over ${RUNS} runs"
}

run_benchmark "Tasks Tree" "/api/tasks?include=children&paginate=true&limit=50"
run_benchmark "Groups List" "/api/groups"
run_benchmark "Groups Compact" "/api/groups?limit=1"
run_benchmark "Labels List" "/api/labels"
run_benchmark "Suggestions" "/api/suggestions?limit=5"
