# System 4: Identity & Cognition — AIFred's Mind

**Purpose**: Defines who AIFred-Pro is, what it knows, how it decides, and how it interacts with the multi-archon ecosystem. This is the behavioral constitution that constrains all other systems.

**Verified**: 2026-04-23 — every claim sourced from direct file reads.

---

## Architecture Overview

```
  Claude Code Session Start
    │
    ├── Force-loads: .claude/CLAUDE.md (behavioral constitution)
    ├── Force-loads: .claude/settings.json (permission model)
    │
    ├── Context layer (.claude/context/) — 5 root .md files, 10 subdirs:
    │   ├── _index.md, session-state.md, configuration-summary.md
    │   ├── user-preferences.md, compaction-essentials.md
    │   ├── decisions/ (5), designs/ (0), lessons/ (1)
    │   ├── patterns/ (35), projects/ (9), standards/ (5)
    │   ├── systems/ (2), telos/ (5), tools/ (2), workflows/ (1)
    │
    ├── Knowledge layer (knowledge/) — lightweight doc store:
    │   ├── docs/getting-started.md
    │   ├── templates/project-context.md
    │   └── notes/ (empty, .gitkeep)
    │
    ├── AGENTS.md — project README (core principles, workflow patterns)
    │
    ├── Agents (.claude/agents/) — 13 agent definitions
    │
    ├── Skills (.claude/skills/) — 10 skill directories
    │
    ├── Commands (.claude/commands/) — 39 slash commands
    │
    └── Personas (.claude/jobs/personas/) — 24 directories
```

---

## Subsystem 4.1: Behavioral Constitution (CLAUDE.md)

**File**: `.claude/CLAUDE.md` — the master behavioral contract, auto-loaded by Claude Code.

### Identity Declaration
> AIfred - AI Infrastructure Assistant. Personal AI infrastructure hub for home lab automation, knowledge management, and system integration.

### Core Principles (from actual CLAUDE.md, lines 7-11)
1. **Hub, Not Container**: Code lives in `projects_root`. AIfred tracks and orchestrates but doesn't contain projects. Paths registered in `paths-registry.yaml`.
2. **Context-First**: Check `.claude/context/` for relevant docs before advising. Start with `_index.md`.
3. **Solve Once, Reuse**: Document solutions in context files. If a task repeats 3+ times, propose a slash command.
4. **Iterative Growth**: Don't over-engineer. Start minimal, evolve based on actual use.
5. **Scripts Over LLM**: Push logic into deterministic scripts. AI creates automation once, execution flows through scripts.
6. **Registry Manifest**: All YAML/JSON registries tracked in `.claude/registries/manifest.yaml`.

### Task Management (CLAUDE.md lines 25-30)
- Use Pulse for ALL tasks. Claim before starting, close when done.
- `/tasks` skill for formatted output — output ONLY the tool's stdout, no reformatting.

### Headless Automation (CLAUDE.md lines 35-38)
- Jobs run on schedule via cron with persona-based permissions, cost controls, optional Telegram.
- Key components: dispatcher, executor, team-runner, message bus.

### Context Loading Order (CLAUDE.md lines 60+)
1. `.claude/context/session-state.md` (current work)
2. `.claude/context/_index.md` (navigation hub)
3. Pulse task state (`pulse list`, `pulse ready`)

---

## Subsystem 4.2: Project README (AGENTS.md)

**File**: `AGENTS.md` — NOT a multi-agent architecture spec. This is the **project README** for Claude Code, providing:

- 8 core principles (Context-First, Document Discoveries, Use Symlinks, Ask Questions, Memory for Decisions, MCP-First Tools, Hub Not Container, Scripts Over LLM)
- Key file navigation table (_index.md, session-state.md, compaction-essentials.md, current-priorities.md, paths-registry.yaml)
- Workflow patterns: DDLA (Discover→Document→Link→Automate), COSA (Capture→Organize→Structure→Automate)

### Actual Agent Definitions (.claude/agents/)

13 agent files (NOT the 5 claimed in prior versions):

| Agent | Purpose |
|-------|---------|
| `code-analyzer.md` | Codebase analysis |
| `code-implementer.md` | Code implementation |
| `code-tester.md` | Testing |
| `deep-research.md` | Research |
| `docker-deployer.md` | Docker deployment |
| `memory-bank-synchronizer.md` | Memory sync |
| `ollama-manager.md` | Ollama management |
| `parallel-dev-documenter.md` | Parallel dev docs |
| `parallel-dev-implementer.md` | Parallel dev implementation |
| `parallel-dev-tester.md` | Parallel dev testing |
| `parallel-dev-validator.md` | Parallel dev validation |
| `project-plan-validator.md` | Plan validation |
| `service-troubleshooter.md` | Service troubleshooting |

Plus: `_template-agent.md`, `_TEMPLATE.txt`, `memory/`, `results/`, `sessions/`

---

## Subsystem 4.3: Knowledge Directory (knowledge/)

Lightweight doc store — **NOT** a behavioral specification layer.

| Path | Content |
|------|---------|
| `docs/getting-started.md` | Getting started guide |
| `templates/project-context.md` | Template for project context files |
| `notes/.gitkeep` | Empty directory |

**Files that DO NOT exist** (claimed in prior versions): `persona.md`, `capabilities.md`, `tools.md`, `conversation-style.md`, `SUMMARY.md`

---

## Subsystem 4.4: Context Layer (.claude/context/)

### Root Files (5)

| File | Purpose |
|------|---------|
| `_index.md` | Navigation hub |
| `session-state.md` | Current work status |
| `configuration-summary.md` | Configuration state |
| `user-preferences.md` | User preferences |
| `compaction-essentials.md` | Core context surviving compaction |

**Files that DO NOT exist**: `project-context.md`, `system-map.md`, `current-priorities.md`

### Subdirectories (10)

| Directory | File Count | Content |
|-----------|-----------|---------|
| `decisions/` | 5 | Architecture decisions (archon-architecture, dev-space-isolation, etc.) |
| `designs/` | 0 | Empty |
| `lessons/` | 1 | Lessons learned |
| `patterns/` | 35 | Behavioral patterns |
| `projects/` | 9 | Project context files |
| `standards/` | 5 | Standards definitions |
| `systems/` | 2 | System documentation |
| `telos/` | 5 | Goals/domains (domains/, goals/, README, TELOS.md, templates/) |
| `tools/` | 2 | Tool references (label-taxonomy.yaml, pulse-reference.md) |
| `workflows/` | 1 | Workflow definitions |

---

## Subsystem 4.5: Persona System (.claude/jobs/personas/)

24 persona directories, each containing 4 files:

```
personas/<name>/
├── config.yaml         # Engine, model, limits, output, session config
├── methodology.yaml    # Approach patterns and constraints
├── permissions.yaml    # Allowed/denied operations
└── prompt.md           # Task prompt template
```

Full list: ai-reviewer, analyst, autofix-executor, backend-eng, bug-fixer, context-maintainer, creative-action, creative-builder, creative-feedback, creative-presenter, creative-thinker, db-eng, infrastructure-deployer, investigator, librarian, pipeline-reviewer, project-manager, researcher, security-reviewer, task-evaluator, task-investigator, team-verdict, troubleshooter, ux-eng

---

## Subsystem 4.6: Configuration (.claude/config/)

| File | Purpose |
|------|---------|
| `active-profile.yaml` | Currently active profile settings |
| `active-profile.yaml.template` | Template for profile settings |
| `feature-registry.yaml` | Feature flag registry |
| `profile-config.json` | Profile configuration |

**Files that DO NOT exist**: `autonomy.yaml`, `mcp-config.yaml`

---

## Subsystem 4.7: Skills (10)

Located at `.claude/skills/`, each as a subdirectory:

| Skill | Purpose |
|-------|---------|
| `fabric` | Fabric AI integration |
| `infrastructure-ops` | Infrastructure management |
| `orchestration` | Job orchestration |
| `parallel-dev` | Parallel development workflows |
| `project-lifecycle` | Project creation/management |
| `session-management` | Session lifecycle |
| `structured-planning` | Planning workflows |
| `system-utilities` | System utility operations |
| `task-dashboard` | Dashboard task operations |
| `upgrade` | System upgrade workflows |

Plus: `_template/`, `_index.md`

---

## Subsystem 4.8: Slash Commands (39)

39 command files in `.claude/commands/`:

agent, analyze-codebase, audit-log, backup-status, capture, check-health, check-services, code, consolidate-project, create-project, design-review, discover-docker, docker-restart, health-report, history, and 24 more.

---

## Subsystem 4.9: Permission Model (.claude/settings.json)

Conservative, read-heavy permission model with hooks registered (persona-guard.js, audit-logger.js, branch-protection.js, context-monitor, etc.).

---

## Subsystem 4.10: Orchestration (.claude/orchestration/)

Minimal content:

| File | Purpose |
|------|---------|
| `README.md` | Orchestration documentation |
| `_template.yaml` | Template for orchestration definitions |

**Files that DO NOT exist**: `session-flow.md`, `inter-archon-protocol.md`

---

## Files Comprising This System

| File | Role | Verified |
|------|------|----------|
| `.claude/CLAUDE.md` | Behavioral constitution | Yes |
| `.claude/settings.json` | Permission model | Yes |
| `AGENTS.md` | Project README (core principles, workflow patterns) | Yes |
| `knowledge/` | 3 files (getting-started, project-context template, notes) | Yes |
| `.claude/context/` | 5 root .md files, 10 subdirs (35 patterns, 9 projects, etc.) | Yes |
| `.claude/config/` | 4 files (active-profile, feature-registry, profile-config) | Yes |
| `.claude/orchestration/` | 2 files (README, template) | Yes |
| `.claude/skills/` | 10 skill directories | Yes |
| `.claude/agents/` | 13 agent definitions | Yes |
| `.claude/commands/` | 39 slash commands | Yes |
| `.claude/jobs/personas/` | 24 persona directories | Yes |
| `.claude/jobs/registry.yaml` | Job registry | Yes |

---

*System 4: Identity & Cognition — verified 2026-04-23. Every claim sourced from direct file reads.*
