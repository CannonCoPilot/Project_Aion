---
description: "JICM v7.9 manual context compression — preserve, prep, write trigger signal for watcher."
allowed-tools: Bash, TaskList, Write
---

# Intelligent Compress (JICM v7.9)

**CRITICAL: Execute silently. No explanations. Tool calls only. Minimize context overhead.**

1. Watcher liveness check:
   ```bash
   WP=$(cat /Users/nathanielcannon/Claude/Project_Aion/.claude/context/.jicm-watcher.pid 2>/dev/null)
   [ -n "$WP" ] && kill -0 "$WP" 2>/dev/null || { echo "Watcher not running."; exit 1; }
   ```
   If guard fails, say "Watcher not running. Start it via tmux jarvis:1." and STOP.

2. Cycle-in-flight check: `ls /Users/nathanielcannon/Claude/Project_Aion/.claude/context/.jicm-clear-now.signal 2>/dev/null` — if exists, say "Cycle already in flight." and STOP.

3. Reset stale transient signals:
   ```bash
   CTX=/Users/nathanielcannon/Claude/Project_Aion/.claude/context
   rm -f "$CTX/.compression-done.signal" "$CTX/.compression-in-progress" "$CTX/.jicm-resume-complete.signal"
   ```

4. Dump active tasks: if `TaskList` is loaded, call it and write a compact rendering to `.claude/context/.active-tasks.txt`. Otherwise (or if no tasks), write the literal `No active tasks.` to that file.

5. Run JICM v7 prep script:
   ```bash
   bash /Users/nathanielcannon/Claude/Project_Aion/.claude/scripts/jicm-prep-context.sh
   ```

6. Check exit code:
   - **Success (0)**: write trigger signal, then say only: "JICM v7.9 cycle initiated."
     ```bash
     date +%s > /Users/nathanielcannon/Claude/Project_Aion/.claude/context/.jicm-clear-now.signal
     ```
   - **Failure (non-zero)**: say "Prep script failed (exit $?)." and clean up — do NOT write the trigger signal.
     ```bash
     rm -f /Users/nathanielcannon/Claude/Project_Aion/.claude/context/.compression-done.signal
     ```

Do NOT: update session files, read additional files, verify output beyond exit code, or add explanations.

The v7.9 watcher (`jicm-watcher.sh:301`) polls every 1s for `.jicm-clear-now.signal` (written in Step 6) and handles HALT → /clear → resume autonomously. It does NOT trigger on `.compression-done.signal`; that's only an intra-cycle prep-completion marker.
