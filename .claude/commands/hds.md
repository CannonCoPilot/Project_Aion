---
name: hds
description: >
  Hierarchical Delta Synthesis — token-efficient document merging.
  Merges N overlapping documents into a single comprehensive master document
  using delta extraction and logarithmic consolidation.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, TaskCreate, TaskUpdate, TaskList, TaskGet
---

# /hds — Hierarchical Delta Synthesis

Load the HDS skill and execute the document merging pipeline.

## Usage

```
/hds                    # Interactive — will ask for document paths and output
/hds <doc1> <doc2> ...  # Merge specified documents
```

## Instructions

1. Load the HDS skill: Read `.claude/skills/hds/SKILL.md`
2. Parse arguments:
   - If args provided, treat as space-separated document paths
   - If no args, ask user for document paths and output path
3. If output path not specified, default to `<first_doc_dir>/hds-merged-<timestamp>.md`
4. Execute the HDS pipeline as described in SKILL.md:
   - Phase 0: Structural Discovery (parallel scouts + taxonomy)
   - Phase 1: Anchor Selection (parallel scoring + master index)
   - Phase 2: Delta Extraction (parallel extractors)
   - Phase 3: Delta Consolidation (logarithmic merge, skip if ≤2 deltas)
   - Phase 4: Final Assembly (single opus agent)
5. Report results to user

## Options

Pass options after `--`:
- `--verify` — Run completeness audit after assembly
- `--conflict prefer_detailed|prefer_recent|flag` — Conflict resolution mode (default: flag)
- `--output PATH` — Explicit output path
