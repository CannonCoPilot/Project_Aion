# JICM v7.9 — Stage-2 Baseline Snapshot (2026-05-03)

**Stage-2 window**: 2026-05-03T03:25Z → 2026-05-17T03:25Z (14 days)
**Approach**: B (conservative incremental — sensing layer deployed, actuation layer deferred)
**Stage-1 verdict**: STAGE_1_CLEAR (5/5 PASS in Jarvis-Dev, 2026-05-03 ~02:00Z)
**Pattern**: `.claude/context/patterns/two-stage-validation-gating.md` v1.0.0
**Roadmap §4.6 acceptance criteria**: anchor for verdict at window close

---

## 1. Deploy summary

| Layer | Action | Notes |
|---|---|---|
| Hooks | Added | `jicm-gate.sh` (UPS#1), `jicm-stop.sh` (Stop#1), `jicm-precompact.sh` (PreCompact#3) |
| Sensing scripts | Added | `jicm-state-update.sh`, `jarvis-statusline-v8.sh` |
| settings.json | Patched | New `statusLine` block + 4 hook insertions |
| `session-start.sh` | Patched | 4-line resume-signal block at line 417 (inside JICM v7 branch) |
| `jicm-watcher.sh` (v7.3) | **UNTOUCHED** | Watcher swap deferred to phase 7.9.6b |
| `jicm-config.sh` (v7.3) | **UNTOUCHED** | New v7.9 hooks self-contained via env-var defaults |
| `jicm-prep-context.sh` (v7.3) | **UNTOUCHED** | Continues to feed v7.3 watcher's CLEARING/RESTORING flow |

**Why Approach B over A**: production session-start.sh JICM v7 branch (lines 358-363) gates on `.jicm-state` containing `state: CLEARING` or `state: RESTORING`. The v7.3 watcher writes those values via `transition_to`. The v7.9 slim watcher (171 lines) writes `.jicm-clear-now.signal` instead and does NOT touch `.jicm-state`. Swapping to v7.9 watcher without first updating session-start.sh's gating expression would break the resume injection path. Approach B keeps the actuation chain on v7.3 (proven 27 cycles) while introducing v7.9 sensing for observation.

---

## 2. Pre-deploy fingerprint

| Item | Value |
|---|---|
| `settings.json` MD5 | `51a0650ee8ebb25ddf7f319795142e3a` (pre) |
| `settings.json` MD5 | `2303a85359abe10ec171e7c39b52e777` (post) |
| `session-start.sh` (pre) | 21954 bytes (Apr 24 17:33) |
| Backup files | `settings.json.pre-v7-9-2026-05-03`, `session-start.sh.pre-v7-9-2026-05-03` |
| Watcher PID | 78594 (v7.3) — unchanged through deploy |
| Watcher cycles at deploy | 27 (last completed: manual JICM trigger 2026-05-03T03:25:13Z) |

## 3. Acceptance criteria for Stage-2 (per roadmap §4.6)

Cited against this baseline at 2026-05-17T03:25Z window close:

1. **No regression in JICM cycle health**: cycles continue to complete (CLEARING → RESTORING → WATCHING) without watcher restart, error count stable.
2. **`.jicm-state-hook.json` populated correctly on every UPS**: tokens, model_id, used_pct fields non-zero/non-empty after first assistant turn (Stage-1 confirmed JSONL parser correctness).
3. **Statusline renders without crash across all states** (WATCHING / SOFT_NUDGE / HARD_HALT — though HARD_HALT only fires if v7.9 watcher writes `pending_action`, which it does NOT in Approach B; SOFT_NUDGE will trigger at 30% real-world).
4. **No spurious decision:block from `jicm-gate.sh`**: gate is sensing-only in v7.9.1, never returns `decision:block` (verified Stage-1 T1).
5. **PreCompact path quiet**: `jicm-precompact.sh` runs only at 70%+ native autocompact threshold; window may close without it firing if no native compact occurs.
6. **No new entries in self-corrections.md** flagged as "JICM hook misbehavior".

If all six hold at window close: **STAGE_2_PASS** → unblocks phase 7.9.6b watcher swap.

If any fail: **STAGE_2_REGRESSION_CATCH** → roll back hooks via `cp settings.json.pre-v7-9-2026-05-03 settings.json` and reload session.

## 4. Coexistence behavior (v7.3 watcher × v7.9 hooks)

| Trigger | v7.3 actuator | v7.9 sensor | Coexistence |
|---|---|---|---|
| UPS arrives | (no UPS hook) | `jicm-gate.sh` writes `.jicm-state-hook.json` | Independent — no conflict |
| Token threshold crossed | watcher polls `.jicm-state` (legacy, still written by gate via legacy field?) — actually NO: v7.9 gate writes `.jicm-state-hook.json`, NOT `.jicm-state`. v7.3 watcher uses tmux capture-pane independently. | gate flags SOFT/HARD in JSON | Both detect; only watcher acts |
| Stop event | (no Stop hook for JICM) | `jicm-stop.sh` reads `pending_action` — always empty in Approach B (no v7.9 watcher to write it) | Stop-hook no-ops permanently |
| Native /compact at 70% | `precompact-analyzer.js` + `pre-compact.sh` | `jicm-precompact.sh` runs prep script | All three peers fire |
| /clear via watcher | `transition_to "CLEARING"` writes `.jicm-state` | session-start.sh writes `.jicm-resume-complete.signal` (new line 417) | v7.3 ignores resume signal; harmless |

**Net effect**: v7.9 hooks are write-only-observation in this Approach B configuration. They cannot break the v7.3 actuation chain because they don't intersect with it (different state files).

## 5. Stage-2 monitoring plan

**Passive**: Stage-2 is observation-only. No formal logging instrumentation needed beyond what hooks already emit:
- `jicm-gate.sh` appends to `.claude/logs/jicm-gate.log` per UPS
- `jicm-stop.sh` appends to `.claude/logs/jicm-stop.log` per Stop event
- `.jicm-state-hook.json` overwritten per UPS (sample any time for spot-check)

**Active checkpoints**:
- Day 1 (2026-05-04): spot-check `.jicm-state-hook.json` looks sane after first ordinary session, statusline renders.
- Day 7 (2026-05-10): mid-window review — read jicm-gate.log for anomalies (errors, malformed JSONL, unexpected SOFT/HARD trips at non-threshold tokens).
- Day 14 (2026-05-17): formal Stage-2 verdict written to this dir as `v7-9-stage-2-result-2026-05-17.md`.

**Rollback procedure** (if regression detected mid-window):
```bash
cd /Users/nathanielcannon/Claude/Jarvis
cp .claude/settings.json.pre-v7-9-2026-05-03 .claude/settings.json
cp .claude/hooks/session-start.sh.pre-v7-9-2026-05-03 .claude/hooks/session-start.sh
# Hooks/scripts can stay in place (settings.json deregistration is sufficient)
```

## 6. Stage-1 evidence reference

- Run #2 verdict: 4/5 PASS (T1/T2/T4/T5)
- Run #3 (after fix v2 wait_for_idle): 5/5 PASS (User-confirmed 2026-05-03 ~02:00Z)
- Test artifacts: `/Users/nathanielcannon/Claude/Jarvis-Dev/.claude/metrics/jicm/v7-9-stage-1-result-*.md` and per-test JSON in `/Users/nathanielcannon/Claude/Jarvis-Dev/.claude/scratch/jicm-v7-9-test-runs/`
- Critical gotcha caught: AC-01 autonomic prompt queueing requires `wait_for_idle` (end_turn stop_reason), not `wait_for_assistant_turn` (any tool_use entry). Recorded in scratchpad ~01:50Z.

## 7. Phase 7.9.6 split

| Sub-phase | Scope | Status |
|---|---|---|
| 7.9.6a | Hooks/sensing/statusline + session-start.sh patch | **THIS DEPLOY** (2026-05-03T03:25Z) |
| 7.9.6b | Watcher swap (v7.3 → v7.9 slim) + session-start.sh re-gate to `.jicm-clear-now.signal` | Deferred to separate session post Stage-2 PASS |

Phase 7.9.6b prerequisites:
1. Stage-2 PASS at 2026-05-17T03:25Z
2. Patch session-start.sh to detect `.jicm-clear-now.signal` (or update v7.3 → v7.9 watcher to also write `state: CLEARING` to `.jicm-state` for back-compat — Approach C from prior session's scratchpad)
3. Backup current v7.3 watcher as `jicm-watcher-legacy-v7-3.sh`
4. Validate end-to-end JICM cycle in Jarvis-Dev with new watcher + production-equivalent session-start.sh BEFORE production swap

---

*Stage-2 baseline v1.0 — JICM v7.9 deploy 2026-05-03T03:25Z*
