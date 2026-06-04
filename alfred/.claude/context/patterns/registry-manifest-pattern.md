# Registry Manifest Pattern

**Created**: 2026-03-17
**Status**: Active
**Related**: `structured-requirements-pattern.md`, `knowledge-tier-classification-pattern.md`

---

## Problem

Multiple registries (YAML, JSON, SQLite) across different directories with no single map. `nexus-sources-of-truth.md` covers Nexus registries but misses project-wide ones like `service-registry.yaml`, `feature-registry.yaml`, and `voice-registry.yaml`. Developers don't know what registries exist, where they live, or who consumes them.

## Solution

A single `manifest.yaml` at `.claude/registries/manifest.yaml` that declares every registry in the project — path, purpose, consumers, freshness expectations, and knowledge tier.

## Design Decisions

1. **Split consumers into `internal` and `external`** — Internal paths (same repo) are fully validatable by cross-reference checks. External paths (other repos like `~/Code/task-dashboard/`) get existence-only validation.

2. **Don't duplicate Document Guard** — The manifest declares *what exists and who reads it*. Document Guard (`document-guard.config.js`) declares *how to protect it*. No overlap.

3. **Don't duplicate cascade rules** — The manifest links to `nexus-sources-of-truth.md` via `cascade_doc` for Nexus registries. Cascade dependency chains stay in that file, not here.

4. **nexus-sources-of-truth.md remains Nexus-specific** — It gains a header linking to the manifest as the superset. It is NOT replaced by the manifest.

5. **Tier classification** — Each registry declares its knowledge tier (`registry`, `pattern`, `reference`, `ephemeral`), enabling tier-appropriate freshness checks. See `knowledge-tier-classification-pattern.md`.

## Structure

```yaml
version: 1
last_verified: "2026-03-17"

registries:
  <registry-id>:
    path: <relative path from project root>
    purpose: "<one-line description>"
    tier: registry | pattern | reference | ephemeral
    consumers:
      internal:             # Same repo — fully validatable
        - <path>
      external:             # Different repos — existence-only
        - <path>
    freshness:
      max_age_days: <int>
      last_verified: "<date>"
    cascade_doc: <path>     # Optional — link to cascade doc
    note: "<optional>"      # Free-form context
```

## Maintenance Rules

- When creating a new registry, add it to the manifest in the same session
- When deleting a registry, remove it from the manifest in the same session
- `last_verified` should be updated during periodic reviews
- Consumer lists must be updated when new scripts/tools start reading a registry

## Related

- @.claude/registries/manifest.yaml — The artifact
- @.claude/context/systems/nexus-sources-of-truth.md — Nexus-specific cascade reference
- @.claude/context/patterns/knowledge-tier-classification-pattern.md — Tier definitions
- @.claude/context/patterns/cross-reference-integrity-pattern.md — Validates manifest paths
- @.claude/context/patterns/schema-validated-registries-pattern.md — Schema enforcement on edit
