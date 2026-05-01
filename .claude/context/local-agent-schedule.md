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

**Updated**: 2026-05-01T15:30:00Z

---

## §1 Quick reference

Sorted by earliest_run.

| earliest_run (UTC) | local time | action | status |
|---|---|---|---|
| **now** | — | Phase 0.4 — quote-aware register filter for extractor v2 | READY |
| **now** | — | Phase 1.5 — Alfred-Brief first clean pre-registered run | READY |
| 2026-05-15T15:00:00Z | 2026-05-15 09:00 MDT | Phase 1.1 — sample-sufficiency check | PENDING |
| event-bound | — | Phase 1.1 — final analysis (gated on 3 ordinary post-deploy sessions) | BLOCKED |

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

### Item 1 — Phase 0.4: quote-aware register filter for extractor v2

**Status**: READY
**Earliest run**: now (no time gate)
**Trigger**: any time before the next register evaluation
**Owner**: Jarvis (local session)
**Prerequisites**: none

**Why**: First register evaluation under the new experimental-design protocol
(see `.claude/metrics/token-compression/phase-1-1-jeeves-brief-result-2026-05-01.md`
§9.3) surfaced false positives where the assistant *talks about* register
patterns inside double-quoted illustrative examples. Until this filter
ships, every register evaluation needs manual review of all hits, which
defeats the protocol's automation.

**What to do**:
1. Edit `.claude/skills/token-compression/scripts/cache-telemetry-extractor-v2.py`
   `analyze_text()` and `count_register_violations()`.
2. Strip from text before pattern-matching:
   - Fenced code blocks (already done).
   - Double-quoted strings: `re.sub(r'"[^"]*"', '', text)` (with handling
     for backslash-escaped quotes and multiline edge cases).
   - Backtick spans: `re.sub(r'`[^`]*`', '', text)`.
   - Optionally: lines matching `^\s*\|.*\|\s*$` (already part of table
     detection — already excluded from prose).
3. Re-run `cache-telemetry-extractor-v2.py` against the
   2026-05-01 corpus with `--emit-class-distribution` to verify class
   shares haven't drifted (expected: identical class shares; only
   `register_violations` column should change).
4. Re-run §6 of `phase-1-1-jeeves-brief-result-2026-05-01.md` register
   scan with the fixed extractor; expected: 0 / 99 violations after fix.
5. Commit and push. Update design doc §14 changelog.

**Outputs**:
- Updated extractor v2 script.
- Updated `phase-1-1-jeeves-brief-result-2026-05-01.md` §6 with post-fix
  numbers.
- Optional: `phase-0-4-fix-validation.md` documenting before/after.

**Effort estimate**: 1-2 hours including re-validation.

---

### Item 2 — Phase 1.5: Alfred-Brief first clean pre-registered run

**Status**: READY
**Earliest run**: now (deploy already exists; pre-registration must be
filed before next post-deploy session)
**Trigger**: any time before next AIFred-Pro-Dev session generates
post-deploy data we want to count
**Owner**: Jarvis (local session)
**Prerequisites**:
- Phase 0.4 quote-aware register filter (Item 1) **strongly recommended**
  to ship first — otherwise Phase 1.5 register evaluation will repeat the
  manual-review burden.

**Why**: Phase 1.1 rerun is post-hoc by necessity (protocol postdated
deploy). Phase 1.5 (Alfred-Brief on AIFred-Pro-Dev `nate-dev`, commits
`c31b2bd` / `f15f6a2`) is eligible to be the **first clean pre-registered
run** in this benchmark family — its post-deploy sessions haven't been
collected in volume yet, so a fresh pre-registration filed now would be
methodologically clean.

**What to do**:
1. Locate Alfred-Brief deploy commit and timestamp (use
   `git -C /Users/nathanielcannon/Claude/AIFred-Pro-Dev log -1 c31b2bd --format=%cI`
   for timestamp).
2. Create `register-markers-phase-1-5-alfred-brief.yaml` overrides for
   "Master Nathaniel" replacing "sir" in `butler_register`.
3. Copy `.claude/metrics/token-compression/templates/pre-registration-template.yaml`
   to `.claude/metrics/token-compression/pre-registration-phase-1-5-alfred-brief.yaml`.
4. Fill in predictions. Suggested baseline (will need refinement based on
   AIFred-Pro-Dev session corpus, which has different content profile
   than Jarvis's):
   - tool_only: 0% expected, 0 tolerance
   - brief: -25% expected, 10 tolerance
   - interactive: -20% expected, 10 tolerance
   - analysis: -10% expected, 8 tolerance
   - code_dump: -2% expected, 5 tolerance
   - structured: -5% expected, 6 tolerance
5. Commit pre-registration to `davidmoneil/AIFred-Pro:nate-dev` (NOT to
   Jarvis — the Phase 1.5 deploy lives there, so the pre-reg should too).
6. Wait for 3 ordinary post-deploy sessions to accumulate in
   `~/.claude/projects/-Users-nathanielcannon-Claude-AIFred-Pro-Dev/`.
7. Run `cache-telemetry-extractor-v2.py` against that directory with
   the Phase-1.5 register-markers override.
8. Build run report from `run-report-template.md`.
9. Decision per §10.2 of design doc.

**Outputs**:
- AIFred-Pro-Dev: pre-registration yaml committed to `nate-dev`.
- Jarvis: run report at
  `.claude/metrics/token-compression/phase-1-5-alfred-brief-result-<YYYY-MM-DD>.md`.

**Effort estimate**: 30 minutes for pre-registration; 14-21 days for
sample collection; 1-2 hours for run report.

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
**Earliest run**: when 3 ordinary post-deploy sessions exist
**Trigger**: condition-based, not time-based — Item 3 promotes this from
BLOCKED to READY when the condition is met
**Owner**: Jarvis (local session)
**Prerequisites**:
- 3+ post-deploy sessions in `~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/`
  with class composition within §7.3 ordinariness bands
- Phase 0.4 quote-aware register filter (Item 1) **shipped** — otherwise
  the register evaluation will require manual review again

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

(Empty — this is v1 of the doc. Items move here from §2 when they reach
DONE status. Move ordering: most-recent-first.)

| Completed | Item | Result | Linked report |
|---|---|---|---|

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
