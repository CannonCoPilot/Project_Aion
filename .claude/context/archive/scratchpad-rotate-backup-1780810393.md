# Scratchpad — Short-Term Working Memory

**Purpose**: Transient details needed within this session or the next 1-2 sessions.

---

## Active Notes

### 2026-06-06 — Palimpsest Phase 1 Implementation (IN PROGRESS)

**Working directory**: `/Users/nathanielcannon/Claude/Projects/palimpsest/`
**Venv**: `.venv/` (Python 3.12.12 via uv)
**Plan document**: `research/domain-synthesis/14-phase1-plan-revised.md` (v3.0)
**Task documents**: `research/domain-synthesis/phase1-tasks/` (37 tasks + INDEX + CONVENTIONS + ERRATA)

#### Implementation Status

**Milestone 1.1**: COMPLETE (107 tests, all critical issues resolved, two rounds adversarial + stakeholder)
**Milestone 1.2**: IMPLEMENTED, TWO REVIEW AGENTS RUNNING IN BACKGROUND
- 149 tests passing, ruff clean, tsc clean (no failures)
- 5 track extractors: entities, sentiment, lexical, dialogue, topics — ALL working + tested
- Pipeline: manifest writing, type guards, provenance fields (python_version, spacy_model, booknlp_available)
- Services: OllamaManager, EmbeddingClient, LLMClient — all graceful None-on-failure
- Server: /api/projects/{id}/tracks GET, /api/summarize POST, CORS allows POST for summarize
- Browser: TrackPanel, OverviewBar (density barcodes + search ticks), TextSearch (Ctrl+F), LLMSummary, LoadingOverlay
- spaCy en_core_web_lg model installed successfully

#### BACKGROUND AGENTS STILL RUNNING (check for task-notifications on resume):
1. **M1.2 adversarial code review** — full adversarial review of all M1.2 code
2. **M1.2 stakeholder review** — 3-persona review (Dr. Chen, Marcus Wong, Prof. Miller)

#### STANDING ORDERS (from user — "you have the conn"):
After both reviews complete:
1. Implement ALL fixes, suggestions, requests, missing components from both reviews
2. Continue iteratively with subsequent reviews until ALL M1.2 items fully implemented, tested, validated
3. Live-fire execution validation at milestone boundaries
4. Then proceed to remaining Phase 1 milestones (M1.3a, M1.3b, M1.4)

#### ROUND 1 CRITICAL ISSUES — ALL FIXED (2026-06-07)

1. ~~Wrong spaCy model~~ → FIXED: `en_core_web_lg` default with `sm` fallback
2. ~~ABC instead of Protocol~~ → FIXED: `@runtime_checkable Protocol`, registry uses `isinstance()`
3. ~~Annotation ID format~~ → FIXED: `urn:palimpsest:{project}:{track}:{suffix}`
4. ~~sentence_count always 0~~ → FIXED: calls `segment_sentences()` at ingest
5. ~~Browser rendering absent~~ → FIXED: TextLinearView, AnnotationOverlay, DetailPanel implemented
6. ~~Server binds 0.0.0.0~~ → FIXED: `127.0.0.1`
7. ~~CORS wildcard~~ → FIXED: localhost:5173 only
8. ~~export CLI missing~~ → FIXED: W3C AnnotationCollection format
9. ~~Body.extra overwrite bug~~ → FIXED: raises ValueError on collision
10. ~~Confidence not range-validated~~ → FIXED: checked in __post_init__
11. ~~pipeline_run.json missing fields~~ → FIXED: python_version, spacy_model, booknlp_available
12. ~~Ghost browser/browser/~~ → FIXED: deleted
13. ~~Keyboard stale state~~ → FIXED: reads fresh state per keystroke, bounds checked
14. ~~Hardcoded track list~~ → FIXED: discovery with fallback
15. ~~viewStore missing selectedAnnotation~~ → FIXED
16. ~~validator doesn't check @context~~ → FIXED: checks structure, id, evidenceLevel, confidence, selectors

#### REMAINING MINOR ISSUES (ROLLED INTO M1.2)
- Legacy `src/` directory still present (old code, not in use)
- React 19 vs plan's React 18 (functional, not a blocker)
- No TypeScript pre-commit hooks
- spaCy model cache not yet implemented for segmenter (loads each time)
- Registry dependency_order() double-instantiates
- No browser unit tests (vitest configured but empty)
- AnnotationCollection export missing @id field

### STANDING ORDERS — M1.2 Execution (2026-06-07)

**Authority**: Full autonomous execution granted. "You have the conn."

**Execution cycle**:
1. Execute full M1.2 implementation (T11-T20: sentiment, lexical, dialogue, topics, pipeline orchestration, LLM, search, browser track panel, overview, milestone testing)
2. After M1.2 complete → one round critical adversarial code + architecture review
3. After adversarial review → in-depth stakeholder review (3 personas)
4. Implement ALL fixes, suggestions, requests, and missing components from both reviews
5. Continue iteratively with subsequent reviews until ALL M1.2 roadmap items, atomized tasks, and product features are fully implemented, tested, validated, and approved
6. Live-fire execution validation at each milestone boundary

**M1.2 scope** (from plan): T11-T20
- T11: Sentiment track (VADER)
- T12: Lexical track (TTR, hapax)
- T13: Dialogue track (quote detection)
- T14: Topics track (LDA)
- T15: Pipeline orchestration (multi-track runner)
- T16: Ollama service manager
- T17: LLM summarizer
- T18: Text search (browser)
- T19: Track panel + overview bar + loading states
- T20: Milestone 1.2 testing + regression

**Stakeholder consensus priorities** (from M1.1 review):
- Sentiment + dialogue extractors are minimum viable "multi-track"
- Browser track toggling UI most-requested by scholar persona
- Paragraph-offset single-source-of-truth (serve segment data via API)
- Per-entity-type filtering in browser

#### NEXT STEPS (in order)

1. Fix the 6 critical issues above
2. Implement AnnotationOverlay.tsx + DetailPanel.tsx to pass M1.1 smoke test
3. Clean up legacy directories
4. Generate regression snapshots for M1.1
5. Tag v0.1.0
6. Begin M1.2 (T11-T20): sentiment, lexical, dialogue, topics tracks + LLM + browser UI

#### Key Paths
- Research: `research/domain-synthesis/` (00-14, 15 documents)
- Task docs: `research/domain-synthesis/phase1-tasks/` (T01-T37 + 3 reference docs)
- Phase 1 plan: `research/domain-synthesis/14-phase1-plan-revised.md`
- Errata: `research/domain-synthesis/phase1-tasks/00-ERRATA.md`
- Conventions: `research/domain-synthesis/phase1-tasks/00-CONVENTIONS.md`

#### Technology Stack (resolved)
- Frontend: React 19 + TypeScript + Zustand (plan says 18, installed 19)
- Build: Vite
- Backend: Python 3.12 / FastAPI / spaCy
- Annotation format: W3C Web Annotation JSON-LD stored as JSONL (PAF is export only)
- spaCy: en_core_web_sm installed (need to install en_core_web_lg for production)
- Test fixtures: Pride & Prejudice + Moby-Dick (public domain)

#### Total Research Corpus
14 documents (382KB), 49 papers/books on disk, 140+ citations
