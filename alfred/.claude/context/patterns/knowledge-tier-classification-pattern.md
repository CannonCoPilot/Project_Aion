# Knowledge Tier Classification Pattern

**Created**: 2026-03-17
**Status**: Active
**Related**: `registry-manifest-pattern.md`, `structured-requirements-pattern.md`

---

## Problem

All 210+ context files are treated equally. `credential-inventory.yaml` (quarterly audit) and `session-state.md` (weekly prune) have the same freshness treatment. There's no formal deprecation mechanism — superseded patterns stay active in the search index with only a prose note.

## Solution

Classify documents into 4 tiers with distinct lifecycle rules, freshness expectations, and maintenance cadence.

## Tier Definitions

| Tier | Where | Freshness | Guard | Review |
|------|-------|-----------|-------|--------|
| **Registry** | Various (tracked in manifest) | Per manifest `max_age_days` | critical/high | Schema validation on edit |
| **Pattern** | `patterns/` | Stable; review on major system change | high | Quarterly; deprecation markers when superseded |
| **Reference** | `systems/`, `projects/`, `tools/` | 90-day freshness target | medium | Cross-ref checker validates links |
| **Ephemeral** | `investigations/`, `audits/`, session-state | 60-day TTL before archive | none | Watchdog flags stale entries |

### Registry
Machine-consumed authoritative files. Changes cascade. Must be schema-validated (when schemas exist) and tracked in the registry manifest. Examples: `label-taxonomy.yaml`, `routing-rules.yaml`, `registry.yaml`.

### Pattern
Reusable design patterns extracted from recurring practices. Stable once written — reviewed quarterly or when the system they describe changes significantly. Can be deprecated (see below). Examples: this file, `code-before-prompts-pattern.md`.

### Reference
Human-maintained documentation that describes systems, tools, or projects. Must stay accurate but changes less frequently than registries. Validated by cross-reference integrity checker for link freshness. Examples: `nexus.md`, `pulse-reference.md`, `inventory.md`.

### Ephemeral
Time-boxed documents with a natural expiration. Investigations, audits, and session artifacts. Should be archived or deleted after 60 days. The watchdog flags ephemeral documents that exceed their TTL. Examples: `session-state.md`, investigation reports, audit findings.

## Deprecation Sub-Pattern

When a pattern or reference document is superseded:

1. Add frontmatter fields:
   ```yaml
   status: deprecated
   superseded_by: <filename>
   ```

2. The search index generator reads `status: deprecated` and renders the entry with ~~strikethrough~~

3. The watchdog flags deprecated documents that appear in recent `file-access.json` logs (still being loaded = confusion risk, may need cleanup or redirect)

### Example

```markdown
---
status: deprecated
superseded_by: nexus-dispatcher-executor
---
# Autonomous Execution Pattern
...
```

## Integration Points

- **Registry manifest** (`.claude/registries/manifest.yaml`): Each registry entry has a `tier:` field
- **Search index** (`Scripts/generate-search-index.js`): Reads frontmatter `status` → renders deprecated entries differently
- **Watchdog** (`pipeline-watchdog.sh`): Applies tier-appropriate freshness thresholds; flags stale ephemeral docs and loaded deprecated docs
- **Document Guard** (`document-guard.config.js`): Protection levels align with tier (critical/high for registries, medium for reference, none for ephemeral)

## Applying This Pattern

When creating a new context file, consider which tier it belongs to:
- Will automation consume it? → **Registry**
- Is it a reusable design principle? → **Pattern**
- Does it describe a system for humans? → **Reference**
- Will it expire naturally? → **Ephemeral**

This classification should inform where you place the file, what freshness expectations you set, and whether it needs Document Guard protection.

## Related

- @.claude/registries/manifest.yaml — Registry entries include tier field
- @.claude/context/patterns/registry-manifest-pattern.md — Manifest design
