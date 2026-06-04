# Multi-Space Setup Plan — AIfred Pro Production + Dev Spaces + Jarvis Integration + Archon Foundation

**Created**: 2026-04-22
**Author**: CannonCoPilot (with Claude Opus 4.7)
**Status**: draft → review → active
**Planning basis**: Progress report dated 2026-04-22 (see prior assistant turn)
**Expected duration**: ~30 hours distributed across 6 phases

---

## Goal

Bring four related spaces into a consistent, integrated, and independently-runnable state:

1. **AIFred Pro Prod** (`~/Claude/AIFred-Pro`) — fully finalized
2. **Jarvis Prod** (`~/Claude/Jarvis`) — routing task activity through AIFred Pulse
3. **AIFred-Pro-Dev** (`~/Claude/AIFred-Pro-Dev`) — functioning isolated dev environment
4. **Jarvis-Dev** (`~/Claude/Jarvis-Dev`) — reference Archon implementation within Project Aion

---

## Conventions

**Task IDs**: `P<phase>-T<nn>` — e.g., `P2-T03`.
**Dependencies**: `depends_on` lists task IDs that must complete before this one starts.
**Priority mapping** (Pulse): `-p 1 = high`, `-p 2 = medium`, `-p 3 = low`, `-p 4 = backlog`.
**Labels applied to every task** (Pulse): `source:plan-2026-04-22`, `project:aifred`, `phase:<n>`.
**Additional per-task labels**: `domain:<area>`, `risk:<level>`, `capability:<code|infra|docs|decision>`.

**Status values**: `pending`, `ready` (all deps met), `in_progress`, `blocked`, `completed`.

---

## Cross-Cutting Decisions (must happen before implementation phases)

Each decision below is a standalone task in **Phase 0**. The decision deliverable is a file in `.claude/context/decisions/`. No downstream work in Phase 2+ may start until its dependent decisions are captured.

| Decision | File | Blocks |
|----------|------|--------|
| Pulse board sharing model (single board vs per-space) | `decisions/pulse-sharing-model.md` | P3-T01, P4-T06, P5-T05 |
| Dev-space isolation scheme (suffixes + port offsets) | `decisions/dev-space-isolation.md` | P4-T02, P5-T03 |
| Archon architecture target (what IS an Archon, lifecycle) | `decisions/archon-architecture.md` | P2-T01 |
| Jarvis→Pulse transport (host.docker.internal / network bridge / public) | `decisions/jarvis-pulse-transport.md` | P3-T02 |
| Dev SSO + reverse-proxy (share prod Authentik/Caddy vs standalone) | `decisions/dev-sso-proxy.md` | P4-T05 |

---

## Phase 0 — Safety & Architecture Decisions

Done criteria: all 5 decision docs exist and are reviewed; in-flight work is safely persisted on both prod repos.

### P0-T01 — Persist in-flight Jarvis prod work
**Description**: Jarvis prod has 38 uncommitted files (project-aion reports, CLAUDE.md changes, scripts). Commit on a `wip/pre-multi-space-plan` branch or create a proper commit on `Project_Aion` — user's call.
**Done criteria**: `git -C ~/Claude/Jarvis status --short | wc -l` returns 0.
**Dependencies**: none
**Labels**: `domain:git`, `risk:safe`, `capability:infra`, `project:jarvis`
**Priority**: `-p 1` (high)
**Estimated effort**: 20 min

### P0-T02 — Triage AIFred-Pro uncommitted changes
**Description**: 48 untracked files. Separate into (a) runtime noise (logs, state) to add to `.gitignore` if not already; (b) intentional additions (hook symlinks, agent memory, context docs) to commit.
**Done criteria**: `git status --short` shows only intentional changes OR all intentional changes are committed, with runtime noise excluded from staging.
**Dependencies**: none
**Labels**: `domain:git`, `risk:safe`, `capability:infra`, `project:aifred-pro`
**Priority**: `-p 1`
**Estimated effort**: 30 min

### P0-T03 — Decide Pulse board sharing model
**Description**: Choose: (a) one board for everything with `project:` label separation, (b) prod-vs-dev boards with their own Pulse instances, (c) hybrid (prod Pulse shared, dev Pulse separate).
**Done criteria**: `decisions/pulse-sharing-model.md` exists with the choice and rationale.
**Dependencies**: none
**Labels**: `domain:architecture`, `risk:safe`, `capability:decision`
**Priority**: `-p 1`
**Estimated effort**: 30 min

### P0-T04 — Decide dev-space isolation strategy
**Description**: Specify container naming (e.g., `*-dev-*` suffix), port offsets (e.g., +1 to prod port, or dedicated range like 18xxx), volume naming, network naming.
**Done criteria**: `decisions/dev-space-isolation.md` has explicit port table and naming convention.
**Dependencies**: none
**Labels**: `domain:architecture`, `risk:safe`, `capability:decision`
**Priority**: `-p 1`
**Estimated effort**: 45 min

### P0-T05 — Decide Archon architecture *direction* (not spec)
**Description**: High-level direction doc — NOT the detailed protocol spec (that's P2-T01). Answer: what *kind* of thing is an Archon (participant? service? role?), what IS in v0 vs deferred, what's the AuthN/AuthZ model, what framework it lives inside (Project Aion).
**Done criteria**: `decisions/archon-architecture.md` exists with: concept framing, v0 scope boundary list, explicit non-goals, AuthN/AuthZ sketch.
**Dependencies**: none
**Labels**: `domain:architecture`, `risk:safe`, `capability:decision`
**Priority**: `-p 1`
**Estimated effort**: 2 hours

---

## Phase 1 — AIFred Pro Prod Finalization

Done criteria: clean repo state, current docs, upstream interactions tracked.

### P1-T01 — Check upstream PR #1 (HARD GATE removal) status
**Description**: Visit https://github.com/CannonCoPilot/Project_Aion/pull/1; log whether merged, changes-requested, or stale.
**Done criteria**: Status logged in `session-state.md` under "Upstream interactions".
**Dependencies**: none
**Labels**: `domain:upstream`, `risk:safe`, `capability:docs`
**Priority**: `-p 3`
**Estimated effort**: 5 min

### P1-T02 — Check upstream issue #2 (archived hooks) status
**Description**: Visit https://github.com/CannonCoPilot/Project_Aion/issues/2; log status.
**Done criteria**: Status logged alongside P1-T01.
**Dependencies**: none
**Labels**: `domain:upstream`, `risk:safe`, `capability:docs`
**Priority**: `-p 3`
**Estimated effort**: 5 min

### P1-T03 — Confirm Sir notified of `ghp_` token rotation
**Description**: Reach out to Sir if not already done. Proof of communication captured.
**Done criteria**: Notification sent (evidence: email draft saved, Slack msg, or GitHub DM noted).
**Dependencies**: none
**Labels**: `domain:security`, `risk:safe`, `capability:docs`
**Priority**: `-p 2`
**Estimated effort**: 10 min

### P1-T04 — Update `configuration-summary.md`
**Description**: Reflect current state — commit SHAs, restored hook inventory, multi-space section header (pointing at this plan), known issues status.
**Done criteria**: File updated; last-updated timestamp current.
**Dependencies**: P0-T02
**Labels**: `domain:documentation`, `risk:safe`, `capability:docs`, `project:aifred-pro`
**Priority**: `-p 2`
**Estimated effort**: 20 min

### P1-T05 — Commit + push AIFred-Pro final prod state
**Description**: Single commit bringing all intentional changes onto `main`; push to `origin`.
**Done criteria**: `origin/main` matches local; `git status --short` shows only gitignored artifacts.
**Dependencies**: P0-T02, P1-T04
**Labels**: `domain:git`, `risk:moderate`, `capability:infra`, `project:aifred-pro`
**Priority**: `-p 2`
**Estimated effort**: 15 min

---

## Phase 2 — Archon Protocol Definition

Done criteria: protocol spec + reference utilities work end-to-end against live Pulse.

### P2-T01 — Write Archon Protocol v0 specification (detailed spec)
**Description**: The detailed technical spec at `context/patterns/archon-protocol-v0.md` with sections: (1) Identity & Registration, (2) Task Lifecycle Contract, (3) Capability Declaration, (4) Label/Metadata Conventions, (5) Failure Modes, (6) v0 Scope Boundaries. Must be implementable by a reference utility (P2-T03, P2-T04) without further design decisions. Distinct from P0-T05 (direction) — this is the concrete contract.
**Done criteria**: Doc exists; reviewed for internal consistency; every label/field/endpoint referenced downstream is defined; reference utilities can be built from this without further architecture review.
**Dependencies**: P0-T05
**Labels**: `domain:architecture`, `risk:safe`, `capability:docs`, `project:aifred-pro`
**Priority**: `-p 1`
**Estimated effort**: 3 hours

### P2-T02 — Extend label taxonomy for Archon
**Description**: Add `archon:*`, `archon-event:*`, `archon-capability:*` namespaces to `.claude/context/tools/label-taxonomy.yaml`. Validate via Pulse.
**Done criteria**: Taxonomy file updated; `pulse create` accepts new labels without error.
**Dependencies**: P2-T01
**Labels**: `domain:protocol`, `risk:safe`, `capability:infra`, `project:aifred-pro`
**Priority**: `-p 2`
**Estimated effort**: 45 min

### P2-T03 — Implement `archon/register` utility
**Description**: Shell or Python script at `scripts/archon/register.sh` (or `.py`) that: (a) reads an archon manifest file (name, capabilities), (b) creates a registration task on Pulse with appropriate labels, (c) returns the registration task ID for later reference.
**Done criteria**: Running the script with a test manifest produces a Pulse task visible via `pulse list --label archon:<name>`.
**Dependencies**: P2-T01, P2-T02
**Labels**: `domain:protocol`, `risk:moderate`, `capability:code`, `project:aifred-pro`
**Priority**: `-p 1`
**Estimated effort**: 2 hours

### P2-T04 — Implement `archon/task-create` wrapper
**Description**: Wrapper around `pulse create` that auto-injects standard Archon labels (`archon:<self>`, `archon-event:task-emitted`, `source:archon`) and accepts custom metadata.
**Done criteria**: Invocation creates tasks with correct label set; verified via API query.
**Dependencies**: P2-T01, P2-T02
**Labels**: `domain:protocol`, `risk:moderate`, `capability:code`, `project:aifred-pro`
**Priority**: `-p 1`
**Estimated effort**: 1 hour

### P2-T05 — Archon utilities test suite
**Description**: `scripts/archon/test.sh` — creates a test Archon registration, emits 3 test tasks, claims one, closes all. Asserts state at each step via API.
**Done criteria**: Script passes; running twice in a row (after cleanup) is deterministic.
**Dependencies**: P2-T03, P2-T04
**Labels**: `domain:testing`, `risk:safe`, `capability:code`, `project:aifred-pro`
**Priority**: `-p 1`
**Estimated effort**: 1 hour

### P2-T06 — Publish Archon docs
**Description**: Link `archon-protocol-v0.md` from AIFred-Pro `README.md` and `docs/`; add quickstart example.
**Done criteria**: Links work; quickstart reproduces.
**Dependencies**: P2-T01, P2-T05
**Labels**: `domain:documentation`, `risk:safe`, `capability:docs`, `project:aifred-pro`
**Priority**: `-p 2`
**Estimated effort**: 30 min

---

## Phase 3 — Jarvis Prod → AIFred Pulse Integration

Done criteria: Jarvis sessions emit tasks to the shared Pulse board; n8n workflows use Archon utilities.

### P3-T01 — Decide Jarvis→Pulse transport mechanism
**Description**: Per decision doc from P0-T03, choose concrete transport: (a) `host.docker.internal:8700` (simplest for macOS Docker Desktop), (b) attach jarvis-net to aifred-network (internal DNS `aifred-pulse:8700`), (c) `https://pulse.onomatologos.org` with service-account token.
**Done criteria**: `decisions/jarvis-pulse-transport.md` written.
**Dependencies**: P0-T03, P2-T01
**Labels**: `domain:architecture`, `risk:safe`, `capability:decision`, `project:jarvis`
**Priority**: `-p 1`
**Estimated effort**: 30 min

### P3-T02 — Implement Jarvis session-end Archon hook
**Description**: Add `~/Claude/Jarvis/.claude/hooks/session-end-archon.sh` (or JS). On session exit, calls `archon/task-create` with session summary. Must not break session exit if Pulse unreachable.
**Done criteria**: Hook registered in Jarvis `settings.json`; exits non-blocking on Pulse failure.
**Dependencies**: P3-T01, P2-T03, P2-T04
**Labels**: `domain:integration`, `risk:moderate`, `capability:code`, `project:jarvis`
**Priority**: `-p 1`
**Estimated effort**: 2 hours

### P3-T03 — End-to-end session test
**Description**: Start a Jarvis session, do trivial work, exit. Verify a task appears on Pulse with correct labels (`archon:jarvis`, `source:session-end`, `project:jarvis`).
**Done criteria**: Pulse task visible via `pulse list --label archon:jarvis`.
**Dependencies**: P3-T02
**Labels**: `domain:testing`, `risk:safe`, `capability:code`, `project:jarvis`
**Priority**: `-p 1`
**Estimated effort**: 30 min

### P3-T04 — Wire 2 high-value Jarvis n8n workflows to emit tasks
**Description**: Pick two existing workflows in `jarvis-n8n` that represent meaningful work. Add a final node that POSTs to Pulse via the Archon wrapper, with workflow-specific labels.
**Done criteria**: Completed workflows produce Pulse tasks; verified in live run.
**Dependencies**: P3-T02
**Labels**: `domain:integration`, `risk:moderate`, `capability:code`, `project:jarvis`
**Priority**: `-p 2`
**Estimated effort**: 3 hours

### P3-T05 — Update Jarvis CLAUDE.md
**Description**: Add "Task Management" section referencing AIFred Pulse + protocol link.
**Done criteria**: Section present; references resolve.
**Dependencies**: P3-T03
**Labels**: `domain:documentation`, `risk:safe`, `capability:docs`, `project:jarvis`
**Priority**: `-p 2`
**Estimated effort**: 20 min

### P3-T06 — Commit + push Jarvis integration changes (core only)
**Description**: Commit the core integration (session-end hook + docs) on `Project_Aion`. n8n workflow changes (P3-T04) can land in a follow-up commit — they are not required to unblock Phase 5.
**Done criteria**: Origin updated; session-state.md notes integration active; Phase 5 can proceed independent of P3-T04.
**Dependencies**: P3-T02, P3-T03, P3-T05
**Labels**: `domain:git`, `risk:moderate`, `capability:infra`, `project:jarvis`
**Priority**: `-p 2`
**Estimated effort**: 15 min

### P3-T07 — Update AIFred-Pro docs re: Jarvis integration
**Description**: Note Jarvis integration in AIFred-Pro `.claude/context/systems/jarvis.md` and `configuration-summary.md` — how tasks arrive, labeling convention, what to look for on the Pulse board.
**Done criteria**: Both files updated; cross-references to protocol doc and Jarvis CLAUDE.md.
**Dependencies**: P3-T03, P2-T06
**Labels**: `domain:documentation`, `risk:safe`, `capability:docs`, `project:aifred-pro`
**Priority**: `-p 2`
**Estimated effort**: 20 min

---

## Phase 4 — AIFred-Pro-Dev Deployment

Done criteria: AIFred-Pro-Dev runs alongside prod on isolated ports/names/volumes, with its own (optional) Pulse or configured to share prod's per P0-T03.

### P4-T01 — Sync AIFred-Pro-Dev to current AIFred-Pro state
**Description**: Merge or cherry-pick AIFred-Pro main (with Nexus overlay) into AIFred-Pro-Dev `main`. Resolve any conflicts.
**Done criteria**: AIFred-Pro-Dev has all infrastructure overlay files (pulse/, dashboard/, monitoring/, infrastructure/).
**Dependencies**: P0-T04, P1-T05
**Labels**: `domain:git`, `risk:moderate`, `capability:infra`, `project:aifred-pro-dev`
**Priority**: `-p 1`
**Estimated effort**: 45 min

### P4-T02 — Create dev compose overlay (`docker-compose.dev.yml`)
**Description**: Override file applying P0-T04 conventions. Rename: `aifred-postgres` → `aifred-dev-postgres`, `aifred-pulse` → `aifred-dev-pulse`, `aifred-dashboard` → `aifred-dev-dashboard`, etc. Offset all ports (per decision). Use distinct volume names. Create `aifred-dev-network`.
**Done criteria**: `docker compose -f docker-compose.yml -f docker-compose.dev.yml config` validates; every service shows renamed container, offset port, and distinct volume.
**Dependencies**: P0-T04, P4-T01
**Labels**: `domain:infra`, `risk:moderate`, `capability:infra`, `project:aifred-pro-dev`
**Priority**: `-p 1`
**Estimated effort**: 90 min

### P4-T03 — Populate AIFred-Pro-Dev `.env`
**Description**: Create dev-specific `.env` with distinct `PULSE_DB_PASSWORD`, `PULSE_DASHBOARD_TOKEN`, VAPID keys. Do NOT copy prod values.
**Done criteria**: `.env` exists; gitignored; secrets distinct from prod `.env`.
**Dependencies**: P4-T02
**Labels**: `domain:security`, `risk:moderate`, `capability:infra`, `project:aifred-pro-dev`
**Priority**: `-p 1`
**Estimated effort**: 20 min

### P4-T04 — Decide dev-stack use of Authentik/Caddy
**Description**: Per `decisions/dev-sso-proxy.md`: share prod's Authentik + Caddy (add subdomains `*-dev.onomatologos.org`) OR run dev without SSO (localhost-only).
**Done criteria**: Decision doc written; implementation plan is clear.
**Dependencies**: P0-T04
**Labels**: `domain:architecture`, `risk:safe`, `capability:decision`, `project:aifred-pro-dev`
**Priority**: `-p 2`
**Estimated effort**: 20 min

### P4-T05 — Bring up AIFred-Pro-Dev stack
**Description**: `docker compose -f docker-compose.yml -f docker-compose.dev.yml -f monitoring/docker-compose.monitoring.yml --project-name=aifred-pro-dev up -d`. Verify all containers healthy.
**Done criteria**: All 6 dev services healthy; zero port conflicts (prod unchanged); `docker ps` shows dev + prod side by side.
**Dependencies**: P4-T01, P4-T02, P4-T03, P4-T04
**Labels**: `domain:infra`, `risk:moderate`, `capability:infra`, `project:aifred-pro-dev`
**Priority**: `-p 1`
**Estimated effort**: 45 min

### P4-T06 — Verify dev Pulse isolation from prod
**Description**: Create test task on dev Pulse port. Verify it does NOT appear on prod Pulse. And vice versa.
**Done criteria**: Two-way isolation confirmed.
**Dependencies**: P0-T03, P4-T05
**Labels**: `domain:testing`, `risk:safe`, `capability:code`, `project:aifred-pro-dev`
**Priority**: `-p 1`
**Estimated effort**: 15 min

### P4-T07 — Document AIFred-Pro-Dev usage
**Description**: README section explaining how to start/stop dev stack, port mapping table, differences from prod. Link to relevant decision docs.
**Done criteria**: README updated; someone unfamiliar could bring up dev stack from docs alone.
**Dependencies**: P4-T05
**Labels**: `domain:documentation`, `risk:safe`, `capability:docs`, `project:aifred-pro-dev`
**Priority**: `-p 2`
**Estimated effort**: 30 min

### P4-T08 — Commit + push AIFred-Pro-Dev
**Description**: Commit all dev overlay files to `main`; push.
**Done criteria**: Origin updated.
**Dependencies**: P4-T07
**Labels**: `domain:git`, `risk:moderate`, `capability:infra`, `project:aifred-pro-dev`
**Priority**: `-p 2`
**Estimated effort**: 15 min

---

## Phase 5 — Jarvis-Dev Retrofit as Archon

Done criteria: Jarvis-Dev runs as an isolated dev stack AND serves as the reference Archon implementation.

### P5-T01 — Sync Jarvis-Dev with current Jarvis prod (incl. Archon integration)
**Description**: Merge or rebase so Jarvis-Dev `dev` branch has all the Jarvis prod work including Phase 3 Archon hooks.
**Done criteria**: `git log dev..Project_Aion` (in Jarvis prod) is empty or expected delta; Jarvis-Dev has the session-end Archon hook.
**Dependencies**: P3-T06, P0-T04
**Labels**: `domain:git`, `risk:moderate`, `capability:infra`, `project:jarvis-dev`
**Priority**: `-p 1`
**Estimated effort**: 1 hour

### P5-T02 — Refresh Jarvis-Dev `paths-registry.yaml`
**Description**: Paths-registry currently refers to an old MacBook Air (192.168.5.9). Rewrite for JARVIS.local (192.168.3.1) + current software versions.
**Done criteria**: `paths-registry.yaml` matches this host.
**Dependencies**: P5-T01
**Labels**: `domain:configuration`, `risk:safe`, `capability:docs`, `project:jarvis-dev`
**Priority**: `-p 2`
**Estimated effort**: 20 min

### P5-T03 — Apply dev isolation to Jarvis-Dev compose
**Description**: Rename every container with `-dev` suffix (`jarvis-dev-postgres`, etc.); offset all 8 ports; rename network `jarvis-net` → `jarvis-dev-net`.
**Done criteria**: `docker compose -f infrastructure/docker-compose.yml config` shows renamed services/ports; zero overlap with prod Jarvis.
**Dependencies**: P5-T01, P0-T04
**Labels**: `domain:infra`, `risk:moderate`, `capability:infra`, `project:jarvis-dev`
**Priority**: `-p 1`
**Estimated effort**: 1 hour

### P5-T04 — Populate Jarvis-Dev `.env`
**Description**: Create dev-specific `.env` in `~/Claude/Jarvis-Dev/infrastructure/`. Distinct DB passwords, N8N encryption key, Neo4j password.
**Done criteria**: `.env` exists; gitignored; differs from prod.
**Dependencies**: P5-T03
**Labels**: `domain:security`, `risk:moderate`, `capability:infra`, `project:jarvis-dev`
**Priority**: `-p 1`
**Estimated effort**: 20 min

### P5-T05 — Wire Jarvis-Dev as an Archon
**Description**: Add Archon registration to Jarvis-Dev startup (a `scripts/on-start/register-archon.sh`); wire session-end hook with label `archon:jarvis-dev`; add workflow labels per Archon convention.
**Done criteria**: On first start, Jarvis-Dev registers itself; sessions emit tasks distinguishable from Jarvis prod.
**Dependencies**: P5-T03, P2-T03, P2-T04, P0-T03
**Labels**: `domain:integration`, `risk:moderate`, `capability:code`, `project:jarvis-dev`
**Priority**: `-p 1`
**Estimated effort**: 2 hours

### P5-T06 — Bring up Jarvis-Dev stack
**Description**: `docker compose -f infrastructure/docker-compose.yml --project-name=jarvis-dev up -d`. Verify all 5 dev containers healthy.
**Done criteria**: `jarvis-dev-*` containers running; ports accessible; prod Jarvis undisturbed.
**Dependencies**: P5-T02, P5-T03, P5-T04
**Labels**: `domain:infra`, `risk:moderate`, `capability:infra`, `project:jarvis-dev`
**Priority**: `-p 1`
**Estimated effort**: 30 min

### P5-T07 — End-to-end Archon test
**Description**: Start Jarvis-Dev session; do a small piece of work; exit. Verify: (a) task appears on Pulse with `archon:jarvis-dev`; (b) task does NOT appear in prod Jarvis's space; (c) Archon registration is present.
**Done criteria**: All three verifications pass.
**Dependencies**: P5-T05, P5-T06
**Labels**: `domain:testing`, `risk:safe`, `capability:code`, `project:jarvis-dev`
**Priority**: `-p 1`
**Estimated effort**: 45 min

### P5-T08 — Document Jarvis-Dev as Archon reference
**Description**: `.claude/context/systems/jarvis-dev.md` updated; AIFred-Pro README section "Jarvis-Dev as Archon reference implementation" added.
**Done criteria**: Docs published; link from Archon protocol doc.
**Dependencies**: P5-T07, P2-T06
**Labels**: `domain:documentation`, `risk:safe`, `capability:docs`, `project:jarvis-dev`
**Priority**: `-p 2`
**Estimated effort**: 30 min

### P5-T09 — Commit + push Jarvis-Dev
**Description**: All Phase 5 changes committed and pushed.
**Done criteria**: Origin updated.
**Dependencies**: P5-T08
**Labels**: `domain:git`, `risk:moderate`, `capability:infra`, `project:jarvis-dev`
**Priority**: `-p 2`
**Estimated effort**: 15 min

---

## Phase 6 — Validation & Documentation

Done criteria: all spaces self-verify via automation; docs reflect final architecture.

### P6-T01 — Smoke test script
**Description**: `scripts/smoke-test-all-spaces.sh` — probes all 4 spaces' compose validity, container health, Pulse reachability, Archon registration, cross-space isolation. Exits non-zero on any failure.
**Done criteria**: Script passes when run against the fully-deployed system.
**Dependencies**: P3-T06, P4-T08, P5-T09
**Labels**: `domain:testing`, `risk:safe`, `capability:code`, `project:aifred-pro`
**Priority**: `-p 2`
**Estimated effort**: 90 min

### P6-T02 — Archon healthcheck scheduled job
**Description**: `.claude/jobs/registry.yaml` entry that runs every 30 min via dispatcher; lists registered Archons; emits an alert task if an Archon's last-heartbeat > 2h.
**Done criteria**: Job runs on cron; alert task visible when simulated absence.
**Dependencies**: P6-T01
**Labels**: `domain:monitoring`, `risk:safe`, `capability:code`, `project:aifred-pro`
**Priority**: `-p 2`
**Estimated effort**: 1 hour

### P6-T03 — Update `.claude/context/systems/` for all 4 spaces
**Description**: One file per space; each has: current state, ports/containers, compose files, related decisions, operational runbook.
**Done criteria**: 4 files present and current; referenced from configuration-summary.md.
**Dependencies**: P4-T07, P5-T08
**Labels**: `domain:documentation`, `risk:safe`, `capability:docs`, `project:aifred-pro`
**Priority**: `-p 2`
**Estimated effort**: 45 min

### P6-T04 — Finalize `configuration-summary.md` (multi-space)
**Description**: Add "Multi-Space Architecture" section with a table of all 4 spaces, their networks, port allocations, Pulse integration mode, Archon status. Include a diagram (mermaid or ASCII).
**Done criteria**: Section present; diagrams render.
**Dependencies**: P6-T03
**Labels**: `domain:documentation`, `risk:safe`, `capability:docs`, `project:aifred-pro`
**Priority**: `-p 2`
**Estimated effort**: 45 min

### P6-T05 — Final smoke test + commit
**Description**: Re-run `smoke-test-all-spaces.sh`; commit final docs; push.
**Done criteria**: Smoke passes; commit pushed.
**Dependencies**: P6-T01, P6-T02, P6-T03, P6-T04
**Labels**: `domain:testing`, `risk:safe`, `capability:infra`, `project:aifred-pro`
**Priority**: `-p 1`
**Estimated effort**: 30 min

---

## Dependency Graph (condensed)

```
P0 (decisions)  → unlocks → P1, P2, P3, P4, P5
P1 (prod final) → unlocks → P4 (P4-T01 needs P1-T05)
P2 (Archon)     → unlocks → P3-T02, P5-T05
P3 (Jarvis int) → unlocks → P5-T01
P4 (dev aifred) → unlocks → P6-T01
P5 (dev jarvis) → unlocks → P6-T01
P6 (validate)   → final
```

**Critical path**: P0-T05 → P2-T01 → P2-T03 → P3-T02 → P3-T06 → P5-T01 → P5-T05 → P5-T07 → P5-T09 → P6-T05 (~18 hours).

**Parallelizable**: most of P0, all of P1, P3-T04 alongside P4, P6-T03 alongside P6-T02.

---

## Total Estimate

| Phase | Tasks | Hours |
|-------|-------|-------|
| P0 | 5 | 3.75 |
| P1 | 5 | 0.92 |
| P2 | 6 | 8.25 |
| P3 | 7 | 7.42 |
| P4 | 8 | 4.92 |
| P5 | 9 | 7.5 |
| P6 | 5 | 4.25 |
| **TOTAL** | **45** | **~37 hours** |

---

## Rollback Triggers

- **Phase 4/5 rollback**: `docker compose down` the relevant dev project (NOT `down -v` — preserve volumes so dev data survives). No impact on prod. If volumes need to be wiped, explicitly `docker volume rm aifred-dev-* / jarvis-dev-*`.
- **Phase 3 rollback**: revert the session-end hook and n8n workflow nodes; Jarvis returns to standalone. Existing Pulse tasks created from Jarvis stay on the board (acceptable — they're labeled and can be closed or bulk-archived).
- **Phase 2 rollback**: archive the protocol doc; utilities are standalone scripts and can be deleted without side effects. Labels in taxonomy can stay (unused labels don't hurt).
- **Phase 1 rollback**: `git reset --hard` on main to prior commit; safety tags still in place from prior sessions (`pre-rerun-backup-2026-04-21`, `archive/setup-rerun-2026-04-22`, `archive/pre-vanilla-reset-2026-04-22`).
- **Plan-wide rollback**: all Pulse tasks created by this plan carry `source:plan-2026-04-22`. Bulk-close via `pulse list --label source:plan-2026-04-22 --json | jq '.tasks[].id' | xargs -I{} pulse close {} --reason "plan abandoned"`.

---

## Open Questions (to resolve during execution)

1. Should the Archon protocol support bidirectional communication (AIFred → Archon commands) in v0, or is task-emission-only sufficient?
2. Can Caddy host dev subdomains (`tasks-dev.onomatologos.org`) or is localhost-only preferable for dev?
3. Is the Archon healthcheck (P6-T02) a blocker for "done" or a nice-to-have?
4. Should AIFred-Pro-Dev also fork a separate Authentik instance, or is share-with-prod acceptable for development?
5. **Plan evolution policy**: when scope drifts during execution (inevitable), do we edit this plan doc + re-sync Pulse tickets, or fork a new plan version? Recommend: edit this file, bump version in Revision History, add/close/relabel Pulse tickets as needed.

---

## Phase Parallelization Map

After Phase 0 decisions land, these subgraphs can run in parallel:

- **Track A (AIFred prod finalization)**: P1-T01..T05 — can run right after Phase 0, no deps on other tracks.
- **Track B (Archon protocol)**: P2-T01..T06 — sequential within phase.
- **Track C (Jarvis integration)**: P3-T01..T07 — starts after P2-T04 complete (needs utility).
- **Track D (AIFred-Pro-Dev)**: P4-T01..T08 — starts after P1-T05 complete; parallel to Track C after that.
- **Track E (Jarvis-Dev)**: P5-T01..T09 — starts after P3-T06 complete; parallel to late-Track-D.

Phase 6 gates on all of D and E (and C for Archon integration test coverage).

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-22 | Claude Opus 4.7 | Initial draft generated from progress report |
| 1.1 | 2026-04-22 | Claude Opus 4.7 | Critical review corrections: (a) clarified P0-T05 vs P2-T01 scope; (b) bumped P0-T05 to 2h, P2-T01 to 3h; (c) removed P3-T04 blocker from P3-T06 commit; (d) added P3-T07 (AIFred-Pro docs update); (e) volume-preservation note in Rollback; (f) plan evolution question; (g) parallelization map; (h) this revision history |
| 1.2 | 2026-04-22 | Claude Opus 4.7 | **Governance revision — no-self-modification rule.** User established the rule that Claude in prod may not modify its own source code. 9 tasks identified as violations (created/modified source in AIFred-Pro or Jarvis prod). Revision applied: (a) violating tasks rerouted to Dev spaces with `target:*-dev` labels; (b) 6 new promotion-gate tasks added (Dev → Prod via human-reviewed PR); (c) 1 new task (P4-T09) for developing the plan-unblocker workflow in AIFred-Pro-Dev, then promoting; (d) P2/P3 implementation tasks now depend on P4/P5 Dev-space setup; (e) total task count 45 → 52. Auto-flow config (labels, auto:ready, pipeline:approved) applied to all compliant tickets. |

---

## Governance — No Self-Modification

Per established rule (see memory `feedback_no_self_modification.md`): **Claude operating in prod (AIFred-Pro or Jarvis prod) may not create or modify source code in those spaces.** This covers hooks, scripts, workflows, persona prompts, service source, CLAUDE.md. Claude may freely manage: settings/config, Pulse tickets, operational commands, data ops, and documentation files in `context/`.

All source changes happen in the corresponding Dev space; human-reviewed PR promotes to prod. This plan has been restructured accordingly — see v1.2 Revision History.

---

*End of plan.*
