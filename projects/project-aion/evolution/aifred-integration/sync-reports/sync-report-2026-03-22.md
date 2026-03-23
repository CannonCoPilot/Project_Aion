# AIfred Baseline Sync Report

**Generated**: 2026-03-22 18:30
**Baseline Commit**: `c27ba27` (AIfred v2.5.0)
**Previous Sync**: `2ea4e8b` (AIfred v1.2.0, 2026-01-09)
**Changes Since**: 283 files changed (+50,855 / -2,776), 22 commits
**Mode**: Dry-run (analysis only)

---

## Summary

| Classification | Count |
|----------------|-------|
| ADOPT | 4 |
| ADAPT | 3 |
| REJECT | 12 |
| DEFER | 5 |

**Gap**: 73 days since last sync. AIfred has gone from v1.2.0 to v2.5.0 with 5 major feature releases. Jarvis has diverged significantly in the same period (JICM v7.2, Archon architecture, 45 sessions of Chronicler development). Most new AIfred features address problems Jarvis solved differently and more thoroughly.

---

## Detailed Analysis

### ADOPT (Ready to Port — 4 items)

#### `.claude/context/compaction-essentials.md` (concept)
- **Change**: A curated "core context" file that survives compaction, injected by pre-compact.js hook
- **Rationale**: Excellent complement to JICM. Jarvis's `.compressed-context-ready.md` is AI-generated per-cycle; a static essentials file would provide a guaranteed-present minimum context floor after `/clear` or native autocompact
- **Action**: Create `compaction-essentials.md` adapted to Jarvis's Archon architecture. Wire into pre-compact.sh hook for injection. Content: key paths, operational habits, critical gotchas, session state pointer

#### `.claude/hooks/restart-loop-detector.js`
- **Change**: Detects Docker container restart loops (N restarts within a time window)
- **Rationale**: Jarvis's existing `docker-restart-loop-detector.js` was ported from an earlier AIfred version. The new version may have improvements worth merging
- **Action**: Diff our version against the new one; merge improvements if material

#### `.claude/context/patterns/fresh-context-pattern.md`
- **Change**: Pattern for executing independent tasks in fresh Claude instances via a loop controller script
- **Rationale**: Useful conceptual reference for headless job scheduling and potential AC-07 R&D automation. Jarvis's JICM handles context exhaustion differently (compress+continue vs restart) but the "each task gets a clean slate" pattern is complementary for batch operations
- **Action**: Port as reference pattern. Do not implement the loop controller (Jarvis's tmux-based architecture serves this role)

#### `.claude/hooks/port-conflict-detector.js`
- **Change**: Detects port conflicts before Docker operations (checks if port is already bound)
- **Rationale**: Practical; Jarvis runs 7+ Docker services. Port conflicts during restarts are a known issue
- **Action**: Review hook logic, port if non-trivial. Low priority

---

### ADAPT (Needs Modification — 3 items)

#### `.claude/hooks/pre-compact.js` changes
- **Change**: Now injects `compaction-essentials.md` content into preserved context before compaction
- **Modification Needed**: Jarvis uses `pre-compact.sh` (bash, not JS). Extract the essentials-injection logic and add to our bash hook
- **Rationale**: The mechanism (inject essential context before compaction) is valuable; the implementation language differs

#### `.claude/hooks/self-correction-capture.js` improvements
- **Change**: Various updates to correction detection and storage
- **Modification Needed**: Diff against our version. Jarvis has corrections.md + self-corrections.md + AC-05 reflection pipeline
- **Rationale**: Core correction-capture logic may have improved regex patterns or edge case handling worth merging

#### `.claude/hooks/document-guard.js` + `document-guard.config.js`
- **Change**: File protection hook that blocks unauthorized edits to critical infrastructure files. Configurable protected paths with override mechanism
- **Modification Needed**: Adapt protected paths to Jarvis architecture (protect `psyche/`, `CLAUDE.md`, `session-state.md` from accidental overwrites by subagents). Remove Ollama-based V2 semantic checking (unnecessary complexity)
- **Rationale**: Jarvis has branch-protection.js but no file-level protection within the working branch. Document Guard V1 (path-based) is useful; V2 (Ollama semantic) is over-engineered

---

### REJECT (Skip — 12 items)

#### Beads Task Management System
- **Change**: External CLI task manager (`bd`) replacing TodoWrite
- **Rationale**: Jarvis uses TodoWrite + AC-02 Wiggum Loop + Ralph Loop for task tracking. Adding an external npm dependency contradicts Jarvis's self-contained design. TodoWrite is zero-overhead; Beads requires npm install, config, and shell aliases
- **Jarvis Alternative**: TodoWrite + `.claude/state/queues/` YAML files

#### Environment Profile System (v2.2)
- **Change**: Composable YAML profiles (general/homelab/development/production) that shape hooks, permissions, patterns
- **Rationale**: Jarvis's three-layer architecture (Nous/Pneuma/Soma) + capability-map.yaml + autonomy-config.yaml already provides more sophisticated behavioral composition. Adding a profile layer would create a fourth configuration source, increasing complexity
- **Jarvis Alternative**: `capability-map.yaml` + `autonomy-config.yaml` + AC-01 session detection

#### TELOS Strategic Goal Alignment
- **Change**: Structured goal alignment framework (Purpose → Constraints → Measures → Strategy)
- **Rationale**: Jarvis has the autopoietic paradigm + jarvis-identity.md + Archon Architecture + session-state priorities. TELOS is a generic framework; Jarvis's self-knowledge system is domain-specific and more integrated
- **Jarvis Alternative**: `psyche/autopoietic-paradigm.md` + `psyche/jarvis-identity.md`

#### Parallel-Dev Skill (entire subsystem: 4 agents + 15 commands)
- **Change**: Git worktree-based parallel development with dedicated agents per role (implementer, tester, validator, documenter)
- **Rationale**: Complex system (19 new files). Jarvis uses `isolation: "worktree"` on the Agent tool natively. The Agent tool's built-in worktree support is simpler and equally effective. Adding a 19-file parallel-dev subsystem would be over-engineering
- **Jarvis Alternative**: `Agent` tool with `isolation: "worktree"` parameter

#### Fabric Integration (skill + 4 commands + hook)
- **Change**: AI text processing via local Ollama models
- **Rationale**: Jarvis's `research-ops` skill covers 15 backends including Ollama/LiteLLM. Adding a "Fabric" abstraction layer is redundant
- **Jarvis Alternative**: `skill.research-ops` + LiteLLM proxy

#### Stay Current System
- **Change**: Component registry with manifest tracking for version updates
- **Rationale**: Jarvis has AC-06 Self-Evolution (evolution-queue.yaml) + AC-07 R&D Cycles (research-agenda.yaml) + `/sync-aifred-baseline` for upstream tracking. Stay Current is a simpler version of what Jarvis already does
- **Jarvis Alternative**: AC-06 + AC-07 + sync-aifred-baseline

#### Ollama Manager Agent + `/ollama` command
- **Change**: Agent for managing Ollama models
- **Rationale**: Jarvis uses LiteLLM as the model proxy layer. Direct Ollama management is handled via bash when needed. A dedicated agent is overhead
- **Jarvis Alternative**: `bash ollama list/pull/rm`

#### Headless Claude Jobs (`.claude/jobs/`)
- **Change**: Scheduled Claude execution via cron with job definitions
- **Rationale**: Jarvis's tmux architecture (Aion Quartet) already provides always-on background execution. W1-W4 handle monitoring, orchestration, navigation, and command injection. Cron-based headless jobs are a simpler pattern for systems without tmux
- **Jarvis Alternative**: Aion Quartet (Watcher, Ennoia, Virgil, Commands)

#### New Commands (30+) — bulk rejection
- **Change**: analyze-codebase, audit-log, backup-status, browser, capture, check-health, check-service(s), code, consolidate-project, context-analyze, context-loss, create-project, discover-docker, docker-restart, history, link-external, metrics, new-code-project, ollama, profile, register-project, ssh-connect, stay-current, sync-git, telos, update-priorities, upgrade
- **Rationale**: Jarvis has 40+ commands already mapped to skills via capability-map.yaml. Most of these are AIfred-specific implementations of capabilities Jarvis handles via skills or direct tooling. Porting would create duplicate functionality
- **Jarvis Alternative**: Existing skill system + commands

#### New Agents (6) — bulk rejection
- **Change**: ollama-manager, parallel-dev-{implementer,tester,validator,documenter}, project-plan-validator
- **Rationale**: All are tied to rejected features (parallel-dev, ollama management). Jarvis has 12 purpose-built agents already
- **Jarvis Alternative**: Existing agent roster

#### Most New Hooks (20+) — bulk rejection
- **Change**: _profile-check, beads-actor, compose-validator, context-usage-tracker, docker-validator, env-validator, fabric-suggester, file-access-tracker, health-monitor, index-sync, lsp-redirector, mcp-enforcer, metrics-collector, network-validator, paths-registry-sync, planning-mode-detector, priority-validator, prompt-enhancer, service-registration-detector, skill-router
- **Rationale**: Most are tied to rejected features (profiles, Beads, Fabric) or duplicate Jarvis capabilities (JICM watcher handles context tracking, AC-08 handles health monitoring). Hook proliferation was identified as a weakness in AIfred's architecture during the January 2026 audit (48→51 patterns, 15→32 hooks). Jarvis deliberately consolidated hooks to ~28
- **Jarvis Alternative**: Existing hooks + AC components + Aion Quartet

#### `CLAUDE.md` structural changes
- **Change**: Added Beads section, profile references, 11 new quick links, updated session management
- **Rationale**: Most changes reference rejected features (Beads, profiles, TELOS, Fabric). Jarvis's CLAUDE.md is heavily customized with Archon architecture, @-imports, force-loaded docs, and Chronicler integration. The AIfred CLAUDE.md is now divergent to the point where merging individual sections risks introducing inconsistencies
- **Jarvis Alternative**: Keep Jarvis CLAUDE.md as-is; adopt compaction-essentials concept independently

---

### DEFER (Review Later — 5 items)

#### `.claude/hooks/context-usage-tracker.js`
- **Change**: Tracks which context files are loaded and how frequently
- **Reason for Deferral**: Interesting data for AC-07 R&D internal efficiency research. Low urgency — would complement file-usage-tracker.sh
- **Review By**: Next AC-07 R&D cycle

#### `.claude/hooks/metrics-collector.js`
- **Change**: Centralized metrics collection
- **Reason for Deferral**: Could supplement AC-08 maintenance telemetry. Need to assess overlap with existing telemetry-emitter.js
- **Review By**: Next AC-08 maintenance cycle

#### `.claude/hooks/planning-mode-detector.js`
- **Change**: Detects when user is in planning vs implementation mode
- **Reason for Deferral**: Interesting concept for AC-02 Wiggum Loop optimization. Could help distinguish "think" vs "do" phases
- **Review By**: Next Wiggum Loop iteration

#### `.claude/context/patterns/secret-management-pattern.md`
- **Change**: SOPS + age encryption for Docker secrets
- **Reason for Deferral**: Jarvis uses `.claude/secrets/credentials.yaml` (gitignored). SOPS+age is more robust for multi-user scenarios. Not urgent for single-user Jarvis
- **Review By**: If multi-user or deployment scenarios arise

#### `.claude/skills/structured-planning/SKILL.md`
- **Change**: Guided conversational planning skill (/plan, /plan:new, /plan:review)
- **Reason for Deferral**: Jarvis uses plans/ directory with adjective-animal naming. The structured planning skill may have useful workflow patterns for plan creation
- **Review By**: Next plan creation opportunity

---

## Recommended Actions

1. **Create `compaction-essentials.md`** for Jarvis — static minimum-context file for post-compaction recovery (ADOPT)
2. **Wire essentials into `pre-compact.sh`** — inject before native autocompact (ADAPT)
3. **Diff self-correction-capture.js** — check for improved regex or edge case handling (ADAPT)
4. **Review document-guard V1** — path-based file protection for critical Jarvis files (ADAPT)
5. **Port fresh-context-pattern.md** — reference pattern for documentation (ADOPT)
6. **Skip all profile/Beads/TELOS/parallel-dev** — Jarvis has superior alternatives (REJECT)
7. **Log deferred items** in research-agenda.yaml for AC-07 (DEFER)

---

## Notes

This is the largest upstream divergence since Project Aion began. AIfred has moved in a fundamentally different direction — toward composable profiles, external task management (Beads), and hook proliferation (15→32 hooks). Jarvis has moved toward autonomic self-management (AC-01..10), compressed context (JICM v7.2), and deep specialization (Chronicler Phase 3).

The two systems are now architecturally incompatible for wholesale syncing. Future syncs should focus on surgical extraction of specific patterns, bug fixes, or hooks rather than attempting broad alignment.

---

*Sync report generated during /sync-aifred-baseline dry-run — Jarvis v5.11.0*
