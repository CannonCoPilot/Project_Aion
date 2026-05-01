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

**Updated**: 2026-05-01T16:50:00Z

---

## §1 Quick reference

Sorted by earliest_run.

| earliest_run (UTC) | local time | action | status |
|---|---|---|---|
| 2026-05-15T03:28:35Z | 2026-05-14 21:28 MDT | Phase 1.5 — sample-sufficiency check (Alfred-Brief, 14d post-deploy) | PENDING |
| 2026-05-15T15:00:00Z | 2026-05-15 09:00 MDT | Phase 1.1 — sample-sufficiency check | PENDING |
| event-bound | — | Phase 1.5 — final analysis (gated on 3 ordinary AIFred-Pro-Dev sessions) | BLOCKED |
| event-bound | — | Phase 1.1 — final analysis (gated on 3 ordinary Jarvis sessions) | BLOCKED |
| 2026-05-01T16:50:00Z | 2026-05-01 10:50 MDT | Phase 1.5 — pre-registration + AIFred-Pro-Dev baseline | DONE |
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

### Item 1 — Phase 1.5 sample-sufficiency check

**Status**: PENDING
**Earliest run**: 2026-05-15T03:28:35Z (deploy_timestamp + 14d)
**Latest run before pushing**: 2026-05-22T03:28:35Z
**Trigger**: time-based; per pre-registration `collection_window_days: 14`
**Owner**: Jarvis (local session)
**Prerequisites**: none

**Why**: Phase 1.5 setup (pre-registration, register-markers override,
AIFred-Pro-Dev baseline) was completed on 2026-05-01. The 14-day
collection window is now open. Need to check whether 3+ ordinary
AIFred-Pro-Dev sessions accumulate within the window and either run
final analysis (Item 2) or extend the window.

**What to do**:
1. Re-run extractor v2 against
   `~/.claude/projects/-Users-nathanielcannon-Claude-AIFred-Pro-Dev/`:
   `cache-telemetry-extractor-v2.py <dir> --register-markers
   .claude/skills/token-compression/templates/register-markers-phase-1-5-alfred-brief.yaml
   --emit-class-distribution --out
   .claude/metrics/token-compression/cache-telemetry-aifred-v2-<YYYYMMDD>.csv`.
2. Filter to `ts >= 2026-05-01T03:28:35Z` (post-deploy bucket).
3. Tag each post-deploy session ordinary vs atypical per
   `baseline-aifred-2026-05-01.md` §3 bands.
4. If `ordinary_sessions ≥ 3`: promote Item 2 from BLOCKED to READY.
5. If `ordinary_sessions < 3`: extend Item 1 earliest_run by another
   7-14 days; do NOT relax ordinariness criteria.

**Outputs**:
- Updated Item 1/2 status, or run-report kickoff.

**Effort estimate**: 30 minutes.

---

### Item 2 — Phase 1.5 final analysis (event-bound)

**Status**: BLOCKED
**Earliest run**: when 3 ordinary AIFred-Pro-Dev post-deploy sessions exist
**Trigger**: condition-based; Item 1 promotes this
**Owner**: Jarvis (local session)
**Prerequisites**:
- 3+ post-deploy AIFred-Pro-Dev sessions classified ordinary per
  `baseline-aifred-2026-05-01.md` §3 bands
- Phase 0.4 quote-aware register filter shipped (DONE 2026-05-01)

**Why**: This is the actual Phase 1.5 final-decision step. Phase 1.5 is
the **first clean pre-registered run** in the benchmark family —
predictions filed before any post-deploy data existed.

**What to do**: same procedure as Phase 1.1 rerun on 2026-05-01, but using
the AIFred-Pro-Dev pre-registration, register-markers override, and
ordinariness bands. Cache, register, and per-class brevity should yield
definitive PASS / FAIL verdicts (no manual-review burden — Phase 0.4
filter handles the meta-mention false-positive class).

**Outputs**:
- Run report at `.claude/metrics/token-compression/phase-1-5-alfred-brief-result-<YYYY-MM-DD>.md`.
- Pre-registration `outcome.status` set to FULL_PASS / PROVISIONAL_PASS /
  FAIL / etc.
- If FULL_PASS: Phase 2 (CoD validation on AIFred-Pro-Dev) unblocked.

**Effort estimate**: 1-2 hours.

---

### Item 3 — Phase 1.1 sample-sufficiency check

**Status**: PENDING
**Earliest run**: 2026-05-15T15:00:00Z (2026-05-15 09:00 MDT)
**Latest run before pushing**: 2026-05-22T15:00:00Z (one week later)
**Trigger**: time-based; ~14 days post-deploy per the pre-registration's
`collection_window_days: 14`
**Owner**: Jarvis (local session)
**Prerequisites**: none

**Why**: The Phase 1.1 rerun on 2026-05-01 closed at INCOMPLETE because
all 3 post-deploy sessions were tagged atypical_analysis. Need to check
whether 14 days of normal Jarvis use has accumulated 3+ ordinary sessions
(class composition within §7.3 bands). If yes, run final analysis and
make the promotion-to-Phase-2 decision. If no, push the window by another
7-14 days (do NOT relax the ordinariness criterion).

**What to do**:
1. Re-run extractor v2 against
   `~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/` to refresh
   the CSV: `cache-telemetry-extractor-v2.py <dir> --register-markers
   <yaml> --emit-class-distribution --out
   .claude/metrics/token-compression/cache-telemetry-v2-<YYYYMMDD>.csv`.
2. Count post-deploy sessions (ts ≥ 2026-05-01T03:27:28Z) and tag each
   ordinary vs atypical per §7.3 bands (now using measured baseline values
   from the 2026-05-01 run).
3. If ordinary_sessions ≥ 3:
   - Run full per-class statistical analysis using the same methodology as
     `phase-1-1-jeeves-brief-result-2026-05-01.md`.
   - Build new run report from template; verdict expected to be FULL_PASS
     or PROVISIONAL_PASS or FAIL.
   - Update pre-registration yaml `outcome` block.
   - If FULL_PASS: open Phase 2 (CoD validation) work.
4. If ordinary_sessions < 3:
   - Update this doc Item 3 with new earliest_run = now + 14 days.
   - Update `phase-1-1-jeeves-brief-result-2026-05-01.md` with note about
     window extension.
   - Defer Phase 2 promotion accordingly.

**Outputs**:
- Either: final Phase 1.1 run report + Phase 2 unblocked, or
- An updated Item 3 entry with extended window.

**Effort estimate**: 30 minutes if 3 ordinary sessions exist; 5 minutes
if extending the window.

**Coordination**: launchd reminder `com.aion.token-compression-reminder`
fires 2026-05-03 09:00 MDT (earlier than this item — that one just nudges,
this one actually re-runs analysis). Remote routine
`trig_01EtBi9X7q42owtUCWzmSgLH` fires 2026-05-04T03:00:00Z. Neither
replaces this item; both are upstream nudges.

---

### Item 4 — Phase 1.1 final analysis (event-bound)

**Status**: BLOCKED
**Earliest run**: when 3 ordinary post-deploy Jarvis sessions exist
**Trigger**: condition-based, not time-based — Item 3 promotes this from
BLOCKED to READY when the condition is met
**Owner**: Jarvis (local session)
**Prerequisites**:
- 3+ post-deploy sessions in `~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/`
  with class composition within §7.3 ordinariness bands
- Phase 0.4 quote-aware register filter shipped (DONE 2026-05-01)

**Why**: This is the actual Phase 1.1 final-decision step. Item 3 detects
when prerequisites are satisfied; this item is the run itself.

**What to do**: same procedure as Phase 1.1 rerun on 2026-05-01, but with
the ordinary post-deploy bucket having ≥ 3 sessions. Cache, register,
and per-class brevity should all yield definitive PASS / FAIL verdicts.

**Outputs**:
- Final Phase 1.1 run report.
- Pre-registration `outcome.status` set to FULL_PASS / PROVISIONAL_PASS /
  FAIL / etc.
- If PASS: Phase 2 CoD validation unblocked.

**Effort estimate**: 1-2 hours.

---

## §3 Completed items

Items move here from §2 when they reach DONE status. Move ordering:
most-recent-first.

| Completed | Item | Result | Linked report |
|---|---|---|---|
| 2026-05-01T16:50:00Z | Phase 1.5 — pre-registration + AIFred-Pro-Dev baseline | DONE; AIFred-Pro-Dev v2 telemetry generated (3,488 turns / 133 sessions, all pre-deploy); pre-registration filed at zero post-deploy turns (first clean pre-reg in benchmark family); register-markers override created; sample window now open through 2026-05-15 | `.claude/metrics/token-compression/pre-registration-phase-1-5-alfred-brief.yaml`; `.claude/metrics/token-compression/baseline-aifred-2026-05-01.md` |
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

- Design doc: `projects/project-aion/reports/token-compression-experimental-design.md`
- Implementation guide: `projects/project-aion/reports/token-compression-implementation-guide.md`
- Roadmap: `projects/project-aion/reports/token-compression-roadmap.md`
- Phase 1.1 rerun result: `.claude/metrics/token-compression/phase-1-1-jeeves-brief-result-2026-05-01.md`
- Pre-registration: `.claude/metrics/token-compression/pre-registration-phase-1-1-jeeves-brief.yaml`

---

*Local Agent Schedule v1 — created 2026-05-01 in lieu of `/schedule` invocations.*
