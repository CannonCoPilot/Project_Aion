#!/bin/bash
# verify-david-nexus-sync-health.sh — One-shot 2-week health check for the
# com.aion.david-nexus-sync-fetch layer-1 review job (deployed 2026-04-30
# alongside the Jarvis git topology migration).
#
# Triggered by launchd plist com.aion.david-nexus-sync-health-check at the
# scheduled date, then self-cleans by unloading + deleting the plist. The
# script itself stays in repo so future health checks can reuse it.

set -uo pipefail

JARVIS=/Users/nathanielcannon/Claude/Project_Aion
DEV=/Users/nathanielcannon/Claude/AIFred-Pro-Dev
RECENT_FILE=/Users/nathanielcannon/Claude/Shared_Projects/Status/david/nexus-sync-2026-04-recent.md
OUT="/Users/nathanielcannon/Claude/Shared_Projects/Status/david/nexus-sync-health-$(date +%Y-%m-%d).md"
LOG="$JARVIS/.claude/logs/david-nexus-sync-health-check.log"
LOG_FETCH="$JARVIS/.claude/logs/david-nexus-sync-fetch.log"
TARGET_PLIST="$HOME/Library/LaunchAgents/com.aion.david-nexus-sync-health-check.plist"
YQ=/opt/homebrew/bin/yq

mkdir -p "$(dirname "$OUT")" "$(dirname "$LOG")"
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "$(ts): $*" >> "$LOG"; }

log "=== verify-david-nexus-sync-health.sh start ==="

# Check 1 — launchctl status of the layer-1 fetch job
LCTL_LINE=$(launchctl list 2>/dev/null | grep com.aion.david-nexus-sync-fetch || true)
if [ -z "$LCTL_LINE" ]; then
  CHECK_1="FAIL: com.aion.david-nexus-sync-fetch is NOT registered with launchd"
else
  EXIT_CODE=$(echo "$LCTL_LINE" | awk '{print $2}')
  if [ "$EXIT_CODE" = "0" ]; then
    CHECK_1="PASS: registered, last exit code = 0"
  else
    CHECK_1="WARN: registered, last exit code = $EXIT_CODE  (line: $LCTL_LINE)"
  fi
fi

# Check 2 — recent file mtime
if [ ! -f "$RECENT_FILE" ]; then
  CHECK_2="FAIL: $RECENT_FILE does not exist"
else
  MTIME_EPOCH=$(stat -f "%m" "$RECENT_FILE" 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  AGE_HOURS=$(( (NOW_EPOCH - MTIME_EPOCH) / 3600 ))
  if [ "$AGE_HOURS" -lt 8 ]; then
    CHECK_2="PASS: mtime ${AGE_HOURS}h old (< 8h threshold)"
  else
    CHECK_2="WARN: mtime ${AGE_HOURS}h old (>= 8h — Layer 1 fetch may be stalled)"
  fi
fi

# Check 3 — error lines in fetch log
if [ ! -f "$LOG_FETCH" ]; then
  CHECK_3="WARN: no log file at $LOG_FETCH (Layer 1 may not have run yet)"
else
  ERRS=$(grep -c "ERROR" "$LOG_FETCH" 2>/dev/null || true)
  ERRS=${ERRS:-0}
  if [ "$ERRS" = "0" ]; then
    CHECK_3="PASS: 0 ERROR lines in log"
  else
    CHECK_3="WARN: $ERRS ERROR line(s) in log — review $LOG_FETCH"
  fi
fi

# Check 4 — commit drift on nexus-sync-2026-04
LAST_REV=""
if [ -x "$YQ" ] && [ -f "$JARVIS/paths-registry.yaml" ]; then
  LAST_REV=$("$YQ" -r '.aifred_pro_dev.nexus_sync.last_reviewed_commit // ""' "$JARVIS/paths-registry.yaml" 2>/dev/null || echo "")
fi
git -C "$DEV" fetch origin nexus-sync-2026-04 >> "$LOG" 2>&1 || true
HEAD_REV=$(git -C "$DEV" rev-parse origin/nexus-sync-2026-04 2>/dev/null || echo "")

if [ -z "$HEAD_REV" ]; then
  CHECK_4="FAIL: cannot resolve origin/nexus-sync-2026-04 (network or auth issue)"
elif [ -z "$LAST_REV" ]; then
  CHECK_4="WARN: no last_reviewed_commit recorded; run \`/sync-aifred-pro-dev\` to bootstrap"
else
  if git -C "$DEV" cat-file -e "$LAST_REV" 2>/dev/null && git -C "$DEV" merge-base --is-ancestor "$LAST_REV" "$HEAD_REV" 2>/dev/null; then
    if [ "$HEAD_REV" = "$LAST_REV" ]; then
      CHECK_4="PASS: HEAD == last_reviewed ($LAST_REV) — no new commits"
    else
      N=$(git -C "$DEV" rev-list --count "$LAST_REV..$HEAD_REV" 2>/dev/null || echo "?")
      CHECK_4="ACTION: $N new commit(s) since last review — run \`/sync-aifred-pro-dev\`"
    fi
  else
    CHECK_4="WARN: last_reviewed ($LAST_REV) not reachable from HEAD ($HEAD_REV) — branch may have been rewound"
  fi
fi

# Write report
cat > "$OUT" <<EOF
---
author: jarvis
type: status
project: AIFred-Pro
generated: $(ts)
check: nexus-sync-2026-04 health (2-week one-shot)
---

# nexus-sync-2026-04 — 2-Week Health Check Report

## Check 1 — Layer-1 launchd registration

$CHECK_1

## Check 2 — Layer-1 recent file mtime (\`Shared_Projects/Status/david/nexus-sync-2026-04-recent.md\`)

$CHECK_2

## Check 3 — Fetch log errors (\`.claude/logs/david-nexus-sync-fetch.log\`)

$CHECK_3

## Check 4 — Commit drift on \`davidmoneil/AIFred-Pro:nexus-sync-2026-04\`

$CHECK_4

---

*Auto-generated. The triggering plist self-cleaned on completion (unloaded + removed).*
*Verifier script remains at \`Jarvis/.claude/scripts/verify-david-nexus-sync-health.sh\` for reuse.*
EOF

log "wrote $OUT"

# Self-cleanup — unload and remove the plist; keep the script for reuse
if [ -f "$TARGET_PLIST" ]; then
  launchctl unload "$TARGET_PLIST" 2>/dev/null || true
  rm -f "$TARGET_PLIST"
  log "self-clean: unloaded and removed $TARGET_PLIST"
fi

log "=== verify-david-nexus-sync-health.sh end ==="
