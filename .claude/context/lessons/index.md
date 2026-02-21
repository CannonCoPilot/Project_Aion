# Lessons Index

**Purpose**: Categorical and chronological index of problems, solutions, and patterns.

**Updated**: 2026-02-21 (PAT-007 through PAT-011: Reflection #14 batch)

---

## Problems

Problems identified during Jarvis operation.

| Date | ID | Summary | Status |
|------|----|---------|--------|
| 2026-01-17 | PRB-001 | AC-02 Wiggum Loop metrics not being captured | Open |
| 2026-01-17 | PRB-002 | Telemetry system not instrumented | Open |

---

## Solutions

Solutions proposed or implemented for identified problems.

| Date | ID | Problem | Status |
|------|----|---------|--------|
| 2026-01-18 | SOL-001 | PRB-002: PR-13 Telemetry specifications complete | Pending Implementation |

---

## Patterns

Recurring patterns discovered through reflection and R&D.

| Date | ID | Summary | Frequency |
|------|----|---------|-----------|
| 2026-01-18 | PAT-001 | Claude Code features evolve rapidly; regular R&D review valuable | Ongoing |
| 2026-01-18 | PAT-002 | MCP tool deferral (auto:N) reduces context usage | New Discovery |
| 2026-01-18 | PAT-003 | PreToolUse additionalContext enables dynamic context injection | New Discovery |
| 2026-01-18 | PAT-004 | Single-agent ReAct loop (Wiggum) more reliable than multi-agent swarms | Confirmed |
| 2026-02-04 | PAT-005 | **tmux self-injection fails from within Claude Code** | Critical Discovery |
| 2026-02-05 | PAT-006 | **Single authority for process launch** — avoid duplicate launcher race conditions | New Discovery |
| 2026-02-21 | PAT-007 | **Evolution queue throughput** — 0→4/session when pipeline unblocked | Confirmed |
| 2026-02-21 | PAT-008 | **Small LLM checkpoint hallucination** — needs explicit state, not inferrable | Confirmed |
| 2026-02-21 | PAT-009 | **Self-healing over queuing for meta-systems** — fix immediately, don't queue | Confirmed |
| 2026-02-21 | PAT-010 | **Signal fingerprinting for session targeting** — passive fingerprints > explicit metadata | New Discovery |
| 2026-02-21 | PAT-011 | **Categorical routing for NL→SQL** — static keyword→query routing table | New Discovery |

---

## By Category

### Context Management
- PAT-002: MCP tool deferral (auto:N) reduces context usage
- PAT-003: PreToolUse additionalContext enables dynamic context injection
- PAT-008: Small LLM checkpoint hallucination — Qwen3:8b needs explicit completion status, not inferrable from plan files
- PAT-010: Signal fingerprinting for session targeting — use protocol artifacts (e.g. `[JICM-HALT]`) as implicit session IDs

### Tool Selection
- PAT-001: Claude Code features evolve rapidly; regular R&D review valuable

### Hook Integration
- PAT-003: PreToolUse additionalContext enables dynamic context injection

### Agent Patterns
- PAT-004: Single-agent ReAct loop (Wiggum) more reliable than multi-agent swarms

### Signal Architecture / tmux Integration
- PAT-005: tmux self-injection fails from within Claude Code
  - **Full lesson**: `lessons/tmux-self-injection-limitation.md`
  - **Key insight**: Bash tool calls block TUI event loop; keystrokes queue unpredictably
  - **Solution**: All prompt injection must come from external processes (watcher pattern)
  - **Affects**: JICM, command-signal-protocol, any autonomous prompt submission

### Process Management / Concurrency
- PAT-006: Single authority for process launch (avoid race conditions)
  - **Context**: Duplicate watcher bug — two launchers, both passed checks, both launched
  - **Key insight**: TOCTOU race between check and launch defeats duplicate detection
  - **Solution**: Designate single authoritative launcher; others request/verify, don't launch
  - **Affects**: Watcher management, future agent spawning, any background process coordination

### Session Insights (Persistent)
- **Full log**: `lessons/insights.md`
- **Purpose**: Captures `★ Insight` blocks that would otherwise vanish after /clear or session end
- **Updated**: During sessions as insights are generated; reviewed during AC-05 reflection
- **Current count**: 75+ insights (INS-001+; refreshed 2026-02-21 via REFL-020)
- **Categories**: Git, Context Management, YAML/Tooling, Authentication, Project Management, Self-Improvement

### Self-Improvement Pipeline
- PAT-007: Evolution queue throughput — machine-readable YAML proposals in a consumable queue are the minimum viable AC-05→AC-06 pipeline
- PAT-009: Self-healing over queuing — when the meta-system is broken, fix it during the current cycle, don't queue for the broken pipeline

### Data Architecture
- PAT-011: Categorical routing for NL→SQL — static keyword→query routing table bridges vocabulary mismatch without embeddings. Simpler, faster, more debuggable for known-vocabulary domains

### Documentation
*None yet*

### R&D Findings (2026-01-18)

Key discoveries from full-scale R&D cycle:

**Claude Code 2026 Features**:
- Setup hook event (--init/--maintenance)
- PreToolUse additionalContext injection
- auto:N MCP tool search threshold
- plansDirectory setting (IMPLEMENTED)
- ${CLAUDE_SESSION_ID} substitution
- /rename and /resume commands

**MCP Ecosystem**:
- 1,200+ servers available in ecosystem
- Local RAG MCP for private semantic search
- Zapier MCP for workflow automation (5000+ integrations)
- Vector database + RAG MCPs mature

**Agent Patterns**:
- Reflexion loop pattern confirmed (already have via Wiggum)
- Self-Refine pattern (generate → critique → revise)
- Single-agent preferred over multi-agent swarms
- Dual-component reflection (separate telemetry from execution)

**Full Report**: `projects/project-aion/reports/rd-cycle-2026-01-18.md`

---

---

## Evolution Proposals (from Reflection)

| Date | ID | Summary | Priority | Status |
|------|----|---------|----------|--------|
| 2026-01-20 | EVO-2026-01-020 | Session State Auto-Update | Low | Superseded |
| 2026-02-20 | REFL-016 | Add queue append step to /reflect | High | Completed |
| 2026-02-20 | REFL-017 | Include current-plans.md in JICM LLM prompt | Medium | Completed |
| 2026-02-20 | REFL-018 | Implement corrections capture mechanism | Medium | Completed |
| 2026-02-20 | REFL-019 | Batch fix stale path references | Low | Completed |
| 2026-02-20 | REFL-020 | Lessons index refresh — 50+ unindexed insights | Medium | Completed |
| 2026-02-21 | REFL-021 | Update lessons index proposal statuses | Low | Completed |
| 2026-02-21 | REFL-022 | Auto-capture self-corrections for JICM hallucination | Low | Queued |

See `.claude/state/queues/evolution-queue.yaml` for full proposal details.

---

*Index maintained by AC-05 Self-Reflection — Updated 2026-02-21*
