# Reactive Search Index Pattern

**Created**: 2026-03-18
**Status**: Active
**Related**: `registry-manifest-pattern.md`, `knowledge-tier-classification-pattern.md`

---

## Problem

`_search-index.md` requires manual `node Scripts/generate-search-index.js`. Headless sessions never regenerate it. A March audit found 11+ files invisible to search because they were created between full regenerations.

## Solution

Two-phase approach:

### Phase 1: Append-on-create (Reactive)

When `index-sync.js` detects a new `.md` file written in `.claude/context/`, it now also:
1. Reads the file content
2. Calls shared `extractMetadata()` from `Scripts/lib/metadata-extractor.js`
3. Finds the correct group table in `_search-index.md`
4. Appends the row (if not already present)

This means new files appear in the search index immediately — no manual trigger needed.

### Phase 2: Staleness backstop (Periodic)

`_search-index.md` now includes a `last_full_regen:` timestamp in its header. The watchdog checks weekly; if the timestamp is >7 days old, a full regeneration is flagged.

Full regen is still done via `node Scripts/generate-search-index.js` — Phase 1 only handles appends.

## Shared Module

`Scripts/lib/metadata-extractor.js` provides:
- `extractMetadata(content, filePath)` — title, description, tags, status, superseded_by
- `parseFrontmatter(content)` — simple YAML frontmatter parser

Used by both `generate-search-index.js` (full regen) and `index-sync.js` (incremental append).

## Deprecation Rendering

Files with frontmatter `status: deprecated` are rendered with ~~strikethrough~~ in the search index. If `superseded_by` is set, the replacement is shown after an arrow. Example:

```
| `patterns/old-pattern.md` | ~~Old description~~ -> new-pattern | — |
```

## Files

| File | Role |
|------|------|
| `Scripts/lib/metadata-extractor.js` | Shared metadata extraction (new) |
| `Scripts/generate-search-index.js` | Full regeneration (modified — uses shared extractor, adds timestamp + deprecation) |
| `.claude/hooks/index-sync.js` | PostToolUse hook (modified — appends to search index on new file creation) |
| `.claude/context/_search-index.md` | The search index (now includes `last_full_regen` timestamp) |

## Hook Registration

`index-sync.js` must be registered in `.claude/settings.json` as a PostToolUse hook on Write operations. Without this, the hook never fires.

## Related

- @Scripts/lib/metadata-extractor.js — Shared extractor module
- @Scripts/generate-search-index.js — Full search index generator
- @.claude/hooks/index-sync.js — Reactive index sync hook
- @.claude/context/patterns/knowledge-tier-classification-pattern.md — Deprecation rendering ties into tier system
