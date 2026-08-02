#!/bin/bash
# Refresh unified rate-limit state to a cache file for statusline consumption.
#
# WHY THIS EXISTS
# ---------------
# Claude Code puts `rate_limits.{five_hour,seven_day}` in the statusline stdin
# payload ONLY when its internal state carries at least one of those claims:
#
#     ...(I.five_hour || I.seven_day) && { rate_limits: I }
#
# When the account crosses into overage, upstream stops emitting the
# `anthropic-ratelimit-unified-5h-*` / `-7d-*` response headers and sends only
# the `-overage-*` family with `representative-claim: overage`. The CLI then has
# neither claim, drops the whole `rate_limits` key, and every statusline that
# reads it renders NOTHING — a blank where the primary capacity signal was.
# That blank is indistinguishable from "healthy", which is exactly the silent
# degradation the workspace guardrails forbid.
#
# This script provides the declared fallback: the usage proxy at :9800 records
# every response's raw `anthropic-*` headers into `api_requests`, so the last
# known 5h/7d utilisation and the live overage state are always recoverable from
# PostgreSQL. The statusline reads this cache, labels it as second-source, and
# shows its age — a fallback that announces itself, not one that hides a gap.
#
# Writes: .claude/context/.ratelimit-cache.json
# Lock:   .claude/context/.ratelimit-refresh.lock (owner-token, see below)
#
# Run asynchronously from the Stop hook — NEVER inline from the statusline
# (a `docker exec psql` round-trip is ~200ms and would stall every render).
#
# NOTE: Do NOT use set -e — this script must be resilient to partial failures.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}"
CACHE_FILE="$PROJECT_DIR/.claude/context/.ratelimit-cache.json"
LOCK_FILE="$PROJECT_DIR/.claude/context/.ratelimit-refresh.lock"
MAX_AGE="${RL_CACHE_MAX_AGE:-120}"   # refresh at most every 2 min
DB_CONTAINER="${RL_DB_CONTAINER:-aifred-dev-postgres}"
DB_USER="${RL_DB_USER:-pulse_dev}"
DB_NAME="${RL_DB_NAME:-pulse_dev}"

# ─── Lock (owner-token: only remove a lock we actually own) ──────────────────
OWNER_TOKEN="$$-$(date +%s)"
if [ -f "$LOCK_FILE" ]; then
    lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0) ))
    lock_pid=$(cut -d- -f1 "$LOCK_FILE" 2>/dev/null)
    if [ "$lock_age" -gt 60 ] || { [ -n "$lock_pid" ] && ! kill -0 "$lock_pid" 2>/dev/null; }; then
        rm -f "$LOCK_FILE"
    else
        exit 0
    fi
fi

# Guard: skip if cache is fresh enough
if [ -f "$CACHE_FILE" ]; then
    cache_age=$(( $(date +%s) - $(stat -f %m "$CACHE_FILE" 2>/dev/null || echo 0) ))
    if [ "$cache_age" -lt "$MAX_AGE" ]; then
        exit 0
    fi
fi

echo "$OWNER_TOKEN" > "$LOCK_FILE"
trap '[ "$(cat "$LOCK_FILE" 2>/dev/null)" = "$OWNER_TOKEN" ] && rm -f "$LOCK_FILE"' EXIT

command -v docker >/dev/null 2>&1 || exit 0

# ─── Query ──────────────────────────────────────────────────────────────────
# Three independent reads, because they go stale at different rates:
#   * last row that carried a 5h utilisation  (may be minutes old under overage)
#   * last row that carried a 7d utilisation
#   * the newest row of all, for live overage / representative-claim state
SQL="
WITH r5 AS (
  SELECT unified_5h_utilization u, unified_5h_reset r, timestamp t
  FROM api_requests WHERE unified_5h_utilization IS NOT NULL
  ORDER BY timestamp DESC LIMIT 1),
r7 AS (
  SELECT unified_7d_utilization u, unified_7d_reset r, timestamp t
  FROM api_requests WHERE unified_7d_utilization IS NOT NULL
  ORDER BY timestamp DESC LIMIT 1),
cur AS (
  SELECT raw_headers h, unified_representative_claim c, unified_status s, timestamp t
  FROM api_requests ORDER BY timestamp DESC LIMIT 1)
SELECT json_build_object(
  'five_hour', (SELECT json_build_object(
        'utilization', u, 'reset_epoch', extract(epoch FROM r)::bigint,
        'observed_epoch', extract(epoch FROM t)::bigint) FROM r5),
  'seven_day', (SELECT json_build_object(
        'utilization', u, 'reset_epoch', extract(epoch FROM r)::bigint,
        'observed_epoch', extract(epoch FROM t)::bigint) FROM r7),
  'overage', (SELECT json_build_object(
        'in_use', COALESCE(h->>'anthropic-ratelimit-unified-overage-in-use','false'),
        'status', h->>'anthropic-ratelimit-unified-overage-status',
        'utilization', h->>'anthropic-ratelimit-unified-overage-utilization',
        'reset_epoch', (h->>'anthropic-ratelimit-unified-overage-reset')::bigint) FROM cur),
  'representative_claim', (SELECT c FROM cur),
  'unified_status', (SELECT s FROM cur),
  'latest_epoch', (SELECT extract(epoch FROM t)::bigint FROM cur),
  'cached_epoch', extract(epoch FROM now())::bigint,
  'source', 'usage-proxy-db');
"

result=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -c "$SQL" 2>/dev/null)

if [ -n "$result" ] && echo "$result" | grep -q '^{'; then
    echo "$result" > "$CACHE_FILE.tmp" && mv "$CACHE_FILE.tmp" "$CACHE_FILE"
else
    rm -f "$CACHE_FILE.tmp"
fi
