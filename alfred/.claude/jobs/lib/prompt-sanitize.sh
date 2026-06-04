#!/usr/bin/env bash
# prompt-sanitize.sh — Prompt injection defense for Nexus executor
#
# Provides XML boundary wrapping for untrusted data and injection pattern
# detection with configurable enforcement. Defense-in-depth: boundary tags
# teach the LLM to treat wrapped content as data, detection provides
# forensic visibility and optional hard blocking.
#
# Source this from executor.sh.
#
# API:
#   sanitize_wrap <tag_name> <content>     — Wrap content in <untrusted_TAG> XML tags
#   detect_injection <content> <source>    — Scan for injection patterns, log matches
#   injection_gate_check                   — Evaluate accumulated detections against mode, return non-zero to abort
#
# Modes (set via PROMPT_SANITIZE_MODE env var):
#   advisory  — log only, never block (legacy behavior)
#   strict    — log + injection_gate_check returns non-zero so executor aborts
#   block     — log + abort + create Pulse waiting:david task for review
#
# Default: strict
#
# Design ref: Aurora threat model 2026-04-01 (AIProjects-ghch)

# Guard against double-sourcing
[ -n "${_PROMPT_SANITIZE_SH_LOADED:-}" ] && return 0
_PROMPT_SANITIZE_SH_LOADED=1

# Ensure audit logging is available
_PS_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$_PS_SCRIPT_DIR/audit-log.sh" 2>/dev/null || true

# ============================================================================
# Mode Configuration
# ============================================================================

# PROMPT_SANITIZE_MODE: advisory | strict | block (default: strict)
PROMPT_SANITIZE_MODE="${PROMPT_SANITIZE_MODE:-strict}"

# Accumulator for detections within a single build_prompt call
_INJECTION_DETECTIONS=()
_INJECTION_SOURCES=()

# ============================================================================
# XML Boundary Wrapping
# ============================================================================

# sanitize_wrap — Wrap untrusted content in XML boundary tags
#
# Neutralizes embedded boundary tags to prevent breakout attacks where content
# contains </untrusted_*> to escape the boundary.
#
# Usage: sanitize_wrap "task" "$task_description"
# Output: <untrusted_task>\n$content_with_neutralized_tags\n</untrusted_task>
sanitize_wrap() {
    local tag_name="$1"
    local content="$2"

    # Neutralize embedded boundary tags (prevent breakout)
    # Replace <untrusted_ and </untrusted_ with bracket equivalents
    content="${content//<untrusted_/[untrusted_}"
    content="${content//<\/untrusted_/[\/untrusted_}"

    printf '<untrusted_%s>\n%s\n</untrusted_%s>' "$tag_name" "$content" "$tag_name"
}

# ============================================================================
# Injection Pattern Detection
# ============================================================================

# High-signal injection patterns (case-insensitive grep)
# These are chosen to minimize false positives on legitimate task descriptions
_INJECTION_PATTERNS=(
    'ignore all previous'
    'ignore the above'
    'ignore above instructions'
    'ignore your instructions'
    'disregard all previous'
    'disregard your instructions'
    '\[END TASK\]'
    '\[SYSTEM\]'
    '\[INJECT\]'
    '\[END PERSONA'
    'you are now a'
    'your new role is'
    'DAN mode'
    'jailbreak'
    'unrestricted mode'
    'override all rules'
    'bypass all'
    '</untrusted_'
)

# detect_injection — Scan content for injection patterns and log matches
#
# Advisory only — logs to audit trail but never blocks execution.
# Returns 0 if patterns found (with logging), 1 if clean.
#
# Usage: detect_injection "$content" "task_description"
detect_injection() {
    local content="$1"
    local source_label="${2:-unknown}"

    [ -z "$content" ] && return 1

    local matched_patterns=()
    for pattern in "${_INJECTION_PATTERNS[@]}"; do
        if printf '%s\n' "$content" | grep -qi "$pattern" 2>/dev/null; then
            matched_patterns+=("$pattern")
        fi
    done

    if [ ${#matched_patterns[@]} -gt 0 ]; then
        local patterns_json
        patterns_json=$(printf '%s\n' "${matched_patterns[@]}" | jq -R . | jq -sc .)
        local content_preview="${content:0:200}"

        # Log to audit trail
        if type log_audit &>/dev/null; then
            log_audit "system:executor" "security.injection_detected" "prompt" "$source_label" \
                "$(jq -nc --arg src "$source_label" --argjson patterns "$patterns_json" \
                    --arg preview "$content_preview" --arg mode "$PROMPT_SANITIZE_MODE" \
                    '{source:$src, patterns:$patterns, content_preview:$preview, mode:$mode}')" 2>/dev/null || true
        fi

        # Also log to stderr for immediate visibility in job logs
        echo "[SECURITY] Injection pattern detected in $source_label: ${matched_patterns[*]} (mode=$PROMPT_SANITIZE_MODE)" >&2

        # Accumulate for gate check
        _INJECTION_DETECTIONS+=("${matched_patterns[*]}")
        _INJECTION_SOURCES+=("$source_label")

        return 0
    fi

    return 1
}

# ============================================================================
# Injection Gate Check
# ============================================================================

# injection_gate_check — Evaluate accumulated detections against mode
#
# Call after build_prompt completes. Behavior depends on PROMPT_SANITIZE_MODE:
#   advisory — always returns 0 (pass)
#   strict   — returns 1 if any detections accumulated (caller should abort)
#   block    — returns 1 + creates a Pulse waiting:david task for review
#
# Usage: injection_gate_check "$JOB_NAME" "$TASK_ID" || { log "aborted"; exit 1; }
injection_gate_check() {
    local job_name="${1:-unknown}"
    local task_id="${2:-}"

    # No detections — always pass
    if [ ${#_INJECTION_DETECTIONS[@]} -eq 0 ]; then
        return 0
    fi

    local detection_count=${#_INJECTION_DETECTIONS[@]}
    local sources_summary
    sources_summary=$(printf '%s, ' "${_INJECTION_SOURCES[@]}")
    sources_summary="${sources_summary%, }"
    local patterns_summary
    patterns_summary=$(printf '%s; ' "${_INJECTION_DETECTIONS[@]}")
    patterns_summary="${patterns_summary%; }"

    # Advisory mode — log summary but pass
    if [ "$PROMPT_SANITIZE_MODE" = "advisory" ]; then
        echo "[SECURITY] Advisory: $detection_count injection detection(s) in [$sources_summary] — proceeding (mode=advisory)" >&2
        _INJECTION_DETECTIONS=()
        _INJECTION_SOURCES=()
        return 0
    fi

    # Strict or block — log and fail
    echo "[SECURITY] BLOCKED: $detection_count injection detection(s) in [$sources_summary] — aborting job $job_name (mode=$PROMPT_SANITIZE_MODE)" >&2

    if type log_audit &>/dev/null; then
        log_audit "system:executor" "security.injection_blocked" "prompt" "$job_name" \
            "$(jq -nc --arg job "$job_name" --arg task "${task_id:-none}" \
                --arg sources "$sources_summary" --arg patterns "$patterns_summary" \
                --arg mode "$PROMPT_SANITIZE_MODE" --arg count "$detection_count" \
                '{job:$job, task_id:$task, sources:$sources, patterns:$patterns, mode:$mode, detection_count:($count|tonumber)}')" 2>/dev/null || true
    fi

    # Block mode — also create a Pulse task for human review
    if [ "$PROMPT_SANITIZE_MODE" = "block" ]; then
        local pulse_cli
        pulse_cli=$(command -v pulse 2>/dev/null || echo "")
        if [ -n "$pulse_cli" ]; then
            local review_title="Security: Injection detected in job $job_name${task_id:+ (task $task_id)}"
            "$pulse_cli" create "$review_title" -t task -p 1 \
                -l "domain:security,project:nexus,source:headless,waiting:david,severity:high,stage:intake,security:injection-suspect" 2>/dev/null || true
            echo "[SECURITY] Created Pulse review task for blocked injection" >&2
        fi
    fi

    # Reset accumulators
    _INJECTION_DETECTIONS=()
    _INJECTION_SOURCES=()

    return 1
}
