# Research Report: Agent Orchestration Systems Landscape — March 2026

**Date**: 2026-03-22
**Status**: COMPLETE
**Scope**: Functional comparison of 9 AI agent orchestration systems vs Jarvis
**Source**: W5:Jarvis-dev deep-research agent (web research + documentation analysis)

---

## Executive Summary

The AI agent orchestration landscape has matured significantly. The field has converged on: isolated execution environments (containers, VMs, git worktrees) for safe autonomous operation; structured file artifacts as cross-session memory; and compound multi-agent architectures with specialized roles. Top SWE-bench Verified scores now reach 65% (mini-SWE-agent).

Jarvis occupies a distinctive niche. Most commercial systems (Claude Code, Cursor, Windsurf, Devin) are product-first. Research systems (SWE-agent, OpenHands) optimize for benchmarks. **Jarvis is infrastructure-first**: it exposes its own internals, manages context explicitly via JICM, and has a documented self-improvement pipeline (AC-05/06/07/08) that no commercial product offers.

## Comparison Matrix

| Dimension | Claude Code | Cursor | Aider | SWE-agent | OpenHands | Devin | **Jarvis** |
|---|---|---|---|---|---|---|---|
| Context Mgmt | Auto-compact ~95% | Semantic embedding | Tree-sitter repo map | ACI constraints | Event stream + condensation | Timeline + Planner | **JICM 280K, AI compression, dual-mechanism resume** |
| Self-Improvement | None | None | None | None | None | None | **AC-05/06/07/08 pipeline** |
| Multi-Agent | Task tool | Parallel VMs + worktrees | Architect+Editor | Swarm mode | AgentDelegate hierarchy | Planner→Coder→Critic | **12 agents, capability-map routing** |
| Memory | CLAUDE.md (manual) | M-Query index | .aider.chat.history.md | Trajectory files | AgentSkills library | Workspace memory | **4-tier: MEMORY.md + Qdrant + Neo4j + files** |
| Sandboxing | None | Ubuntu VMs | None | Docker | Docker | Persistent env | **None (host + guardrails)** |
| Continuous Op | No | No | No | No | No | Long-horizon | **Yes (Wiggum Loop, JICM, AC-01..09)** |
| Codebase Index | grep/search | Semantic embedding | Tree-sitter + PageRank | None | None | Closed source | **grep/search** |

## Key Gaps Identified

### Jarvis Lacks (adoption candidates)
1. **Parallel agent execution with git worktree isolation** (Cursor pattern)
2. **Tree-sitter repo map** for compressed codebase structure (Aider pattern)
3. **Docker sandbox** for high-risk operations (OpenHands/SWE-agent pattern)
4. **Structured progress files** for cross-session continuity (Claude Agent SDK pattern)

### Jarvis Uniquely Offers
1. **Explicit context management** with documented thresholds and dual-mechanism resume
2. **Formal self-improvement pipeline** (reflection → evolution queue → implementation)
3. **Continuous operational loop** (Wiggum Loop + JICM + Aion Quartet)
4. **Deep project-specific context** (Chronicler knowledge base, DF game control)

## Top 5 Recommendations

1. **Tree-sitter repo map** (from Aider): Build `skill.codebase-map` for DwarfCron structural overview in ~2K tokens. Biggest context efficiency win.
2. **claude-progress.txt pattern** (from Agent SDK): Write structured progress file at AC-09, read at AC-01. Complements JICM for cross-session continuity.
3. **Git worktree parallel agents** (from Cursor): For Phase 4+ when parallel implementation tasks arise. Not needed yet.
4. **Docker sandbox** (from OpenHands): Wrap high-risk Bash in containers. Low priority — most ops already git-tracked.
5. **SWE-bench baseline**: Run mini-SWE-bench to establish objective capability measurement. AC-07 research item.

---

*Full report from deep-research agent. See source transcript for detailed per-system analysis.*
