#!/bin/bash
# Phase 1 Validation Pipeline — Visual verification of overnight artifacts
# Targets: 1.2 (compressed-context-ready), 1.3 (/clear safety),
#          1.5 (bash-gotchas), 1.6 (computed-state pattern)
#
# Usage: bash .claude/scripts/validate-phase1.sh

PROJECT_DIR="$HOME/Claude/Jarvis"
PASS=0
FAIL=0
WARN=0

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

check() {
    local label="$1"
    local result="$2"
    if [ "$result" = "PASS" ]; then
        echo "  [PASS] $label"
        PASS=$((PASS + 1))
    elif [ "$result" = "WARN" ]; then
        echo "  [WARN] $label"
        WARN=$((WARN + 1))
    else
        echo "  [FAIL] $label"
        FAIL=$((FAIL + 1))
    fi
}

divider() {
    echo "  ────────────────────────────────────────────────"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header "1.2  Compressed-Context-Ready.md Verification"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CCR="$PROJECT_DIR/.claude/context/.compressed-context-ready.md"
PREP="$PROJECT_DIR/.claude/scripts/jicm-prep-context.sh"

# Check: prep script exists
if [ -f "$PREP" ]; then
    check "jicm-prep-context.sh exists" "PASS"
else
    check "jicm-prep-context.sh exists" "FAIL"
fi

# Check: output path in prep script matches expected
if grep -q "compressed-context-ready.md" "$PREP" 2>/dev/null; then
    check "Prep script writes to .compressed-context-ready.md" "PASS"
else
    check "Prep script writes to .compressed-context-ready.md" "FAIL"
fi

# Check: prep script does NOT delete the output file
if grep -q "rm.*compressed-context-ready" "$PREP" 2>/dev/null; then
    check "Prep script does NOT delete output after write" "FAIL"
else
    check "Prep script does NOT delete output after write" "PASS"
fi

# Check: watcher does NOT consume/delete the file
WATCHER="$PROJECT_DIR/.claude/scripts/jicm-watcher.sh"
if grep -q "rm.*compressed-context-ready" "$WATCHER" 2>/dev/null; then
    check "Watcher does NOT delete .compressed-context-ready.md" "FAIL"
else
    check "Watcher does NOT delete .compressed-context-ready.md" "PASS"
fi

# Check: file currently exists on disk (may not if no compression this session)
if [ -f "$CCR" ]; then
    check "File exists on disk (from prior compression)" "PASS"
    divider
    echo "  File size: $(wc -c < "$CCR" | xargs) bytes"
    echo "  Last modified: $(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$CCR")"
    echo "  Line count: $(wc -l < "$CCR" | xargs)"
    divider
    echo "  First 15 lines:"
    head -15 "$CCR" | sed 's/^/    /'
else
    check "File exists on disk" "WARN"
    echo "  (No compression has occurred this session — expected if fresh)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header "1.3  /clear Safety — PreCompact Hook"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRECOMPACT="$PROJECT_DIR/.claude/hooks/pre-compact.sh"
SETTINGS="$PROJECT_DIR/.claude/settings.json"
CHECKPOINT="$PROJECT_DIR/.claude/context/.soft-restart-checkpoint.md"

# Check: pre-compact.sh exists
if [ -f "$PRECOMPACT" ]; then
    check "pre-compact.sh hook exists" "PASS"
else
    check "pre-compact.sh hook exists" "FAIL"
fi

# Check: registered in settings.json under PreCompact
if grep -q "pre-compact" "$SETTINGS" 2>/dev/null; then
    check "Hook registered in settings.json" "PASS"
else
    check "Hook registered in settings.json" "FAIL"
fi

# Check: creates checkpoint file
if grep -q "soft-restart-checkpoint" "$PRECOMPACT" 2>/dev/null; then
    check "Hook writes .soft-restart-checkpoint.md" "PASS"
else
    check "Hook writes .soft-restart-checkpoint.md" "FAIL"
fi

# Check: session-start.sh reads checkpoint on restore
SESSSTART="$PROJECT_DIR/.claude/hooks/session-start.sh"
if grep -q "soft-restart-checkpoint\|compressed-context-ready" "$SESSSTART" 2>/dev/null; then
    check "session-start.sh reads checkpoint on restore" "PASS"
else
    check "session-start.sh reads checkpoint on restore" "FAIL"
fi

# Check: current checkpoint file on disk
if [ -f "$CHECKPOINT" ]; then
    check "Checkpoint file exists on disk" "PASS"
    divider
    echo "  Last modified: $(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$CHECKPOINT")"
    echo "  First 8 lines:"
    head -8 "$CHECKPOINT" | sed 's/^/    /'
else
    check "Checkpoint file exists on disk" "WARN"
    echo "  (No compaction triggered yet — expected for fresh session)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header "1.5  Bash Gotchas Reference"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GOTCHAS="$PROJECT_DIR/.claude/context/reference/bash-gotchas.md"

# Check: file exists
if [ -f "$GOTCHAS" ]; then
    check "bash-gotchas.md exists" "PASS"
else
    check "bash-gotchas.md exists" "FAIL"
fi

# Check: minimum size (should be substantial)
if [ -f "$GOTCHAS" ]; then
    lines=$(wc -l < "$GOTCHAS" | xargs)
    if [ "$lines" -ge 100 ]; then
        check "File has $lines lines (>= 100 expected)" "PASS"
    else
        check "File has $lines lines (>= 100 expected)" "FAIL"
    fi
fi

# Check: key sections present
for section in "macOS Bash 3.2" "tmux Interaction" "set -euo pipefail" "GH007" "send-keys" "Heredocs" "jq Patterns"; do
    if grep -qi "$section" "$GOTCHAS" 2>/dev/null; then
        check "Section present: $section" "PASS"
    else
        check "Section present: $section" "FAIL"
    fi
done

# Check: referenced from MEMORY.md
MEMORY="$HOME/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/memory/MEMORY.md"
if grep -q "bash-gotchas" "$MEMORY" 2>/dev/null; then
    check "Referenced from MEMORY.md" "PASS"
else
    check "Referenced from MEMORY.md" "FAIL"
fi

# Check: referenced from CLAUDE.md
CLAUDEMD="$PROJECT_DIR/CLAUDE.md"
if grep -q "bash-gotchas" "$CLAUDEMD" 2>/dev/null; then
    check "Referenced from CLAUDE.md" "PASS"
else
    check "Referenced from CLAUDE.md" "FAIL"
fi

divider
echo "  Table of Contents (## headers):"
grep "^## " "$GOTCHAS" 2>/dev/null | sed 's/^/    /'

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header "1.6  Computed-State Pattern"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CSTATE="$PROJECT_DIR/.claude/context/patterns/computed-state.md"

# Check: file exists
if [ -f "$CSTATE" ]; then
    check "computed-state.md exists" "PASS"
else
    check "computed-state.md exists" "FAIL"
fi

# Check: has required metadata
for field in "ID" "Category" "Status" "Added"; do
    if grep -q "\\*\\*$field\\*\\*" "$CSTATE" 2>/dev/null; then
        check "Metadata field: $field" "PASS"
    else
        check "Metadata field: $field" "FAIL"
    fi
done

# Check: key sections present
for section in "Problem" "Solution" "Examples in Jarvis" "When to Use" "When NOT to Use" "Anti-Patterns"; do
    if grep -q "## $section" "$CSTATE" 2>/dev/null; then
        check "Section present: $section" "PASS"
    else
        check "Section present: $section" "FAIL"
    fi
done

# Check: references EVO-2026-02-004
if grep -q "EVO-2026-02-004" "$CSTATE" 2>/dev/null; then
    check "References EVO-2026-02-004 identifier" "PASS"
else
    check "References EVO-2026-02-004 identifier" "FAIL"
fi

# Check: registered in patterns index
PINDEX="$PROJECT_DIR/.claude/context/patterns/_index.md"
if grep -qi "computed.state" "$PINDEX" 2>/dev/null; then
    check "Registered in patterns/_index.md" "PASS"
else
    check "Registered in patterns/_index.md" "WARN"
    echo "  (Pattern may not be indexed yet)"
fi

divider
echo "  Jarvis examples documented:"
grep "^### " "$CSTATE" 2>/dev/null | sed 's/^/    /'

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
header "SUMMARY"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOTAL=$((PASS + FAIL + WARN))
echo ""
echo "  Results: $PASS passed, $FAIL failed, $WARN warnings  ($TOTAL total checks)"
echo ""
if [ "$FAIL" -eq 0 ]; then
    echo "  STATUS: ALL CRITICAL CHECKS PASSED"
else
    echo "  STATUS: $FAIL FAILURES DETECTED — review above"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
