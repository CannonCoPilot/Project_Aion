# Reflection Report — 2026-02-22 (Session 32, Reflection #15)

## Summary
- Corrections analyzed: 0 (corrections.md still empty)
- Self-corrections identified: 3 (from session analysis)
- Insights analyzed: 6 new (session 32)
- Problems identified: 4
- Proposals generated: 3
- Patterns discovered: 2 new

---

## Phase 1: Data Inventory

| Source | Count | Status |
|--------|-------|--------|
| corrections.md | 0 entries | Empty since creation (2026-02-18) |
| self-corrections.md | 0 entries | Empty since creation (2026-02-18) |
| insights-log.md | 6 new since R#14 | JICM perf, Chronicler validation findings |
| evolution-queue.yaml | 2 queued (EVO-004, REFL-022), rest completed | Pipeline healthy |
| lessons/index.md | 11 patterns (PAT-001 through PAT-011) | Updated in R#14 |

---

## Phase 2: Problems Found

### P1: Chronicler XML Parser Boolean Flag Gap [HIGH]
All boolean flags (`is_deity`, `is_vampire`, `is_necromancer`, `is_werebeast`, `is_force`, `is_ghost`) are `false` across **all 55,321 historical figures** in both World 1 and World 2. The legends XML likely uses presence-based tags (e.g. `<deity/>`) that the parser doesn't extract. This completely breaks categorical routing for supernatural beings — "tell me about the gods" returns nothing.

**Impact**: High for storyteller quality. Every categorical supernatural query fails silently.

### P2: Chronicler Site Ownership Not Populated [MEDIUM]
All `owner_entity_id` values are NULL for World 2 sites (1,899 sites). This means civilization-to-site relationships are invisible, preventing queries like "what sites does this civilization control?"

**Impact**: Medium — the storyteller's world overview can't link civilizations to their territories.

### P3: LLM Hallucination Under Sparse Context [MEDIUM]
When context retrieval returns minimal data (e.g. Firebronze: 1 record, 28 chars), Qwen3 8B generates extensive fabricated narratives despite the system prompt instruction "never fabricate facts that contradict the records." The model interprets "don't contradict" as permission to *add* freely when records are silent.

**Impact**: Medium — undermines trust in storyteller output. Most queries return sufficient context, but site-only and artifact queries often have minimal data.

### P4: War Context Missing Belligerent Names [LOW]
When a war event collection is retrieved, the attacker/defender entity IDs are present but not resolved to names in the context. The LLM must either guess or fabricate belligerent identities. The Barbarous Conflict response attributed it to "barbarous points" (olm_man outcast) instead of the actual "carnal hex" (goblin) vs "coincidental boulders" (dwarf).

**Impact**: Low frequency but high factual error severity when it occurs.

---

## Phase 2.5: Process Simplification Detection

### Repeated Workflow: DB Schema Discovery
During this session, I ran 6+ iterative queries to discover table names, column names, and data distributions — each time hitting errors from wrong column/table names. A `chronicler db-schema` CLI command or a cached schema reference file would eliminate this friction.

**Candidate**: chronicler-schema-cache
**Trigger**: Every validation or ad-hoc DB exploration session
**Frequency**: 2+ times this session, likely every Chronicler dev session
**Complexity**: Low (one-time `information_schema` dump to markdown)
**Action**: Appended to skill-candidates.yaml

---

## Phase 3: Patterns Discovered

### PAT-012: LLM Hallucination Inversely Correlates with Context Density
**Category**: Chronicler / LLM Behavior
**Frequency**: Confirmed across 8 validation queries
**Insight**: With 38 context records (Cata Stilledbeasts), the LLM stayed close to facts (6/10 accuracy). With 1 record (Firebronze, 28 chars), it fabricated entirely (2/10). With 0 records matching but fallback providing overview data, it hallucinated less (deity query correctly said "no records"). The honesty path works when explicitly triggered by empty results, but *sparse* results (1-5 records) are the danger zone — enough to anchor the narrative but not enough to constrain it.

### PAT-013: Validation-Driven Development for Data Pipelines
**Category**: Architecture / Quality
**Frequency**: New Discovery
**Insight**: The storyteller validation exercise discovered 4 data quality issues (boolean flags, site ownership, war context, artifact metadata sparsity) that were invisible during development because the ingestion and retrieval code were tested independently. End-to-end validation with ground truth comparison — asking actual questions and verifying answers against the database — is the most efficient way to find data pipeline gaps. This pattern applies broadly: test the *output* with real queries, not just the *plumbing*.

---

## Phase 3: Planning Tracker Verification

| Document | In Tracker | Enforcement |
|----------|-----------|-------------|
| session-state.md | Yes | mandatory |
| current-plans.md | Yes (as current-priorities.md) | mandatory |
| merry-wandering-ullman.md | Yes | advisory |
| mac-studio-db-ai-roadmap.md | Yes | advisory |

**Gaps Found**: None — all active planning documents are tracked.
**Note**: Tracker references `current-priorities.md` but actual file is `current-plans.md`. Minor naming drift, non-blocking.

---

## Phase 4: Evolution Proposals

### REFL-023: Fix XML Parser Boolean Flag Extraction [HIGH]
**Problem**: Legends XML contains deity/vampire/necromancer/werebeast/force tags but the parser doesn't extract them, leaving all 55K+ HFs with false flags.
**Proposal**: Audit the XML parser's HF extraction to handle presence-based boolean tags (e.g. `<deity/>`, `<vampire/>`, `<necromancer/>`). Re-ingest the legends XML after fix.
**Effort**: Medium (XML parser audit + re-ingestion)

### REFL-024: Add Confidence Signaling to Storyteller Context [MEDIUM]
**Problem**: Qwen3 8B hallucinates extensively when context is sparse (<5 records or <200 chars). The system prompt says "don't fabricate" but the model treats sparse context as creative license.
**Proposal**: In `format_context()`, prepend a confidence signal when records are sparse: "WARNING: Very few records found. Base your response strictly on the records below and clearly indicate when information is limited." This exploits the LLM's instruction-following to reduce hallucination.
**Effort**: Low (5-line change in prompts.py)

### REFL-025: Enrich War Event Collection Context [LOW]
**Problem**: War queries retrieve collection metadata but don't resolve attacker/defender entity IDs to names. The LLM fabricates belligerent identities.
**Proposal**: In `retrieve_context()`, when a war collection is found, fetch the attacker and defender entity names and include them in the context text.
**Effort**: Low (add 2 JOINs or subqueries to the collection query)

---

## Phase 5: Graphiti Knowledge Graph Ingestion

Graphiti ingestion completed successfully:
- **Entities extracted**: 19
- **Edges created**: 50
- **Episodes**: Session 32 reflection data, self-corrections, and evolution proposals ingested
- **Status**: Complete

---

## Self-Corrections Identified (Session 32)

1. **Unfiltered world_id queries**: Initial ground truth gathering mixed World 1 and World 2 data because queries didn't filter by `world_id`. Led to confusion about which world the wars and linked figures belonged to. **Lesson**: Always filter by world_id when the schema supports multiple worlds.

2. **Schema assumptions**: Assumed column names (`entity_type`, `hf_id_other`) without checking `information_schema`. Caused 3 query failures before I discovered the actual column names. **Lesson**: Always run schema discovery before ad-hoc queries on unfamiliar tables.

3. **LiteLLM model name mismatch**: Used `qwen3:8b` (Ollama name) instead of `qwen3-8b-nothink` (LiteLLM alias). **Lesson**: LiteLLM model names don't match Ollama names — check `/v1/models` first.

---

## Next Steps
1. Implement REFL-023 (XML parser boolean fix) — highest impact for Chronicler quality
2. Implement REFL-024 (confidence signaling) — quick win, reduces hallucination
3. Implement REFL-025 (war context enrichment) — prevents factual errors in war queries
4. Update session-state.md with validation findings and next priorities

---

*Reflection #15 — AC-05 Self-Reflection, Session 32, 2026-02-22*
