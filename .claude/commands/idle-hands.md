---
description: Toggle idle-hands protocols on/off — controls whether Jarvis performs autonomous maintenance when idle
allowed-tools: [Read, Write, Bash]
---

# /idle-hands — Idle-Hands Toggle

**Purpose**: Control Ennoia's idle-hands scheduler. When OFF, Jarvis will not autonomously start maintenance tasks (commit/reflect/maintain) when idle. When ON, idle-hands resumes normal behavior (15-minute idle threshold triggers maintenance cycle).

**Usage**:
- `/idle-hands off` — Disable idle-hands (create signal file). Use when you are present and waiting for work to finish.
- `/idle-hands on` — Enable idle-hands (remove signal file). Use when going AFK and want Jarvis to self-maintain.
- `/idle-hands` or `/idle-hands status` — Show current state.

---

## Execution

The signal file is: `.claude/context/.idle-hands-disabled.signal`

### Parse Argument

Extract the argument from the user's command. It will be one of: `on`, `off`, `status`, or empty.

### If `off`

1. Create the signal file:
   ```
   Write .claude/context/.idle-hands-disabled.signal with content:
   disabled_at: <epoch seconds>
   disabled_by: user
   reason: manual toggle
   ```
2. Also clean up any active idle-hands state files:
   - Remove `.claude/context/.idle-hands-active.W0` if it exists
3. Report: "Idle-hands DISABLED. Jarvis will not start autonomous maintenance when idle. Use `/idle-hands on` to re-enable."

### If `on`

1. Remove the signal file: `.claude/context/.idle-hands-disabled.signal`
2. Report: "Idle-hands ENABLED. Jarvis will start maintenance tasks after 15 minutes of idle."

### If `status` or empty

1. Check if `.claude/context/.idle-hands-disabled.signal` exists
2. Check if `.claude/context/.idle-hands-active.W0` exists (cycle in progress)
3. Check if `.claude/context/.idle-hands-cooldown.W0` exists (post-cycle cooldown)
4. Report current state:
   - Signal file exists → "DISABLED (manually toggled off)"
   - Active file exists → "ACTIVE (maintenance cycle in progress)" + show phase from file
   - Cooldown file exists → "COOLDOWN (next cycle after <time>)"
   - Otherwise → "ENABLED (monitoring for idle, threshold: 15 min)"
