#!/bin/bash
# Refresh ccusage block data to a cache file for statusline consumption.
# Run asynchronously from Stop hook or ennoia maintenance — NOT inline from statusline.
#
# Writes: .claude/context/.ccusage-blocks.json
# Lock: .claude/context/.ccusage-refresh.lock (prevents concurrent runs)
#
# NOTE: Do NOT use set -e — this script must be resilient to partial failures.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-/Users/nathanielcannon/Claude/Jarvis}"
CACHE_FILE="$PROJECT_DIR/.claude/context/.ccusage-blocks.json"
LOCK_FILE="$PROJECT_DIR/.claude/context/.ccusage-refresh.lock"
NPX="/Users/nathanielcannon/.nvm/versions/node/v24.13.1/bin/npx"
MAX_AGE=300  # Only refresh if cache is older than 5 minutes

# Guard: skip if lock exists (another refresh in progress)
if [ -f "$LOCK_FILE" ]; then
    # Stale lock detection: if lock is older than 60s, remove it
    lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0) ))
    if [ "$lock_age" -gt 60 ]; then
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

# Acquire lock
echo "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# Run ccusage blocks with JSON output
"$NPX" ccusage@latest blocks --json 2>/dev/null > "$CACHE_FILE.tmp"

if [ $? -eq 0 ] && [ -s "$CACHE_FILE.tmp" ]; then
    mv "$CACHE_FILE.tmp" "$CACHE_FILE"
else
    rm -f "$CACHE_FILE.tmp"
fi
