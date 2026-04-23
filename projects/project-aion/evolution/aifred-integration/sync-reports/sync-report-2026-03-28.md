# AIfred Baseline Sync Report

**Generated**: 2026-03-28 18:05
**Baseline Commit**: `a4088af` (AIfred v3.0.0)
**Previous Sync**: `2ea4e8b`
**Intermediate Commits**: `c27ba27` was local HEAD before pull
**Changes Since**: 334 files changed, 55,889 insertions, 3,187 deletions (3 commits)

---

## Summary

| Classification | Count |
|----------------|-------|
| ADOPT | 3 |
| ADAPT | 5 |
| REJECT | 8 |
| DEFER | 4 |

---

## Commit Breakdown

| Commit | Description |
|--------|-------------|
| `5c4aa18` | Context optimization — align with AIProjects cleanup patterns |
| `c64f39b` | AIfred v3.0.0 — headless automation framework, hook consolidation, task-dashboard skill |
| `a4088af` | Testing & validation framework (structural, functional, CI) |

---

## Detailed Analysis

### ADOPT (Ready to Port)

#### `.claude/hooks/lib/shared.js` — Hook shared utilities library
- **Change**: New shared library extracting common hook patterns: `readStdin()`, `getSessionName()`, `ensureDir()`, `readFileSafe()`, `appendJsonl()`, `proceed()`, `block()`, `runHook()`
- **Rationale**: Clean DRY extraction. Jarvis hooks currently duplicate stdin parsing, error handling, and proceed/block output across 28 hooks. This library would reduce ~40% of boilerplate.
- **Action**: ADOPT directly. Create equivalent at `.claude/hooks/lib/shared.js`. All Jarvis hooks can incrementally migrate to use it.

#### `.claude/context/patterns/clarification-pattern.md` — When to ask vs assume
- **Change**: New pattern documenting when Claude should ask clarifying questions vs proceed with assumptions
- **Rationale**: Generic, universally applicable pattern. No conflicts with Jarvis architecture.
- **Action**: Copy to `.claude/context/patterns/clarification-pattern.md`

#### `scripts/scan-secrets.sh` — Secret scanning utility
- **Change**: New script that scans for accidentally committed secrets (API keys, tokens, passwords)
- **Rationale**: Security utility, universally useful. No conflicts.
- **Action**: Copy to `scripts/scan-secrets.sh`

---

### ADAPT (Needs Modification)

#### Hook consolidation pattern (prompt-dispatcher.js + subagent-dispatcher.js)
- **Change**: AIfred consolidated ~20 hooks into 2 dispatchers (prompt-dispatcher for UserPromptSubmit, subagent-dispatcher for SubagentStop) + archived individual hooks to `hooks/archive/`
- **Modification Needed**: Jarvis has different hook composition — our hooks include JICM-specific, Ulfhedthnar-specific, and Chronicler-specific hooks that don't exist in AIfred. Would need to create Jarvis-specific dispatchers preserving our unique hooks while adopting the consolidation pattern.
- **Rationale**: Good architectural pattern (fewer hook processes per event = faster), but Jarvis divergence is significant. Our hooks include `insight-capture.js`, `ulfhedthnar-detector.js`, `jicm-continuation-verifier.js`, `virgil-tracker.js` which have no AIfred equivalents.
- **Priority**: Medium — hook consolidation would reduce per-prompt latency

#### `.claude/settings.json` — Hook registration overhaul
- **Change**: Simplified hook registry — 6 active hooks (down from ~20), cleaner permissions with `_disabled` annotations
- **Modification Needed**: Cannot adopt directly. Jarvis settings.json has extensive custom hook registrations, MCP configs, and Jarvis-specific permissions. Would need selective merge of permission patterns.
- **Rationale**: The permission structure is well-organized. Could adopt the deny-list pattern and some allow-list entries.

#### `.claude/CLAUDE.md` — Massive simplification (560→90 lines)
- **Change**: AIfred dramatically trimmed CLAUDE.md — removed inline documentation, added more `@` imports, streamlined core principles to 5 items, added "Scripts Over LLM" principle
- **Modification Needed**: Jarvis CLAUDE.md serves a fundamentally different role (full autonomic behavior spec + force-loaded docs). The "Scripts Over LLM" principle is already embodied in Jarvis's `code-before-prompts-pattern.md`.
- **Rationale**: The brevity is aspirational but Jarvis needs more in-context instructions due to the autonomic system complexity. Could adopt specific wording improvements.

#### `tests/validate-structure.sh` + `tests/functional/*.bats` — Testing framework
- **Change**: Comprehensive structural validation (TAP format) + functional tests using bats-core
- **Modification Needed**: Jarvis has different file structure, different hook names, different skill organization. Would need rewrite for Jarvis paths, but the testing approach is valuable.
- **Rationale**: Jarvis currently has no structural validation tests. Adapting this would improve CI/maintenance confidence.

#### `.claude/context/patterns/automation-routing.md` — Automation decision pattern
- **Change**: New pattern for deciding between cron, hook, and manual automation
- **Modification Needed**: Rename automation targets to Jarvis equivalents (Aion Quartet scripts vs AIfred's cron jobs)
- **Rationale**: Good decision framework, needs Jarvis-specific routing targets

---

### REJECT (Skip)

#### `.claude/jobs/` — Entire headless automation framework
- **Change**: Major new capability — `dispatcher.sh`, `executor.sh`, `team-runner.py`, personas, SQLite job DB, Telegram notifications, watchdog
- **Rationale**: Jarvis already has a more sophisticated orchestration layer (Aion Quartet: Watcher/Ennoia/Virgil/Commands in tmux). The headless framework uses cron+Claude CLI invocations, while Jarvis uses persistent tmux sessions with signal-based IPC. Fundamentally different architecture.
- **Jarvis Alternative**: Aion Quartet + AC components

#### `.beads/` directory + Beads integration
- **Change**: New task management system using `.beads/issues.jsonl` and `bd` CLI
- **Rationale**: Jarvis uses TodoWrite for in-session tasks, session-state.md for cross-session tracking, and orchestration commands for complex task trees. Beads would be a competing system.
- **Jarvis Alternative**: TodoWrite + session-state.md + orchestration skill

#### `.claude/skills/task-dashboard/` — Beads task dashboard
- **Change**: New skill reading `.beads/issues.jsonl` for formatted task views
- **Rationale**: Depends on Beads (rejected above)
- **Jarvis Alternative**: `/jarvis-status` skill

#### `profiles/` directory — Multi-profile system
- **Change**: YAML profiles for different deployment contexts (development, homelab, production)
- **Rationale**: Jarvis is a single-deployment system (Mac Studio). Profile switching adds complexity without benefit.

#### `.claude/context/patterns/aiprojects-aifred-sync-pattern.md` — AIfred-specific sync pattern
- **Change**: Pattern for syncing AIfred with AIProjects upstream
- **Rationale**: AIfred-specific. Jarvis already has `/sync-aifred-baseline` command.

#### `docs/images/*.svg` — Architecture diagrams
- **Change**: SVG component maps, hub architecture, setup flow diagrams
- **Rationale**: AIfred-specific architecture diagrams. Jarvis has its own Psyche topology maps.

#### `.claude/agents/parallel-dev-*.md` — Parallel dev agents
- **Change**: 4 new agents for parallel development workflow (documenter, implementer, tester, validator)
- **Rationale**: Jarvis uses worktree-based agents differently. These are tightly coupled to AIfred's parallel-dev skill.

#### `VERSION` file
- **Change**: New file tracking AIfred version number
- **Rationale**: Jarvis uses `CHANGELOG.md` + inline version in CLAUDE.md

---

### DEFER (Review Later)

#### `.github/workflows/validate.yml` — CI pipeline
- **Change**: GitHub Actions workflow running structural + functional tests on push/PR
- **Reason for Deferral**: Would need Jarvis-specific test suite first (from ADAPT: testing framework). Revisit after adapting `validate-structure.sh`.
- **Review By**: When Jarvis testing infrastructure is built

#### `.claude/hooks/session-start.js` — Enhanced session-start hook
- **Change**: Added session-state size monitoring, settings.local.json cleanup nudge, TELOS goal alignment, upgrade discovery reminders
- **Reason for Deferral**: Jarvis has a fundamentally different session-start hook (bash, not JS; integrates with JICM resume). Would need careful analysis of which features to backport.
- **Review By**: Next hook consolidation pass

#### `.claude/skills/upgrade/` — Upgrade skill with references
- **Change**: Restructured with references/ directory pattern (analysis-workflow.md, implementation-workflow.md, scheduled-execution.md)
- **Reason for Deferral**: The reference-splitting pattern (SKILL.md stays lean, references/ holds details) is interesting but Jarvis already uses this in some skills. Low priority to formalize.
- **Review By**: Next skill architecture review

#### `.shellcheckrc` + `.yamllint` — Linting configs
- **Change**: New linting configuration files for shell scripts and YAML
- **Reason for Deferral**: Would benefit Jarvis scripts, but need to validate against our bash 3.2 macOS constraint (shellcheck may flag 3.2-compatible patterns as issues)
- **Review By**: Next maintenance cycle

---

## Recommended Actions

1. **ADOPT `hooks/lib/shared.js`** — Highest ROI item. Reduces hook boilerplate across 28 Jarvis hooks.
2. **ADOPT `scan-secrets.sh`** — Zero-effort security improvement.
3. **ADAPT testing framework** — Create Jarvis-specific `validate-structure.sh` based on AIfred's approach. Would catch structural drift.
4. **Study hook consolidation pattern** — Plan a Jarvis-specific hook consolidation pass, grouping by event type (like AIfred's prompt-dispatcher/subagent-dispatcher pattern).

---

## Update Port Log?

No ports applied (dry-run mode). `paths-registry.yaml` NOT updated.

---

*Sync Report — 2026-03-28 | AIfred v3.0.0 | 334 files, 3 commits since last sync*
