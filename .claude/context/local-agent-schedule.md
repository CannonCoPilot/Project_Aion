# Local Agent Schedule

**Purpose**: Time-keyed queue of suggested local agent workflows — actions
that a future Jarvis session should run at or after a specific timestamp,
or when a specific condition is met. Used in lieu of firing remote routines
or launchd jobs, so that the suggestion stays auditable and editable.

**Scope**: Suggestions only — items I would otherwise have offered to
`/schedule`. Already-active scheduling infrastructure (launchd jobs, remote
routines) is NOT mirrored here; those have their own canonical configs.

**Consumed by**: AC-01 session start (read this on login; surface any items
with `earliest_run ≤ now` and `status: PENDING`); manual review during
`/maintain` and `/reflect` cycles.

**Updated**: 2026-05-01T17:30:00Z

---

## §1 Quick reference

Sorted by earliest_run.

| earliest_run (UTC) | local time | action | status |
|---|---|---|---|
| 2026-05-03T03:28:35Z | 2026-05-02 21:28 MDT | **Stage-1 interim safety check** (Phase 1.1 + 1.5; 1.2/1.3 deferred until Phase 0.5 ships) | PENDING |
| 2026-05-15T03:28:35Z | 2026-05-14 21:28 MDT | Phase 1.5 — Stage-2 sample-sufficiency check | PENDING |
| 2026-05-15T03:27:28Z | 2026-05-14 21:27 MDT | Phase 1.1 — Stage-2 sample-sufficiency check | PENDING |
| event-bound | — | Phase 1.5 — Stage-2 final analysis | BLOCKED |
| event-bound | — | Phase 1.1 — Stage-2 final analysis | BLOCKED |
| any time | — | Phase 0.5 — pipeline-telemetry extractor (backlog) | READY |
| event-bound | — | Phase 1.2 / 1.3 — Stage-1 interim check (deferred until 0.5) | BLOCKED |
| event-bound | — | Phase 1.2 / 1.3 — Stage-2 sample-sufficiency | BLOCKED |
| event-bound | — | Phase 1.2 / 1.3 — Stage-2 final analysis | BLOCKED |
| 2026-05-01T17:00:00Z | 2026-05-01 11:00 MDT | Phase 1.2 / 1.3 — pre-registrations + two-stage gating doc | DONE |
| 2026-05-01T16:50:00Z | 2026-05-01 10:50 MDT | Phase 1.5 — pre-registration + Alfred-Dev baseline | DONE |
| 2026-05-01T16:30:00Z | 2026-05-01 10:30 MDT | Phase 0.4 — quote-aware register filter | DONE |

Status legend:
- `READY` — earliest_run has passed; no blocking prerequisites; can start now
- `PENDING` — earliest_run is in the future; check back at that time
- `BLOCKED` — gated on a condition that hasn't been met
- `IN-FLIGHT` — a session is actively working on it
- `DONE` — completed; moved to §3

---

## §2 Items

Each item carries enough context to be picked up cold by a session that has
no memory of when it was created.

---

### Item 1 — Stage-1 interim safety check (Phase 1.1 + 1.5)

**Status**: PENDING
**Earliest run**: 2026-05-03T03:28:35Z (deploy_timestamp + 48h)
**Latest run before pushing**: 2026-05-04T03:28:35Z
**Trigger**: time-based; design doc §10.4 two-stage gating
**Owner**: Jarvis (local session)
**Prerequisites**: none

**Why**: Two-stage gating per design doc §10.4. Stage-1 evaluates only
regression-catch axes (cache hit rate, eph_1h adoption, register violations)
— NOT per-class brevity. Purpose: detect catastrophic regression early so
orthogonal-stream work (Phase 2 CoD, Phase 3 JICM, Phase 5 dashboard) can
proceed without 14-day blocking. Phase 1.2 / 1.3 Stage-1 deferred until
Phase 0.5 pipeline-telemetry extractor ships.

**What to do**:
1. Re-run extractor v2 against
   `~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/` and
   `~/.claude/projects/-Users-nathanielcannon-Claude-Alfred-Dev/`.
2. For each: split pre-deploy / post-deploy at the relevant deploy timestamp
   (Phase 1.1: `2026-05-01T03:27:28Z`; Phase 1.5: `2026-05-01T03:28:35Z`).
3. Compute Stage-1 axes per the pre-reg `interim_check` blocks:
   - `cache_hit_rate_dip_pp` (token-weighted): post vs pre. Threshold ±5pp.
   - `eph_1h_adoption_pct` (post-deploy bucket): threshold ≥ 50%.
   - `register_violations_per_100_blocks` (post-deploy bucket, Phase 0.4
     quote-aware filter active): threshold ≤ 5.
4. For each phase, emit a verdict: STAGE_1_CLEAR, STAGE_1_HALT, or
   STAGE_1_DEFERRED (post-deploy bucket too small for any axis).
5. Write a short interim report:
   `.claude/metrics/token-compression/phase-1-x-stage-1-interim-2026-05-03.md`.
6. If any STAGE_1_HALT: surface immediately in session-state.md and pause
   downstream work.

**Outputs**:
- Per-phase Stage-1 verdict.
- Interim report; updates to pre-reg `outcome.stage_1_*` blocks.
- If STAGE_1_CLEAR: Phase 3 JICM work continues unimpeded; Phase 2 CoD
  groundwork can begin.

**Effort estimate**: 30 minutes.

**Coordination**: launchd reminder `com.aion.token-compression-reminder`
fires 2026-05-03 09:00 MDT (~6 hours after Stage-1 earliest_run). Aligns
naturally with this item.

---

### Item 2 — Phase 1.5 Stage-2 sample-sufficiency check

**Status**: PENDING
**Earliest run**: 2026-05-15T03:28:35Z (deploy_timestamp + 14d)
**Latest run before pushing**: 2026-05-22T03:28:35Z
**Trigger**: time-based; per pre-reg `collection_window_days: 14`
**Owner**: Jarvis (local session)
**Prerequisites**: none (independent of Item 1's Stage-1 outcome —
Stage-2 is the formal pre-reg sign-off regardless of Stage-1 verdict)

**Why**: Formal Phase-2 promotion gate per design doc §10.4 / §10.3.

**What to do**:
1. Re-run extractor v2 against Alfred-Dev corpus.
2. Filter to `ts >= 2026-05-01T03:28:35Z` (post-deploy bucket).
3. Tag each post-deploy session ordinary vs atypical per
   `baseline-aifred-2026-05-01.md` §3 bands.
4. If `ordinary_sessions ≥ 3`: promote Item 3 (final analysis) to READY.
5. If `< 3`: extend Item 2 earliest_run by another 7-14 days; do NOT
   relax ordinariness criteria.

**Outputs**: Updated Item 2/3 status, or run-report kickoff.
**Effort estimate**: 30 minutes.

---

### Item 3 — Phase 1.5 Stage-2 final analysis (event-bound)

**Status**: BLOCKED
**Earliest run**: when 3 ordinary Alfred-Dev post-deploy sessions exist
**Trigger**: condition-based; Item 2 promotes this
**Owner**: Jarvis (local session)
**Prerequisites**:
- 3+ ordinary post-deploy Alfred-Dev sessions per `baseline-aifred-2026-05-01.md` §3
- Phase 0.4 quote-aware register filter (DONE 2026-05-01)

**Why**: Phase 1.5 is the **first clean pre-registered run**. Stage-2
verdict is the formal Phase-2-promotion gate.

**What to do**: full per-class statistical analysis using the methodology
of `phase-1-1-jeeves-brief-result-2026-05-01.md`, but against the
Alfred-Dev pre-registration, register-markers override, and bands.

**Outputs**:
- `.claude/metrics/token-compression/phase-1-5-alfred-brief-result-<YYYY-MM-DD>.md`
- Pre-reg `outcome.status` = FULL_PASS / PROVISIONAL_PASS / FAIL / etc.
- If FULL_PASS: Phase 2 (CoD on Alfred-Dev) unblocked.

**Effort estimate**: 1-2 hours.

---

### Item 4 — Phase 1.1 Stage-2 sample-sufficiency check

**Status**: PENDING
**Earliest run**: 2026-05-15T03:27:28Z (deploy_timestamp + 14d)
**Latest run before pushing**: 2026-05-22T03:27:28Z
**Trigger**: time-based; per pre-reg `collection_window_days: 14`
**Owner**: Jarvis (local session)
**Prerequisites**: none

**Why**: Phase 1.1 rerun on 2026-05-01 closed at INCOMPLETE (all 3
post-deploy sessions atypical_analysis). Item 4 re-checks at the formal
14-day mark.

**What to do**:
1. Re-run extractor v2 against the Jarvis corpus.
2. Count post-deploy sessions (ts ≥ 2026-05-01T03:27:28Z); tag ordinary
   vs atypical per design doc §7.3 measured bands.
3. If `ordinary_sessions ≥ 3`: promote Item 5 to READY.
4. If `< 3`: extend Item 4 earliest_run by 7-14 days; update
   `phase-1-1-jeeves-brief-result-2026-05-01.md` with a window-extension note.

**Outputs**: Updated Item 4/5 status, or run-report kickoff.
**Effort estimate**: 30 minutes.

**Coordination**: launchd reminder `com.aion.token-compression-reminder`
fires 2026-05-03 (covers Item 1 timing, not this one). Remote routine
`trig_01EtBi9X7q42owtUCWzmSgLH` fires 2026-05-04T03:00:00Z (also early).
Both nudge but neither runs Stage-2 analysis.

---

### Item 5 — Phase 1.1 Stage-2 final analysis (event-bound)

**Status**: BLOCKED
**Earliest run**: when 3 ordinary post-deploy Jarvis sessions exist
**Trigger**: condition-based; Item 4 promotes this
**Owner**: Jarvis (local session)
**Prerequisites**:
- 3+ post-deploy Jarvis sessions in §7.3 bands
- Phase 0.4 quote-aware register filter (DONE)

**What to do**: same procedure as Phase 1.1 rerun on 2026-05-01, but with
≥3 ordinary sessions in bucket.

**Outputs**: Final Phase 1.1 run report; pre-reg `outcome.status` set.
If PASS: Phase 2 (CoD on Jarvis) unblocked.

**Effort estimate**: 1-2 hours.

---

### Item 6 — Phase 0.5: pipeline-telemetry extractor (backlog)

**Status**: READY
**Earliest run**: any time (no time gate)
**Trigger**: any time before next pipeline-intervention evaluation
**Owner**: Jarvis (local session) or Alfred-Dev pipeline contributor
**Prerequisites**: none

**Why**: Phase 1.2 / 1.3 evaluations require per-task telemetry from
Pulse, not Claude Code session JSONLs. The current `cache-telemetry-
extractor-v2.py` consumes Claude Code's `.jsonl` `usage` blocks; it does
not consume Pulse task metadata. Until this extractor lands, Phase 1.2
and 1.3 Stage-1 + Stage-2 evaluations are deferred (Items 7-9 BLOCKED).

**What to do**:
1. Survey Pulse task metadata schema for executor + reviewer fields:
   `prompt_tokens`, `completion_tokens`, `thinking_tokens`,
   `cache_creation`, `cache_read`, response timestamps, model identity.
2. Decide on the extraction unit — per Pulse task, per executor invocation,
   or per pipeline cycle.
3. Build `pipeline-telemetry-extractor.py` (analog of v2 but consuming
   Pulse task records). Output the same CSV schema for compatibility:
   intent_class can be tagged `executor_completion`, `reviewer_verdict`,
   `reviewer_reasoning` etc.
4. Validate against Alfred-Dev pipeline data; emit class distribution.
5. Document the extractor in design doc §13.x or a new §13.4.
6. Promote Items 7-9 from BLOCKED to PENDING/READY as appropriate.

**Outputs**:
- `.claude/skills/token-compression/scripts/pipeline-telemetry-extractor.py`
- Documentation update.
- Items 7-9 status updates.

**Effort estimate**: 3-5 hours including schema discovery and validation.

---

### Item 7 — Phase 1.2 / 1.3 Stage-1 interim check (event-bound)

**Status**: BLOCKED
**Earliest run**: when Phase 0.5 pipeline-telemetry extractor ships
**Trigger**: condition-based; Item 6 promotes this
**Prerequisites**: Phase 0.5 (Item 6) DONE

**What to do**: run the new pipeline extractor; compute Phase 1.2 / 1.3
Stage-1 axes against `f15f6a2` deploy timestamp; emit verdicts; update
both pre-reg `outcome.stage_1_*` blocks.

**Effort estimate**: 30 minutes.

---

### Item 8 — Phase 1.2 / 1.3 Stage-2 sample-sufficiency (event-bound)

**Status**: BLOCKED
**Earliest run**: when Phase 0.5 ships AND deploy_timestamp + 14d (2026-05-15T03:29:07Z) reached
**Trigger**: condition-based + time-based
**Prerequisites**: Item 6 DONE; 14-day window reached

**What to do**: same as Item 4 but for pipeline corpus.

---

### Item 9 — Phase 1.2 / 1.3 Stage-2 final analysis (event-bound)

**Status**: BLOCKED
**Earliest run**: when Item 8 promotes this
**Prerequisites**: Item 6 DONE; 3+ ordinary pipeline runs accumulated

**What to do**: per-class statistical analysis on pipeline-executor and
pipeline-reviewer corpora separately; emit verdicts; promote Phase 4
COMPRESSION_MODE plumbing if FULL_PASS.

---

## §3 Completed items

Items move here from §2 when they reach DONE status. Move ordering:
most-recent-first.

| Completed | Item | Result | Linked report |
|---|---|---|---|
| 2026-05-01T17:00:00Z | Phase 1.2 / 1.3 — pre-registrations filed; two-stage gating (§10.4) added | DONE; Phase 1.2 (executor) and Phase 1.3 (reviewer) pre-registrations filed against deploy `f15f6a2`; predictions magnitude-mirrored from Phase 1.5; analysis deferred to Phase 0.5 (pipeline-telemetry extractor); design doc §10.4 documents two-stage gating model | `.claude/metrics/token-compression/pre-registration-phase-1-2-pipeline-executor-brief.yaml`; `.claude/metrics/token-compression/pre-registration-phase-1-3-pipeline-reviewer-brief.yaml`; design doc §10.4 + §14.3 |
| 2026-05-01T16:50:00Z | Phase 1.5 — pre-registration + Alfred-Dev baseline | DONE; Alfred-Dev v2 telemetry generated (3,488 turns / 133 sessions, all pre-deploy); pre-registration filed at zero post-deploy turns (first clean pre-reg in benchmark family); register-markers override created; sample window now open through 2026-05-15 | `.claude/metrics/token-compression/pre-registration-phase-1-5-alfred-brief.yaml`; `.claude/metrics/token-compression/baseline-aifred-2026-05-01.md` |
| 2026-05-01T16:30:00Z | Phase 0.4 — quote-aware register filter for extractor v2 | DONE; corpus-wide register violations 636 → 608; targeted false-positive case (94c8971e turn 182) 2 → 0; class shares unchanged | `.claude/metrics/token-compression/phase-1-1-jeeves-brief-result-2026-05-01.md` §6 (Post-Phase-0.4 re-scan); design doc §14.3 changelog |

---

## §4 Maintenance

- **When adding a new item**: assign a sequential ID, fill all fields,
  update §1 quick-reference table.
- **When an item moves to IN-FLIGHT**: update status; note start time at
  bottom of item entry.
- **When an item completes**: move from §2 to §3; preserve full content
  for audit.
- **When an item's earliest_run passes**: status auto-transitions PENDING →
  READY (no edit needed if a session checks during AC-01).
- **When a launchd or remote routine schedule changes**: do NOT update this
  doc; those have their own canonical configs at
  `~/Library/LaunchAgents/com.aion.*.plist` and the remote-routine API
  respectively.
- **When the doc itself becomes stale**: trigger via `/maintain` (AC-08);
  audit each item against current state.

---

## §5 References

- Design doc: `projects/project-aion/reports/token-compression-experimental-design.md` (§10.4 two-stage gating)
- Implementation guide: `projects/project-aion/reports/token-compression-implementation-guide.md`
- Roadmap: `projects/project-aion/reports/token-compression-roadmap.md`
- Phase 1.1 rerun result: `.claude/metrics/token-compression/phase-1-1-jeeves-brief-result-2026-05-01.md`
- Pre-registrations:
  - Phase 1.1: `.claude/metrics/token-compression/pre-registration-phase-1-1-jeeves-brief.yaml`
  - Phase 1.5: `.claude/metrics/token-compression/pre-registration-phase-1-5-alfred-brief.yaml`
  - Phase 1.2: `.claude/metrics/token-compression/pre-registration-phase-1-2-pipeline-executor-brief.yaml`
  - Phase 1.3: `.claude/metrics/token-compression/pre-registration-phase-1-3-pipeline-reviewer-brief.yaml`

---

*Local Agent Schedule v1 — created 2026-05-01 in lieu of `/schedule` invocations.*
