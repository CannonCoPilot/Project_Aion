# Session Meditation Pattern

**Pattern ID**: session-completion
**Version**: 2.0.0
**Status**: active
**Component**: AC-09

---

## Overview

Session Meditation is a restorative pause — not an exit. Like meditation, sleep, or dreaming for humans, this is where Jarvis reflects, consolidates knowledge, communicates with collaborators, and preserves state before resting.

### Core Principles

1. **User-Prompted Only**: Sessions meditate ONLY when user explicitly requests
2. **Reflection Is Primary**: The true purpose is insight capture, error analysis, and pattern creation — not just state saving
3. **Full Memory Consolidation**: ALL memory systems (Graphiti, RAG, MEMORY.md, plans, scratchpad) get reviewed and updated
4. **No Lost Work**: State is ALWAYS preserved before rest
5. **Graceful Degradation**: Complete even when components fail

### What DOESN'T End Sessions

| Event | Actual Response |
|-------|-----------------|
| Context exhaustion | AC-04 JICM handles; work continues |
| Wiggum Loop completes | Check for more work; offer Tier 2 cycles |
| Idle timeout | Trigger R&D/Maintenance/Reflection |
| Errors or blockers | Investigate via Wiggum Loop |

---

## Nine-Phase Protocol

| Phase | Name | Purpose | Duration |
|-------|------|---------|----------|
| 1 | **Guard** | Set `.jicm-exit-mode.signal` | Instant |
| 2 | **Offer** | Pre-meditation Tier 2 cycles (AC-05/06/07/08) | User choice |
| 3 | **Reflect** | Review insights, analyze errors, create prevention patterns | ~30s |
| 4 | **Consolidate** | Full memory systems review — RAG, Graphiti, MEMORY.md, plans, scratchpad, usage audit | ~60s |
| 5 | **Communicate** | ProjectIntel debrief + status updates | ~10s |
| 6 | **Preserve** | Session state, priorities, version check | ~5s |
| 7 | **Commit** | Git + cross-project check + Pulse housekeeping tickets | ~10s |
| 8 | **Valediction** | Weather-aware Wodehouse farewell | ~5s |
| 9 | **Release** | Remove signal, emit context-window metrics | Instant |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| User-prompted only | Preserve user control over session lifecycle |
| Reflection before preservation | Insights are the point; state saving is mechanics |
| All memory systems reviewed | Meditation means full consolidation, not partial |
| Weather-aware valediction | Context-aware personality adds warmth |
| Context-window metrics at release | Enables cross-session comparison via JICM standard |
| Pulse tickets for housekeeping | Let Pulse-Nexus self-manage; don't hand-hold |

---

## Implementation

- **Command**: `.claude/commands/meditate-session.md` (authoritative procedure)
- **AC Spec**: `.claude/context/components/AC-09-session-completion.md`
- **Valedictions**: `.claude/context/psyche/valedictions.yaml`
- **Invocation**: `/meditate-session`

---

*Session Meditation Pattern v2.0.0 — AC-09 Implementation Guide*
