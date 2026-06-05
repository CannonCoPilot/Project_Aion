#!/bin/bash
# ============================================================================
# Chain-of-Draft (CoD) Injection Hook — UserPromptSubmit
# ============================================================================
#
# Phase 2.4.a — runtime wiring for CoD reasoning compression.
#
# Architecture: projects/project-aion/designs/cod-injection-architecture.md v1.1.0
# Pre-registration: .claude/metrics/token-compression/pre-registration-phase-2-cod.yaml
# Mirror pattern: .claude/hooks/jicm-gate.sh (sensing-only, additionalContext, no
# decision:block — fail-closed-by-default with single explicit opt-in).
#
# BEHAVIOR:
#   1. JICM_COD_DISABLED=1 → no-op (emergency kill switch, architecture §8 Q3)
#   2. Prompt lacks `^[task: <type>]` prefix → no-op (architecture §8 Q1)
#   3. Task-type matches Layer-1 skip-rule (arithmetic | code-generation |
#      creative-writing | tool-use-heavy) → log + no-op (pre-reg zero-tolerance)
#   4. Resolve template — fewshot variant (prompts/cod-examples/<type>.md) with
#      automatic fallback to single-line variant (templates/chain-of-draft-single-line.txt)
#      while Phase 2.2 fewshots remain unauthored
#   5. Emit template content as additionalContext (per-prompt scope; one turn only)
#   6. Log application to .claude/logs/cod-inject.log (rotated at 100KB)
#
# PER-PROMPT SEMANTICS: Hook fires on each UPS event; CoD applies only to the
# next assistant turn. Subsequent turns require re-prefixing. This matches the
# pre-registration's effort_class=per_prompt_telemetry (architecture §3.5).
#
# TEMPLATE EXTENSION HANDLING:
#   .txt → strip leading shell-style comment header (authoring documentation
#          should not reach the model); content body emitted verbatim
#   .md  → emit as-is (markdown headers in body are signal — fewshot structure)
#
# ENV OVERRIDES:
#   JICM_COD_DISABLED=1        Emergency kill switch (architecture §8 Q3)
#   JICM_COD_PROJECT_DIR=...   Override CLAUDE_PROJECT_DIR (rare; tests)
#
# OUTPUT: JSON to stdout, exit 0 always (errors → no-op, never block UPS).
# ============================================================================

set -o pipefail   # NB: NOT -euo (per Jarvis MEMORY.md grep-exit-1 gotcha)

INPUT="$(cat)"

# ─── Required tools ─────────────────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
    echo '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
    exit 0
fi

# ─── Config ─────────────────────────────────────────────────────────────────
PROJECT_DIR="${JICM_COD_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$HOME/Claude/Project_Aion}}"
SKILL_ROOT="$PROJECT_DIR/.claude/skills/token-compression"
LOG_FILE="$PROJECT_DIR/.claude/logs/cod-inject.log"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null

# ─── Emergency kill switch (architecture §8 Q3) ─────────────────────────────
if [[ "${JICM_COD_DISABLED:-0}" == "1" ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
    exit 0
fi

# ─── Extract identifiers + prompt from stdin ────────────────────────────────
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
[[ "$SESSION_ID" == "null" ]] && SESSION_ID="unknown"
[[ "$PROMPT" == "null" ]] && PROMPT=""

# ─── Empty / missing prompt → no-op ─────────────────────────────────────────
if [[ -z "$PROMPT" ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
    exit 0
fi

# ─── Anchored prefix-tag scan (architecture §3.3.1, §8 Q1) ──────────────────
# Strict format: `^\[task: <type>\]` on the first line, lowercase a-z plus
# hyphen/underscore. No leading whitespace. The space after `task:` is required.
# Anything else → treated as untagged (no CoD).
FIRST_LINE=$(printf '%s' "$PROMPT" | head -n 1)
TASK_TYPE=$(printf '%s' "$FIRST_LINE" | sed -nE 's/^\[task: ([a-z_-]+)\].*/\1/p' | head -n 1)

if [[ -z "$TASK_TYPE" ]]; then
    # No tag → no CoD; emit empty additionalContext (silent, no log line —
    # the absence of CoD is not noteworthy; logging would dwarf the actual
    # signal we care about).
    echo '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
    exit 0
fi

NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PROMPT_CHARS=$(printf '%s' "$PROMPT" | wc -c | tr -d ' ')

# ─── Layer-1 skip-rule enforcement (pre-reg zero-tolerance, architecture §2.3) ─
# Per pre-registration-phase-2-cod.yaml#skip_rules, these task types must NEVER
# receive CoD: arithmetic shows -4% accuracy in the paper; code-generation
# triggers register-violation patterns; creative-writing's free-form structure
# is incompatible with <draft>/<answer> framing; tool-use-heavy reasoning is
# observation-driven, not draft-shaped.
case "$TASK_TYPE" in
    arithmetic|code-generation|creative-writing|tool-use-heavy)
        echo "$NOW_ISO | SKIP_RULE_VIOLATION | task_type=$TASK_TYPE | prompt_chars=$PROMPT_CHARS | session=$SESSION_ID" >> "$LOG_FILE"
        echo '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
        exit 0 ;;
esac

# ─── Resolve template (fewshot first, single-line fallback) ─────────────────
# Phase 2.2 per-task-type fewshots are gated on Task 2.1.b results — until
# they exist, every tagged prompt resolves to the arxiv-verbatim single-line
# seed. This is the intended Stage-1 behavior.
TEMPLATE="$SKILL_ROOT/prompts/cod-examples/${TASK_TYPE}.md"
TEMPLATE_VARIANT="fewshot"
if [[ ! -f "$TEMPLATE" ]]; then
    TEMPLATE="$SKILL_ROOT/templates/chain-of-draft-single-line.txt"
    TEMPLATE_VARIANT="single-line"
fi

if [[ ! -f "$TEMPLATE" ]]; then
    # No template at all (skill misconfigured) → log + no-op
    echo "$NOW_ISO | TEMPLATE_NOT_FOUND | task_type=$TASK_TYPE | session=$SESSION_ID" >> "$LOG_FILE"
    echo '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":""}}'
    exit 0
fi

# ─── Read template content (extension-aware) ────────────────────────────────
# .txt files have shell-style header comments (authoring docs); strip them so
# only content reaches the model. .md files use # for markdown headers — the
# fewshot structure is signal — emit verbatim.
case "$TEMPLATE" in
    *.txt)
        COD_TEXT=$(awk 'BEGIN{h=1} h && (/^#/ || /^[[:space:]]*$/) {next} {h=0; print}' "$TEMPLATE") ;;
    *)
        COD_TEXT=$(cat "$TEMPLATE") ;;
esac

# ─── Emit additionalContext + log ───────────────────────────────────────────
echo "$NOW_ISO | APPLIED | task_type=$TASK_TYPE | variant=$TEMPLATE_VARIANT | template=$TEMPLATE | prompt_chars=$PROMPT_CHARS | session=$SESSION_ID" >> "$LOG_FILE"

# Rotate log if > 100KB (matches jicm-gate.sh rotation policy)
LOG_SIZE=$(wc -c < "$LOG_FILE" 2>/dev/null | tr -d ' ' || echo 0)
if [[ "$LOG_SIZE" -gt 102400 ]]; then
    mv "$LOG_FILE" "${LOG_FILE}.1" 2>/dev/null
fi

# JSON-escape COD_TEXT through jq (handles quotes, newlines, unicode safely)
jq -n --arg ctx "$COD_TEXT" \
    '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $ctx}}'
exit 0
