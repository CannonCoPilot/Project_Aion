---
description: "Manual JICM cycle (v7.9-aligned) — preserve context, signal watcher, drive full compression → /clear → resume cycle."
allowed-tools: Bash, TaskList, Write, Read
---

# /jicm — Manual JICM Context Cycle (v7.9-aligned)

**Purpose**: One-command manual JICM cycle. Preserves work state, generates the compressed checkpoint, then writes the *trigger signal* so the watcher (W1) drives `/clear` and resume autonomously.

**CRITICAL: Execute efficiently. Tool calls only until final status. Do not over-narrate.**

## Execution Steps

### Step 1: Watcher liveness check

```bash
WATCHER_PID=$(cat /Users/nathanielcannon/Claude/Jarvis/.claude/context/.jicm-watcher.pid 2>/dev/null)
if [ -n "$WATCHER_PID" ] && kill -0 "$WATCHER_PID" 2>/dev/null; then
    echo "Watcher alive (pid $WATCHER_PID)"
else
    echo "GUARD-FAIL: watcher not running — start it via tmux jarvis:1 before triggering /jicm"
    exit 1
fi
```

If guard fails, **STOP**. Tell the user to start the watcher (e.g., `bash .claude/scripts/jicm-watcher.sh` in `tmux jarvis:1`).

### Step 2: Cycle-in-flight check

```bash
if [ -f /Users/nathanielcannon/Claude/Jarvis/.claude/context/.jicm-clear-now.signal ]; then
    echo "GUARD-FAIL: .jicm-clear-now.signal already present — a cycle is in flight or stalled"
    exit 1
fi
```

If trigger signal is already present, the watcher is already mid-cycle (or stalled). **STOP** and ask the user to either wait or investigate watcher logs (`.claude/logs/jicm-watcher.log`).

### Step 3: Reset stale transient signals

Reaching this step means no cycle is in flight (Step 2 passed). Any other transient signals are stale leftovers from a prior failed cycle — clear them so prep produces a fresh checkpoint and the watcher's cycle starts clean.

```bash
CTX=/Users/nathanielcannon/Claude/Jarvis/.claude/context
rm -f "$CTX/.compression-done.signal" \
      "$CTX/.compression-in-progress" \
      "$CTX/.jicm-resume-complete.signal"
```

### Step 4: Dump active tasks

If `TaskList` tool is loaded, call it and write a compact rendering of the result to `/Users/nathanielcannon/Claude/Jarvis/.claude/context/.active-tasks.txt`. If `TaskList` is not loaded (deferred-tool registry), or there are no tasks, write the literal string `No active tasks.` to that file.

### Step 5: Run JICM prep script

```bash
bash /Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh
```

This produces `.compressed-context-ready.md` and `.compression-done.signal`. The prep script invokes a local Ollama model (qwen3:8b at `localhost:11434`) for narrative compression — no Anthropic tokens consumed.

### Step 6: Verify checkpoint

```bash
ls -la /Users/nathanielcannon/Claude/Jarvis/.claude/context/.compressed-context-ready.md \
       /Users/nathanielcannon/Claude/Jarvis/.claude/context/.compression-done.signal 2>/dev/null
```

Both files must exist. If the prep script exited non-zero **or** either file is missing, run the failure cleanup (see "On Failure" below) and abort.

### Step 7: Fire the trigger

```bash
date +%s > /Users/nathanielcannon/Claude/Jarvis/.claude/context/.jicm-clear-now.signal
```

This is the signal the v7.9 watcher's main loop polls for (`jicm-watcher.sh:301`). Within ~1s the watcher will enter `actuate_jicm_cycle()`.

### Step 8: Final status output

Output exactly:

```
JICM cycle initiated.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Checkpoint: /Users/nathanielcannon/Claude/Jarvis/.claude/context/.compressed-context-ready.md
Signals:    .compression-done.signal (prep complete)
            .jicm-clear-now.signal   (cycle trigger fired)

Watcher will now:
  1. Inject [JICM-HALT] into this window (~1-3s)
  2. Wait for "Understood" acknowledgement
  3. Confirm idle via JSONL stop_reason poll
  4. Fire /clear via tmux send-keys
  5. Wait for SessionStart hook to write .jicm-resume-complete.signal
  6. Inject [JICM-RESUME] into the cleared session

Acknowledge with the single word "Understood" when HALT arrives.
```

## On Failure

If Step 5 (prep) fails or Step 6 (verify) finds missing artifacts:

```bash
CTX=/Users/nathanielcannon/Claude/Jarvis/.claude/context
rm -f "$CTX/.compression-done.signal" "$CTX/.compression-in-progress"
echo "JICM prep failed. No trigger signal written. Working tree restored to pre-/jicm state."
```

Do NOT write `.jicm-clear-now.signal` on failure — the cycle must not start without a valid checkpoint.

## How It Works (v7.9)

The watcher (`jicm-watcher.sh`) is a slim signal-driven actuator. It does NOT sense — sensing belongs to `jicm-gate.sh` (UserPromptSubmit hook). The watcher's main loop only enters its cycle when it sees `.jicm-clear-now.signal` (line 301).

Cycle phases:

1. **Trigger** (this command's Step 7): write `.jicm-clear-now.signal`.
2. **HALT inject**: watcher writes `[JICM-HALT]` to W0 via tmux send-keys.
3. **HALT ack**: watcher polls capture pane for "Understood" (≤60s).
4. **Prep skip**: watcher checks `.compression-done.signal`; absent → run prep, present → skip with log "prep skipped (signal/guard already present)". This command writes the signal in Step 5, so prep is skipped.
5. **Idle confirm**: watcher polls JSONL transcript for `stop_reason ∈ {end_turn, stop_sequence, max_tokens}` to ensure /clear lands as a slash command, not a queued text prompt.
6. **/clear**: watcher injects `clear-input + /clear + submit` via tmux send-keys.
7. **Resume signal**: SessionStart hook detects `.compressed-context-ready.md`, writes `.jicm-resume-complete.signal`.
8. **RESUME inject**: watcher writes `[JICM-RESUME]` prompt; new session resumes without greeting.
9. **Cleanup**: watcher removes `.jicm-clear-now.signal`, `.compression-done.signal`, `.compression-in-progress`, `.jicm-resume-complete.signal` (line 233).

## Notes

- Watcher poll cadence: 1s (v7.9; was 5s in v7.x). HALT typically lands within 2-3s of trigger.
- `.compression-in-progress` is owned by the watcher's cycle (`jicm-watcher.sh:166`); this command no longer pre-creates it. Step 3 reaps stale instances from prior failed cycles.
- Recent fixes baked into the v7.9 watcher: `f8e3879` (inject-escape removal from /clear defensive sequence), `539ec29` (`wait_for_idle` prevents HALT/clear queue race + JSONL-fresh tokens).
- The cull (`084b752`, 2026-05-04) does not affect this cycle — JICM operates entirely below the skill/MCP discovery layer.
- Checkpoint contents: session status, priorities, git state, active plan, recent conversation, LLM-synthesized summary.

## Migration Notes (v7.x → v7.9)

The previous version of this command pre-set `.compression-in-progress` at Step 2 and told the user to "type /clear now" or wait for the watcher. Both behaviors are obsolete:

- **Pre-setting `.compression-in-progress`**: caused signal/guard conflicts with the v7.9 watcher's own guard ownership. Removed; Step 3 instead resets stale instances.
- **"Type /clear now"**: v7.9 watcher does not detect `.compression-done.signal` as the cycle trigger — that signal is only an *intra-cycle* prep-completion marker. The cycle entry trigger is `.jicm-clear-now.signal` (added in Step 7).
- **"Within 30s of signal detection"**: v7.9 watcher polls every 1s, so HALT typically lands within 2-3s.
