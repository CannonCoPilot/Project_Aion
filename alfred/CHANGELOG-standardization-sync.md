# AIFred Pro Standardization Sync — Changelog

> **Migration note (2026-06-04)**: Alfred-Dev is being migrated into the Project Aion monorepo (CannonCoPilot/Project_Aion). References to `davidmoneil/AIFred-Pro` and `/home/davidmoneil/` paths below are historical and reflect the original upstream; they have not been altered in this document.

**Date**: 2026-03-19
**Source**: AIProjects (376 commits since AIFred v3.0.0, March 5 2026)
**Scope**: AIFred Pro only (`~/Code/AIFred-Pro/`)
**Session**: AIProjects session 419

---

## Summary

Brought AIFred Pro up to parity with AIProjects standards accumulated over 14 days of heavy standardization work. All changes are **templates/examples** — no hardcoded working integrations per standing rule.

---

## Phase 1: Beads → Pulse Migration (CRITICAL)

The entire task management layer was migrated from the dead Beads system (`bd` CLI, `.beads/issues.jsonl`) to Pulse (FastAPI + PostgreSQL at `${PULSE_URL:-http://localhost:8700}`).

### Files Changed

| File | Change |
|------|--------|
| `.claude/CLAUDE.md` | All `bd` → `pulse`, added Principle #6 (Registry Manifest), updated Quick Reference |
| `.claude/settings.local.json` | **Created** — Pulse CLI permissions (list, show, update, close, create, ready, search, label, defer, transition, stage, comments) |
| `.claude/skills/task-dashboard/tools/index.ts` | **Rewritten** — `BeadsIssue` → `PulseTask`, JSONL file read → async Pulse HTTP API with CLI fallback |
| `.claude/skills/task-dashboard/SKILL.md` | Updated tags, description, data source, related links |
| `.claude/skills/_index.md` | "Beads task views" → "Pulse task views" |
| `.claude/skills/upgrade/SKILL.md` | "Beads tasks" → "Pulse tasks" |
| `.claude/skills/upgrade/references/analysis-workflow.md` | "Beads tasks" → "Pulse tasks" |
| `.claude/commands/upgrade.md` | "Beads tasks" → "Pulse tasks", "BD-xxx" → "task" |
| `.claude/jobs/registry.yaml` | All `bd` → `pulse` in 4 job prompts + pre_checks (task-score, task-investigator, task-executor, priority-review) |
| `.claude/jobs/executor.sh` | `BEADS_ACTOR` → `PULSE_ACTOR`, comment updated |
| `.claude/jobs/README.md` | "Beads tasks" → "Pulse tasks" |
| `.claude/jobs/lib/autofix-scoring-rules.md` | "Beads tasks" → "tasks" |
| `.claude/jobs/personas/researcher/prompt.md` | All `bd` → `pulse`, "Beads" → "Pulse/tasks" (~15 replacements) |
| `.claude/jobs/personas/task-investigator/prompt.md` | All `bd` → `pulse`, "Beads label updates" → "task label updates" |
| `.claude/jobs/personas/autofix-executor/prompt.md` | All `bd` → `pulse`, "Beads Integration" → "Task Integration" |
| `.claude/jobs/personas/investigator/prompt.md` | "Beads" → "Pulse" |
| `.claude/jobs/personas/*/permissions.yaml` (6 files) | `bd` → `pulse` in pre_approved, tier comments |
| `.claude/jobs/rules/routing.yaml` | "beads_task reference" → "task reference" |
| `.claude/hooks/document-guard.config.js` | Removed `.beads/config.yaml` protection rule |
| `.claude/context/_index.md` | `beads-reference.md` → `pulse-reference.md` |
| `docs/headless-automation.md` | All `bd` → `pulse`, "Beads" → "Pulse" |
| `docs/PROJECT-PLAN.md` | Historical Beads refs updated to Pulse |
| `README.md` | All `bd` → `pulse`, directory tree updated |
| `setup-phases/00-prerequisites.md` | Beads setup → Pulse Docker Compose setup |
| `setup-phases/03-foundation-setup.md` | `bd init` → Docker Compose + setup-pulse.sh |
| `setup-phases/07-finalization.md` | Beads verification → Pulse verification |
| `tests/sync-manifest.yaml` | `beads-aliases.sh` → `pulse-aliases.sh` |

### Files Deleted

| File | Reason |
|------|--------|
| `.beads/` directory | Dead system — Pulse replaces it |
| `.beads/.gitignore` | Part of dead .beads directory |
| `scripts/beads-aliases.sh` | Replaced by existing `scripts/pulse-aliases.sh` |
| `.claude/context/tools/beads-reference.md` | Replaced by `pulse-reference.md` |
| `.claude/hooks/beads-actor.sh` | Dead hook — Pulse handles provenance |

### Files Created (Templates)

| File | Source | Template-ization |
|------|--------|------------------|
| `.claude/context/tools/label-taxonomy.yaml` | AIProjects label-taxonomy.yaml | Stripped Aurora labels, AI David review labels, `waiting:david` → `waiting:owner`, generic handler names, `# CUSTOMIZE:` blocks |
| `.claude/context/tools/pulse-reference.md` | AIProjects pulse-reference.md | Removed Nexus refs, parameterized URLs, removed Bash Integration section, removed feedback endpoints |
| `.claude/jobs/lib/routing-rules.yaml` | AIProjects routing-rules.yaml | Removed ai-david entry, `waiting:david` → `waiting:owner`, generic handlers, `# CUSTOMIZE:` blocks |

### Residual Beads References (Intentional)

3 references remain in `pulse-reference.md` — historical context in the "Migration from Beads" section. These are correct and should stay.

---

## Phase 2: Registry System

Introduced a centralized registry tracking system for all authoritative YAML/JSON files.

| File | Description |
|------|-------------|
| `.claude/registries/manifest.yaml` | **Created** — Central registry of 6 registries (label-taxonomy, routing-rules, job-registry, paths-registry, credential-governance, persona-policies) |
| `.claude/registries/schemas/label-taxonomy.schema.json` | **Copied** from AIProjects |
| `.claude/registries/schemas/job-registry.schema.json` | **Copied** from AIProjects |
| `.claude/registries/schemas/paths-registry.schema.json` | **Copied** from AIProjects |
| `.claude/registries/schemas/service-registry.schema.json` | **Copied** from AIProjects |
| `.claude/registries/credential-governance.yaml` | **Created** — Template with policy schema + 3 commented example policies (critical/high-risk/standard tiers) |
| `.claude/hooks/yaml-validator.js` | **Copied** from AIProjects — PostToolUse YAML validation |

---

## Phase 3: Credential Governance

Added credential access scope authorization and persona-based command restrictions.

| File | Description |
|------|-------------|
| `.claude/hooks/credential-guard.js` | **Copied** from AIProjects — PreToolUse enforcement hook |
| `.claude/hooks/credential-guard.config.js` | **Created** — Template with empty policies, `process.env.HOME` (no hardcoded paths), graceful failMode |
| `.claude/hooks/persona-guard.js` | **Created** — Template with 2 commented example personas (block mode + allow-only mode) |
| `.claude/hooks/lib/persona-policies.yaml` | **Created** — Template with commented example policies |

### Key Design Decisions
- Empty policies arrays — users add their own credentials/personas
- `failMode: 'open'` — hooks don't block on missing config
- No Pulse task creation or Telegram for escalation — replaced with console warnings
- Zero hardcoded paths (verified: `grep -r "/home/davidmoneil"` returns 0)

---

## Phase 4: Missing Patterns & Standards

Ported 7 architectural patterns and 2 standards that accumulated in AIProjects since v3.0.0.

### Patterns (direct copy from AIProjects)

| Pattern | Purpose |
|---------|---------|
| `credential-governance-pattern.md` | Credential access scope authorization framework |
| `knowledge-tier-classification-pattern.md` | Classify documents by tier (registry, pattern, reference, ephemeral) |
| `reactive-search-index-pattern.md` | Auto-maintained search indexes via hooks |
| `registry-manifest-pattern.md` | Track all registries in a central manifest |
| `retry-detection-pattern.md` | Detect and prevent retry loops in automation |
| `schema-validated-registries-pattern.md` | JSON Schema validation for YAML registries |
| `structured-requirements-pattern.md` | Use YAML/JSON for requirements instead of prose |

### Standards

| Standard | Source | Notes |
|----------|--------|-------|
| `application-standards.yaml` | Direct copy | Generic application config standards |
| `documentation-location.md` | Adapted | Removed AIProjects/Obsidian specifics, kept decision framework |

### Index Updates
- `.claude/context/patterns/_index.md` — Added 7 new entries in 3 new categories (Security & Governance, Reliability & Automation, Knowledge & Documentation)
- `.claude/context/standards/_index.md` — Added 2 new entries

---

## Phase 5: Error Handling & Hooks

### Error Classification (executor.sh)

Added smart error handling to the job executor:

- **`classify_error()`** — Categorizes errors as `auth`, `transient`, or `fatal`
- **Auth circuit breaker** — 30-minute cooldown after auth failures (prevents burning API budget on expired keys)
  - `is_auth_circuit_open()` / `trip_auth_circuit()` functions
  - State file: `${STATE_DIR}/auth-circuit-${JOB_NAME}`

### Context Monitor Hooks

Copied `context-monitor/` directory from AIProjects:
- `index.js` — SessionStart context tracking
- `post-tool.js` — PostToolUse file access monitoring
- `stop.js` — Stop session summary
- `lib/` — Shared utilities

---

## Phase 0: Audit Report

Created comprehensive delta report at `.claude/context/projects/aiprojects-migration-audit.md` covering:
1. File-by-file delta table (action per file)
2. Stale content inventory (everything removed)
3. Pro-unique inventory (everything preserved)
4. Template-ization matrix (what was parameterized and how)

---

## What Was NOT Touched (Pro-Unique)

| File/Directory | Reason |
|----------------|--------|
| `.claude/hooks/_profile-check.js` | Profile system unique to Pro |
| `.claude/context/patterns/environment-profile-pattern.md` | Pro's profile docs |
| `.claude/skills/upgrade/` | Pro-only skill |
| `.claude/jobs/team-runner.py` | Multi-agent consensus |
| `.claude/jobs/rules/` | Pro governance rules (only removed "beads_task" ref) |
| `profiles/` directory | Pro's environment profile system |
| `docker-compose.yml` | Pro's Docker config |
| `.claude/jobs/.env.template` | Pro's job env template |
| `scripts/pulse-aliases.sh` | Already existed — leveraged |
| `scripts/setup-pulse.sh` | Already existed — leveraged |

---

## Deferred (Phases 6-7)

| Phase | What | Why Deferred |
|-------|------|--------------|
| **6: Orchestration-to-Pulse Projects** | Document Pulse Projects API in pulse-reference.md, update orchestration skill | Lower priority — orchestration YAML still works |
| **7: Test Harness** | Create `.claude/tests/` with hook load tests, YAML parse tests, schema validation | Lower priority — can be created incrementally |

---

## Verification Results

```
Beads references remaining:     3  (all intentional in pulse-reference.md migration section)
Hardcoded paths in hooks:       0
Pro-unique files preserved:     All confirmed
Template files created:         3  (label-taxonomy, pulse-reference, routing-rules)
New files total:               ~25
Files modified:                ~45
Files deleted:                   5
```

---

## How to Validate

```bash
# Zero stale Beads references (expect 3 in pulse-reference.md migration section)
grep -ri "beads\|\.beads" ~/Code/AIFred-Pro/ --include="*.md" --include="*.yaml" --include="*.json" --include="*.ts" --include="*.js" --include="*.sh" | grep -v archive/ | grep -v node_modules/ | grep -v .git/ | grep -v aiprojects-migration-audit.md

# Label taxonomy exists at Docker mount path
test -f ~/Code/AIFred-Pro/.claude/context/tools/label-taxonomy.yaml && echo OK

# Routing rules exists at Docker mount path
test -f ~/Code/AIFred-Pro/.claude/jobs/lib/routing-rules.yaml && echo OK

# .beads directory gone
test ! -d ~/Code/AIFred-Pro/.beads && echo OK

# Pulse permissions in settings
grep -q "pulse" ~/Code/AIFred-Pro/.claude/settings.local.json && echo OK

# No hardcoded paths in credential hooks
grep -r "/home/davidmoneil" ~/Code/AIFred-Pro/.claude/hooks/credential-guard* | wc -l  # should be 0
```
