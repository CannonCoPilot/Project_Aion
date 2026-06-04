#!/bin/bash
# validate-sync.sh — Cross-repo drift detection between AIFred and AIFred-Pro
#
# Compares shared files, checks for unexpected drift, scans for hardcoded paths,
# and reports upstream commits not yet merged.
#
# Usage:
#   tests/validate-sync.sh                                           # Auto-detect paths
#   tests/validate-sync.sh --aifred ~/Code/AIfred --pro ~/Code/AIFred-Pro
#   tests/validate-sync.sh --summary                                 # Condensed output

set -uo pipefail

# --- Config ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MANIFEST="$SCRIPT_DIR/sync-manifest.yaml"

# Defaults (auto-detect from Pro location)
AIFRED_ROOT="${PRO_ROOT%Pro}"  # ~/Code/AIFred-Pro -> ~/Code/AIFred-
[[ -d "${AIFRED_ROOT%?}" ]] || AIFRED_ROOT=""  # Strip trailing dash if dir doesn't exist
# Try common locations
if [[ -z "$AIFRED_ROOT" ]] || [[ ! -d "$AIFRED_ROOT" ]]; then
    for candidate in "$HOME/Code/AIfred" "$HOME/Code/aifred"; do
        if [[ -d "$candidate" ]]; then
            AIFRED_ROOT="$candidate"
            break
        fi
    done
fi

SUMMARY_MODE=0

# --- Parse args ---
while [[ $# -gt 0 ]]; do
    case "$1" in
        --aifred) AIFRED_ROOT="$2"; shift 2 ;;
        --pro)    PRO_ROOT="$2"; shift 2 ;;
        --summary) SUMMARY_MODE=1; shift ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

# --- Validate ---
if [[ ! -d "$AIFRED_ROOT" ]]; then
    echo "ERROR: AIFred repo not found. Use --aifred <path>"
    exit 1
fi
if [[ ! -f "$MANIFEST" ]]; then
    echo "ERROR: sync-manifest.yaml not found at $MANIFEST"
    exit 1
fi

# --- Counters ---
PASS=0
FAIL=0
WARN=0
TEST_NUM=0

tap_pass() {
    ((TEST_NUM++))
    ((PASS++))
}

tap_fail() {
    ((TEST_NUM++))
    ((FAIL++))
    echo "not ok $TEST_NUM - $1"
    [[ -n "${2:-}" ]] && echo "  --- detail: $2"
}

tap_warn() {
    ((TEST_NUM++))
    ((WARN++))
    echo "ok $TEST_NUM - $1 # WARN $2"
}

echo "TAP version 13"
echo "# AIFred Sync Validation"
echo "# Base: $AIFRED_ROOT"
echo "# Pro:  $PRO_ROOT"
echo "# Date: $(date -Iseconds)"

# --- Parse manifest (minimal YAML parser for flat lists) ---
parse_section() {
    local section="$1"
    local in_section=0
    while IFS= read -r line; do
        # Strip comments
        line="${line%%#*}"
        # Detect section headers
        if [[ "$line" =~ ^([a-z_]+): ]]; then
            if [[ "${BASH_REMATCH[1]}" == "$section" ]]; then
                in_section=1
            else
                in_section=0
            fi
            continue
        fi
        # Collect list items in our section
        if [[ $in_section -eq 1 ]] && [[ "$line" =~ ^[[:space:]]*-[[:space:]]+(.*) ]]; then
            echo "${BASH_REMATCH[1]}"
        fi
    done < "$MANIFEST"
}

# ============================================================================
# 1. Shared files — diff between repos
# ============================================================================
echo ""
echo "# Shared File Comparison"

DRIFT_COUNT=0
MISSING_BASE=0
MISSING_PRO=0

while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    base_path="$AIFRED_ROOT/$file"
    pro_path="$PRO_ROOT/$file"

    if [[ ! -e "$base_path" ]]; then
        tap_fail "shared file in base: $file" "missing from AIFred"
        ((MISSING_BASE++))
        continue
    fi
    if [[ ! -e "$pro_path" ]]; then
        tap_fail "shared file in pro: $file" "missing from AIFred-Pro"
        ((MISSING_PRO++))
        continue
    fi

    if diff -q "$base_path" "$pro_path" &>/dev/null; then
        tap_pass "synced: $file"
    else
        ((DRIFT_COUNT++))
        if [[ $SUMMARY_MODE -eq 0 ]]; then
            DIFF_LINES=$(diff "$base_path" "$pro_path" | wc -l)
            tap_fail "synced: $file" "$DIFF_LINES lines differ"
        else
            tap_fail "synced: $file" "files differ"
        fi
    fi
done < <(parse_section "shared")

# ============================================================================
# 2. Pro-only files — verify they exist in Pro, not in base
# ============================================================================
echo ""
echo "# Pro-Only Files"

while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    # Handle directory patterns (trailing /)
    if [[ "$file" == */ ]]; then
        if [[ -d "$PRO_ROOT/$file" ]]; then
            tap_pass "pro-only dir exists: $file"
        else
            tap_fail "pro-only dir exists: $file" "directory missing from Pro"
        fi
        if [[ -d "$AIFRED_ROOT/$file" ]]; then
            tap_warn "pro-only not in base: $file" "directory also exists in public AIFred"
        fi
        continue
    fi

    if [[ -f "$PRO_ROOT/$file" ]]; then
        tap_pass "pro-only exists: $file"
    else
        tap_fail "pro-only exists: $file" "missing from AIFred-Pro"
    fi

    if [[ -f "$AIFRED_ROOT/$file" ]]; then
        tap_warn "pro-only not in base: $file" "file also exists in public AIFred (leak?)"
    fi
done < <(parse_section "pro_only")

# ============================================================================
# 3. Base-only files — verify they exist in base, not in Pro
# ============================================================================
echo ""
echo "# Base-Only Files"

while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    if [[ -f "$AIFRED_ROOT/$file" ]]; then
        tap_pass "base-only exists: $file"
    else
        tap_warn "base-only exists: $file" "missing from AIFred"
    fi
done < <(parse_section "base_only")

# ============================================================================
# 4. Hardcoded paths in shared files
# ============================================================================
echo ""
echo "# Hardcoded Paths in Shared Files"

HARDCODED_FOUND=0
while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    filepath="$PRO_ROOT/$file"
    [[ -f "$filepath" ]] || continue

    if grep -qE '/home/[a-z]+/' "$filepath" 2>/dev/null; then
        MATCHES=$(grep -nE '/home/[a-z]+/' "$filepath" | head -3)
        tap_fail "no hardcoded paths: $file" "$MATCHES"
        ((HARDCODED_FOUND++))
    fi
done < <(parse_section "shared")

if [[ $HARDCODED_FOUND -eq 0 ]]; then
    tap_pass "no hardcoded user paths in shared files"
fi

# ============================================================================
# 5. Upstream sync status
# ============================================================================
echo ""
echo "# Upstream Sync Status"

if [[ -d "$AIFRED_ROOT/.git" ]] && [[ -d "$PRO_ROOT/.git" ]]; then
    BASE_HEAD=$(cd "$AIFRED_ROOT" && git rev-parse --short HEAD 2>/dev/null)
    PRO_HEAD=$(cd "$PRO_ROOT" && git rev-parse --short HEAD 2>/dev/null)
    BASE_DATE=$(cd "$AIFRED_ROOT" && git log -1 --format='%ci' 2>/dev/null)
    PRO_DATE=$(cd "$PRO_ROOT" && git log -1 --format='%ci' 2>/dev/null)

    echo "# Base HEAD: $BASE_HEAD ($BASE_DATE)"
    echo "# Pro HEAD:  $PRO_HEAD ($PRO_DATE)"

    # Count recent base commits (last 30 days)
    RECENT=$(cd "$AIFRED_ROOT" && git log --since="30 days ago" --oneline 2>/dev/null | wc -l)
    echo "# Base commits (last 30d): $RECENT"
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "1..$TEST_NUM"
echo ""

TOTAL=$((PASS + FAIL + WARN))
if [[ $FAIL -eq 0 ]]; then
    echo -e "\033[0;32m# All $TOTAL checks passed ($PASS ok, $WARN warnings)\033[0m"
    exit 0
else
    echo -e "\033[0;31m# $FAIL of $TOTAL checks failed ($PASS passed, $WARN warnings)\033[0m"
    if [[ $DRIFT_COUNT -gt 0 ]]; then
        echo "# $DRIFT_COUNT shared file(s) have drifted between repos"
    fi
    if [[ $MISSING_BASE -gt 0 ]]; then
        echo "# $MISSING_BASE shared file(s) missing from AIFred (base)"
    fi
    if [[ $MISSING_PRO -gt 0 ]]; then
        echo "# $MISSING_PRO shared file(s) missing from AIFred-Pro"
    fi
    exit 1
fi
