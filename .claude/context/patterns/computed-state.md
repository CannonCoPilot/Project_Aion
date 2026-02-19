# Pattern: Computed State

**ID**: computed-state
**Category**: Architecture
**Status**: Active
**Added**: 2026-02-18 (EVO-2026-02-004)

## Problem

Maintaining state in dedicated files creates synchronization burden. State files
can become stale when the source-of-truth changes but the state file isn't
updated. Multiple writers to the same state file create race conditions.

## Solution

Derive state by computing it from authoritative sources rather than maintaining
it separately. Instead of writing state changes to a file, read the source data
and compute the current state on demand.

## Examples in Jarvis

### JICM State from JSONL Transcript
- **Before**: LLM compression agent summarized conversation into a checkpoint file
- **After (v7)**: `jicm-prep-context.sh` extracts user messages directly from
  the JSONL transcript (the authoritative conversation record)
- **Benefit**: 7,500x faster, always accurate, no stale summaries

### Session Status from Git + File Timestamps
- Session state can be partially reconstructed from:
  - `git log --oneline -5` (recent work)
  - `git status` (uncommitted changes)
  - File modification times on session-state.md, plans, etc.
- No separate "activity tracker" needed for basic state

### Watcher Health from pgrep
- Instead of maintaining a "watcher-alive" heartbeat file, compute:
  ```bash
  pgrep -f "jicm-watcher.sh" | wc -l
  ```
- Always accurate, no stale heartbeat files

### Context Percentage from TUI
- JICM reads context % directly from Claude Code's TUI status line
- No estimation model or token counting needed — source of truth is the TUI

## When to Use

- State changes frequently and has a reliable source of truth
- Multiple components need to read state but only one writes
- State reconstruction is cheap (< 1s)
- Staleness would cause errors or confusion

## When NOT to Use

- Computation is expensive (cache the result instead)
- The source data is ephemeral (e.g., in-memory only)
- Multiple writers need to coordinate (use a proper state file with locking)
- Historical state matters (computed state is point-in-time only)

## Anti-Patterns

### Computed + Cached Without Invalidation
Computing state but caching it without a cache-invalidation strategy recreates
the staleness problem. Either recompute on every read, or use file watchers /
timestamps to invalidate.

### Over-Computing
If 10 hooks all compute the same state from the same source, that's 10x the
I/O for no benefit. In this case, compute once and share via a short-TTL cache
file (e.g., `.jicm-state` updated every 30s by the watcher).

## Related Patterns

- **Signal Files**: Related but different — signal files are write-once triggers,
  not state containers
- **State Machine**: JICM uses a state machine in the watcher process; this is
  process-internal state, not file-based
- **Event Sourcing**: The JSONL transcript is effectively an event log from which
  state can be reconstructed — a lightweight form of event sourcing

---

*Pattern documented 2026-02-18 — EVO-2026-02-004*
