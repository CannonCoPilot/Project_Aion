# Project Registration System

**Status**: Design doc (not yet implemented)
**Created**: 2026-06-04

## Purpose

Standardize how external projects (code that lives outside the monorepo) register with the Aion platform for cross-project operations (commits, context, memory partitions).

## Registration via paths-registry.yaml

Each project gets an entry under the `projects:` key in a `paths-registry.yaml` file:

```yaml
projects:
  chronicler:
    path: /Users/nathanielcannon/Claude/Projects/DwarfCron
    branch: main
    remote: CannonCoPilot/DwarfCron
    status: active
    artifacts: projects/chronicler/    # in-monorepo dev artifacts
    qdrant_collection: codebase        # optional memory partition
    guardrails:                        # optional project-specific rules
      - "Phase-linear development (no skipping stages)"
      - "Standalone executable required per phase"

  token-compression-bench:
    path: /Users/nathanielcannon/Claude/TokenCompressionBench
    branch: main
    remote: null
    status: active
    artifacts: null
```

## Fields

| Field | Required | Description |
|---|---|---|
| `path` | yes | Absolute path to project root |
| `branch` | yes | Default branch name |
| `remote` | no | GitHub remote (owner/repo) |
| `status` | yes | `active`, `paused`, `archived` |
| `artifacts` | no | Path within monorepo for dev artifacts |
| `qdrant_collection` | no | Qdrant collection for project-specific RAG |
| `guardrails` | no | Project-specific rules (appended to base guardrails) |

## Integration Points

- **cross-project-commit-tracker.js**: reads registry to know which paths to monitor
- **session-state.md**: can reference project status
- **additionalDirectories**: settings.json auto-populated from active projects
- **memory partitions**: optional per-project Qdrant collections

## Current Registrants

1. **DwarfCron/Chronicler** — external code at `~/Claude/Projects/DwarfCron/`, artifacts at `projects/chronicler/`
2. **TokenCompressionBench** — external code at `~/Claude/TokenCompressionBench/`
