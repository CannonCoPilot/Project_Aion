# Documentation Location Standard

**Created**: 2026-01-02
**Status**: Active
**Purpose**: Define where Claude should create documentation by default.

---

## Core Rule

> **Default location is the project directory** (`.claude/context/`) unless the user explicitly directs otherwise.

This applies to all documentation created during Claude Code sessions.

---

## Decision Matrix

| Content Type | Default Location | Override Trigger |
|--------------|------------------|------------------|
| Design patterns | `.claude/context/patterns/` | User specifies otherwise |
| Standards | `.claude/context/standards/` | User specifies otherwise |
| Project documentation | `.claude/context/projects/` | User specifies otherwise |
| Session state | `.claude/context/session-state.md` | N/A (always project dir) |
| Workflow documentation | `.claude/context/workflows/` | User specifies otherwise |
| Technical notes | `knowledge/notes/` | User specifies otherwise |

---

## Explicit Triggers

### To Document in Project Directory

User says any of:
- "document this" (default)
- "add to context"
- "create a pattern"
- "update the docs"

---

## Why This Matters

Without this standard, Claude may create documentation in inconsistent locations, making it hard to find later. The project's `.claude/context/` directory is the canonical location for all operational documentation.

---

## Implementation Notes

- All paths are relative to the project root
- `knowledge/` is for learning material and notes
- `.claude/context/` is for active operational docs
- Completed/historical content goes to `knowledge/archive/`
