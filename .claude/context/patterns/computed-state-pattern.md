# Computed State Over Maintained State

**Strictness**: Recommended
**Category**: Architecture
**Created**: 2026-03-22 (EVO-2026-02-004)

---

## Principle

Prefer computing values at read-time over storing and maintaining them. Hardcoded counts, boolean flags, and cached status values drift from actual state. Code that computes "how many patterns exist?" via `ls .claude/context/patterns/*.md | wc -l` is always correct; a YAML field `pattern_count: 51` requires manual updates and will inevitably become stale.

## When to Apply

- **Counts of files/directories**: Use `glob + count` instead of hardcoded numbers
- **Boolean "does X exist?"**: Use `fs.existsSync()` instead of a state file flag
- **Status of external services**: Use health check instead of cached boolean
- **Derived values**: Compute from source data instead of maintaining a copy

## When NOT to Apply

- **Counters that accumulate** (compression_count, error_count): Must be stored — no way to recompute
- **Timestamps of past events** (last_reflection_date): Must be stored
- **User preferences and decisions**: Must be stored
- **Values expensive to compute** (>5s): Cache with TTL, not permanent state

## Anti-Patterns to Avoid

```yaml
# BAD: Maintained state — will drift
pattern_count: 51
agents_active: 12
hooks_registered: 28

# GOOD: Computed at read-time
pattern_count: $(ls .claude/context/patterns/*.md 2>/dev/null | wc -l)
agents_active: $(ls .claude/agents/*.md 2>/dev/null | grep -v template | wc -l)
hooks_registered: $(jq '.hooks | [.[] | .[].hooks | length] | add' .claude/settings.json)
```

## Candidates for Conversion

| Current State File | Stale Field | Compute Instead |
|---|---|---|
| AC state JSONs | `triggers_tested: false` | Check report files exist |
| CLAUDE.md | count references ("51 patterns") | Omit counts; use index pointers |
| psyche maps | directory counts | Reference `_index.md` |
| `.jicm-config` | threshold values | Watcher writes on startup (implemented v7.1) |

## Related

- EVO-2026-02-004 (origin proposal)
- `.claude/context/patterns/organization-pattern.md` (file placement)
- `.claude/state/` (primary consumer of this pattern)

---

*Pattern: Computed State Over Maintained State — v1.0.0*
