#!/usr/bin/env bash
# validate-agent-schemas.sh — Detect malformed YAML frontmatter in agent definitions.
#
# Created: 2026-05-15 after the subagent-hallucination diagnostic experiment confirmed
# that `tools: All tools` (English prose) is parsed by the Claude Code harness as two
# invalid tool names ("All", "tools") via comma-split, granting the agent zero tools.
# The agent then fabricates tool output narrations rather than admit it has no tools.
#
# This script catches that family of schema bugs across all agent files:
#   - tools: All tools                 → INVALID (English prose, parses to bad tool names)
#   - tools: *                         → may or may not be supported; flag for review
#   - tools: <missing>                 → defaults to all-tool inheritance; OK
#   - tools: Read, Write, Bash, ...    → VALID (canonical comma-separated list)
#
# Exit codes:
#   0 — all agent files valid
#   1 — one or more files have malformed schemas
#
# Usage:
#   bash .claude/scripts/validate-agent-schemas.sh          # scan all agent dirs
#   bash .claude/scripts/validate-agent-schemas.sh --quiet  # only print on error

set -u
QUIET=0
[[ "${1:-}" == "--quiet" ]] && QUIET=1

JARVIS_ROOT="${JARVIS_ROOT:-$HOME/Claude/Jarvis}"
AGENT_DIRS=(
  "$JARVIS_ROOT/.claude/agents"
  "$JARVIS_ROOT/.claude/agents/_disabled"
  "$JARVIS_ROOT/.claude/agents/_archive"
)

# Canonical tool names recognized by the Claude Code harness (subset).
# Extracted from reference plugin agents + project _template-agent.md.
VALID_TOOLS="Read Write Edit Glob Grep Bash LS WebFetch WebSearch TodoWrite NotebookRead NotebookEdit BashOutput KillShell Task TaskCreate TaskUpdate TaskList TaskGet TaskOutput TaskStop Skill ToolSearch ScheduleWakeup AskUserQuestion EnterPlanMode ExitPlanMode EnterWorktree ExitWorktree CronCreate CronDelete CronList Monitor PushNotification RemoteTrigger ListMcpResourcesTool ReadMcpResourceTool LSP"

errors=0
checked=0

for dir in "${AGENT_DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  while IFS= read -r -d '' file; do
    name=$(basename "$file" .md)
    # Skip non-agent files (template marker, dotfiles)
    [[ "$name" == "_template-agent" ]] && continue
    [[ "$name" == "CLAUDE" ]] && continue

    # Extract `tools:` line from frontmatter.
    tools_line=$(awk '/^---$/{f++; next} f==1 && /^tools:/{print; exit} f==2{exit}' "$file")

    checked=$((checked + 1))

    if [[ -z "$tools_line" ]]; then
      [[ $QUIET -eq 0 ]] && echo "[OK ] $file — no tools: field (inherits all tools)"
      continue
    fi

    # Strip "tools:" prefix and whitespace.
    tools_value=$(echo "$tools_line" | sed 's/^tools:[[:space:]]*//' | tr -d '\r')

    # Detect known-bad values.
    case "$tools_value" in
      "All tools"|"all tools"|"ALL TOOLS"|"All Tools")
        echo "[BAD] $file — \`tools: $tools_value\` is INVALID English prose. Replace with a comma-separated list of canonical tool names (e.g. \`tools: Read, Write, Bash\`) or omit \`tools:\` entirely to inherit all tools." >&2
        errors=$((errors + 1))
        continue
        ;;
      "*"|'"*"')
        [[ $QUIET -eq 0 ]] && echo "[WARN] $file — \`tools: *\` — wildcard may not be honored by all Claude Code versions. Prefer explicit list OR omit tools: entirely."
        continue
        ;;
    esac

    # Parse as comma-separated list; validate each entry.
    IFS=',' read -ra entries <<< "$tools_value"
    invalid_in_file=()
    for raw in "${entries[@]}"; do
      tool=$(echo "$raw" | tr -d '[:space:]')
      [[ -z "$tool" ]] && continue
      if ! echo " $VALID_TOOLS " | grep -q " $tool "; then
        invalid_in_file+=("$tool")
      fi
    done
    if [[ ${#invalid_in_file[@]} -gt 0 ]]; then
      echo "[BAD] $file — unknown tool name(s) in tools: list: ${invalid_in_file[*]}" >&2
      errors=$((errors + 1))
    else
      [[ $QUIET -eq 0 ]] && echo "[OK ] $file — tools: $tools_value"
    fi
  done < <(find "$dir" -maxdepth 1 -name "*.md" -type f -print0 2>/dev/null)
done

[[ $QUIET -eq 0 ]] && echo ""
if [[ $errors -gt 0 ]]; then
  echo "validate-agent-schemas: $errors error(s) across $checked file(s). Fix before next session." >&2
  exit 1
fi
echo "validate-agent-schemas: $checked file(s) checked, no errors."
exit 0
