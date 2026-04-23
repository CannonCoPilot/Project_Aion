# AIfred + Nexus Deep Analysis & Project Aion Integration Strategy

**Generated**: 2026-03-28, Session 49 (W5:Jarvis-dev)
**Analyst**: Jarvis (Master Archon)
**Classification**: Strategic — Project Aion Architecture
**Sources**: AIfred baseline (`a4088af`), AIfred-Pro (`81ce116`, v3.1.0), Nexus-System-Overview.pdf

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [AIfred Current State Analysis](#2-aifred-current-state-analysis)
3. [Nexus Deep Review](#3-nexus-deep-review)
4. [Pulse — Task Management System](#4-pulse--task-management-system)
5. [Loom — Local LLM & Content Generation (Speculative)](#5-loom--local-llm--content-generation-speculative)
6. [Jarvis vs AIfred: Capability Comparison](#6-jarvis-vs-aifred-capability-comparison)
7. [Project Aion Integration Vision](#7-project-aion-integration-vision)
8. [Multi-Archon Architecture](#8-multi-archon-architecture)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Risks and Mitigations](#10-risks-and-mitigations)

---

## 1. Executive Summary

AIfred has evolved from a Claude Code starter kit into a **production-grade autonomous operations platform** running 24/7 on Dave O'Neil's home lab. The v3.1.0 release (AIfred-Pro) introduces three major subsystems that don't yet exist in Jarvis:

| System | Status | What It Does |
|--------|--------|-------------|
| **Nexus** | Complete (Phases 1-4) | Autonomous job orchestration with dispatcher, personas, and approval loops |
| **Pulse** | Complete (replaces Beads) | PostgreSQL-backed task management with 60+ labels, REST API, and dashboard |
| **Loom** | Announced, not yet built | Local LLM handling and content generation delivery system |

**The strategic opportunity**: AIfred and Jarvis solve complementary problems. AIfred excels at **headless infrastructure automation** (cron-driven, stateless, multi-project). Jarvis excels at **deep collaborative work** (persistent sessions, context management, memory hierarchy, project-specific knowledge). Combining them under Project Aion would create a system where:

- **AIfred** handles the always-on operational layer (health checks, task routing, infrastructure tending)
- **Jarvis** handles deep focused work sessions (coding, architecture, analysis, creative problem-solving)
- **Additional Archons** fill specialized roles (security, research, deployment)
- **Nexus** becomes the shared orchestration bus connecting them all

---

## 2. AIfred Current State Analysis

### 2.1 Two Repositories

| Repo | Location | Version | Relationship |
|------|----------|---------|-------------|
| AIfred (baseline) | `/Users/nathanielcannon/Claude/AIfred` | v3.0.0 (`a4088af`) | Open-source baseline, `main` branch |
| AIfred-Pro | `/Users/nathanielcannon/Claude/AIFred-Pro` | v3.1.0 (`81ce116`) | Extended version with Pulse, security guards, bootstrap |

AIfred-Pro is a superset of the baseline. It adds:
- **Pulse** (PostgreSQL-backed task management replacing Beads JSONL)
- **Self-bootstrapping setup** (27-task dependency graph, hard gate in CLAUDE.md)
- **Security infrastructure** (Document Guard, Credential Guard, Persona Guard)
- **OpenCode dual-support** (`.opencode/` directory alongside `.claude/`)
- **Proprietary license** (Apache 2.0 → proprietary in Pro)

### 2.2 Architecture at a Glance

```
AIfred-Pro Architecture (v3.1.0)
═══════════════════════════════════════════════════════════

Entry Points:
  Claude Code Session | Claude App | Nexus Jobs | CLI | Telegram

Configuration Layer:
  Profiles (general → homelab → development → production)
  ├── Merge strategy: last-wins hooks, union patterns/skills, deny-precedence permissions
  └── Output: settings.json + profile-config.json

Hook Layer (28 active):
  SessionStart → session-start.js (hard gate, context setup)
  UserPromptSubmit → prompt-dispatcher.js, skill-router.js, orchestration-detector.js
  PreToolUse → audit-logger, secret-scanner, branch-protection, document-guard
  PostToolUse → file-access-tracker, commit-tracker, doc-sync, memory-maintenance
  Stop → session-stop.js
  SubagentStop → subagent-dispatcher.js (metrics + chaining)

Capability Layer:
  63 Commands | 11 Skills | 17 Agents (including 7 job personas)

Automation Layer (Nexus):
  Dispatcher (cron 5m) → Executor (persona-aware) → Team Runner (multi-agent consensus)
  └── Message Bus (SQLite) → Telegram Relay (DND-aware)

Data Layer:
  Pulse (PostgreSQL) | paths-registry.yaml | context files | knowledge/
```

### 2.3 Key Innovations Worth Noting

**a) Profile Composability**: Stacked YAML layers with merge semantics. A `homelab.yaml` profile adds Docker hooks and NAS monitoring; a `development.yaml` adds code project registration and CI/CD skills. Profiles determine what hooks, permissions, patterns, and agents are active. Jarvis has no equivalent — our configuration is monolithic in `settings.json`.

**b) Hard Gate Pattern**: CLAUDE.md includes a gate that blocks ALL work until infrastructure prerequisites pass (Docker running, Pulse healthy, setup tasks complete). This is aggressive but effective for ensuring operational readiness. Jarvis's AC-01 is advisory, not blocking.

**c) Document Guard (4-tier)**: A 27.9KB hook that classifies files into protection tiers (critical/high/medium/low) with 7 check types including section preservation, frontmatter validation, and optional semantic validation via Ollama. Jarvis has no file protection hooks — we rely on CLAUDE.md guardrails.

**d) Self-Bootstrapping Setup**: A `bootstrap.sh` script that creates the entire directory structure, deploys Pulse via Docker, imports a 27-task setup plan, registers the dispatcher cron, and hardens `.gitignore`. From zero to operational in one script. Jarvis's setup is manual via `launch-jarvis-tmux.sh`.

**e) Team Runner (Multi-Agent Consensus)**: A Python script (934 lines) that runs multiple agents in parallel, scores their output by agreement/confidence/authority, and escalates disagreements to a human. Jarvis has no equivalent — our agents run independently.

---

## 3. Nexus Deep Review

### 3.1 What Nexus Is

Nexus is **not a single component** — it's the name for AIfred's entire autonomous operations platform. It's the combination of:

1. **Dispatcher** (`dispatcher.sh`, 1,028 lines) — The only cron job. Runs every 5 minutes. Evaluates schedules, pre-check gates, and budget constraints. If nothing is due, no AI cost is incurred.

2. **Executor** (`executor.sh`, 1,027 lines) — Per-job execution engine. Loads persona (prompt + permissions + config), resolves execution engine (Claude Code or Ollama), runs the job, extracts results, and publishes to the message bus.

3. **Personas** (7 defined, 3 safety tiers) — Investigator (read-only), Analyst (read+write data), Troubleshooter (diagnose+fix). Each persona has explicit permission boundaries. No job gets more access than it needs.

4. **Team Runner** (`team-runner.py`, 934 lines) — Multi-agent consensus for high-stakes decisions. Runs N agents in parallel, compares outputs, and escalates disagreements.

5. **Message Bus** (`msgbus.sh`) — SQLite-backed event store. Append-only. Drives Telegram notifications via `msg-relay.sh` with DND-aware delivery (quiet hours: 10 PM-7 AM weekdays, 11 PM-9 AM weekends).

6. **AI David** — An autonomous persona that processes the `waiting:david` queue. Reads documented patterns, past decisions, and project conventions. Makes decisions with confidence/risk scoring. First run: 15 tasks processed, 15 agreed, 4 adjusted, 0 wrong.

### 3.2 The Job Registry

Jobs are defined in `registry.yaml` with schedule, persona, budget, pre-check, and prompt fields:

**Task Generators** (create work):
| Job | Frequency | Purpose |
|-----|-----------|---------|
| Health Summary | 6h | Docker container health → infra tasks |
| ABS Librarian | 6h | AudioBookShelf scanning → rename/restructure tasks |
| Backup Validate | Daily | Restic backup verification → alert tasks |
| Docker Cleanup | Weekly | Stale container identification → cleanup tasks |
| Threat Intel | Weekly | Security intelligence → research notes |
| Upgrade Discover | Daily | Claude Code/MCP update detection → upgrade tasks |
| Doc Sync Check | Daily | Documentation drift detection → sync tasks |

**Pipeline Jobs** (route and execute):
| Job | Frequency | Purpose |
|-----|-----------|---------|
| Task Evaluator | 8h | Score tasks, stamp `auto:` + `risk:` labels |
| Task Investigator | 4h | Promote `auto:candidate` → `auto:ready` |
| Task Executor | 8h | Execute `auto:ready` + `risk:safe` autonomously |
| Task Research | 6h | Run `type:research` tasks → Obsidian output |
| AI David | 2h | Triage `waiting:david` queue with learned patterns |
| Infra Deployer | Daily 10pm | Docker/compose deployments |

**Aurora (Creative Surprise System)**:
| Job | Frequency | Purpose |
|-----|-----------|---------|
| Think | 4h | Generate creative ideas |
| Build | Daily 2am | Build approved projects in isolated worktrees |
| Present | Daily 6am | Deliver finished surprises via Telegram |
| Feedback | Daily 9pm | Process reactions, update labels |

### 3.3 Design Principles Analysis

Nexus's 7 design principles reveal a mature operational philosophy:

1. **Single entry point**: One cron job. This eliminates the "crontab sprawl" problem. Jarvis's Aion Quartet has 4+ persistent processes instead — more complex but more responsive.

2. **Persona isolation**: Every job runs with explicit permissions. This is more granular than Jarvis's approach (all agents share the same permission set from `settings.json`).

3. **Pre-check gates**: Bash gates before LLM invocation. If nothing changed, no cost. This is the key insight Jarvis lacks — our AC components don't have cost-aware gating.

4. **Human-in-the-loop**: Critical actions require approval via Telegram. Jarvis has confirmation gates in AC-06/AC-10 but no asynchronous approval channel.

5. **Label-driven lifecycle**: Tasks move through stages via labels, not manual status changes. This is more sophisticated than Jarvis's TodoWrite/session-state approach.

6. **External watchdog**: 15-minute Telegram alerts if dispatcher stalls. Jarvis's Ennoia serves a similar role but is tmux-bound.

7. **Learn, don't repeat**: Feedback captured and applied. AI David reads updated patterns on next run. Similar to Jarvis's AC-05 reflection but with a tighter feedback loop.

### 3.4 Safety Rails

The safety architecture is well-considered:
- 10-task execution cap per run (prevents runaway)
- Git stash before file operations (reversible)
- 3-minute timeout per task execution
- Structured JSON audit trail for every decision
- DND-aware notifications
- Relay watchdog for message delivery stalls

**Comparison to Jarvis**: Jarvis has equivalent safety rails (CLAUDE.md guardrails, AC-10 Ulfhedthnar with auto-disengage, confirmation gates for destructive ops) but they're embedded in Claude's context rather than enforced by external scripts. AIfred's approach of enforcing safety in bash (before LLM invocation) is more robust because it can't be "forgotten" across context clears.

### 3.5 Key Numbers (Production Metrics)

| Metric | Value | Significance |
|--------|-------|-------------|
| Total tasks tracked | ~494 | Substantial real-world usage |
| Tasks closed | ~437 | 88.5% completion rate |
| Audit events | ~6,977 | Rich observability data |
| Registered personas | 13 | Mature role separation |
| Background jobs | 15+ | Comprehensive automation |
| Dashboard pages | 23 | Full-featured UI |
| Labels in taxonomy | 60+ across 14 categories | Sophisticated categorization |
| AI David first run | 15/15 agreed, 4 adjusted, 0 wrong | Well-calibrated decision engine |

---

## 4. Pulse — Task Management System

### 4.1 What Pulse Is

Pulse is AIfred's task management system, evolved from Beads (git-native JSONL) to a proper PostgreSQL-backed service. It provides:

- **REST API** on port 8700 (health-checked, Docker Compose deployed)
- **PostgreSQL** storage (persistent volumes, alpine image)
- **CLI** (`pulse list/create/update/close/ready`)
- **Label taxonomy** (60+ labels across 14 categories, YAML-defined)
- **Routing rules** (YAML-defined automation routing tied to labels)
- **Dashboard** (React + TypeScript + Fastify at `tasks.theklyx.space`, 23 pages)

### 4.2 Label Architecture (The Heart of Pulse)

The label system is the most architecturally significant innovation. Labels serve dual roles:

**Execution Labels** (control what happens):
| Category | Examples | Purpose |
|----------|----------|---------|
| `auto:` | ready, candidate, blocked | Automation readiness |
| `risk:` | safe, moderate, destructive | Reversibility assessment |
| `pipeline:` | evaluated, approved, needs-approval | Pipeline stage tracking |
| `waiting:` | david, external | Blocking factor |
| `action:` | rename-safe, restructure, delete-junk | Operation type |
| `aurora:` | building, delivered, approved | Creative pipeline stage |
| `review:` | pending | Review queue status |

**Context Labels** (categorize and filter):
| Category | Examples | Purpose |
|----------|----------|---------|
| `domain:` | infrastructure, coding, creative, security | Work discipline |
| `project:` | aiprojects, aurora, beads-dashboard | Owning project |
| `source:` | session, headless, claude-code | Origin tracking |
| `type:` | research, bug, feature | Task classification |
| `capability:` | file-ops, code, research | Required tooling |
| `severity:` | high, medium, low | Impact level |
| `agent:` | claude, ai-david | Creator tracking |

**Execution Matrix**:
```
auto:ready + risk:safe        → Execute autonomously (no human)
auto:ready + risk:moderate    → Individual approval required
auto:ready + risk:destructive → Manual only
auto:candidate                → Investigation phase (evaluator assesses)
```

### 4.3 How Pulse Could Serve Project Aion

Pulse's label-driven task management is more sophisticated than anything Jarvis currently has. Our options:

**Option A: Adopt Pulse as the unified task backend**
- Replace TodoWrite + session-state tracking with Pulse API calls
- Each Archon writes to and reads from the same Pulse instance
- Dashboard provides cross-Archon visibility
- Labels naturally encode which Archon owns which task

**Option B: Build a Jarvis-native equivalent**
- Create a Jarvis-specific task system using our existing PostgreSQL
- Port the label taxonomy concept
- Build MCP tools for task CRUD
- Skip the dashboard (Jarvis is CLI-native)

**Option C: Federation — Pulse for ops, Jarvis internals for work**
- Pulse handles infrastructure tasks, health checks, maintenance
- Jarvis keeps TodoWrite for in-session task tracking
- Bridge: completed Pulse tasks automatically update session-state.md

**Recommendation**: **Option A** (Adopt Pulse) is highest value. The infrastructure already exists, the label taxonomy is well-designed, and having a single task backend across all Archons is the right architectural choice for multi-agent coordination.

---

## 5. Loom — Local LLM & Content Generation (Speculative)

Dave O'Neil has indicated Loom will be "a delivery system for local LLM handling and content generation." Based on AIfred's existing patterns and infrastructure, here's what Loom likely entails and how it could be built.

### 5.1 What Loom Probably Is

Based on AIfred's existing components and the gap analysis:

**Existing LLM infrastructure in AIfred:**
- Ollama integration via `fabric` skill (analyze-logs, commit-msg, review-code)
- `ollama-manager` agent for model lifecycle
- Executor engine routing (Claude Code OR Ollama per job)
- Cost tracking for API calls

**What's missing** (and what Loom would fill):
- Model selection intelligence (which model for which task)
- Content generation pipelines (research → draft → review → publish)
- Quality scoring and iteration loops
- Output delivery (Obsidian, filesystem, Telegram, dashboard)
- Template management (prompt templates, output format specs)
- Cost optimization (local vs API based on task complexity)

### 5.2 Speculative Loom Architecture

```
Loom — Content Generation Delivery System
═══════════════════════════════════════════

Input Layer:
  Task (from Pulse) → Content Request
  ├── type: research-note | blog-post | code-review | summary | creative
  ├── model-hint: local-fast | local-quality | api-smart | auto
  └── delivery: obsidian | file | telegram | dashboard

Model Router:
  ├── Task complexity scoring (token estimate, domain, quality requirement)
  ├── Model selection matrix:
  │   ├── Simple (summaries, formatting): Qwen3-8B (local, ~0.25s)
  │   ├── Medium (analysis, research notes): Qwen3-30B or Mistral (local, ~2-5s)
  │   ├── Complex (architecture, creative): Claude API (Sonnet/Opus)
  │   └── Embeddings: Qwen3-Embedding-4B (MLX, local)
  └── Cost tracking per generation

Generation Pipeline:
  ├── Template resolution (prompt templates per content type)
  ├── Context assembly (pull relevant context from Pulse, files, knowledge/)
  ├── Generation (selected model)
  ├── Quality scoring (automated: coherence, completeness, factuality)
  ├── Iteration loop (if score < threshold, re-generate with feedback)
  └── Output formatting (markdown, HTML, structured data)

Delivery Layer:
  ├── Obsidian vault (research notes, knowledge articles)
  ├── Filesystem (reports, documentation)
  ├── Telegram (summaries, alerts, creative surprises for Aurora)
  ├── Dashboard (rendered in Pulse UI)
  └── Git commit (auto-commit generated content)

Learning Layer:
  ├── Generation quality tracking (model × task-type → success rate)
  ├── Cost optimization (local vs API cost/quality tradeoff)
  └── Template evolution (which prompts produce best results)
```

### 5.3 How Loom Maps to Jarvis's Existing Infrastructure

Jarvis already has several Loom-equivalent components:

| Loom Concept | Jarvis Equivalent | Gap |
|-------------|------------------|-----|
| Model routing | capability-map.yaml (opus/sonnet/haiku tiers) | No local model routing |
| Local LLM | MLX Embed (Qwen3-4B), Ollama (Qwen3:8b), LiteLLM proxy | No unified routing layer |
| Content generation | AC-05 reflection, research-ops skill | No pipeline/template system |
| Quality scoring | Wiggum Loop (AC-02) | Manual, not automated scoring |
| Delivery | session-state.md, git commits | No multi-channel delivery |
| Learning | AC-05/AC-06 (reflection → evolution) | Slower loop than Loom envisions |

**Integration opportunity**: Jarvis could provide the **local LLM infrastructure** (MLX, Ollama, LiteLLM) while Loom provides the **pipeline and delivery logic**. This is a natural split — Jarvis runs on a Mac Studio with GPU; AIfred's Loom manages what to generate and where to send it.

### 5.4 Building Loom — Key Design Decisions

If we were to build Loom for the Aion ecosystem:

1. **Model registry**: YAML file mapping task types to model preferences with fallback chains. Similar to `capability-map.yaml` but for generation tasks rather than Claude tool selection.

2. **Template system**: Markdown templates with variable interpolation for each content type. Stored in `loom/templates/`. Each template specifies: required context, model preference, output format, quality threshold.

3. **Quality scoring**: Automated evaluation using a fast local model (Qwen3-8B) to score generated content on dimensions like coherence, completeness, and task-alignment. Score < threshold triggers re-generation.

4. **Delivery plugins**: Modular output handlers. Start with filesystem and Obsidian. Add Telegram, dashboard, and email as needed.

5. **Cost tracking**: Per-generation cost logging with model × task-type aggregation. Enables data-driven model selection optimization.

---

## 6. Jarvis vs AIfred: Capability Comparison

### 6.1 Comprehensive Feature Matrix

| Capability | Jarvis | AIfred-Pro | Winner | Notes |
|-----------|--------|-----------|--------|-------|
| **Session Persistence** | Excellent — JICM v6.1, 4-tier memory, compression/resume | Basic — session-state.md + Pulse | Jarvis | JICM is years ahead |
| **Context Management** | JICM (55/73% thresholds), external watcher, dual-mechanism resume | Pre-compact hook, compaction-essentials.md | Jarvis | AIfred has no context watcher |
| **Memory Hierarchy** | 4-tier: scratchpad, MEMORY.md, Qdrant, Graphiti | Context files + Memory MCP (shadowed) | Jarvis | Vector+graph DB vs flat files |
| **Task Management** | TodoWrite (in-session only) | Pulse (PostgreSQL, REST API, 60+ labels, dashboard) | AIfred | Pulse is production-grade |
| **Headless Automation** | Aion Quartet (tmux, signal files, persistent) | Nexus (cron, personas, stateless, cost-gated) | Tie | Different paradigms, both valid |
| **Approval Workflow** | AC-06 gates (in-session, synchronous) | Telegram inline keyboards (async, any-time) | AIfred | Async approval is more practical |
| **Observability** | JICM watcher log, Virgil task tracking | JSON audit trail, Prometheus metrics, 23-page dashboard | AIfred | Dashboard is a big advantage |
| **Security Guards** | CLAUDE.md guardrails only | 3-layer (Document/Credential/Persona guards) | AIfred | Hook-enforced vs prompt-enforced |
| **Self-Improvement** | AC-05/06/07/08 (reflection/evolution/R&D/maintenance) | Upgrade skill, feedback learning (AI David) | Jarvis | More systematic improvement cycle |
| **Project-Specific Work** | Deep (Chronicler: bridge, ETL, watcher, UI) | Shallow (hub orchestration, not deep coding) | Jarvis | Jarvis is a builder, AIfred is a coordinator |
| **Multi-Agent Coordination** | Independent agents, no consensus | Team Runner (parallel, consensus scoring) | AIfred | Consensus is novel |
| **Test Infrastructure** | Wiggum Loop (in-session) + dev-ops (W5→W0) | TAP structural tests + bats functional tests + CI | AIfred | External tests catch more |
| **Identity/Persona** | Rich (Psyche, autopoietic paradigm, valedictions) | Minimal (pragmatic assistant) | Jarvis | Jarvis has genuine personality |
| **Patterns Library** | 51 patterns (comprehensive) | 18+ patterns (practical) | Jarvis | More patterns, though some may be stale |
| **Setup Automation** | launch-jarvis-tmux.sh (manual) | bootstrap.sh + 27-task plan (self-operationalizing) | AIfred | Bootstrap is more comprehensive |
| **Profile/Environment** | None (monolithic config) | Composable YAML profiles (4 layers) | AIfred | Profiles are architecturally clean |

### 6.2 Philosophical Differences

| Dimension | Jarvis | AIfred |
|-----------|--------|--------|
| **Identity** | Autopoietic entity with Psyche | Pragmatic infrastructure tool |
| **Session model** | Persistent tmux with context continuity | Ephemeral Claude Code invocations |
| **Automation model** | Always-on tmux scripts + signal files | Cron-driven, cost-gated, stateless |
| **Safety model** | Prompt-based guardrails in CLAUDE.md | Script-enforced guards (hooks) |
| **Growth model** | Self-referential (AC-05→06→07→08 cycle) | Pattern learning (AI David feedback loop) |
| **Communication** | In-session only (tmux send-keys) | Async (Telegram, dashboard, email) |
| **Scope** | Deep single-project focus | Broad multi-project coordination |

---

## 7. Project Aion Integration Vision

### 7.1 The Multi-Archon Model

The vision is to create a **federation of specialized Archons** operating under the Aion umbrella, each with distinct capabilities and domains:

```
Project Aion — Multi-Archon Federation
═══════════════════════════════════════════════════════════════

                    ┌─────────────────────┐
                    │    User (Nathaniel)  │
                    │  Telegram / CLI /    │
                    │  Dashboard / tmux    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │      NEXUS          │
                    │  (Orchestration      │
                    │   Bus + Pulse)       │
                    └──┬──────┬───────┬───┘
                       │      │       │
          ┌────────────▼┐  ┌──▼────┐  ┌▼──────────────┐
          │   JARVIS    │  │AIFRED │  │  Future        │
          │   (Master   │  │(Ops   │  │  Archons       │
          │   Archon)   │  │Archon)│  │  (Sentinel,    │
          │             │  │       │  │   Scholar,     │
          │  Deep work: │  │Always │  │   Artificer)   │
          │  coding,    │  │on:    │  │                │
          │  analysis,  │  │health,│  │                │
          │  projects   │  │tasks, │  │                │
          │             │  │maint  │  │                │
          └──────┬──────┘  └───┬───┘  └───────┬────────┘
                 │             │              │
          ┌──────▼─────────────▼──────────────▼────────┐
          │              SHARED INFRASTRUCTURE          │
          │  PostgreSQL | Qdrant | Neo4j | Redis | MLX  │
          │  Pulse API | Ollama | LiteLLM | tmux       │
          └────────────────────────────────────────────┘
```

### 7.2 Archon Roles

**Jarvis — Master Archon (existing)**
- Deep collaborative coding sessions
- Context-managed persistent work (JICM)
- Memory hierarchy (4-tier: scratchpad → MEMORY.md → Qdrant → Graphiti)
- Project-specific expertise (Chronicler, future projects)
- Self-improvement cycle (AC-05/06/07/08)
- Personality and relationship continuity

**AIfred — Operations Archon (to be integrated)**
- Always-on infrastructure monitoring (Nexus dispatcher)
- Task lifecycle management (Pulse)
- Headless automation (personas, cost-gated execution)
- Async approval workflows (Telegram)
- Multi-project coordination
- Observability dashboard

**Sentinel — Security Archon (future)**
- Continuous security scanning (threat intel, vulnerability monitoring)
- Document and credential guard enforcement
- Access control and audit trail analysis
- Backup validation and disaster recovery readiness
- Based on AIfred's existing security hooks + expanded scope

**Scholar — Research Archon (future)**
- Deep research with citation tracking
- Knowledge graph maintenance (Graphiti ingestion)
- RAG collection curation and freshness auditing
- Loom content generation pipeline
- Academic paper analysis, technical report synthesis

**Artificer — Deployment Archon (future)**
- Docker service lifecycle management
- VM orchestration (UTM, remote servers)
- CI/CD pipeline management
- Infrastructure provisioning and scaling
- Based on AIfred's Infra Deployer persona + Jarvis's docker-deployer agent

### 7.3 Communication Protocol

Archons communicate through shared infrastructure, not direct message passing:

```
Communication Channels:
  1. Pulse API     — Task creation, status updates, label changes
  2. Signal files  — Real-time coordination (.claude/context/ flags)
  3. PostgreSQL    — Shared state (Pulse DB, Chronicler DB, Jarvis DB)
  4. Neo4j         — Knowledge graph (shared group_id per Archon)
  5. Qdrant        — Semantic search (shared collections)
  6. Telegram      — Async human notification and approval
  7. tmux          — Direct keystroke injection (Jarvis Aion Quartet)

Arbitration:
  - Pulse labels determine ownership (agent:jarvis, agent:aifred, etc.)
  - Conflicting writes to shared state resolved by timestamp (last writer wins)
  - Destructive operations require human approval regardless of Archon
  - Nexus dispatcher is the scheduling authority for headless jobs
  - Jarvis retains primacy for interactive sessions
```

### 7.4 Shared Infrastructure Plan

Current infrastructure that should be shared:

| Service | Current Owner | Shared Access |
|---------|--------------|---------------|
| PostgreSQL (5432) | Jarvis (Docker) | Add Pulse DB alongside Chronicler DB |
| Qdrant (6333) | Jarvis (Docker) | Shared collections with namespace prefix |
| Neo4j (7474) | Jarvis (Docker) | Shared graph with group_id per Archon |
| Redis (6379) | Jarvis (Docker) | Shared with key prefix per Archon |
| MLX Embed (8000) | Jarvis (tmux) | Shared embedding service |
| Ollama (11434) | Jarvis (host) | Shared model server |
| LiteLLM (4000) | Jarvis (host) | Shared proxy for model routing |
| Pulse API (8700) | AIfred (Docker) | New — deployed alongside Jarvis infra |
| n8n (5678) | Jarvis (Docker) | Shared workflow engine |

**Key decision**: Deploy Pulse's PostgreSQL inside Jarvis's existing Docker Compose stack (as a separate database on the same PostgreSQL instance) rather than running a second PostgreSQL container. This saves resources and simplifies networking.

---

## 8. Multi-Archon Architecture

### 8.1 Integration Phases

**Phase 0: Foundation (Current Session)**
- Clone AIfred-Pro (DONE: `/Users/nathanielcannon/Claude/AIFred-Pro`)
- Deep analysis (DONE: this document)
- Strategic alignment with user

**Phase 1: Infrastructure Merge**
- Deploy Pulse alongside Jarvis's Docker stack
- Create `pulse` database on existing PostgreSQL
- Configure Pulse API (port 8700)
- Import label taxonomy
- Validate health checks

**Phase 2: Nexus Activation**
- Adapt dispatcher.sh for Mac Studio environment
- Create Jarvis-specific personas (jarvis-investigator, jarvis-maintainer)
- Register initial jobs (health summary, backup validate, doc sync)
- Set up Telegram bot for async notifications
- Configure DND-aware scheduling

**Phase 3: Task Unification**
- Create Pulse MCP server (6 tools: list, create, update, close, ready, search)
- Wire Jarvis's session-state updates to create/update Pulse tasks
- Label Jarvis tasks with `agent:jarvis` and appropriate domain/project labels
- Dashboard access for cross-Archon visibility

**Phase 4: Archon Protocol**
- Define Archon communication protocol (Pulse-mediated)
- Implement Archon identity system (extend Psyche for multi-Archon)
- Create shared knowledge graph schema (group_id per Archon)
- Build Archon handoff protocol (task delegation between Archons)

**Phase 5: Loom Integration**
- Build model routing layer (local vs API selection)
- Create content generation templates
- Implement quality scoring pipeline
- Deploy delivery plugins (filesystem, Obsidian, Telegram)

**Phase 6: Additional Archons**
- Sentinel (security) — Extract from AIfred's security hooks + expand
- Scholar (research) — Build on Jarvis's research-ops skill + Loom
- Artificer (deployment) — Build on AIfred's Infra Deployer + Jarvis's docker-deployer

### 8.2 What Changes in Jarvis

To accommodate the multi-Archon model, Jarvis needs:

1. **Pulse MCP server**: New MCP providing task CRUD operations against the Pulse API
2. **Archon identity extension**: `psyche/` gains multi-Archon awareness (know what other Archons exist and their capabilities)
3. **Task delegation pattern**: New pattern for when to delegate tasks to other Archons vs handle internally
4. **Shared memory namespace**: Qdrant collections and Graphiti group_ids prefixed per Archon
5. **Nexus job for Jarvis**: A Nexus persona that can invoke Jarvis for scheduled deep-work sessions
6. **Dashboard integration**: Session state and work progress visible in Pulse dashboard

### 8.3 What Changes in AIfred

To become the Operations Archon:

1. **Mac Studio adaptation**: Profiles tuned for Mac Studio hardware (not generic homelab)
2. **Shared PostgreSQL**: Use Jarvis's existing PostgreSQL instance instead of deploying a new one
3. **Identity**: Adopt Archon identity framework (Nous/Pneuma/Soma layering, though simpler than Jarvis)
4. **Knowledge sharing**: Write to shared Qdrant collections and Neo4j graph
5. **Jarvis-aware scheduling**: Nexus dispatcher knows when Jarvis is in a deep work session and avoids interruption
6. **Pulse as shared bus**: All Archons read/write to the same Pulse instance

---

## 9. Implementation Roadmap

### Phase 1: Infrastructure Merge (Estimated: 1-2 sessions)

| Task | Description | Complexity |
|------|-------------|-----------|
| 1.1 | Add `pulse` database to existing PostgreSQL container | Low |
| 1.2 | Deploy Pulse API container (port 8700) | Medium |
| 1.3 | Import label taxonomy from AIfred-Pro | Low |
| 1.4 | Validate Pulse health endpoint | Low |
| 1.5 | Update `infrastructure/docker-compose.yml` | Medium |
| 1.6 | Create Pulse MCP server (FastMCP, 6 tools) | Medium |
| 1.7 | Register Pulse MCP in `.mcp.json` | Low |

### Phase 2: Nexus Activation (Estimated: 2-3 sessions)

| Task | Description | Complexity |
|------|-------------|-----------|
| 2.1 | Adapt `dispatcher.sh` for Mac Studio (paths, bash 3.2) | Medium |
| 2.2 | Create Mac Studio-specific personas | Medium |
| 2.3 | Set up Telegram bot (token, chat ID) | Low |
| 2.4 | Register initial jobs (health, backup, doc sync) | Medium |
| 2.5 | Configure DND-aware scheduling | Low |
| 2.6 | Integrate dispatcher with Jarvis tmux session | Medium |
| 2.7 | Validate end-to-end: job → execution → notification | High |

### Phase 3: Task Unification (Estimated: 2 sessions)

| Task | Description | Complexity |
|------|-------------|-----------|
| 3.1 | Create Pulse MCP tools (list/create/update/close/ready/search) | Medium |
| 3.2 | Wire AC-01 session-start to create Pulse session task | Medium |
| 3.3 | Wire AC-09 session-end to close Pulse session task | Medium |
| 3.4 | Label schema for Jarvis tasks (agent:jarvis, project:chronicler) | Low |
| 3.5 | Bridge: TodoWrite → Pulse task creation | High |
| 3.6 | Dashboard access validation | Low |

### Phase 4-6: Deferred to future planning sessions

---

## 10. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|-----------|
| Bash 3.2 incompatibility with AIfred scripts | Dispatcher/executor fail | Medium | AIfred requires bash 4.0+; need to install bash 4+ via Homebrew or rewrite scripts |
| PostgreSQL port conflict | Deployment failure | Low | Use existing Jarvis PostgreSQL with separate database |
| Pulse API version incompatibility | Task operations fail | Low | Pin Pulse container version; test before upgrade |
| Context budget increase from Pulse MCP | JICM triggers more often | Medium | Pulse MCP tools should be on-demand (Tier 2 in MCP loading strategy) |
| Architectural overengineering | Complexity without benefit | Medium | Start minimal (Phase 1 only), validate before expanding |
| Telegram bot security | Unauthorized command execution | Low | Bot token in .claude/secrets/; restrict to known chat IDs |
| Nexus cron conflicting with Jarvis tmux | Resource contention | Medium | Nexus jobs run in separate worktrees; Jarvis tmux has priority |

---

## Appendix A: Repository Locations

| Repo | Path | Version | Purpose |
|------|------|---------|---------|
| Jarvis | `/Users/nathanielcannon/Claude/Jarvis` | v5.11.0 | Master Archon (this repo) |
| AIfred (baseline) | `/Users/nathanielcannon/Claude/AIfred` | v3.0.0 | Open-source baseline (read-only) |
| AIfred-Pro | `/Users/nathanielcannon/Claude/AIFred-Pro` | v3.1.0 | Extended version for integration |
| DwarfCron | `/Users/nathanielcannon/Claude/Projects/DwarfCron` | — | Chronicler product code |

## Appendix B: Key Files for Integration

| File | Repo | Purpose |
|------|------|---------|
| `docker-compose.yml` | AIfred-Pro | Pulse + PostgreSQL deployment |
| `.claude/jobs/dispatcher.sh` | AIfred-Pro | Nexus job scheduler |
| `.claude/jobs/executor.sh` | AIfred-Pro | Persona-aware job runner |
| `.claude/jobs/registry.yaml` | AIfred-Pro | Job definitions |
| `.claude/context/tools/label-taxonomy.yaml` | AIfred-Pro | Label system spec |
| `.claude/jobs/lib/routing-rules.yaml` | AIfred-Pro | Automation routing |
| `scripts/bootstrap.sh` | AIfred-Pro | Self-setup automation |
| `.claude/hooks/lib/shared.js` | AIfred-Pro | Hook shared utilities |
| `profiles/schema.yaml` | AIfred-Pro | Profile composability spec |

---

*AIfred + Nexus Deep Analysis — Project Aion Strategic Report*
*Generated 2026-03-28 by W5:Jarvis-dev*
