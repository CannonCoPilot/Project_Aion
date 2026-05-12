# Pulse / Nexus Boundary Audit — 2026-05-05

**Author**: Jarvis (post-P1.6.y session)
**Trigger**: User asked for an architectural / conceptual review of the Pulse vs Nexus boundary, mapping recent pipeline-v2 + observability work onto that axis, and aligning Jarvis-side documentation to canonical Pulse-Nexus language.

---

## 1. Canonical Boundary (extracted from authoritative docs)

| Concept | Authoritative source | One-line definition |
|---|---|---|
| **Pulse** | `AIFred-Pro/.claude/context/tools/pulse-reference.md` | The *service*: state-of-record for tasks, labels, transitions, events, triggers, messages, jobs, settings, observability tables. FastAPI + PostgreSQL on `:8700` (prod) / `:8800` (dev). |
| **Nexus** | `Alfred-Dev/.claude/context/systems/nexus.md` | The *platform*: scheduling, execution, observability emission, communication, dashboard, tenants. Uses Pulse as its task-state backend. |

### Ownership matrix

| Concern | Owner | Notes |
|---|---|---|
| Task / label / transition CRUD | Pulse | API surface; PostgreSQL schemas |
| Event store | Pulse | `events` table; `/events`, `/events/stream` |
| Pipeline trigger registry | Pulse | `/triggers/*` endpoints; handler resolution |
| Message bus persistence | Pulse | `/messages/*` |
| Job state, settings | Pulse | `/jobs/{name}`, `/settings/{key}` |
| Observability tables (audit_log, cost_events, decision_events) | Pulse | Phase 5.1 schema; populated via Pulse POST endpoints (P1.5) |
| Dispatcher + cron schedule | Nexus | `dispatcher.sh`, `registry.yaml`, every 5 min |
| Persona-aware execution | Nexus | `executor.sh` / `executor.py`, `personas/<name>/` |
| Pipeline-v2 services (stage / evaluate / orchestrate / execute / review / diagnose) | Nexus | `.claude/jobs/services/*.py` |
| Pipeline-watcher (retry orchestration, fail_fast circuit breaker) | Nexus | `.claude/jobs/pipeline-watcher.py` |
| Observability *emission* (audit_log / decision_log / cost_log writers, `services/observability/`) | Nexus | Python package wired into pipeline-v2 services |
| Communication delivery (Telegram, msg-relay, msgbus relay) | Nexus | `lib/send-telegram.sh`, `lib/msg-relay.sh` |
| Dashboard frontend + server | Nexus | `dashboard/` |
| Tenants (Aurora, ABS Librarian, Health Summary, …) | Nexus | Run *on* Nexus; not part of Pulse |

### Boundary rules (derived)

1. **Pulse owns the data model.** Anyone reading/writing this data goes through Pulse's HTTP API, not direct PostgreSQL.
2. **Nexus is Pulse's primary writer.** Observability events, task transitions, label mutations all flow Nexus → Pulse.
3. **Pulse is consumed by more than just Nexus.** The `pulse` CLI, dashboard, MCPs, ad-hoc Jarvis sessions — all are first-class consumers.
4. **No scheduling logic in Pulse.** Cron, dispatcher decisions, retry orchestration are all Nexus.
5. **No persona logic in Pulse.** Personas are Nexus capabilities.

---

## 2. Recent work classification

| Workstream | Side | Boundary status |
|---|---|---|
| **R5.5** — `services/observability/` python package (audit/decision/cost/thread loggers) wired into 6 pipeline-v2 services (commit `1983dc0`) | Nexus | Clean — Nexus emits, Pulse stores |
| **R6** — `pulse/migrations/0001-phase-5-1-observability-tables.sql` (commit `bb2d453`) | Pulse | Clean — Pulse owns schema |
| **P1.5** — `pulse/app.py` POST endpoints `/audit/events`, `/audit/decisions`, `/costs/events` (commit `090f6ec`) | Pulse | Clean — Pulse exposes write API |
| **P1.6** — `executor.py` 7 → 30 observability sites (commit `5720cdc`) | Nexus | Clean |
| **P1.6.x** — `pipeline-watcher.py` retry/give_up decisions + `job.retrying` audit (commit `4322469`) | Nexus | Clean |
| **P1.6.y** — fail_fast auth circuit breaker (executor + pipeline-watcher + state file) (commit `6305258`) | Nexus | Clean — state file is Nexus-internal |
| **P1.A1** — dashboard `/personas` page wired up (commit `f052778`) | Nexus (dashboard reads Nexus persona YAMLs from disk) | **Boundary leak (P2)** — dashboard reaches into Nexus filesystem rather than consuming an API. Pragmatic; low urgency. |
| **P1.B1** — dashboard `DecisionsPage` with cross-table storyline view (commit `042247b`) | Boundary violation | **P0** — dashboard's `dashboard/server/services/pulse-events.ts` uses `pg.Pool` to *directly* query `pulse.{audit_log,cost_events,decision_events}`. Asymmetric with writes (which go through Pulse API). |
| **M1 cleanup** — `lib/pulse-env.sh` canonical PULSE_API_URL resolver (commit `002f02e`) | Nexus consumption layer | Clean — strengthens consistency without changing the axis |

---

## 3. Boundary findings

### F-1 (P0): Dashboard bypasses Pulse for observability reads

`dashboard/server/services/pulse-events.ts` opens a direct `pg.Pool` against `pulse.{audit_log,cost_events,decision_events}` for the DecisionsPage and storyline view. This is the *only* dashboard service that goes around Pulse's API — every other dashboard data path goes through `/api/v1/...`. The asymmetry was introduced because Pulse's P1.5 endpoints only expose **POST** (write); there is no symmetric read surface.

**Fix (new workstream — P1.B1.1)**: add Pulse READ endpoints, then refactor the dashboard service to consume them.

Endpoints to add to `pulse/app.py`:
- `GET /api/v1/audit/events?thread_id=&task_id=&limit=&since=` — paginated audit_log query
- `GET /api/v1/audit/decisions?thread_id=&task_id=&decision_type=&limit=` — paginated decision_events query
- `GET /api/v1/costs/events?thread_id=&task_id=&engine=&limit=` — paginated cost_events query
- `GET /api/v1/observability/storyline/{thread_id}` — joined audit + cost + decision rows ordered by ts (the dashboard's existing storyline drawer does this join client-side)
- `GET /api/v1/observability/stats` — aggregates currently computed by the dashboard

After endpoints land: rewrite `pulse-events.ts` to call the Pulse API; remove `pg` dependency from dashboard server; drop `PULSE_DB_*` env vars.

Estimated effort: ~3-4 hr (4 endpoints + dashboard refactor + smoke).

### F-2 (P2 — deferred): Dashboard reads Nexus persona YAMLs from disk

`dashboard/server/services/personas.ts` reads `.claude/jobs/personas/<name>/{config,prompt}.yaml` directly from a mounted volume. Personas are Nexus-internal capability definitions; the dashboard is reaching across the boundary into Nexus territory.

The proper fix is a Nexus persona-listing API surface (likely added to Pulse as `/api/v1/personas/*` since Pulse already serves cross-cutting metadata via `/taxonomy`, `/settings`, etc.). However, persona YAMLs are essentially read-only configuration; the boundary leak is low-impact. **Defer until there's a second consumer that needs persona metadata.**

### F-3 (P2 — naming): Jarvis docs don't tag Pulse vs Nexus on workstreams

Jarvis-side `session-state.md` and `.active-plan` describe recent work without explicitly tagging which side of the boundary it lives on. P1.5 is correctly named "Pulse observability endpoints" but P1.6 is described as "executor.py port-completion" without "Nexus" framing. New readers (or future-self after compression) lose the architectural picture.

**Fix (this audit)**: prefix workstream descriptions with `[Pulse]` / `[Nexus]` / `[Boundary]`. Update CLAUDE.md to require this for new workstreams.

### F-4 (low): "nexus-sync" branch name overloads "Nexus"

David's `nexus-sync-2026-04` branch name uses "Nexus" as a brand for the refactor effort, not strictly the architectural concept. In Jarvis docs we sometimes write "Nexus-sync supplant" referring to the branch and "Nexus components" referring to the platform — same word, different meanings.

**No fix needed** — context disambiguates. Just be aware when reading old session notes.

---

## 4. Doc + plan alignment changes (this session)

| File | Change |
|---|---|
| `Jarvis/.claude/context/.active-plan` | Add `[Pulse]` / `[Nexus]` / `[Boundary]` tags to recent + future workstream descriptions; add new P1.B1.1 workstream for the Pulse READ API gap |
| `Jarvis/.claude/context/session-state.md` | Same tagging for current priorities; add boundary-audit summary line |
| `Jarvis/projects/project-aion/reports/pulse-nexus-boundary-audit-2026-05-05.md` | This file (new) |

No Alfred-Dev docs are modified — the canonical Pulse/Nexus framing in `.claude/context/systems/nexus.md` and `tools/pulse-reference.md` is already correct and authoritative. Jarvis-side docs are the only ones drifting from it.

---

## 5. Forward guidance

When planning new work in Jarvis, classify at planning time:

- **[Pulse]** — modifies `pulse/app.py`, `pulse/migrations/`, or Pulse data model. Affects the API contract or schema.
- **[Nexus]** — modifies `.claude/jobs/`, `.claude/orchestration/`, `lib/`, dispatcher, executor, watchers, personas, dashboard server/frontend code that consumes Pulse via API.
- **[Boundary]** — work that crosses the boundary cleanly (e.g. P1.5 added Pulse endpoints AND wired Nexus emitters in the same effort). Note both sides in the description.
- **[Boundary-violation]** — code that reaches across the boundary improperly. Should be rare and time-bounded, with a follow-up workstream queued to repair.

This tagging makes the architectural shape of in-flight work visible at a glance and prevents drift like P1.B1's direct-DB access from going unnoticed for a future maintainer.
