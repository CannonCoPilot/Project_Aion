# AIFred-Pro Architecture Report: Context & Knowledge Layer

**Report**: 02 of 10
**Scope**: `.claude/context/` (11 files) + `knowledge/` (5 files) = 16 files
**Date**: 2026-04-23
**Repository**: `/Users/nathanielcannon/Claude/AIFred-Pro/`

---

## Overview

AIFred-Pro employs a two-tier knowledge system that reflects its dual heritage: an original AIFred v3.2.0 baseline and a Jarvis integration overlay.

- **`.claude/context/`** (11 files): Operational knowledge added during the Jarvis integration session of 2026-03-28. Contains session state, priorities, patterns, infrastructure maps, and API references. This is the active operational layer -- what AIFred-Pro needs to function as an Operations Archon within the multi-Archon ecosystem.

- **`knowledge/`** (5 files): Original AIFred v3.2.0 persona and capability definitions carried forward from the baseline fork. These define the generic personality and tooling inventory. The Operations Archon role definition in `.claude/context/project-context.md` supersedes the generic persona described here.

---

## .claude/context/ Files

### _index.md -- Navigation Hub

Central navigation file mapping needs to files. Explains the relationship between `knowledge/` (original persona definitions) and `.claude/context/` (operational patterns added during integration). Serves as the entry point for any agent or session needing to orient within the knowledge layer.

### session-state.md -- Current Work Status

| Field | Value |
|-------|-------|
| Status | INITIAL INTEGRATION -- Jarvis sync complete, Pulse API operational |
| Last session | 2026-03-28 |

**Accomplished during integration**:
- 47 shebang fixes (`#!/bin/bash` to `#!/usr/bin/env bash`)
- 25 `grep -oP` fixes (PCRE to POSIX sed equivalents)
- Pulse API built and deployed
- Pulse MCP registered (6 tools)
- 4 operational patterns created

**Known issues at session end**:
- Telegram bot needs token and chat_id configuration
- Nexus dispatcher untested end-to-end
- `shared.js` hook library not ported
- `scan-secrets.sh` not ported

### current-priorities.md -- Active Task Queue

| Priority | Tasks |
|----------|-------|
| **P0** | None |
| **P1** | Telegram bot configuration, Nexus dispatcher E2E test, Nexus persona validation (24 personas) |
| **P2** | `shared.js` port, `scan-secrets.sh` port, health check automation |
| **P3** | Pulse dashboard UI, multi-Archon task routing, Nexus job history |

### project-context.md -- Project Identity

Defines AIFred-Pro's identity as the Operations Archon within the multi-Archon architecture.

| Property | Value |
|----------|-------|
| Role | Operations Archon |
| Version | v3.2.0 |
| Origin | Forked from AIFred baseline |

**Components**:

| Component | Location | Purpose |
|-----------|----------|---------|
| Nexus | `.claude/jobs/` | Job scheduler -- cron-based dispatcher every 5 min, SQLite state at `.claude/jobs/state/jobs.db`, callback 5 min, watchdog 15 min |
| Pulse | `pulse/` | Task API -- FastAPI on port 8700, PostgreSQL backend |
| Personas | (24 specialized) | Job definitions for Nexus dispatcher |
| Hooks | `.claude/hooks/` | Event-triggered behaviors |
| Knowledge | `knowledge/` | Original persona and capability definitions |

**Multi-Archon topology**:
- Jarvis = Master Archon (development, architecture, self-improvement)
- AIFred-Pro = Operations Archon (infrastructure health, headless jobs, task routing)

**Integration status**: Pulse API and MCP operational. Telegram needs credential configuration. Docker health monitoring and Pulse callbacks planned but not implemented.

### system-map.md -- Infrastructure Topology

Provides an ASCII infrastructure diagram of the Mac Studio host environment:

```
Mac Studio Host
  |
  +-- AIFred-Pro Services
  |     +-- Nexus Dispatcher (cron, 5 min)
  |     +-- Nexus Callback (cron, 5 min)
  |     +-- Nexus Watchdog (cron, 15 min)
  |     +-- Pulse API (:8700)
  |
  +-- Shared Docker Infrastructure
        +-- PostgreSQL (:5432)
        +-- Qdrant (:6333/:6334)
        +-- Neo4j (:7474/:7687)
        +-- Redis (:6379)
        +-- n8n (:5678)
```

Documents 15 key filesystem paths, 10 network ports, and 4 credential locations. Includes cron schedule reference (Dispatcher 5 min, Callback 5 min, Watchdog 15 min).

### patterns/_index.md

Index of 4 operational patterns:

| Pattern | Strictness |
|---------|------------|
| `automation-routing-pattern.md` | ALWAYS |
| `clarification-pattern.md` | ALWAYS |
| `health-check-pattern.md` | Recommended |
| `pulse-task-pattern.md` | Recommended |

### patterns/automation-routing-pattern.md

Decision tree for routing incoming tasks across the multi-Archon system:

| Route to | Task types |
|----------|------------|
| **AIFred-Pro** | Docker health, service restarts, log inspection, cron management, system status, file operations |
| **Jarvis** | Code development, architecture, planning, self-improvement, complex implementations |
| **Shared** | DB maintenance, credential rotation, infrastructure upgrades |

### patterns/clarification-pattern.md

Core principle: "Ask when the cost of being wrong is high. Assume when the cost of asking is high."

**ASK before proceeding**:
- Destructive operations
- Irreversible changes
- Ambiguous scope
- Cross-Archon impact
- Security-sensitive actions
- Cost-bearing decisions

**ASSUME and proceed**:
- Read-only operations
- Idempotent actions
- Standard procedures
- Low-risk defaults
- Time-sensitive tasks

**Escalation protocol**: Create a P1 Pulse task in blocked state, send Telegram notification, and do NOT proceed with destructive operations.

### patterns/health-check-pattern.md

Three-tier health check hierarchy:

**Docker checks (5)**:
- PostgreSQL: `pg_isready`
- Qdrant: `/healthz`
- Neo4j: HTTP endpoint
- Redis: `ping`
- n8n: `/healthz`

**AIFred-Pro checks (3)**:
- Pulse: `/health` endpoint
- Nexus dispatcher: last run < 10 min ago
- Watchdog: last run < 20 min ago

**Jarvis checks (2, read-only)**:
- MLX Embed on `:8000`
- LiteLLM on `:4000`

**Severity mapping**: Green = log only, Yellow = log + notify, Red = log + alert + create Pulse task.

### patterns/pulse-task-pattern.md

Task lifecycle and conventions:

**Lifecycle**: Created -> Open -> In Progress -> [Blocked] -> Completed/Cancelled

**Priority levels**:

| Priority | Meaning |
|----------|---------|
| P0 | Immediate |
| P1 | This session |
| P2 | Next session |
| P3 | When available |

**Required label**: `agent:aifred`, `agent:jarvis`, or `agent:shared`
**Optional label**: `category:infra`, `category:dev`, `category:ops`, `category:maintenance`

### reference/pulse-reference.md

Full REST API reference for the Pulse task management service. Documents 7 endpoints with methods, paths, parameters, and response formats. Includes the database schema (tasks table with 12 columns and 3 indexes) and start commands for foreground, background, and health check modes.

---

## knowledge/ Files

### SUMMARY.md

Brief index pointing to the 4 knowledge definition files below.

### persona.md

Original AIFred identity specification. Name origin: "AI" + "Alfred". Defines 5 personality traits: professional, proactive, detail-oriented, adaptive, transparent.

**Important note**: This is the GENERIC persona from the AIFred baseline. It describes a general-purpose assistant and does not reference the Operations Archon role. For role definition, `project-context.md` supersedes this file.

### capabilities.md

Defines 7 core capability areas:

1. Task management
2. Code assistance
3. System administration
4. Information management
5. Communication
6. Automation
7. Analysis

**Integration points**: REST APIs, PostgreSQL/SQLite, Docker, Git, Telegram, MCP. Lists 5 known limitations.

### tools.md

Tool inventory organized by category:

| Category | Tools |
|----------|-------|
| Built-in | File operations, Bash, Python, web search/fetch |
| MCP | Pulse (6 tools), Memory (if configured) |
| Custom | Nexus scripts, health checks |

**Guidelines**: Use built-in tools for direct operations, MCP for cross-system coordination, custom scripts for complex workflows.

### conversation-style.md

Communication style specification. Tone: professional but not stiff, warm but not casual.

**Templates provided for**: Status updates, task confirmations, error reports.

**Interaction modes**:
1. Direct (default)
2. Advisory
3. Report

Defines 4 escalation levels for graduated response severity.

---

## Gaps Identified

| # | Gap | Impact | Files Affected |
|---|-----|--------|----------------|
| 1 | **Telegram bot credentials not set** | Referenced in 4 files but non-functional. No token or chat_id configured. Escalation and notification paths are dead. | `project-context.md`, `clarification-pattern.md`, `health-check-pattern.md`, `session-state.md` |
| 2 | **Nexus dispatcher untested E2E** | 24 personas referenced but never validated against the dispatcher. No persona documentation exists in the knowledge layer. | `project-context.md`, `current-priorities.md` |
| 3 | **shared.js and scan-secrets.sh not ported** | Hook library and security scanner from AIFred baseline remain unported. Hook functionality may be incomplete. | `session-state.md`, `current-priorities.md` |
| 4 | **No self-knowledge or reflection files** | Unlike Jarvis (which maintains `strengths.md`, `weaknesses.md`, `patterns-observed.md`, `corrections.md`), AIFred-Pro has no introspective documentation. No mechanism for learning from operational experience. | -- |
| 5 | **No scratchpad** | No transient working memory equivalent to Jarvis's `.scratchpad.md`. Session-specific details have nowhere to live between JICM cycles. | -- |
| 6 | **persona.md drift** | Describes a generic "multi-purpose assistant" rather than the Operations Archon role. `project-context.md` supersedes it, but the drift creates potential confusion for any agent reading both files. | `knowledge/persona.md` vs `.claude/context/project-context.md` |

---

*AIFred-Pro Architecture Report 02/10 -- Context & Knowledge Layer*
*Generated 2026-04-23*
