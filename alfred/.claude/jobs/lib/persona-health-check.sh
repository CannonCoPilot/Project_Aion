#!/usr/bin/env bash
# persona-health-check.sh — Validate persona directories and registry references
#
# Checks:
#   1. Every persona dir has config.yaml and prompt.md
#   2. Every enabled job in registry.yaml references a valid persona
#   3. No orphan persona dirs (defined but unused)
#
# Usage:
#   persona-health-check.sh           # Run checks, exit 0=clean, 1=issues
#   persona-health-check.sh --json    # JSON output for automation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS_DIR="$(dirname "$SCRIPT_DIR")"
REGISTRY="$JOBS_DIR/registry.yaml"
PERSONAS_DIR="$JOBS_DIR/personas"

# Load shared utilities
source "$SCRIPT_DIR/common.sh"
YQ=$(require_yq)

JSON_MODE=false
[ "${1:-}" = "--json" ] && JSON_MODE=true

ISSUES=()
WARNINGS=()

# ============================================================================
# Check 1: Persona directory completeness
# ============================================================================

for dir in "$PERSONAS_DIR"/*/; do
    persona=$(basename "$dir")
    [ "$persona" = "_template" ] && continue

    if [ ! -f "$dir/config.yaml" ]; then
        ISSUES+=("Persona '$persona' missing config.yaml")
    fi
    if [ ! -f "$dir/prompt.md" ]; then
        ISSUES+=("Persona '$persona' missing prompt.md")
    fi
done

# ============================================================================
# Check 2: Registry references valid personas
# ============================================================================

while IFS= read -r job; do
    enabled=$(reg_get "$job" "enabled" "true")
    [ "$enabled" = "false" ] && continue

    persona=$(reg_get "$job" "persona" "")
    if [ -z "$persona" ] || [ "$persona" = "null" ]; then
        WARNINGS+=("Job '$job' has no persona defined")
        continue
    fi

    if [ ! -d "$PERSONAS_DIR/$persona" ]; then
        ISSUES+=("Job '$job' references non-existent persona '$persona'")
    fi
done < <("$YQ" '.jobs | keys | .[]' "$REGISTRY" 2>/dev/null)

# ============================================================================
# Check 3: Orphan personas (defined but no job uses them)
# ============================================================================

for dir in "$PERSONAS_DIR"/*/; do
    persona=$(basename "$dir")
    [ "$persona" = "_template" ] && continue

    used=false
    while IFS= read -r job; do
        job_persona=$(reg_get "$job" "persona" "")
        if [ "$job_persona" = "$persona" ]; then
            used=true
            break
        fi
    done < <("$YQ" '.jobs | keys | .[]' "$REGISTRY" 2>/dev/null)

    if [ "$used" = "false" ]; then
        WARNINGS+=("Persona '$persona' exists but no job references it")
    fi
done

# ============================================================================
# Output
# ============================================================================

if [ "$JSON_MODE" = "true" ]; then
    jq -nc \
        --argjson issues "$(printf '%s\n' "${ISSUES[@]:-}" | jq -R . | jq -s .)" \
        --argjson warnings "$(printf '%s\n' "${WARNINGS[@]:-}" | jq -R . | jq -s .)" \
        --arg status "$([ ${#ISSUES[@]} -eq 0 ] && echo "healthy" || echo "unhealthy")" \
        '{status: $status, issues: $issues, warnings: $warnings}'
else
    if [ ${#ISSUES[@]} -eq 0 ] && [ ${#WARNINGS[@]} -eq 0 ]; then
        echo "Persona health: all checks passed"
    else
        if [ ${#ISSUES[@]} -gt 0 ]; then
            echo "ISSUES (${#ISSUES[@]}):"
            for issue in "${ISSUES[@]}"; do
                echo "  [!] $issue"
            done
        fi
        if [ ${#WARNINGS[@]} -gt 0 ]; then
            echo "WARNINGS (${#WARNINGS[@]}):"
            for warning in "${WARNINGS[@]}"; do
                echo "  [~] $warning"
            done
        fi
    fi
fi

# Exit non-zero if issues found
[ ${#ISSUES[@]} -eq 0 ]
