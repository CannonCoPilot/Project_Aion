# Plan: Phase F Expanded — AC-03 Hotfix + Aion MVP + Multi-Agent Coordination

## Context

The Roadmap II milestone detection system (AC-03) hasn't fired once during sessions 1-6 of Phase B work because:
1. `MILESTONE_TASK_PATTERNS` only matches `PR-\d+`, `phase-\d+` (numerical) — misses Roadmap II notation (`Phase B.7`, `Phase F`, `A.1`)
2. `MILESTONE_PHRASES` only matches "milestone is complete" — misses "Phase B is complete", "B.7 is done", "hotfix applied"
3. VERSION file stuck at `2.3.0` while architecture is at v5.9.0 (roadmap says Phase B complete = v5.10.0)
4. No version bumping automation exists — bump-version.sh exists but nothing calls it

Additionally, Aion Trinity scripts (Ennoia, Virgil) are scaffolded but unwired — not in tmux launcher, not in capability-map. Phase F in roadmap-ii.md needs rewriting to absorb this work + remaining wiring tasks alongside multi-agent coordination.

**User request**: Implement AC-03 hotfix FIRST (so versioning triggers for this work), then rewrite Phase F to reflect expanded scope.

---

## Part 1: AC-03 Hotfix (implement first)

### Step 1: Broaden MILESTONE_TASK_PATTERNS

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/hooks/milestone-coordinator.js`
**Lines**: 144-147

Replace the current array with expanded patterns:

```javascript
const MILESTONE_TASK_PATTERNS = [
  // Original patterns
  /PR[-\s]?\d+/i, /milestone/i, /release[-\s]?v?\d+/i,
  /complete.*PR/i, /finish.*feature/i, /implement.*system/i,

  // Roadmap II phase patterns (letters + sub-phases)
  /phase[-\s]?[A-Z]/i,              // Phase A, Phase F, Phase-C
  /phase[-\s]?\d+/i,                // Phase 5, phase-6 (original)
  /\b[A-Z]\.\d+\b/,                // B.7, F.3, A.1 (sub-phase dot notation)

  // Work type patterns
  /\bhotfix\b/i, /\bbugfix\b/i, /\bbacklog\b/i,
  /\bRoadmap\s*(I{1,2}|[12])\b/i,  // Roadmap I, Roadmap II

  // Broader completion patterns
  /complete.*phase/i, /finish.*phase/i,
  /complete.*implementation/i,
];
```

### Step 2: Broaden MILESTONE_PHRASES

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/hooks/milestone-coordinator.js`
**Lines**: 42-49

Append new patterns to the array:

```javascript
  // Roadmap II phase completion phrases
  /phase\s+[A-Z](\.\d+)?\s+(is\s+)?(complete|done|finished)/i,
  /completed?\s+(the\s+)?phase\s+[A-Z]/i,
  /finished\s+(the\s+)?phase/i,
  /\b[A-Z]\.\d+\s+(is\s+)?(complete|done|finished)/i,
  /hotfix\s+(is\s+)?(complete|done|applied|finished)/i,
```

### Step 3: Sync VERSION to 5.10.0

**File**: `/Users/nathanielcannon/Claude/Jarvis/VERSION`

Write `5.10.0` (deliberate realignment from 2.3.0). Per roadmap-ii.md version progression, Phase B complete = v5.10.0.

### Step 4: Update CHANGELOG.md

**File**: `/Users/nathanielcannon/Claude/Jarvis/CHANGELOG.md`

Insert `[5.10.0]` entry after `[Unreleased]`, before `[2.3.0]`. Document:
- VERSION realignment (2.3.0 → 5.10.0) with rationale
- Phase B completion (7 sub-phases, one line each)
- AC-03 hotfix (broadened patterns)
- Aion Trinity scaffolding (6 files, commit fbd74d9)

### Step 5: Update AC-03 state file

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/state/components/AC-03-review.json`

Update version to `1.3.0`, add hotfix note.

### Step 6: Verify detection

Test milestone-coordinator.js via stdin pipe:
- `{"user_prompt": "Phase B.7 is complete"}` → should trigger enforceDocs
- `{"user_prompt": "hotfix applied"}` → should trigger enforceDocs
- `{"user_prompt": "PR-12 is complete"}` → should still trigger (regression check)
- `{"tool": "TodoWrite", "tool_input": {"todos": [{"status": "completed"}]}}` with Wiggum state containing `"Phase F"` task description → should trigger detectMilestone

---

## Part 2: Rewrite Phase F in roadmap-ii.md

### Step 7: Replace Phase F section

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/plans/roadmap-ii.md`
**Lines**: 288-312 (current Phase F)

Replace with expanded Phase F containing 7 sub-phases:

| Sub-phase | Focus | Hours | Status |
|-----------|-------|-------|--------|
| F.0 | AC-03 Hotfix (broadened detection + versioning) | 1-2 | DONE (this plan) |
| F.1 | Ennoia MVP — Watcher-synced session orchestrator | 4-6 | TODO |
| F.2 | Virgil MVP — task list, active agents, files touched | 4-6 | TODO |
| F.3 | Remaining Wiring (valedictions→end-session, housekeep.sh, capability-map) | 3-4 | TODO |
| F.4 | Task Delegation Protocol (executable compositions) | 5-6 | TODO |
| F.5 | Agent Chain/Group Architecture | 4-6 | TODO |
| F.6 | Agent Library Survey + Best-in-Class (may defer to Phase G) | 6-8 | TODO |

---

### F.1 Ennoia MVP — Detailed Requirements

**Critical constraint**: JICM monitoring, session-start wake-up, context compression, and post-/clear resume functions MUST remain fully operational in Watcher. Ennoia takes over *intent*, Watcher keeps *mechanics*.

**Architecture** (from `ennoia-aion-script-design.md` Section 2):
```
Watcher: keystroke injection, JICM state machine, emergency recovery (unchanged)
Ennoia:  session intent, briefing content, idle scheduling, maintenance queue
Handoff: Watcher reads .ennoia-recommendation before injecting wake-up text
         If .ennoia-recommendation absent → Watcher falls back to hardcoded behavior
```

**Deliverables**:
1. **Upgrade ennoia.sh v0.1 → v0.2**: Add recommendation output
   - On mode `arise`: write `.ennoia-recommendation` with session briefing content
   - On mode `resume`: write `.ennoia-recommendation` with "resume from compressed context" intent
   - Content format: simple text that Watcher injects as the wake-up prompt
2. **Modify Watcher idle-hands**: Add `.ennoia-recommendation` read before keystroke injection
   - `idle_hands_session_start()` (~line 1350): read `.ennoia-recommendation` for wake-up text, fall back to current hardcoded prompt if absent
   - `idle_hands_jicm_resume()` (~line 1273): same pattern — read recommendation, fall back
   - This is the minimal coupling point — Watcher checks for one file, uses its content or ignores
3. **Add tmux window for Ennoia** in `launch-jarvis-tmux.sh` (after line 154)
4. **Register in capability-map.yaml**
5. **Sync validation**: Confirm JICM cycle (compress → /clear → resume) still works with Ennoia running

**Non-goals for MVP (deferred to Phase J)**:
- Idle-time work scheduler (auto-triggering /reflect, /maintain)
- Session-start.sh refactoring (thin dispatcher model)
- Ennoia auto-actions

---

### F.2 Virgil MVP — Detailed Requirements

**Three new panels** beyond the current v0.1 (recent files + git changes + context):

**Panel 1: TASKS (from Jarvis session)**
- Data source: Hook on PostToolUse:TaskCreate + PostToolUse:TaskUpdate writes `.virgil-tasks.json`
- Content: task ID, subject, status (pending/in_progress/completed), activeForm
- Virgil reads `.virgil-tasks.json` and renders task list with status indicators
- Fallback: If no signal file, show "(no active tasks)"

**Panel 2: ACTIVE AGENTS**
- Data source: Hook on PostToolUse writes `.virgil-agents.json` when tool is "Task" (subagent launch)
  - Records: agent type, description, start time, status (running/completed)
  - SubagentStop or Task completion clears entry
- Virgil reads `.virgil-agents.json` and renders agent list with elapsed time
- Stale entries (>10 min old, no completion) show as "(possibly stalled)"
- Fallback: If no signal file, show "(no active agents)"

**Panel 3: FILES TOUCHED**
- Data source: Combine two inputs:
  - `git diff --name-only` (modified since last commit)
  - `git diff --cached --name-only` (staged)
  - Optionally: file-access.json write operations
- Show files grouped by operation type (M/A/?/D)
- Already partially implemented as "CHANGES (uncommitted)" — enhance to be more prominent and labeled "FILES TOUCHED"

**Implementation approach**:
- Create lightweight `virgil-tracker.js` hook (PostToolUse, matcher `^Task$|^TaskCreate$|^TaskUpdate$`)
  - Writes `.virgil-tasks.json` and `.virgil-agents.json` to `.claude/context/`
  - Stateless — reads current signal files, merges new data, writes back
  - Cleans stale entries (>15 min)
- Upgrade virgil.sh v0.1 → v0.2 with 3 new panels
- Add tmux window for Virgil in `launch-jarvis-tmux.sh`
- Register in capability-map.yaml

**Non-goals for MVP (deferred to Phase J)**:
- Breadcrumbs (session journey)
- Layer visualization (Nous/Pneuma/Soma heatmap)
- Mode detection (WORK/RESEARCH/MAINTENANCE)
- Mermaid.js web dashboard (virgil-ui/index.html already scaffolded)

---

### Step 8: Update roadmap tables

- **Timeline table**: Update Phase F row to `24-36 hrs`, note expanded scope
- **Version progression**: Move "HERE" marker to v5.10.0, update description
- **Phase J**: Note that full Aion implementation (schedulers, auto-actions, dashboard redesign) remains in Phase J
- **Footer**: Update date to 2026-02-10

---

## Files Modified

| File | Change |
|------|--------|
| `.claude/hooks/milestone-coordinator.js` | Expand MILESTONE_TASK_PATTERNS + MILESTONE_PHRASES |
| `VERSION` | 2.3.0 → 5.10.0 |
| `CHANGELOG.md` | Insert [5.10.0] entry |
| `.claude/state/components/AC-03-review.json` | Version 1.2.0 → 1.3.0 |
| `.claude/plans/roadmap-ii.md` | Rewrite Phase F section + update tables |

## Verification

1. `cat VERSION` → `5.10.0`
2. `echo '{"user_prompt":"Phase B.7 is complete"}' | node .claude/hooks/milestone-coordinator.js` → should contain "MILESTONE DOCUMENTATION GATE"
3. `echo '{"user_prompt":"hotfix applied"}' | node .claude/hooks/milestone-coordinator.js` → should contain "MILESTONE DOCUMENTATION GATE"
4. `echo '{"user_prompt":"PR-12 is complete"}' | node .claude/hooks/milestone-coordinator.js` → regression check, should still trigger
5. Read CHANGELOG.md — verify [5.10.0] entry is well-formed
6. Read roadmap-ii.md — verify Phase F has 7 sub-phases (F.0-F.6)

## Design Decisions

1. **Semi-automatic versioning (not auto-bump)**: Detection prompts user to run `/review-milestone`, version bump happens post-review via `bump-version.sh`. Avoids false-positive version inflation.
2. **VERSION realignment (not incremental)**: Jump 2.3.0→5.10.0 rather than carrying drift. Documented in CHANGELOG with rationale.
3. **No commit-message detection hook**: Modifying cross-project-commit-tracker to trigger AC-03 would over-couple two independent systems. Can be added in F.4/F.5 if needed.
4. **Ennoia-Watcher handoff = single signal file**: `.ennoia-recommendation` is the only coupling point. Watcher reads it if present, falls back to hardcoded behavior if absent. This means Ennoia can crash without breaking JICM.
5. **Virgil data via dedicated tracker hook**: New `virgil-tracker.js` writes signal files that virgil.sh reads. Avoids polluting existing hooks (observation-tracker, telemetry-emitter) with Virgil concerns.
6. **Full Aion implementation stays in Phase J**: MVP scope is functional-but-minimal. Schedulers, auto-actions, dashboard redesign, Mermaid.js web UI all remain in Phase J.
