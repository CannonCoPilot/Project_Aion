# Overnight Autonomous Session Plan — Session 28b
# Master Plan for W5:Jarvis-dev

**Created**: 2026-02-18 22:35 MST
**Operator**: W5:Jarvis-dev (autonomous overnight)
**Branch**: Project_Aion
**Auto-compact**: Active (no JICM in W5 — manual progress tracking required)

---

## Execution Philosophy

This plan is the **single source of truth** for overnight progress. After every
auto-compact boundary, Jarvis-dev MUST re-read this file and check task status
before resuming work. Each task has a checkbox — mark `[x]` when complete.

**Parallelization strategy**: Research tasks (Phase 4) are independent and will
be dispatched as parallel subagents wherever possible. Implementation tasks
depend on research outputs and run sequentially.

**Progress checkpoints**: After completing each phase, commit progress and update
this plan file. This ensures no work is lost across compaction boundaries.

---

## Phase 1: Quick Fixes & Infrastructure Hardening (Est. 2h)

### 1.1 [x] JICM Sleep During End-Session
- **What**: Add JICM sleep signal at start of end-session protocol
- **Where**: `.claude/commands/end-session.md`
- **How**: Already partially done (exit-mode signal exists). Verify `.jicm-exit-mode.signal`
  is created FIRST in the end-session command template. Confirm watcher respects it.
- **Status**: VERIFIED — already implemented. The end-session.md command creates
  `.jicm-exit-mode.signal` as its very first step and removes it as its very last step.
  No changes needed.

### 1.2 [ ] Compressed-Context-Ready.md Verification
- **What**: Ensure `.claude/context/.compressed-context-ready.md` is written correctly
  by jicm-prep-context.sh, persists (not consumed/deleted), and overwrites on each
  compression trigger
- **How**:
  1. Read jicm-prep-context.sh to understand current write behavior
  2. Read jicm-watcher.sh to see if it consumes/deletes the file
  3. If file is consumed: change watcher to leave it in place
  4. Run 3 experimental compression triggers, verify file contents each time
  5. Verify file contains: current task, plan summary, key context, next steps
- **Test**: Trigger compression, check file exists + contents, trigger again, verify overwrite
- **Files**: `.claude/scripts/jicm-prep-context.sh`, `.claude/scripts/jicm-watcher.sh`

### 1.3 [ ] /clear Safety — Ensure Context Preservation
- **What**: Make `/clear` trigger jicm-prep-context.sh so a backup is always created
- **Where**: Hook system or command override
- **How**: Check if there's a pre-clear hook. If not, create one that runs
  jicm-prep-context.sh before /clear executes. Ensure the backup contains
  meaningful session context.
- **Files**: `.claude/hooks/`, `.claude/scripts/jicm-prep-context.sh`

### 1.4 [ ] JICM Agent-Awareness for Auto-Compact
- **What**: Research whether JICM/auto-compact kills subagents, and if so, design
  a solution to wait for agents to complete before compacting
- **How**:
  1. Research Claude Code auto-compact behavior with running Task agents
  2. Check if agent results are preserved in JSONL transcript
  3. Design a flag-check mechanism (e.g., `.agents-running` signal file)
  4. Document findings and implementation plan
- **Output**: Research doc at `.claude/context/research/jicm-agent-awareness.md`

### 1.5 [ ] Bash Gotchas Reference File
- **What**: Compile known bash pitfalls into a coding reference for LLM sessions
- **Where**: `.claude/context/reference/bash-gotchas.md`
- **Content**:
  - bash 3.2 (macOS) vs 4+ differences
  - `local` outside function
  - `set -euo pipefail` with grep pipelines
  - `$HOME/bin/tmux` piping in zsh
  - heredoc quoting
  - array syntax differences
  - Other gotchas from session history
- **Also**: Reference this file from CLAUDE.md so it's discoverable

### 1.6 [ ] Computed-State Pattern Doc (EVO-2026-02-004)
- **What**: Write pattern documentation for computed-state architecture
- **Where**: `.claude/context/patterns/computed-state.md`
- **Content**: Document the pattern of deriving state from source files rather
  than maintaining separate state files (e.g., JICM state from JSONL, session
  state from git log + file timestamps)

---

## Phase 2: Documentation & Architecture Consolidation (Est. 3h)

### 2.1 [ ] Consolidate session-state + current-priorities
- **What**: Merge current-priorities.md INTO session-state.md. Session-state becomes
  the single source of truth, with a detailed "Current Priorities" subsection.
- **Rules**:
  - session-state.md: FULL OVERWRITE every session start (fresh, not appended)
  - Include subsections: Status, Accomplished, Current Priorities (in-progress +
    recently completed), Referenced Files (loaded into context), Modified Files
    (with full project-relative paths), Data/Results Files, Next Steps
  - current-priorities.md: Keep as a redirect/pointer to session-state.md initially,
    then remove references across codebase
- **Update refs**: Find all scripts/hooks/commands that reference current-priorities.md
  and update them to point to session-state.md
- **Files to audit**: session-start.sh, end-session.md, CLAUDE.md, capability-map.yaml,
  any hooks that read priorities

### 2.2 [ ] MEMORY.md Rewrite
- **What**: Rewrite with clear purpose statement relative to Qdrant + Graphiti layers
- **Purpose of MEMORY.md**: Persistent cross-session facts that MUST be in every
  context window. Unlike Qdrant (semantic search, pulled on demand) or Graphiti
  (deep relational knowledge, queried), MEMORY.md is ALWAYS loaded. It should
  contain only stable, high-frequency-access facts.
- **Structure**: Infrastructure facts, critical gotchas, key paths, integration notes
- **Trim**: Remove anything that's better served by Qdrant/Graphiti queries

### 2.3 [ ] Hierarchical CLAUDE.md with @ Imports
- **What**: Use `@path` syntax in CLAUDE.md to auto-load key files into every session
- **Candidates for @-import**:
  - `@.claude/context/reference/bash-gotchas.md` (once created)
  - `@.claude/context/psyche/jarvis-identity.md` (always needed)
  - `@.claude/context/psyche/capability-map.yaml` (routing)
- **Research**: Verify @ import syntax actually works in Claude Code CLAUDE.md
- **Caution**: Don't over-import — each file adds to base context cost

### 2.4 [ ] Rename README.md → CLAUDE.md in Key Directories
- **What**: Claude Code auto-loads CLAUDE.md from directories when files are read.
  Renaming README.md to CLAUDE.md in key directories makes them auto-discoverable.
- **Scope**: Only directories that Jarvis frequently reads from:
  - `.claude/hooks/README.md` → `.claude/hooks/CLAUDE.md`
  - `.claude/scripts/README.md` → `.claude/scripts/CLAUDE.md`
  - `.claude/skills/README.md` → `.claude/skills/CLAUDE.md`
  - `.claude/commands/README.md` → `.claude/commands/CLAUDE.md`
  - `.claude/agents/README.md` → `.claude/agents/CLAUDE.md`
- **NOT**: Subdirectories or rarely-accessed paths (avoid context bloat)
- **Method**: `git mv` to preserve history

### 2.5 [ ] Hedging Behavior Prevention
- **What**: Add explicit anti-hedging instructions to CLAUDE.md
- **Root cause**: Model defaults to uncertainty when implicit requirements lack
  explicit documentation. The tmux case was specific; the fix must be general.
- **Approach**:
  1. Add "Runtime Environment" section to CLAUDE.md (already done per session-state)
  2. Add general anti-hedging directive: "When uncertain about environment
     capabilities, INVESTIGATE before hedging. Use bash commands to probe the
     environment. Never assume unavailability without checking."
  3. Add to guardrails: "NEVER declare a task blocked without first attempting
     3 alternative approaches"

### 2.6 [ ] Insight Preservation Hook
- **What**: Create a hook that captures ★ Insight blocks to a persistent file
- **Where**: `.claude/hooks/insight-capture.js` (stop hook)
- **How**: On each assistant turn, scan output for `★ Insight` markers, extract
  the block, append to `.claude/context/insights/insights-log.md` with timestamp
- **Integration**: `/reflect` Phase 5 should read insights-log.md and feed to
  Graphiti for deep memory. `/reflect` should also clear processed insights.
- **Files**: New hook, update reflect command, create insights directory

---

## Phase 3: UX & Farewell Improvements (Est. 1.5h)

### 3.1 [ ] Farewell Message Formatting
- **What**: Give the final Jarvis farewell special visual formatting
- **How**: Update end-session.md to instruct formatting:
  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [farewell text in Wodehouse style, italicized]
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ```
- **Reference**: User example: "Very well, sir. A most satisfactory session..."

### 3.2 [ ] Valedictions.yaml Overhaul
- **What**: Replace generic locations with authentic 1930s English manor house
  locations and butler activities. Add weather-aware valedictions.
- **Locations**: Drawing room, library, boot room, scullery, butler's pantry,
  wine cellar, conservatory, billiard room, gun room, still room, servants' hall,
  kitchen garden, rose garden, stable yard, orangery, folly, ha-ha, pheasant covert,
  potting shed, the lodge, east wing, morning room
- **Activities**: Decanting the port, pressing the morning coat, inventorying the
  silver, reviewing the wine ledger, attending to the correspondence, airing the
  morning room, setting the clocks, polishing the candelabra
- **Weather**: Use Location Services or Salem UT fallback. Time-of-day awareness.
- **Template**: "I shall be [activity] in the [location], should you have need of me.
  [time+weather valediction], sir."
- **session_kill_confirm**: Update template to use new format

---

## Phase 4: Research Sprint (Est. 4-5h, PARALLELIZABLE)

All research tasks output to `.claude/context/research/` and can run as
parallel subagents.

### 4.1 [ ] MCP CLI Registration Research
- **Question**: Can MCPs be registered/unregistered via CLI args at launch?
- **Goal**: Jarvis-main (no MCPs, lean context) + Jarvis-MCPs (tool proxy)
- **Output**: `.claude/context/research/mcp-cli-registration.md`

### 4.2 [ ] Async Hooks Research (RD-002)
- **Question**: Can logging hooks run async to avoid blocking tool calls?
- **Output**: `.claude/context/research/async-hooks-rd002.md`

### 4.3 [ ] claude-spend + Usage Monitor Research
- **URLs**: https://github.com/rtk-ai/rtk — WRONG, this is RTK
  - https://github.com/writetoaniketparihar-collab/claude-spend
  - https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor
- **Goal**: Browser-based usage dashboard + improved TUI dashboard
- **Output**: `.claude/context/research/usage-monitoring-tools.md`

### 4.4 [ ] Blitz.dev Research
- **URL**: https://blitz.dev/
- **Question**: What is Blitz, what can it do for Jarvis, how to use it?
- **Output**: `.claude/context/research/blitz-dev.md`

### 4.5 [ ] claude-code-docs Research
- **URL**: https://github.com/costiash/claude-code-docs
- **Questions**: Is it installed? Fork potential? Semantic indexing of docs?
- **Goal**: Better self-knowledge of Claude Code ecosystem
- **Output**: `.claude/context/research/claude-code-docs-analysis.md`

### 4.6 [ ] CCTCRG Context Management Research
- **URL**: https://github.com/gino2013/CCTCRG
- **Goal**: Extract all context window management tips, create implementation strategy
- **Output**: `.claude/context/research/cctcrg-context-strategies.md`

### 4.7 [ ] RTK Research + Install + Comparison
- **URL**: https://github.com/rtk-ai/rtk
- **Goal**: Research, pull, evaluate, install. Side-by-side token usage comparison.
- **Output**: `.claude/context/research/rtk-evaluation.md`

### 4.8 [ ] Dwarf Fortress / DFHack Project Plan
- **URLs**: Multiple (DFHack, df-structures, scripts, Dwarf-Therapist, df-ai,
  weblegends, LegendsViewer, LegendsBrowser2, LegendsViewer-Next, DrPhilHarmonik)
- **Scope**:
  1. macOS setup via Wine variant
  2. Dev/test environment design
  3. Product vision: Purpose 1 (CDM → AI storyteller), Purpose 2 (all-inclusive data viz)
  4. First iteration project plan
- **Output**: `.claude/context/research/dwarf-fortress-project-plan.md`

---

## Phase 5: Implementation from Research (Est. 3h)

### 5.1 [ ] n8n Workflows (M5)
- **What**: n8n admin is now set up. Register n8n-mcp, build initial workflows.
- **Workflows**: Session summaries, RAG re-indexing, scheduled maintenance
- **Depends on**: n8n being accessible at localhost:5678 (CONFIRMED by user)

### 5.2 [ ] RTK Installation + Testing (if viable from 4.7)
- **What**: Install RTK, integrate into Jarvis patterns, run token comparison

### 5.3 [ ] Usage Dashboard Setup (from 4.3)
- **What**: Set up browser-based usage dashboard from research findings

### 5.4 [ ] Implement CCTCRG Strategies (from 4.6)
- **What**: Apply actionable context management improvements

---

## Phase 6: Validation & Testing (Est. 2h)

### 6.1 [ ] Full /reflect Validation (All 5 Phases)
- **What**: Run /reflect in W0:Jarvis and validate all 5 phases execute correctly
- **Method**: Use W5 dev scripts to send /reflect to W0, monitor output
- **Verify**: Phase 1-5 all produce expected outputs, Graphiti ingestion succeeds

### 6.2 [ ] Integration Testing
- **What**: End-to-end test of overnight changes
- **Tests**: JICM compression trigger, insight capture, farewell formatting,
  session-state consolidation, /clear safety

---

## Execution Order

```
SEQUENTIAL                          PARALLEL (subagents)
──────────                          ──────────────────────
Phase 1 (1.2-1.6)
  │
Phase 2 (2.1-2.6)
  │
Phase 3 (3.1-3.2)                   ┌─ 4.1 MCP CLI research
  │                                 ├─ 4.2 Async hooks
  ├── Launch Phase 4 ──────────────►├─ 4.3 Usage monitoring
  │                                 ├─ 4.4 Blitz.dev
  │   (continue Phase 2-3           ├─ 4.5 claude-code-docs
  │    while research runs)         ├─ 4.6 CCTCRG
  │                                 ├─ 4.7 RTK
  │                                 └─ 4.8 Dwarf Fortress
  │
Phase 5 (depends on Phase 4)
  │
Phase 6 (validation)
  │
COMMIT + PUSH
```

---

## Progress Tracking

**Last checkpoint**: Phase 1 starting
**Current phase**: 1
**Current task**: 1.2
**Commits this session**: 0
**Compaction count**: 0

---

*Plan created 2026-02-18 22:35 MST — W5:Jarvis-dev overnight autonomous session*
