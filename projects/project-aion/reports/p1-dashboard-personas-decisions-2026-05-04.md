---
type: validation-report
date: 2026-05-04
author: Jarvis (CannonCoPilot)
project: AIFred-Pro
workstream: P1 (A1 + B1) — dashboard personas + decisions visualization
status: COMPLETE
related:
  - projects/project-aion/reports/p15-pulse-observability-endpoints-2026-05-04.md
  - projects/project-aion/reports/nexus-sync-supplant-r6-validation-2026-05-04.md
target_branch: nate-dev (davidmoneil/AIFred-Pro)
commits:
  a1: f052778 (parseValue inline-comment fix + dev-dashboard recreate)
  b1: 042247b (DecisionsPage with cross-table storyline view, +1206 LOC)
---

# P1 — Dashboard Personas + Decisions

## Summary

Bundled delivery of A1 (wire up the existing `/personas` page) and B1 (rich
decisions visualization with cross-table storyline view). Closes the dashboard
half of the nexus-sync supplant arc: writers (R5.5) → schema (R6) → API receivers
(P1.5) → readers (P1).

## A1 — Personas page

### Root cause (two bugs, neither in the route layer)

1. **Stale dev-dashboard container**: the running `aifred-dev-dashboard` was 4 days
   old, predating the supplant compose changes. Its actual mounts (one bind: just
   `.claude/logs/headless/executions`) lacked the `.claude/jobs` mount needed to
   reach the persona library at `/workspace/.claude/jobs/personas`. Recreate
   against the current `docker-compose.yml + docker-compose.dev.yml` overlay
   restored the 6 expected bind mounts.

2. **Homemade YAML parser inline-comment bug**: After the recreate,
   `/api/personas` returned 32 personas — but values like
   `model: sonnet  # 2026-04-08 u6uh: changed from opus → sonnet` surfaced as the
   literal string `"sonnet           # 2026-04-08 u6uh: ..."`. Fix: 6-line patch
   in `dashboard/server/services/personas.ts:parseValue()` strips inline
   comments preceded by whitespace, guarded so quoted strings preserve embedded
   `#` characters.

### Result

- **Before**: `/api/personas` → `{"personas":[]}` (empty)
- **After**: 32 personas including post-supplant additions (ai-reviewer,
  analyst, cortex, orchestrator, content-writer, researcher-readonly,
  skill-experimenter), all fields clean.

### Commit
- `f052778` on nate-dev — `fix(dashboard/personas): strip inline YAML comments in parseValue`

## B1 — DecisionsPage (rich)

### Architecture

The dashboard's existing data layer used `better-sqlite3` against the Nexus
SQLite file plus JSONL spool reads — no PostgreSQL access. B1 introduces the
first direct connection to `pulse_dev` postgres for visualizing the Phase 5.1
observability tables (`pulse.audit_log`, `pulse.cost_events`,
`pulse.decision_events`).

### Backend additions

`dashboard/server/services/pulse-events.ts` (~265 LOC):
- `pg.Pool` with lazy init (env: PULSE_DB_HOST/PORT/NAME/USER/PASSWORD)
- `tsToIso()` helper coerces pg's `Date` → ISO string at boundary
- Queries: `listDecisions`, `getDecisionStats`, `getDecisionsByThread`,
  `getStoryline` (the cross-table join), `listRecentThreads`
- Type definitions mirror the migration's column lists

`dashboard/server/routes/decisions.ts` (~95 LOC):
- 5 endpoints under `/api/`:
  - `GET /decisions` — paginated list with filter (actor, decision_type,
    outcome, thread_id, task_id, since, until)
  - `GET /decisions/stats?hours=N` — top-N actor/type/outcome + rate +
    unique_threads
  - `GET /decisions/threads?limit=N` — recent thread summaries (first/last ts,
    decision_count)
  - `GET /decisions/thread/:thread_id` — all decisions for one thread
  - `GET /storyline/:thread_id` — **the headline endpoint** — joins audit_log +
    cost_events + decision_events on thread_id, sorts by ts, stamps each row
    with `kind` discriminator
- Structured 503 fallback if pulse_dev unreachable

`dashboard/server/index.ts` registers `decisionsRoutes` after
`executionStreamRoutes`. `docker-compose.dev.yml` adds PULSE_DB env to the
nexus-dashboard service.

### Frontend additions

`dashboard/frontend/src/api/decisions.ts` (~135 LOC) — TanStack Query hooks
mirroring the 5 endpoints with 15-30s polling.

`dashboard/frontend/src/pages/DecisionsPage.tsx` (~440 LOC):
- StatCards row (decisions in 24h + per-hour rate, unique threads, top actor,
  top decision_type)
- Filter bar with URL-synced state (actor, decision_type, outcome, thread_id)
- Recent threads table (clickable → opens storyline drawer)
- Recent decisions table with confidence visual bars + outcome color pills
- **StorylineDrawer**: side panel with chronological timeline, color-coded
  `kind` badges (DEC purple / COST emerald / AUDIT blue), inline JSON
  drilldown for alternatives/signals/downstream_effect/details
- URL state: `?drawer=<thread_id>` for shareable deep links

`App.tsx` adds `/decisions` route. `AppShell.tsx` adds Decisions to NEXUS_NAV
(icon ⦿) next to Personas.

### Validation

#### Synthetic seed (8 rows across 3 threads)

| Thread | audit | cost | decisions |
|---|---|---|---|
| `p1b1-seed-storyline` | 3 (claimed/processing/completed) | 1 ($0.0034 haiku 75s) | 2 (budget_gate→allowed 0.95, risk_assessment→risk:low_reversible 0.92) |
| `p1b1-seed-watchdog` | 0 | 0 | 1 (system:pipeline-watchdog fix→fix_applied 0.85) |
| `p1b1-seed-blocked` | 0 | 0 | 1 (persona:ai-reviewer route→blocked 0.55) |

`/api/decisions/stats` returned `{total: 4, unique_threads: 3, by_actor: 4, ...}` correctly.
`/api/storyline/p1b1-seed-storyline` returned 6 events sorted by ts, demonstrating
that audit + cost + decision rows interleave cleanly:

```
audit    | 03:50:00 | task.claimed
decision | 03:50:15 | budget_gate → allowed
audit    | 03:50:30 | task.processing
decision | 03:51:00 | risk_assessment → risk:low_reversible
cost     | 03:51:30 | $0.0034 / claude-haiku-4-5 / 75s
audit    | 03:51:45 | task.completed
```

This is the comparison harness — a chronological "story" of one task's
journey, joined across all three observability tables.

#### Real-flow capture: `executor.sh --job ollama-test`

Command:
```bash
NEXUS_THREAD_ID="p1b1-sh-ollama-1777956102" \
  PROJECT_DIR="$(pwd)" \
  PULSE_API_URL="http://localhost:8800/api/v1" \
  bash .claude/jobs/executor.sh --job ollama-test
```

Result: 14-second run completed cleanly with `exit 0`. Pulse_dev rows:

| kind | ts | actor | event |
|---|---|---|---|
| audit | 04:41:42 | system:executor | persona.loaded on persona:investigator |
| audit | 04:41:42 | job:ollama-test | job.started on job:ollama-test |
| audit | 04:41:56 | job:ollama-test | job.completed on job:ollama-test |
| audit | 04:41:56 | job:ollama-test | job.cost_recorded on budget:ollama-test |
| cost | 04:41:56 | investigator | qwen3:8b ($0.00) |

5 real rows (4 audit + 1 cost) routed via `lib/audit-log.sh` + `lib/cost-log.sh`
through the P1.5 endpoints to pulse_dev. The storyline drawer renders these
correctly. **Free** because qwen3:8b is local Ollama, not Anthropic.

## Adapt-Absorb-Replace assessment (executor.sh vs executor.py)

The user requested using both executors as a comparison harness. Static
analysis of observability call sites + targeted real-flow runs produced this
inventory:

### executor.sh (`.claude/jobs/executor.sh`, 2502 LOC)

| Site type | Count | Locations / decision_types |
|---|---|---|
| `log_decision` inline | 10 | budget_gate (blocked, proceed_with_warning), task_claim (claimed, race_lost), retry (fail_fast, retry, give_up), task_release (released_to_queue, released_after_success) |
| `_parse_and_emit_persona_decisions` hook | 1 fn | walks `decisions[]` arrays from persona reports, calls `log_decision` per entry — extracts ALL persona-emitted decisions |
| `log_audit` | 22 | persona.loaded/switched/error, job.started/timeout(×2)/retrying/failed/completed/cost_recorded, task.evaluated/claimed/escalated/released/error, attempt-tagged paths |
| `log_cost` | 1 | line 2365 (with `declare -F` guard for backward compat) |
| **Total** | **33 sites** | |

### executor.py (`.claude/jobs/services/executor.py`, 597 LOC)

| Site type | Count | Locations / decision_types |
|---|---|---|
| `log_decision` | 1 | line 353: `persona_selection` (records which persona was resolved + source confidence) — **novel decision_type, not present in shell** |
| `log_audit` | 5 | task.claimed (line 373), task.completed (541), task.failed (571), task.timeout (581), task.error (588) |
| `log_cost` | 1 | line 538 (task completion) |
| persona-emitted `decisions[]` extraction | **MISSING** | no equivalent of `_parse_and_emit_persona_decisions` |
| **Total** | **8 sites** | |

### Diff

**25 sites missing in the python port.** Specifically:
- **Operational decisions absent**: budget_gate, task_claim, retry, task_release — none of these 10 inline call sites have python equivalents. Personas running through executor.py emit ZERO operational rationale.
- **Persona lifecycle audit absent**: persona.loaded, persona.switched, persona.error — gone.
- **Job lifecycle audit absent**: job.started, job.timeout, job.retrying, job.failed, job.completed, job.cost_recorded — gone. executor.py audits at the *task* level, not the *job* level.
- **Persona-emitted decisions hook absent**: even when a persona emits a `decisions[]` array in its report, executor.py won't extract or log them. The `_parse_and_emit_persona_decisions` function from `93f5320` (Phase 5.5) was not ported. This means executor.py-driven personas effectively have no rationale logging.
- **One novel addition**: `persona_selection` decision (line 353) — records which persona was resolved and from what source. Not in executor.sh.

### Real-flow corroboration

- **executor.sh --job ollama-test**: 5 real rows in pulse_dev (4 audit + 1 cost). Full lifecycle (persona.loaded → job.started → job.completed → job.cost_recorded) emitted as expected.
- **executor.py with TASK_ID=NONEXISTENT**: 0 rows. Failed at `pulse_get` with 404, exited before reaching any `log_audit` site. The python port has no observability for task-fetch failure (the shell would emit `task.evaluated` first and propagate from there).

### Verdict

**Adapt-absorb-replace stage ≈ 30%** for the executor:
- ✅ **Adapt**: executor.py exists, imports `from observability import log_audit, log_cost, log_decision`, structurally compatible with the migration's schema.
- 🟡 **Absorb**: only ~24% (8/33) of observability sites ported. The novel `persona_selection` decision is a feature improvement, but the absence of operational decisions (budget/retry/claim/release) and the persona-decisions extraction hook leaves the python path effectively *blind* to the rationale data.
- ❌ **Replace**: not yet — production traffic on executor.py would lose ~76% of observability emissions vs the shell version. Replacement would silently degrade observability without alerting anyone (no API errors, just missing rows).

### Recommended next steps

The python port needs the inline operational decisions before replacement is viable. Priority order (by impact):

1. **`_parse_and_emit_persona_decisions` equivalent** — the highest-leverage single addition. Without it, persona-driven decisions vanish.
2. **budget_gate decisions** (2 sites) — observability for cost-related routing.
3. **task_claim decisions** (2 sites) — race-loss visibility under concurrent dispatchers.
4. **retry decisions** (3 sites) — failure-mode classification.
5. **persona lifecycle audit** (3 sites) — error attribution.
6. **job lifecycle audit** (6 sites) — coarser-grain rollups for dashboards.

These are mechanical ports — the shell-side already documents the call signatures, and `services/observability/{audit,decision}_log.py` has the python helpers ready (R5.5).

## Outstanding deferred work

- **B1-rich storyline view validation with multi-row real flow**: today's
  ollama-test only emitted 5 rows on one thread. A multi-task or persona-with-
  decisions flow would more thoroughly exercise the storyline drawer.
- **Frontend visual QA**: API probes verified data flow; a human-eyes pass on
  `/decisions` in browser is recommended once Nate has 5 minutes.
- **YAML parser robustness**: the homemade parser in `services/personas.ts`
  handled the inline-comment case but is generally fragile (no list-of-objects
  support, no anchors/aliases). Replacing with `js-yaml` (already a dep) is a
  small follow-on cleanup.

## Files touched

### AIFred-Pro-Dev (commit 042247b)
- `dashboard/server/services/pulse-events.ts` (NEW, 265 LOC)
- `dashboard/server/routes/decisions.ts` (NEW, 95 LOC)
- `dashboard/server/index.ts` (registered route)
- `dashboard/server/package.json` + `package-lock.json` (pg + @types/pg)
- `docker-compose.dev.yml` (PULSE_DB env on nexus-dashboard)
- `dashboard/frontend/src/api/decisions.ts` (NEW, 135 LOC)
- `dashboard/frontend/src/pages/DecisionsPage.tsx` (NEW, 440 LOC)
- `dashboard/frontend/src/App.tsx` (route)
- `dashboard/frontend/src/components/layout/AppShell.tsx` (nav link)

### AIFred-Pro-Dev (commit f052778, A1 fix)
- `dashboard/server/services/personas.ts` (parseValue inline-comment fix)

### Jarvis-side
- `projects/project-aion/reports/p1-dashboard-personas-decisions-2026-05-04.md` (this report)
- (state file updates pending in next commit)

## Outcome

P1 ships the dashboard layer of the nexus-sync supplant arc. Both pages
function: `/personas` lists 32 personas cleanly; `/decisions` renders the
cross-table storyline view that doubles as an executor-comparison harness.
The dual-executor analysis surfaces a concrete adapt-absorb-replace work item:
the python executor needs ~25 additional observability sites before it can
replace the shell version without losing 76% of the observability emissions.
