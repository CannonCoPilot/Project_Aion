# JICM Agent-Awareness: Auto-Compact and Subagent Protection

## Problem Statement

When JICM (or Claude Code's built-in auto-compact) triggers context compression,
running Task subagents may be affected:

1. **Subagent results may be lost** if the parent context is cleared before agents return
2. **Post-clear Jarvis may repeat agent work** because it sees agents as "failed"
3. **No parallelization** after restore — Jarvis works sequentially without agents

## Analysis

### How Claude Code Auto-Compact Works

Claude Code's auto-compact triggers when context approaches limits. It:
1. Summarizes the conversation
2. Clears the context window
3. Injects the summary as new context

**Key finding**: Auto-compact is a CLIENT-SIDE operation. Running subagents are
server-side processes that continue regardless of client context state. However:
- The parent conversation loses awareness of dispatched agents
- Agent results are written to output files in `/private/tmp/claude-*/tasks/`
- The JSONL transcript DOES record agent dispatches and completions

### How JICM v7 Works

JICM sends `[JICM-HALT]` → runs prep script → sends `/clear` → sends resume prompt.
The prep script extracts from JSONL, but **does not capture agent status**.

## Proposed Solution

### Option A: Pre-Halt Agent Check (Recommended)

Before sending `[JICM-HALT]`, check if agents are running:

```bash
# In jicm-watcher.sh, before do_halt()
check_running_agents() {
    # Check for active Task tool processes
    local agent_count
    agent_count=$(pgrep -f "claude.*task" 2>/dev/null | wc -l | xargs)

    if [[ "$agent_count" -gt 0 ]]; then
        echo "$agent_count"
        return 0
    fi
    echo "0"
    return 0
}
```

If agents are running, delay the JICM cycle by a configurable timeout (e.g., 120s)
and re-check. If still running after timeout, proceed anyway but log the risk.

### Option B: Agent Result Recovery

After restore, scan the JSONL for recent agent dispatches and check output files:

```bash
# Extract agent output files from JSONL
grep -o '/private/tmp/claude-[^"]*\.output' "$JSONL" | while read -r f; do
    if [[ -f "$f" ]]; then
        echo "Agent result available: $f"
    fi
done
```

### Option C: Signal File Protocol

1. When Jarvis dispatches agents, a hook writes `.agents-running` with count
2. JICM checks this file before halting
3. Agents decrement on completion; JICM waits for count=0

**Drawback**: Requires hook integration on both Task dispatch and completion.

## Recommendation

**Implement Option A first** (simplest, no hook changes needed), then consider
Option B as enhancement for context recovery. Option C is over-engineered for
the current use case.

## Implementation Status

- [ ] Add `check_running_agents()` to jicm-watcher.sh
- [ ] Add configurable agent wait timeout (default: 120s)
- [ ] Add agent status to jicm-prep-context.sh output
- [ ] Test with parallel Task agents running

---

*Research doc created 2026-02-18 — W5:Jarvis-dev overnight session*
