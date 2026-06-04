#!/bin/bash
# fetch-david-nexus-sync.sh — Layer 1 review for David's nexus-sync-2026-04 branch.
# Fires every 6h via launchd (com.aion.david-nexus-sync-fetch).
# Fetches origin/nexus-sync-2026-04 on AIFred-Pro-Dev, computes new commits since
# the last reviewed commit (paths-registry.yaml), and writes a plain-Markdown
# summary that AC-01 surfaces on every Jarvis session start.
#
# Why no `set -e`: `git log` returns non-zero on empty ranges (no new commits),
# which is a normal-operation case here. We want to write a "no activity" report,
# not abort. `-uo pipefail` is enough for our needs.

set -uo pipefail

JARVIS=/Users/nathanielcannon/Claude/Project_Aion
DEV=/Users/nathanielcannon/Claude/AIFred-Pro-Dev
BRANCH=nexus-sync-2026-04
REMOTE=origin
OUT_DIR=/Users/nathanielcannon/Claude/Shared_Projects/Status/david
OUT="$OUT_DIR/nexus-sync-2026-04-recent.md"
LOG_DIR="$JARVIS/.claude/logs"
LOG="$LOG_DIR/david-nexus-sync-fetch.log"
YQ=/opt/homebrew/bin/yq

mkdir -p "$OUT_DIR" "$LOG_DIR"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "$(ts): $*" >> "$LOG"; }

log "=== fetch-david-nexus-sync.sh start ==="

# Resolve last reviewed commit from paths-registry.yaml. If absent or unparseable,
# treat as empty — the report will then list the most recent 14 days of activity.
LAST_REV=""
if [ -x "$YQ" ] && [ -f "$JARVIS/paths-registry.yaml" ]; then
  LAST_REV=$("$YQ" -r '.aifred_pro_dev.nexus_sync.last_reviewed_commit // ""' "$JARVIS/paths-registry.yaml" 2>/dev/null || echo "")
fi
log "last_reviewed_commit=${LAST_REV:-(none)}"

# Fetch the branch. Network errors are logged but non-fatal — we still emit a
# report from local state so AC-01 always has a current file to surface.
if ! git -C "$DEV" fetch "$REMOTE" "$BRANCH" >> "$LOG" 2>&1; then
  log "WARN: git fetch failed; continuing with local state"
fi

HEAD_REV=$(git -C "$DEV" rev-parse "$REMOTE/$BRANCH" 2>/dev/null || echo "")
if [ -z "$HEAD_REV" ]; then
  log "ERROR: could not resolve $REMOTE/$BRANCH"
  cat > "$OUT" <<EOF
---
author: jarvis
type: status
project: AIFred-Pro
branch: $BRANCH
generated: $(ts)
state: error
---

# David's $BRANCH — Recent Activity

ERROR: could not resolve \`$REMOTE/$BRANCH\` at $(ts).
Check \`$LOG\` for git fetch diagnostics.
EOF
  exit 1
fi

# Decide commit range. If LAST_REV is set AND reachable from HEAD, range from there.
# Otherwise list the last 14 days.
RANGE=""
USED_LAST_REV="false"
if [ -n "$LAST_REV" ] && git -C "$DEV" cat-file -e "$LAST_REV" 2>/dev/null; then
  if git -C "$DEV" merge-base --is-ancestor "$LAST_REV" "$HEAD_REV" 2>/dev/null; then
    RANGE="$LAST_REV..$HEAD_REV"
    USED_LAST_REV="true"
  fi
fi

if [ -z "$RANGE" ]; then
  RANGE="$HEAD_REV"
  TIME_FILTER="--since=14.days.ago"
else
  TIME_FILTER=""
fi

# shellcheck disable=SC2086 — TIME_FILTER must word-split when set
NEW_COUNT=$(git -C "$DEV" rev-list --count $TIME_FILTER "$RANGE" 2>/dev/null || echo "0")
COMMITS=$(git -C "$DEV" log $TIME_FILTER "$RANGE" --pretty=format:"- \`%h\` %ci %an: %s" 2>/dev/null | head -50)

if [ -z "$COMMITS" ]; then
  COMMITS="_No new commits in the selected window._"
fi

# Compute file-change shortstat for the same range.
STATS=$(git -C "$DEV" diff --shortstat $TIME_FILTER "$RANGE" 2>/dev/null || echo "")
if [ -z "$STATS" ]; then
  STATS="_No file changes in the selected window._"
fi

cat > "$OUT" <<EOF
---
author: jarvis
type: status
project: AIFred-Pro
branch: $BRANCH
generated: $(ts)
head: $HEAD_REV
last_reviewed: ${LAST_REV:-none}
new_commit_count: $NEW_COUNT
range_basis: $([ "$USED_LAST_REV" = "true" ] && echo "since-last-review" || echo "last-14-days")
---

# David's \`$BRANCH\` — Recent Activity

Branch HEAD: \`$HEAD_REV\`
Last reviewed: \`${LAST_REV:-(none)}\`
New commits: **$NEW_COUNT**

## Diff stats

$STATS

## Commits

$COMMITS

---

*Auto-generated every 6 hours by \`com.aion.david-nexus-sync-fetch\`.*
*For ADOPT/ADAPT/REJECT/DEFER classification, run \`/sync-aifred-pro-dev\`.*
EOF

log "wrote $OUT (HEAD=$HEAD_REV, new=$NEW_COUNT, range_basis=$([ "$USED_LAST_REV" = "true" ] && echo "since-last-review" || echo "last-14-days"))"
log "=== fetch-david-nexus-sync.sh end ==="
