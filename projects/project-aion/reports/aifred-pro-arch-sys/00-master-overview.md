# AIFred-Pro Systems Architecture — Master Overview

**Date**: 2026-04-23 (verified — every claim cross-referenced with source files)
**Version**: AIFred-Pro v3.2.0
**Repository**: `/Users/nathanielcannon/Claude/AIFred-Pro/` (production, read-only for Jarvis)
**Development**: `/Users/nathanielcannon/Claude/AIFred-Pro-Dev/` (nate-dev branch)
**Purpose**: Comprehensive systems-oriented architectural analysis for shared development reference between Nate and David O'Neil.

---

## What Is AIFred-Pro?

AIFred-Pro is the **Operations Archon** of Project Aion — an autonomous operations assistant that manages tasks, orchestrates headless AI jobs, monitors services, and coordinates with Jarvis (the Master Archon) through shared infrastructure.

It is **8 interconnected systems** that together create an autonomous operational agent.

---

## The 8 Systems

| # | System | Purpose | Key Technology |
|---|--------|---------|---------------|
| [01](01-pulse-task-management.md) | **Pulse** | Task lifecycle management | FastAPI + PostgreSQL + asyncpg (pool 2-10) |
| [02](02-nexus-job-orchestration.md) | **Nexus** | Headless AI job orchestration | Bash + cron + `claude -p` + SQLite |
| [03](03-dashboard-web-interface.md) | **Dashboard** | Visual operations interface | Fastify 5.3 + React 19.1 + Vite 6.3 + Tailwind 4.1 |
| [04](04-identity-and-cognition.md) | **Identity & Cognition** | Behavioral constitution | CLAUDE.md + AGENTS.md + context/ + knowledge/ |
| [05](05-safety-and-quality.md) | **Safety & Quality** | Defensive perimeter | 48+ JS hooks + validate.yml + bats tests |
| [06](06-bootstrap-and-lifecycle.md) | **Bootstrap & Lifecycle** | Setup, services, backup | bootstrap.sh + docker-compose (3 services) + Restic |
| [07](07-communications.md) | **Communications** | Telegram, Archon Protocol | send-telegram.sh + archon-protocol-v0.md + msgbus.sh |
| [08](08-configuration-substrate.md) | **Configuration** | Env, paths, version, sync | .env + .aifred.yaml (component manifest) + profiles/*.yaml |

---

## System Interaction Map

```
                    ┌─────────────────────────┐
                    │   CONFIGURATION (8)      │
                    │   .env, profiles, paths, │
                    │   .aifred.yaml manifest  │
                    └─────────┬───────────────┘
                              │ read by all
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       v                      v                      v
  ┌─────────┐          ┌───────────┐          ┌───────────┐
  │ PULSE   │◄────────►│  NEXUS    │          │ DASHBOARD │
  │ (1)     │ tasks +  │  (2)      │          │ (3)       │
  │ :8700   │ triggers │ cron +    │          │ :8600     │
  │ FastAPI │          │ claude -p │          │ Fastify   │
  └────┬────┘          └─────┬────┘          └─────┬────┘
       │                     │                     │
       │              ┌──────┴──────┐              │
       │              │ COMMS (7)   │              │
       │              │ Telegram    │              │
       │              │ msgbus      │              │
       │              └─────────────┘              │
       │                                           │
       │         ┌──────────────────────┐          │
       └────────►│  IDENTITY (4)        │◄─────────┘
                 │  CLAUDE.md, context/ │
                 │  13 agents, 24 pers. │
                 └──────────┬───────────┘
                            │
               ┌────────────┼────────────┐
               │                         │
        ┌──────┴──────┐          ┌───────┴───────┐
        │ SAFETY (5)  │          │ BOOTSTRAP (6) │
        │ 48+ hooks   │          │ bootstrap.sh  │
        │ validate.yml│          │ 3 containers  │
        │ bats tests  │          │ Restic backup │
        └─────────────┘          └───────────────┘
```

### Key Data Flows

1. **Autonomous task execution**: Cron → Nexus dispatcher → persona executor → `claude -p` → PATCH Pulse task
2. **Cross-archon coordination**: Jarvis → mcp tools → Pulse API ← Nexus coordinator
3. **Human visibility**: Browser → Dashboard (:8600) → Pulse API + Nexus SQLite + logs
4. **Failure alerting**: Nexus executor → send-telegram.sh → @KeryxArchon_bot
5. **Quality gate**: git push → validate.yml → structural validation + bats tests

---

## Issues Requiring Attention

| ID | System | Finding | Impact | Severity |
|----|--------|---------|--------|----------|
| **I-1** | Nexus (2) | MAX_CONCURRENT=3 not enforced in dispatcher | Unbounded parallel Claude sessions possible | High |
| **I-2** | Pulse (1) | No priority/status enum validation | Unknown values silently accepted | Medium |
| **I-3** | Safety (5) | No authentication on Pulse API | PULSE_SERVICE_TOKEN exists but not enforced on all routes | Medium |

### Design Observations

| ID | System | Finding |
|----|--------|---------|
| D-1 | Config (8) | `.aifred.yaml` is a component sync manifest (1120 lines), not a runtime config |
| D-2 | Nexus (2) | Pulsars (event-driven triggers) defined but execution engine is early stage |
| D-3 | Identity (4) | AGENTS.md is a project README, not agent routing spec — agents defined separately in `.claude/agents/` |

---

## Technology Stack Summary

| Layer | Technology | Location |
|-------|-----------|----------|
| Task API | FastAPI + asyncpg pool | `pulse/app.py` |
| Task DB | PostgreSQL (AIFred-Pro's own docker-compose) | `:5432`, database `pulse` |
| Job Engine | Bash + cron + SQLite (`lib/jobsdb.py`) | `.claude/jobs/` |
| AI Runtime | `claude -p` with `--allowedTools --max-budget-usd` | Nexus executor |
| Dashboard Backend | Fastify 5.3.3 + TypeScript 5.8 | `dashboard/server/` |
| Dashboard UI | React 19.1 + Vite 6.3 + Tailwind 4.1 + TanStack Query + Recharts | `dashboard/frontend/` |
| CI/CD | GitHub Actions (`validate.yml`) | `.github/workflows/` |
| Safety Hooks | 48+ JavaScript hooks | `.claude/hooks/` |
| Notifications | Telegram (@KeryxArchon_bot) + Web Push + msgbus | `.claude/jobs/lib/` |
| Component Tracking | `.aifred.yaml` manifest (1120 lines) | Root |

---

## Port Allocation

| Port | Service | System |
|------|---------|--------|
| 5173 | Dashboard frontend (dev) | Dashboard (3) |
| 5432 | PostgreSQL | Docker compose (6) |
| 8600 | Dashboard backend (Fastify) | Dashboard (3) |
| 8700 | Pulse API (FastAPI) | Pulse (1) |

---

## Recommended Development Order

Based on David's recommendation (Dashboard highest priority):

1. **Dashboard familiarization**: 37 routes, 159 frontend files, WebSocket, multiple data sources
2. **Fix I-1**: Implement MAX_CONCURRENT check in dispatcher.sh
3. **Fix I-3**: Add PULSE_SERVICE_TOKEN enforcement to Pulse API middleware
4. **Run tests**: `./tests/validate-structure.sh --verbose` and bats functional tests
5. **Review Archon Protocol v0**: `.claude/context/patterns/archon-protocol-v0.md` for multi-archon patterns

---

## How to Use These Reports

- **New to the codebase?** Read Systems 1 (Pulse), 2 (Nexus), and 3 (Dashboard).
- **Debugging a service?** Read the specific system report.
- **Adding a feature?** Check System 4 (Identity), System 5 (Safety), System 8 (Configuration).
- **Setting up from scratch?** Read System 6 (Bootstrap), System 8 (Configuration).

---

*AIFred-Pro Systems Architecture — Master Overview*
*8 Systems, all claims verified against source files 2026-04-23*
