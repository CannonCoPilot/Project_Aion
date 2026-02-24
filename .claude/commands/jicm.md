---
description: "Manual JICM cycle — preserve context, compress, and prepare for /clear."
allowed-tools: Bash, TaskList, Write, Read
---

# /jicm — Manual JICM Context Cycle

**Purpose**: One-command manual JICM cycle for co-productivity sessions. Preserves work state, compresses context, and prepares for `/clear`.

**CRITICAL: Execute efficiently. Minimize context overhead. Tool calls only until final status.**

## Execution Steps

### Step 1: Guard — Check for in-progress compression

```bash
ls /Users/nathanielcannon/Claude/Jarvis/.claude/context/.compression-in-progress 2>/dev/null
```

If the file exists, say "JICM compression already in progress. Wait for it to complete or remove `.compression-in-progress` to force." and **STOP**.

### Step 2: Set in-progress flag

```bash
echo "$(date +%s)" > /Users/nathanielcannon/Claude/Jarvis/.claude/context/.compression-in-progress
```

### Step 3: Dump active tasks

Call `TaskList`. Write the results to `/Users/nathanielcannon/Claude/Jarvis/.claude/context/.active-tasks.txt`. If no tasks, write "No active tasks."

### Step 4: Run JICM v7 prep script

```bash
bash /Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh
```

### Step 5: Verify and report

Check exit code from Step 4:

**On success (exit 0)**:

Verify the checkpoint exists:
```bash
ls -la /Users/nathanielcannon/Claude/Jarvis/.claude/context/.compressed-context-ready.md /Users/nathanielcannon/Claude/Jarvis/.claude/context/.compression-done.signal 2>/dev/null
```

Then output exactly:

```
JICM checkpoint created successfully.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Checkpoint: .compressed-context-ready.md
Signal: .compression-done.signal

Type /clear now to complete the cycle.
Context will be restored automatically on next session start.
```

**On failure (non-zero exit)**:

Clean up the flag:
```bash
rm -f /Users/nathanielcannon/Claude/Jarvis/.claude/context/.compression-in-progress
```

Then say: "JICM prep failed (exit $?). Check stderr output above. Flag cleared."

## How It Works

The JICM cycle is a 3-phase process:

1. **Preserve** (this command): Extracts session state, tasks, git state, recent conversation from the JSONL transcript. Runs local LLM (qwen3:8b) to create a rich narrative checkpoint.

2. **Clear** (user types `/clear`): Claude Code clears the context window. All conversation history is removed.

3. **Restore** (automatic): The SessionStart hook detects `.compressed-context-ready.md` and injects it as context. Jarvis resumes from the checkpoint seamlessly.

## Notes

- The watcher (W1) can also detect the `.compression-done.signal` and send `/clear` automatically. But in co-productivity mode, the user controls when to clear.
- If the watcher IS running, it will handle `/clear` within ~30 seconds of signal detection. You can wait or type `/clear` manually — either works.
- The checkpoint includes: session status, priorities, git state, active plan, recent conversation, and LLM-synthesized summary.
