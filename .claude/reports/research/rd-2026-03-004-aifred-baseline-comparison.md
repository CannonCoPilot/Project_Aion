# Research Report: AIfred v3.0.0 — Current State vs Jarvis v5.11.0

**Date**: 2026-03-22
**Status**: COMPLETE
**Source**: W5:Jarvis-dev deep-research agent (GitHub API + raw file analysis)

---

## Executive Summary

AIfred v3.0.0 has added 26 commits since the Jarvis fork (`2ea4e8b`), with the largest being a 148-component sync from a private AIProjects hub (2026-02-16). Jarvis's entire autonomic stack (AC-01..10, JICM, Wiggum Loop, self-improvement) has no AIfred equivalent — those are entirely original Jarvis contributions.

However, AIfred has developed capabilities Jarvis lacks: **Document Guard** (file protection), **TELOS** (strategic governance), **headless jobs with multi-agent consensus**, **git worktree parallel isolation**, and **memory entity lifecycle tracking**.

## Comparison Matrix

| Capability | AIfred v3.0.0 | Jarvis v5.11.0 | Leader |
|---|---|---|---|
| Autonomic components (AC-01..10) | None | Full 10-component system | **Jarvis** |
| JICM context management | Passive ~4KB | Active watcher + dual-mechanism | **Jarvis** |
| Self-improvement pipeline | None | AC-05/06/07/08 full cycle | **Jarvis** |
| Wiggum Loop | None | AC-02 default mode | **Jarvis** |
| Session continuity | session-start/stop hooks | AC-01 + JICM + AC-09 | **Jarvis** |
| File protection | Document Guard (glob, tiers, tokens) | None | **AIfred** |
| Strategic governance | TELOS (quarterly goals, anti-goals) | None | **AIfred** |
| Headless jobs + consensus | 7-job cron + team-runner.py | None | **AIfred** |
| Multi-agent consensus | Parallel + verdict rules + escalation | Sequential two-level review | **AIfred** |
| Parallel isolation | git worktrees | Shared directory | **AIfred** |
| Memory lifecycle | 90/180-day entity tracking | None | **AIfred** |
| Testing infrastructure | yamllint + shellcheck + bats | None | **AIfred** |

## Top 5 Port Candidates (AIfred → Jarvis)

### 1. Document Guard (HIGH PRIORITY)
AIfred's `document-guard.js` protects files with glob-pattern rules, violation tiers (critical/high blocks, medium warns), structural integrity checks (YAML frontmatter, markdown sections), and override tokens with TTL. Jarvis's load-bearing files (`session-state.md`, `capability-map.yaml`, AC specs, `CLAUDE.md`) are completely unprotected. A corrupted `session-state.md` silently breaks the next session.

### 2. TELOS Strategic Framework (MEDIUM PRIORITY)
Quarterly focus theme, active goals (YAML), explicit anti-goals, three-cadence governance. The anti-goals list is particularly valuable — hard guardrails against scope creep. For Chronicler: "No Phase 4 work during Phase 3", "No explorer UI changes during live integration."

### 3. Memory Maintenance Entity Lifecycle (LOW-MEDIUM)
PostToolUse hook tracks entity access per 30-day window. 90 days without access = review candidate. 180 days = archive. Prevents Memory MCP from accumulating indefinitely stale entities.

### 4. Team-Runner for AC-03 (MEDIUM)
Convert AC-03 milestone review from sequential two-agent to parallel with consensus rules. Run code-review + project-manager simultaneously; require both to approve; escalate on disagreement.

### 5. Parallel-Dev Worktree Isolation (MEDIUM)
Git worktrees at `~/tmp/worktrees/` with fresh-context agents. Agents can't conflict on the same files. Most relevant for Phase 4+ parallel implementation work.

## Key Finding: AIProjects Private Hub

All AIfred features originate in a private `AIProjects` repository. The 148-component sync (2026-02-16) was a bulk transfer. AIfred's public capabilities lag its actual capabilities. The full AIProjects inventory is unknown.

---

*Full 14-source report from deep-research agent. See agent memory at `.claude/agents/memory/deep-research/aifred-current-state-2026-03-22.md`*
