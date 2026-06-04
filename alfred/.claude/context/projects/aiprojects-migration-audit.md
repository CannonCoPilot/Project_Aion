# AIProjects Standardization Migration — Audit Report

> Generated: 2026-03-19
> Source: AIProjects (376 commits since AIFred v3.0.0, March 5 2026)
> Target: AIFred Pro (`~/Code/AIFred-Pro/`)

## 1. File-by-File Delta Table

| Source File (AIProjects) | Action | Target in Pro | Notes |
|--------------------------|--------|---------------|-------|
| `.claude/context/tools/label-taxonomy.yaml` | template-ize | `.claude/context/tools/label-taxonomy.yaml` | Strip Aurora, AI David, Nexus-specific handlers |
| `.claude/context/tools/pulse-reference.md` | template-ize | `.claude/context/tools/pulse-reference.md` | Replace hardcoded URLs, remove Nexus bash helpers |
| `.claude/jobs/lib/routing-rules.yaml` | template-ize | `.claude/jobs/lib/routing-rules.yaml` | Strip environment bindings, add CUSTOMIZE blocks |
| `.claude/registries/manifest.yaml` | new (Pro-specific) | `.claude/registries/manifest.yaml` | Pro-only references |
| `.claude/registries/schemas/*.schema.json` (4 files) | direct copy | `.claude/registries/schemas/` | No changes needed |
| `.claude/registries/credential-governance.yaml` | template-ize | `.claude/registries/credential-governance.yaml` | Strip real credentials, keep policy schema + examples |
| `.claude/hooks/yaml-validator.js` | direct copy | `.claude/hooks/yaml-validator.js` | No environment-specific content |
| `.claude/hooks/credential-guard.js` | direct copy | `.claude/hooks/credential-guard.js` | Depends on lib/shared.js (exists in Pro) |
| `.claude/hooks/credential-guard.config.js` | template-ize | `.claude/hooks/credential-guard.config.js` | Strip hardcoded paths, empty policies array |
| `.claude/hooks/persona-guard.js` | template-ize | `.claude/hooks/persona-guard.js` | Replace AIProjects personas with example templates |
| `.claude/hooks/lib/persona-policies.yaml` | template-ize | `.claude/hooks/lib/persona-policies.yaml` | Example policies, all commented out |
| `.claude/hooks/context-monitor/` (4 files) | direct copy | `.claude/hooks/context-monitor/` | index.js, post-tool.js, stop.js, lib/ |
| `.claude/context/patterns/credential-governance-pattern.md` | direct copy | same relative path | Generic pattern |
| `.claude/context/patterns/knowledge-tier-classification-pattern.md` | direct copy | same relative path | Generic pattern |
| `.claude/context/patterns/reactive-search-index-pattern.md` | direct copy | same relative path | Generic pattern |
| `.claude/context/patterns/registry-manifest-pattern.md` | direct copy | same relative path | Generic pattern |
| `.claude/context/patterns/retry-detection-pattern.md` | direct copy | same relative path | Generic pattern |
| `.claude/context/patterns/schema-validated-registries-pattern.md` | direct copy | same relative path | Generic pattern |
| `.claude/context/patterns/structured-requirements-pattern.md` | direct copy | same relative path | Generic pattern |
| `.claude/context/standards/application-standards.yaml` | direct copy | same relative path | Generic standard |
| `.claude/context/standards/documentation-location.md` | adapt | same relative path | Remove AIProjects/Obsidian specifics |

## 2. Stale Content Inventory (Removed)

| Item | Location in Pro | Status | Replacement |
|------|----------------|--------|-------------|
| `bd` CLI references | ~40 files across prompts, docs, registry | **Replaced** | `pulse` CLI |
| `.beads/` directory | `.beads/config.yaml.template`, `.beads/.gitkeep` | **Deleted** | Pulse API |
| `beads-reference.md` | `.claude/context/tools/beads-reference.md` | **Deleted** | `pulse-reference.md` |
| `beads-aliases.sh` | `scripts/beads-aliases.sh` | **Deleted** | `scripts/pulse-aliases.sh` (already exists) |
| `beads-actor.sh` hook | `.claude/hooks/` | **Not found** | N/A (was already absent) |
| `BEADS_ACTOR` export | `.claude/jobs/executor.sh` | **Replaced** | `PULSE_ACTOR` |
| `BeadsIssue` interface | `.claude/skills/task-dashboard/tools/index.ts` | **Replaced** | `PulseTask` |
| `.beads/issues.jsonl` data source | task-dashboard, SKILL.md | **Replaced** | Pulse API + CLI fallback |
| `.beads/config.yaml` Document Guard rule | `document-guard.config.js` | **Removed** | N/A |
| `beads_task` reference in routing | `.claude/jobs/rules/routing.yaml` | **Updated** | Generic "task reference" |

## 3. Pro-Unique Inventory (Preserved — NOT touched)

| File | Purpose | Status |
|------|---------|--------|
| `.claude/hooks/_profile-check.js` | Profile system unique to Pro | Preserved |
| `.claude/context/patterns/environment-profile-pattern.md` | Pro's profile docs | Preserved |
| `.claude/skills/upgrade/` | Pro-only skill | Preserved |
| `.claude/jobs/team-runner.py` | Multi-agent consensus | Preserved |
| `.claude/jobs/rules/` | Pro governance rules | Preserved (routing.yaml updated for Beads ref only) |
| `profiles/` directory | Pro's environment profile system | Preserved |
| `docker-compose.yml` | Docker config | Preserved (untouched) |
| `.claude/jobs/.env.template` | Job env template | Preserved (untouched) |
| `scripts/pulse-aliases.sh` | Pulse CLI aliases | Preserved (already existed) |
| `scripts/setup-pulse.sh` | Pulse setup script | Preserved (already existed) |
| `.claude/context/patterns/sync-validation-test.md` | Pro-specific test pattern | Preserved |

## 4. Template-ization Matrix

| File | Template Changes Applied |
|------|------------------------|
| `label-taxonomy.yaml` | Aurora labels removed, AI David review labels removed, `waiting:david`→`waiting:owner`, generic handlers, CUSTOMIZE blocks |
| `pulse-reference.md` | Nexus refs removed, URLs parameterized, feedback endpoints removed, bash integration removed |
| `routing-rules.yaml` | AI David entry removed, `waiting:david`→`waiting:owner`, generic handlers, CUSTOMIZE blocks |
| `credential-governance.yaml` | All real credentials stripped, example policies (commented), generic escalation |
| `credential-guard.config.js` | Hardcoded paths removed, empty policies, `process.env.HOME` instead of `/home/davidmoneil` |
| `persona-guard.js` | AIProjects personas replaced with generic examples |
| `persona-policies.yaml` | All policies commented out as examples |
| `documentation-location.md` | AIProjects→generic, Obsidian refs removed |

## 5. Migration Summary

### Phase 1: Beads→Pulse (COMPLETE)
- 40+ files updated across CLAUDE.md, registry, personas, docs, settings, hooks
- Zero remaining Beads/bd references (verified via grep)
- Task dashboard rewritten from JSONL→Pulse API with CLI fallback
- .beads/ directory deleted, settings.local.json created with Pulse perms

### Phase 2: Registry System (COMPLETE)
- manifest.yaml created with Pro-specific references
- 4 JSON Schema files copied
- Template credential-governance.yaml created
- yaml-validator.js hook ported and registered

### Phase 3: Credential Governance (COMPLETE)
- credential-guard.js + config ported (template-ized)
- persona-guard.js ported with example policies
- persona-policies.yaml template created
- All hooks registered in settings.json

### Phase 4: Patterns & Standards (COMPLETE)
- 7 missing patterns copied
- 2 missing standards ported (1 adapted)
- Both _index.md files updated

### Phase 5: Terminology, Error Handling, Hooks (COMPLETE)
- Workspace terminology verified in pulse-reference.md
- classify_error() + auth circuit breaker added to executor.sh
- context-monitor/ hooks ported and registered

### Phases 6-7: DEFERRED (lower priority)
- Phase 6: Orchestration-to-Pulse Projects documentation
- Phase 7: Test harness creation
