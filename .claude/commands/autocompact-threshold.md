---
description: Set the JICM compression threshold and view native autocompact status
allowed-tools: [Read, Edit, Write, Bash]
---

# /autocompact-threshold — Context Compression Threshold

Set the JICM watcher's token threshold for context compression. Also reports the native Claude Code autocompact setting (which requires a session restart to change).

## Usage

```
/autocompact-threshold [<tokens>]
```

## Arguments

- `$ARGUMENTS` — Token count threshold (e.g., `280000`, `350000`). Omit to show current settings.

## Valid Ranges (1M context window)

| Value | Description |
|-------|-------------|
| 150000 | Aggressive — frequent compression |
| 200000 | Moderate — good for cost control |
| **280000** | **Default** — balanced |
| 350000 | Conservative — longer sessions |
| 500000 | Relaxed — large context work |

Maximum recommended: 500000 (50% of 1M). Leave room for native autocompact backstop.

## Execution

### If no argument — show current status

1. Read `.claude/context/.jicm-state` for current JICM token threshold
2. Read `.claude/context/.jicm-config` for config values
3. Check `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` from launcher script
4. Report both thresholds:

```
Context Compression Thresholds
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

JICM Watcher (primary — changeable now):
  Token threshold: 280,000
  Pct fallback:    25%
  Status:          WATCHING

Native Autocompact (backstop — requires session restart):
  Percentage:      50% (= 500K at 1M window)
  Env var:         CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50

Gap: 220K tokens between JICM trigger and native backstop
```

### If argument provided — change JICM threshold

1. **Validate**: Must be a number between 50000 and 800000
2. **Update watcher default** in `.claude/scripts/jicm-watcher.sh`:
   - Find: `JICM_TOKEN_THRESHOLD=${JICM_TOKEN_THRESHOLD:-NNNNN}`
   - Replace with new value
3. **Restart the watcher** (W1:Watcher tmux window):
   ```bash
   # Kill current watcher
   $HOME/bin/tmux send-keys -t jarvis:Watcher C-c
   sleep 2
   # Recreate with new threshold
   $HOME/bin/tmux new-window -t jarvis -n "Watcher" -d \
     "cd '$PROJECT_DIR' && .claude/scripts/jicm-watcher.sh --interval 3; echo 'Watcher stopped.'; read"
   $HOME/bin/tmux set-window-option -t jarvis:Watcher automatic-rename off
   ```
4. **Wait 3s** then read `.claude/context/.jicm-state` to confirm new threshold
5. **Update references** — edit these files to keep documentation in sync:
   - `.claude/context/session-state.md` — JICM threshold line in Notes section
   - `CLAUDE.md` — AC-04 JICM line (token threshold value)
6. **Report**:
   ```
   JICM threshold updated: OLD → NEW tokens
   Watcher restarted (PID: NNNN)
   Native autocompact: 50% (500K) — unchanged (requires session restart to change)
   ```

## Changing Native Autocompact

The native `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` is set at Claude Code launch and **cannot be changed mid-session**. To change it:

1. Edit `.claude/scripts/launch-jarvis-tmux.sh` — find `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=NN` in the `CLAUDE_ENV` line
2. Change the percentage value
3. Restart Claude Code (next session will use new value)

Report this to the user if they ask to change the native threshold.

## Two-Threshold Architecture

```
0                   280K        500K                    1M
|════════════════════|═══════════|═════════════════════════|
     Normal          JICM       Native                 Window
     Operation      Trigger     Autocompact             Limit
                   (watcher)    (backstop)
```

JICM fires first → halt + compress + /clear + resume.
Native autocompact is the safety net if JICM fails.

## Related

- `/jicm` — Manual JICM cycle
- `/intelligent-compress` — Manual compression
- `/context-budget` — View context usage breakdown
