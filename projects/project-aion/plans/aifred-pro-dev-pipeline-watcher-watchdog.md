# Pipeline-Watcher Watchdog — Implementation Plan

**Status**: W1 SHIPPED 2026-05-07 (commit `f511e16` on Alfred-Dev `nate-dev`); W2 + W3 pending (PR-#3-independent — can resume anytime)
**Target repo**: Alfred-Dev (`nate-dev` branch)
**Effort**: 2-3 days across 3 phases (W1 used ~0.5d)
**Created**: 2026-05-06
**Last updated**: 2026-05-12
**Tag**: `[Nexus]` (modifies `.claude/jobs/pipeline-watcher.py` + dashboard `/health` panel)

---

## 1. Motivation

Live incident **AION-13dc7b96**: pipeline-watcher accumulated **4,466 cycle errors over 74 hours** with **zero outbound alerts**. The Telegram routing wire-up (commit `cd0aadd`, 2026-05-05) covers task-level alerts but not the watcher's own-process health signals. The pipeline-watcher silently degraded into a non-functional state while reporting alive via `/health` 200; nobody noticed until manual log inspection.

The 2026-05-06 task-executor leak investigation confirmed this is a recurring class of failure: things that should fire alarms instead fire silently. The Watcher itself needs to be watched.

## 2. Current Scaffolding

Existing watchdog infrastructure in `Alfred-Dev/.claude/jobs/pipeline-watcher.py:272-303` covers a narrow case: **task-LABEL stuck states** (a task labelled `in-flight` for too long). It does NOT cover:
- Cycle-loop error accumulation (the AION-13dc7b96 failure mode)
- Process liveness from outside the process (the `/health` 200 paradox — process is alive enough to serve the endpoint but not alive enough to drain its work queue)

This plan extends the scaffolding rather than replacing it. The existing task-LABEL watchdog stays intact.

## 3. Architecture

```
┌─────────────────────────────┐    ┌──────────────────────────┐
│ pipeline-watcher.py main    │    │ External liveness probe  │
│  loop (every cycle)         │    │ (launchd or cron)        │
│                             │    │                          │
│  ┌─ track _consec_errors ──┐│    │  POST /health            │
│  │  incr on exception      ││    │  if no 200 in 30m → ALERT│
│  │  reset on success       ││    │  if no 200 in 2h → CANCEL│
│  └─────────────────────────┘│    └──────────────────────────┘
│                             │              │
│  ┌─ check threshold ───────┐│              │ pulse_post
│  │  if N >= 5 → emit_alert ││              │ /tasks/$id/close
│  │  dedup via sentinel     ││              │ {scenario:
│  └─────────────────────────┘│              │  watchdog-auto-cancel}
│           │                 │              ▼
└───────────┼─────────────────┘    ┌──────────────────────────┐
            ▼                      │ Pulse API                │
   ┌─────────────────┐             │ (records cancellation)   │
   │ Telegram        │             └──────────────────────────┘
   │ (existing route)│
   └─────────────────┘
```

Two independent failure-detection paths, each with its own alert channel and dedup logic. The internal counter catches "loop is failing"; the external probe catches "process is wedged".

## 4. Phases

### W1 — Cycle-error-rate alert (0.5-1d) — **SHIPPED 2026-05-07 (commit `f511e16` on nate-dev)**

Smoke-validated 4 assertions; consecutive-cycle-error alert + sentinel dedup wired. Activates the durable watcher-side health signal that AION-13dc7b96 demonstrated was missing.

**Deliverables**:
- New module-level counter `_consecutive_cycle_errors: int = 0` in `pipeline-watcher.py`
- Increment on caught exception in main loop body
- Reset to 0 on any successful cycle completion
- New env var `WATCHDOG_CYCLE_ERROR_THRESHOLD` (default `5`)
- When counter reaches threshold:
  - Call existing `emit_alert()` with severity=`critical`, dedup_key=`pipeline_watcher_cycle_errors`
  - Write sentinel to `/tmp/aifred-watchdog-cycle-errors-<UTC-date>` to prevent re-fire same day
- Log structured payload: `{event: "watchdog.cycle_errors", consecutive: N, threshold: T, last_exception: str}`

**Done-criteria**:
- Inject 5 forced exceptions in test harness → exactly one Telegram alert fires
- Successful cycle after 4 errors → counter resets, no false alarm
- Run in dev for 24h → zero spurious alerts on healthy operation

**Files touched** (anticipated):
- `Alfred-Dev/.claude/jobs/pipeline-watcher.py` (~30 LOC added)

### W2 — External liveness probe (1d)

**Deliverables**:
- New script `Alfred-Dev/.claude/scripts/watchdog-liveness-probe.sh`
- launchd plist `~/Library/LaunchAgents/com.aifred.watchdog-liveness.plist` (StartInterval=300, RunAtLoad=true)
- Script logic:
  - `curl -fsS --max-time 5 http://localhost:8810/health` → 200 OK = healthy, advance heartbeat file mtime
  - No 200 in 30 minutes (heartbeat mtime > 1800s old) → emit_alert severity=`warning`
  - No 200 in 2 hours → emit_alert severity=`critical` AND (if `WATCHDOG_AUTO_CANCEL_ENABLED=true`) call `pulse_post /tasks/<active-task-id>/close {scenario: "watchdog-auto-cancel", reason: "pipeline-watcher non-responsive 2h"}`
- Auto-cancel gated behind `WATCHDOG_AUTO_CANCEL_ENABLED=false` initially — alert-only mode for first week of production observation, then enable

**Done-criteria**:
- Kill -STOP the watcher → 30m later, warning alert fires; 2h later, critical alert + (gated) auto-cancel
- Restart watcher → next probe cycle clears alert state
- Ledger of probe attempts visible at `.claude/logs/watchdog-liveness.log` for post-mortem reconstruction

**Files touched**:
- `Alfred-Dev/.claude/scripts/watchdog-liveness-probe.sh` (NEW, ~80 LOC)
- `Alfred-Dev/~/Library/LaunchAgents/com.aifred.watchdog-liveness.plist` (NEW)
- `Alfred-Dev/.gitignore` (add probe state files)

### W3 — Surface new metrics (0.5d)

**Deliverables**:
- Pipeline-watcher `/health` endpoint returns expanded payload:
  ```json
  {
    "status": "healthy",
    "consecutive_cycle_errors": 0,
    "last_successful_cycle_iso": "2026-05-06T14:23:11Z",
    "uptime_sec": 84231,
    "watchdog_cycle_threshold": 5
  }
  ```
- Dashboard `/health` panel shows new fields under a "Pipeline Watcher" sub-section
- Existing dashboard endpoints stay unchanged — additive only

**Done-criteria**:
- `curl :8810/health | jq '.consecutive_cycle_errors'` returns integer
- Dashboard displays the field in a "Pipeline Watcher Health" sub-panel
- Alert state visible in dashboard during forced-error injection

**Files touched**:
- `Alfred-Dev/.claude/jobs/pipeline-watcher.py` (`/health` payload extension, ~10 LOC)
- `Alfred-Dev/dashboard/server/routes/health.ts` (passthrough, ~5 LOC)
- `Alfred-Dev/dashboard/frontend/src/pages/HealthPage.tsx` (display, ~30 LOC)

## 5. Risks / Open Questions

- **False-positive risk for liveness probe**: launchd-driven script + 5min cadence = 12 probes/hour. If pipeline-watcher's `/health` blocks briefly during heavy cycles, the probe might mis-count. Mitigation: heartbeat file mtime tracks "last 200" not "every probe attempt" — single missed probe doesn't reset the 30m clock.
- **Auto-cancel scope**: `pulse_post /close {scenario}` writes a Pulse audit row. Is the chosen scenario string (`watchdog-auto-cancel`) backward-compatible with existing dashboards? Confirm with David before W2 ships.
- **Telegram dedup window**: existing dedup is `/tmp/nexus-msgbus-<key>-<UTC-date>` — once-per-day per key. For watchdog alerts, is once-per-day too coarse? Probably fine for a "your watcher is broken" alert, but reconsider if signal-to-noise becomes a problem.

## 6. Out of Scope (deferred)

- Watchdog dashboard panel for historical alert frequency (would need new Pulse table or log-aggregation)
- Cross-watcher liveness (Jarvis watcher checking AIFred watcher and vice-versa) — interesting symmetry but adds coupling that would have to be unwound for portability
- Per-cycle latency alerts (e.g. "cycle took >10s" — different signal, different threshold tuning)
- Recursive self-watchdog (the watchdog watching itself) — infinite regress; trust the OS scheduler at the bottom of the stack

## 7. Sequencing Notes

- W1 ships first (smallest, lowest risk, highest value — directly closes AION-13dc7b96 class of failure)
- W2 second (depends on W1's `emit_alert` integration being proven)
- W3 last (cosmetic / observability surface; no behavioral change)
- All three should ship within a single week to keep mental context fresh and avoid mid-implementation drift

## 8. Connection to Larger Architecture

This work is the **W3-tier safety layer** in the workstream architecture v1.3 (Jarvis design doc §7.2). It complements but does not replace:
- W1 (cost-anomaly watcher, Jarvis-side, shipped 2026-05-06)
- W2 (executor pre-flight gates, Alfred-Dev, shipped commit `649acfc`)

The three together form a defense-in-depth pattern: cost-anomaly catches budget leakage, executor gates catch hard-fail tasks before LLM call, watchdog catches the watcher itself failing silently. None alone is sufficient; together they cover the failure surface that produced the 2026-05-06 incident.
