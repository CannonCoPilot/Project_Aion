# Alfred-Dev Baseline — 2026-05-01

**Corpus**: `~/.claude/projects/-Users-nathanielcannon-Claude-Alfred-Dev/`
**Telemetry CSV**: `.claude/metrics/token-compression/cache-telemetry-aifred-v2-20260501.csv`
**Extractor**: `cache-telemetry-extractor-v2.py` (post-Phase-0.4 quote-aware register filter)
**Reference for**: Phase 1.5 Alfred-Brief and any future Alfred-Dev intervention
**Cutoff**: 2026-05-01T03:28:35Z (Alfred-Brief deploy commit `c31b2bd`)

---

## §1 Why a separate baseline

Jarvis's pre-deploy baseline (`baseline-2026-04-30.md`) is not transferable.
The Alfred-Dev corpus has a substantially different content profile:
pipeline development, MCP testing, dashboard work, and David-O'Neil-collab
sessions, versus Jarvis's mix of self-improvement, Chronicler, infra, and
methodology work. Class composition diverges enough that comparing post-
deploy AIFred sessions against Jarvis bands would mis-tag every session
as atypical.

## §2 Pre-Deploy Class Composition

n = 3,488 turns / 133 sessions. ts < 2026-05-01T03:28:35Z.

| Class | Turns | Share | Jarvis equivalent | Δ |
|---|---|---|---|---|
| `tool_only` | 118 | 3.38% | 22.92% | -19.54pp |
| `brief` | 476 | 13.65% | 34.34% | -20.69pp |
| `interactive` | 1,993 | **57.14%** | 26.83% | **+30.31pp** |
| `analysis` | 851 | 24.40% | 13.65% | +10.75pp |
| `code_dump` | 11 | 0.32% | 0.61% | -0.29pp |
| `structured` | 39 | 1.12% | 1.65% | -0.53pp |

Headline distinction: Alfred-Dev is dominated by interactive answers
(57%) where Jarvis is more evenly split between tool-call-only turns,
short status outputs, and conversational answers. This means:

1. The Alfred-Brief brevity effect should be most visible on `interactive`
   in this corpus, since 57% of post-deploy turns will be in that class.
2. `tool_only` is too rare here (3.38%) to power any interesting comparison.
3. `code_dump` and `structured` are rare enough that per-class
   significance tests for those classes will likely be underpowered for
   the foreseeable future — same as in Jarvis.

## §3 Ordinariness Bands

A post-deploy session is "ordinary" if its per-class composition falls
within these bands:

| Class | Reference | Tolerance | Band |
|---|---|---|---|
| `tool_only` | 3.38% | ±10pp | [0%, 13.38%] (lower bound clamped to 0) |
| `brief` | 13.65% | ±10pp | [3.65%, 23.65%] |
| `interactive` | 57.14% | ±10pp | [47.14%, 67.14%] |
| `analysis` | 24.40% | ±10pp | [14.40%, 34.40%] |
| `code_dump` | 0.32% | ±2pp | [0%, 2.32%] |
| `structured` | 1.12% | ±2pp | [0%, 3.12%] |

Sessions outside any of these bands are tagged atypical for the violating
class(es) (e.g., `atypical_analysis` for an analysis-heavy migration session)
and DO NOT count toward Phase 1.5's `sample_targets.ordinary_sessions: 3`.

## §4 Cache Hit Rate Reference

| Metric | Pre-deploy value |
|---|---|
| Token-weighted hit rate | (TBD — compute on next pass) |
| Per-turn mean hit rate | (TBD — compute on next pass) |
| eph_1h adoption | (TBD — compute on next pass) |

These are deferred to the Phase 1.5 run report; the cache test compares
post-deploy bucket against the same pre-deploy bucket then, so re-computing
on the same CSV at run time avoids drift.

## §5 Per-Class Pre-Deploy Output-Token Medians

These will serve as the comparison reference in the Phase 1.5 run report's
§5 per-class brevity table. Computed at run time from the same CSV.

| Class | n | median output_tokens | Notes |
|---|---|---|---|
| `tool_only` | 118 | (TBD) | likely ~1, same shape as Jarvis |
| `brief` | 476 | (TBD) | |
| `interactive` | 1,993 | (TBD) | the big one — drives most of the effect signal |
| `analysis` | 851 | (TBD) | |
| `code_dump` | 11 | (TBD) | underpowered for significance tests |
| `structured` | 39 | (TBD) | underpowered for significance tests |

Computing now is unnecessary; the run-report extraction script will pull
these from the CSV in one pass.

## §6 Files

- Telemetry CSV: `.claude/metrics/token-compression/cache-telemetry-aifred-v2-20260501.csv` (gitignored, regenerable)
- Pre-registration: `.claude/metrics/token-compression/pre-registration-phase-1-5-alfred-brief.yaml`
- Register markers override: `.claude/skills/token-compression/templates/register-markers-phase-1-5-alfred-brief.yaml`
- Deploy commit: `davidmoneil/AIFred-Pro:nate-dev` `c31b2bd` (2026-05-01T03:28:35Z)
- Directive text: Alfred-Dev `.claude/CLAUDE.md` Output style (Alfred-Brief) section

---

*Alfred-Dev baseline reference — 2026-05-01.*
*Captured at the moment of Phase 1.5 pre-registration; before any post-deploy turns existed.*
