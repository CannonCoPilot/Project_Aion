# System 5: Safety & Quality Gates — Defensive Perimeter

**Purpose**: Prevent mistakes before they happen. This system provides layered defenses against secrets leakage, dangerous git operations, code style drift, and regressions — from real-time hooks in Claude Code sessions to CI/CD pipelines on GitHub.

**Verified**: 2026-04-23 — every claim sourced from direct file reads.

---

## Architecture Overview

```
  Claude Code Session
    │
    ├── 48+ hooks in .claude/hooks/ (registered in settings.json)
    │   ├── credential-guard.js    — scope-based credential access control
    │   ├── branch-protection.js   — git branch safety
    │   ├── document-guard.js      — structural file protection
    │   ├── persona-guard.js       — persona permission enforcement
    │   ├── audit-logger.js        — action audit trail
    │   ├── secret-scanner.js      — real-time secret detection
    │   └── 42+ more hooks (monitoring, session, context, docker, etc.)
    │
    ├── Standalone utilities:
    │   └── scripts/scan-secrets.sh — full repo secret scan
    │
    └── Static analysis:
        ├── .shellcheckrc          — ShellCheck config (3 disabled rules)
        └── .yamllint              — YAML lint (relaxed, max 200 chars)

  GitHub Actions (on push/PR):
    └── .github/workflows/validate.yml
        ├── structural job: validate-structure.sh + yamllint + shellcheck
        └── functional job: bats tests (PR/manual only)
```

---

## Subsystem 5.1: Hooks (48+)

**Location**: `.claude/hooks/`

AIFred-Pro has a significantly larger hook infrastructure than initially reported. Key hooks by category:

### Security Hooks

| Hook | Type | Purpose |
|------|------|---------|
| `credential-guard.js` | PreToolUse | Scope-based credential access authorization. Checks consumer/persona against policy in `credential-governance.yaml`. Config: `credential-guard.config.js` |
| `secret-scanner.js` | PreToolUse | Real-time secret detection |
| `branch-protection.js` | PreToolUse | Prevents dangerous git operations |
| `document-guard.js` | PreToolUse | Structural file protection. Config: `document-guard.config.js` |

### Monitoring Hooks

| Hook | Type | Purpose |
|------|------|---------|
| `audit-logger.js` | PostToolUse | Action audit trail |
| `health-monitor.js` | PostToolUse | Service health monitoring |
| `docker-health-check.js` | PostToolUse | Docker container health |
| `docker-validator.js` | PreToolUse | Docker operations validation |
| `restart-loop-detector.js` | PostToolUse | Detects restart loops |
| `port-conflict-detector.js` | PreToolUse | Port conflict detection |

### Session/Context Hooks

| Hook | Type | Purpose |
|------|------|---------|
| `session-start.js` | PreToolUse | Session initialization |
| `session-stop.js` | PreToolUse | Session cleanup |
| `session-tracker.js` | PostToolUse | Session activity tracking |
| `session-exit-enforcer.js` | PreToolUse | Clean exit enforcement |
| `context-monitor/` | Directory | Context monitoring (multi-file) |
| `context-reminder.js` | PostToolUse | Context awareness reminders |
| `context-usage-tracker.js` | PostToolUse | Context budget tracking |
| `pre-compact.js` | PreToolUse | Pre-compaction preparation |

### Intelligence Hooks

| Hook | Type | Purpose |
|------|------|---------|
| `persona-guard.js` | PreToolUse | Persona permission enforcement |
| `orchestration-detector.js` | PostToolUse | Auto-detect complex prompts needing orchestration |
| `planning-mode-detector.js` | PostToolUse | Planning mode detection |
| `skill-router.js` | PreToolUse | Skill routing |
| `prompt-dispatcher.js` | PreToolUse | Prompt dispatching |
| `prompt-enhancer.js` | PreToolUse | Prompt enhancement |
| `mcp-enforcer.js` | PreToolUse | MCP usage enforcement |
| `priority-validator.js` | PreToolUse | Task priority validation |

### Other Hooks

| Hook | Purpose |
|------|---------|
| `_profile-check.js` | Profile validation |
| `amend-validator.js` | Git amend validation |
| `compose-validator.js` | Docker compose validation |
| `cross-project-commit-tracker.js` | Cross-project commit tracking |
| `doc-sync-trigger.js` | Documentation sync |
| `file-access-tracker.js` | File access auditing |
| `index-sync.js` | Index synchronization |
| `lsp-redirector.js` | LSP redirection |
| `memory-maintenance.js` | Memory maintenance |
| `paths-registry-sync.js` | Paths registry sync |
| `project-detector.js` | Project detection |
| `self-correction-capture.js` | Self-correction logging |
| `service-registration-detector.js` | Service registration |
| `subagent-dispatcher.js` | Subagent dispatching |
| `subagent-stop.js` | Subagent lifecycle |
| `worktree-manager.js` | Git worktree management |
| `yaml-validator.js` | YAML validation |

Supporting: `lib/` (shared hook utilities), `logs/` (hook output logs), `archive/` (retired hooks), `README.md`

---

## Subsystem 5.2: Security Scanner

**File**: `scripts/scan-secrets.sh` — standalone repo-wide secret scan utility. Verified exists.

---

## Subsystem 5.3: CI/CD Pipeline

**Location**: `.github/workflows/`

### validate.yml — Single Workflow (NOT ci.yml/lint.yml/release.yml)

```yaml
name: Validate
on:
  push:
    branches: ['*']
  pull_request:
    branches: [main]
  workflow_dispatch:
```

**Two jobs**:

1. **structural** (runs on every push):
   - Node 22, yamllint, shellcheck
   - Runs `tests/validate-structure.sh --verbose`

2. **functional** (PR/manual only):
   - Node 22, bats
   - Runs bats functional tests

**Files that DO NOT exist**: `ci.yml`, `lint.yml`, `release.yml`

---

## Subsystem 5.4: Test Suite

**Location**: `tests/`

| File | Framework | Purpose |
|------|-----------|---------|
| `validate-structure.sh` | Bash | Structural validation (CI job) |
| `validate-sync.sh` | Bash | Sync validation |
| `sync-manifest.yaml` | YAML | Sync test configuration |
| `functional/dispatcher-parse.bats` | bats | Dispatcher parsing tests |
| `functional/hook-loading.bats` | bats | Hook loading tests |
| `functional/profile-loader.bats` | bats | Profile loader tests |
| `functional/skill-listing.bats` | bats | Skill listing tests |
| `functional/helpers/` | bats | Test helpers |

**Framework**: bats (Bash Automated Testing System) — NOT pytest

**Directories that DO NOT exist**: `unit/`, `integration/`, `performance/`

---

## Subsystem 5.5: Static Analysis Config

### .shellcheckrc (verified)

```
external-sources=true
disable=SC2034,SC2155,SC1091
```

- SC2034: variable appears unused (used by sourcing scripts)
- SC2155: declare and assign separately
- SC1091: not following sourced file

### .yamllint (verified)

```yaml
extends: relaxed
rules:
  line-length:
    max: 200
    level: warning
  truthy:
    level: warning
  comments:
    min-spaces-from-content: 1
  document-start: disable
  indentation:
    spaces: 2
    indent-sequences: consistent
```

---

## Subsystem 5.6: Operation Ignore Lists

### .aifred-ignore
Verified exists. Controls which files AIFred operations should skip.

### .gitignore
Standard exclusions for secrets, logs, state, dependencies.

---

## Subsystem 5.7: GitHub Templates

| Template | Status |
|----------|--------|
| `.github/ISSUE_TEMPLATE/bug_report.md` | **EXISTS** |
| `.github/ISSUE_TEMPLATE/feature_request.md` | **DOES NOT EXIST** |
| `.github/PULL_REQUEST_TEMPLATE.md` | **DOES NOT EXIST** |

---

## Files Comprising This System

| File | Role | Verified |
|------|------|----------|
| `.claude/hooks/` | 48+ hook files | Yes (listed above) |
| `.claude/hooks/lib/` | Shared hook utilities | Yes |
| `.claude/hooks/credential-guard.config.js` | Credential guard config | Yes |
| `.claude/hooks/document-guard.config.js` | Document guard config | Yes |
| `.claude/registries/credential-governance.yaml` | Credential access policy | Yes (referenced by credential-guard.js) |
| `scripts/scan-secrets.sh` | Repo-wide secret scan | Yes |
| `.github/workflows/validate.yml` | CI pipeline (structural + functional) | Yes |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Bug report template | Yes |
| `tests/validate-structure.sh` | Structural validation script | Yes |
| `tests/functional/*.bats` | 4 bats test files | Yes |
| `.shellcheckrc` | ShellCheck config | Yes |
| `.yamllint` | YAML lint config | Yes |
| `.aifred-ignore` | Operation ignore list | Yes |

---

*System 5: Safety & Quality — verified 2026-04-23. Every claim sourced from direct file reads.*
