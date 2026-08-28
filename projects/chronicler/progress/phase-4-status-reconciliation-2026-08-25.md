# Phase 4 Status Reconciliation — 2026-08-25

**Author**: W2:Urist · **Trigger**: persona `CLAUDE.md` said "Phase 4 is PAUSED pending P1"
while commits `a54ee34` and `69736a2` clearly landed Stages 4.3–4.8. One of the two was wrong.

## Verdict

**Phase 4 (Narrative Engine) is CODE COMPLETE but NOT SIGNED OFF.**
The "PAUSED pending P1" line was **stale**. Work resumed and every M4 DoD item has
implementing code. Phase 4 is *not* complete, on two counts recorded below.

## Evidence

### Stages landed (git)

| Commit | Content |
|---|---|
| `b507a0a` | Stage 4.1 — temporal year headers, artifact claim chain synthesis, 23 tests |
| `782040d` | Stage 4.2 — narrative generators (war, battle, civilization, biography) |
| `cfd5582` | Phase 4 comprehensive validation — "85 tests", 3 bug fixes |
| `a54ee34` | Stage 4.3 — agentic SQL storyteller with autonomous DB exploration |
| `69736a2` | Stages 4.4–4.8 — monitoring, AI generators, fortress saga, quality evaluation |

### M4 DoD walked against the code (not against commit messages)

| DoD item | Implementing code |
|---|---|
| Template system architecture, 132+ event types, 50+ death causes, fallback, perspective, temporal, circumstance | `chronicler/explorer/perspective.py` (1364 lines, ~144 template keys) |
| War / battle / civilization / biography generators | `storyteller/narrative_generators.py` — `generate_war_narrative`, `generate_battle_detail`, `generate_civilization_narrative`, `generate_character_biography` |
| Annotated schema summary | `storyteller/annotated_schema.py` |
| SQL tool definition + safety layer | `storyteller/agentic.py` — `validate()` rejects non-SELECT/WITH, `_enforce_limit()` |
| Multi-round SQL exploration | `storyteller/agentic.py` — `AGENTIC_MAX_ROUNDS` loop |
| Mode toggle (keyword/agentic/hybrid) + SSE filtering | `api/routes/storyteller.py` |
| Four-phase latency logging + monitoring dashboard | `chronicler/monitoring.py` (context/TTFT/LLM/total), `api/routes/monitoring.py` |
| Stage 4.5 AI generators | `storyteller/ai_generators.py` — `generate_world_summary`, `generate_obituary`, `generate_year_in_history`, `generate_highlight_reel` |
| Fortress saga, quality evaluation | `storyteller/saga_generator.py`, `storyteller/quality.py` |

`saga_generator.py` and `quality.py` read only pre-existing tables — no missing migration.

### Tests actually run (not inferred)

Started `chronicler serve --port 8080` against the live DB, ran the suite, stopped the server.

- `tests/test_phase4_validation.py` — **44 passed, 0 failed** (5.6s).
  The commit message claiming "85 tests" overcounts; the phase-4 file holds 44.
- Full suite — **441 passed, 43 failed, 5 errors, 5 skipped, 3 xfailed** (2m51s).

Test fixture IDs (HF 42730, HF 1170, site 331, artifact 211) all resolve in the live DB, so
the phase-4 suite is still meaningful against world 1.

## Why this is NOT "COMPLETE"

### 1. 43 stale tests fail repo-wide

Diagnosed, and they are **not product regressions** — the test suite drifted behind the product:

- `tests/test_xml_parser.py` (38 failures): `_parse_sites` has returned a **3-tuple**
  (`sites, structs, site_properties`) since Stage 3.1 CDM expansion; the tests still do
  `sites, structs = _parse_sites(...)` → `ValueError: too many values to unpack`.
- `tests/test_chronicler_validation.py` (5 errors): references a `conn` fixture that no
  conftest defines → collection error.

Leaving these red means the suite cannot detect a *real* regression. That is the actual risk.

### 2. No packaged stand-alone executable

`pyproject.toml` declares `chronicler = "chronicler.cli:cli"`, and the CLI is rich
(`serve`, `ingest`, `watch`, `probe`, `rescore`, `worldgen`, …). But per **THE OVERRIDING
RULE**, a phase is not complete until a stand-alone executable ships packaged, hands-off and
user-controlled. Running from `.venv/bin/chronicler` in a dev checkout is not that.

Per **NO SILENT DEGRADATION**: I have not marked M4 done to make the roadmap look finished.
The gap is in the *method* of shipping, and that is what needs closing.

## Recommended close-out for M4

1. Repair the 38 `test_xml_parser.py` unpack sites and add the missing `conn` fixture. Cheap,
   and it restores the suite's ability to catch regressions.
2. Build and verify the packaged `chronicler` executable.
3. Tick the M4 DoD boxes in `reports/phases/phase-4-narrative-engine.md` (all 71 are still
   unchecked) and only then move the roadmap row to COMPLETE.

## Doc corrections made alongside

- `personas/urist/CLAUDE.md` — replaced the stale "PAUSED pending P1" line.
- `.claude/context/current-plans.md` — Phase 4 roadmap row.
- `projects/chronicler/CLAUDE.md` — VM was `192.168.64.2` + TCP 5000 (both wrong; it is
  `192.168.64.3` and `dfhack-run` over SSH), and world was "Namoram" (live DB says
  **"Orid Zurko"**). Data is consistent; only the labels had drifted.
