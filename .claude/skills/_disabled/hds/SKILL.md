---
name: hds
description: >
  Hierarchical Delta Synthesis — token-efficient document merging.
  Use when: merge documents, consolidate documents, combine documents,
  create master document, planning history, document synthesis, HDS,
  merge-reduce, collate documents, document consolidation.
version: 1.0.0
---

# Hierarchical Delta Synthesis (HDS)

Token-efficient merging of N overlapping documents into a single comprehensive
master document using delta extraction and logarithmic consolidation.

## Core Concept

Instead of tournament-style full-document rewrites (which balloon output tokens),
HDS:

1. Discovers document structure cheaply (headers only)
2. Picks the most comprehensive document as the **Master**
3. Extracts only **delta** (new/different) information from each other document
4. Consolidates deltas logarithmically (small structured data, not full prose)
5. Integrates all deltas into Master in a single final assembly pass

**Expected savings**: ~80% reduction in output tokens vs. tournament merge.

## Parameters

When the user invokes HDS, gather these parameters (ask if not provided):

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `document_paths` | Yes | — | List of file paths to merge |
| `output_path` | Yes | — | Where to write the final master document |
| `conflict_resolution` | No | `flag` | `flag` / `prefer_detailed` / `prefer_recent` |
| `verify` | No | `false` | Run completeness audit after assembly |
| `working_dir` | No | auto | Temp directory for intermediates |

## Orchestration Procedure

Follow these phases **in strict order**. Use `TodoWrite` to track progress.

---

### SETUP

1. Validate all input document paths exist
2. Create working directory: `<output_dir>/.hds-work-<timestamp>/`
3. Create subdirectories: `structures/`, `scores/`, `deltas/`, `consolidation/`
4. Count documents (N), note total estimated size

---

### PHASE 0: Structural Discovery

**Goal**: Derive a unified taxonomy from all documents' headings without
reading body content. This is the cheapest phase (~2-5% of total tokens).

**Step 0a — Extract Structures (PARALLEL)**

For EACH document, spawn a Task agent:
- `subagent_type`: `general-purpose`
- `model`: `haiku`
- Prompt: Read `skills/hds/prompts/structural-scout.md`, then append:
  ```
  Document to analyze: <path>
  Write your JSON output to: <work_dir>/structures/<doc_basename>.json
  ```
- Launch ALL agents in a single message (parallel execution)

**Step 0b — Build Taxonomy (SEQUENTIAL)**

After all scouts complete:
- Spawn ONE Task agent:
  - `subagent_type`: `general-purpose`
  - `model`: `sonnet`
  - Prompt: Read `skills/hds/prompts/taxonomy-architect.md`, then append:
    ```
    Structure files to synthesize: <list all .json paths from structures/>
    Write your taxonomy to: <work_dir>/master-taxonomy.json
    ```

---

### PHASE 1: Anchor Selection & Indexing

**Goal**: Pick the most comprehensive document as Master and build an
addressable index.

**Step 1a — Score Coverage (PARALLEL)**

For EACH document, spawn a Task agent:
- `subagent_type`: `general-purpose`
- `model`: `haiku`
- Prompt: Read `skills/hds/prompts/coverage-scorer.md`, then append:
  ```
  Document to score: <path>
  Taxonomy file: <work_dir>/master-taxonomy.json
  Write your score to: <work_dir>/scores/<doc_basename>.json
  ```
- Launch ALL agents in parallel

**Step 1b — Select Master**

After all scorers complete:
- Read all score files from `scores/`
- Select the document with highest `overall_score` as Master
- Designate all other documents as SubDocs
- Log selection: "Master: <path> (score: X.XX)"

**Step 1c — Build Master Index (SEQUENTIAL)**

Spawn ONE Task agent:
- `subagent_type`: `general-purpose`
- `model`: `sonnet`
- Prompt: Read `skills/hds/prompts/index-builder.md`, then append:
  ```
  Master document: <master_path>
  Taxonomy file: <work_dir>/master-taxonomy.json
  Write your index to: <work_dir>/master-index.json
  ```

---

### PHASE 2: Delta Extraction

**Goal**: Extract ONLY unique/different information from each SubDoc relative
to Master. This is the key innovation — output is deltas only (~10-30% of each
SubDoc's length).

**For each SubDoc IN PARALLEL**, spawn a Task agent:
- `subagent_type`: `general-purpose`
- `model`: `sonnet`
- Prompt: Read `skills/hds/prompts/delta-extractor.md`, then append:
  ```
  Master document: <master_path>
  Master index: <work_dir>/master-index.json
  Master taxonomy: <work_dir>/master-taxonomy.json
  SubDocument: <subdoc_path>
  Write your delta to: <work_dir>/deltas/<subdoc_basename>-delta.json
  ```
- Launch ALL agents in parallel

**Critical instruction for all delta extractors**:
> When uncertain whether information is "new" or "redundant", ERR ON THE SIDE
> OF INCLUSION. It is better to extract something redundant than to lose
> something unique.

---

### PHASE 3: Delta Consolidation

**Goal**: Merge delta files pairwise, removing cross-document redundancies.

**Skip this phase entirely if there are 1-2 delta files** — go to Phase 4.

For 3+ deltas, perform logarithmic pairwise reduction:

```
Round = 1
DeltaFiles = all files in deltas/

WHILE len(DeltaFiles) > 1:
  Create directory: consolidation/round-<Round>/
  NextRound = []

  FOR i in range(0, len(DeltaFiles), 2):
    IF i+1 < len(DeltaFiles):
      Spawn Task agent (model: sonnet):
        Read skills/hds/prompts/delta-consolidator.md
        Pass: DeltaFiles[i], DeltaFiles[i+1], master-index.json, master-taxonomy.json
        Write to: consolidation/round-<Round>/merged-<i>.json
      Append merged path to NextRound
    ELSE:
      Copy DeltaFiles[i] to consolidation/round-<Round>/passthrough-<i>.json
      Append path to NextRound

  AWAIT all consolidators
  DeltaFiles = NextRound
  Round += 1

FinalDelta = DeltaFiles[0]
```

Launch each round's consolidators in parallel.

---

### PHASE 4: Final Assembly

**Goal**: Integrate all deltas into Master to produce the final document.

Spawn ONE Task agent:
- `subagent_type`: `general-purpose`
- `model`: `opus`
- Prompt: Read `skills/hds/prompts/final-assembler.md`, then append:
  ```
  Master document: <master_path>
  Final delta file: <final_delta_path>
  Master taxonomy: <work_dir>/master-taxonomy.json
  Conflict resolution mode: <flag|prefer_detailed|prefer_recent>

  Write the final integrated document to: <output_path>
  Write the integration report to: <work_dir>/integration-report.json
  Write any conflict report to: <work_dir>/conflict-report.md
  ```

---

### PHASE 5: Verification (Optional)

Only run if `verify=true` was requested.

Spawn ONE Task agent:
- `subagent_type`: `general-purpose`
- `model`: `sonnet`
- Prompt: Read `skills/hds/prompts/completeness-auditor.md`, then append:
  ```
  Final document: <output_path>
  Original documents: <list all input paths>
  Final delta: <final_delta_path>
  Integration report: <work_dir>/integration-report.json
  Write audit report to: <work_dir>/audit-report.json
  ```

---

## Completion Report

After all phases complete, report to the user:

1. **Master selected**: which document, why (score)
2. **Documents processed**: count, total input size
3. **Deltas extracted**: total extractions across all SubDocs
4. **Consolidation**: rounds performed, duplicates removed
5. **Final document**: path, size, section count
6. **Conflicts**: count flagged for review (if any)
7. **Token estimate**: approximate savings vs. tournament merge

## Error Handling

- **Subagent failure**: Retry once with same inputs. If second failure, log error and continue with remaining documents.
- **Invalid JSON output**: If an agent writes malformed JSON, re-read the file and attempt to parse the key fields from the text. If unrecoverable, re-spawn the agent with explicit "output ONLY valid JSON" instruction.
- **Missing anchor text**: The delta-extractor and final-assembler use `fallback_position` when `anchor_text` cannot be located. This is expected for ~10-15% of insertions.
- **Empty delta**: If a SubDoc produces zero extractions, it was fully redundant with Master. Log and skip.

## Working Directory Layout

```
<work_dir>/
  structures/              # Phase 0: structural extracts per doc
    doc1.json
    doc2.json
  master-taxonomy.json     # Phase 0: unified section taxonomy
  scores/                  # Phase 1: coverage scores per doc
    doc1.json
    doc2.json
  master-index.json        # Phase 1: addressable Master index
  deltas/                  # Phase 2: delta extractions per SubDoc
    doc2-delta.json
    doc3-delta.json
  consolidation/           # Phase 3: consolidation rounds
    round-1/
    round-2/
  integration-report.json  # Phase 4: assembly statistics
  conflict-report.md       # Phase 4: flagged conflicts
  audit-report.json        # Phase 5: completeness audit
```

## Model Selection Guide

| Agent | Model | Reasoning |
|-------|-------|-----------|
| Structural Scout | haiku | Simple extraction, low stakes |
| Taxonomy Architect | sonnet | Moderate reasoning needed |
| Coverage Scorer | haiku | Straightforward scoring |
| Index Builder | sonnet | Accuracy matters for insertion targeting |
| Delta Extractor | sonnet | Core accuracy phase — must not miss content |
| Delta Consolidator | sonnet | Deduplication requires judgment |
| Final Assembler | opus | Quality of final document is paramount |
| Completeness Auditor | sonnet | Verification, moderate complexity |
