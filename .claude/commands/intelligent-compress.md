---
description: "JICM v7 manual context compression — runs prep script, writes checkpoint + signal for watcher."
allowed-tools: Bash, TaskList, Write
---

# Intelligent Compress (JICM v7)

**CRITICAL: Execute silently. No explanations. Tool calls only. Minimize context overhead.**

1. Check flag: `ls .claude/context/.compression-in-progress 2>/dev/null` — if exists, say "Compression already in progress." and STOP.
2. Create flag: `echo "$(date +%s)" > .claude/context/.compression-in-progress`
3. Dump active tasks to file: call `TaskList`, then write results to `.claude/context/.active-tasks.txt`. If no tasks exist, write "No active tasks."
4. Run JICM v7 prep script:
   ```bash
   bash /Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh
   ```
5. Check exit code:
   - **Success (0)**: Say only: "JICM v7 context prepared. Checkpoint at .compressed-context-ready.md, signal written."
   - **Failure (non-zero)**: Say: "Prep script failed (exit $?)." and remove the in-progress flag: `rm -f .claude/context/.compression-in-progress`

Do NOT: update session files, read additional files, verify output, or add explanations.
The watcher detects .compression-done.signal and handles /clear + restoration automatically.
