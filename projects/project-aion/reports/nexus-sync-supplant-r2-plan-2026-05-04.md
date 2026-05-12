---
type: plan
version: "1.0"
date: 2026-05-04
author: Jarvis
project: AIFred-Pro
workstream: nexus-sync supplant onto nate-dev
phase: R2 → R3-resolved
status: R3 review complete (2026-05-04); ready for R4
r3_resolutions:
  Q1: "Option (c) — manual line-by-line merge for ALL conflict surfaces"
  Q2: "Option (c) + isolate — ADAPT into both executor.sh and executor.py; rewire callers off executor.sh; keep file disconnected for David's review continuity"
  Q3: "Option (a) — supplant includes thread_id port to pipeline-v2 services"
  Q4: "Option (b) — verified now; schema NOT present in pulse_dev; derive from audit-ingest.py and apply migration in R6"
  Q5: "Option (a) — supplant includes _parse_and_emit_persona_decisions port to executor.py; ALL shell-path executions ultimately isolated and rewired to python services"
related:
  - projects/project-aion/reports/nexus-sync-supplant-r1-investigation-2026-05-04.md
  - projects/project-aion/reports/aifred-pro-dev-comprehensive-review-2026-05-04.md
---

# R2 — Per-Commit Classification with Adaptation Strategy

Per-commit lift plan for the 21 commits on `origin/nexus-sync-2026-04` ahead of `nate-dev`. Per directive, no REJECT or DEFER classifications — every commit must end up represented in nate-dev. Items I'd otherwise reject become **REQUIRES_DECISION** with a specific question for joint R3 review.

---

## R3 Resolution Summary — Adapt-Absorb-Replace Mandate

User directive (2026-05-04): "lean heavily towards fully integrating every conflict surface and avoiding leaving behind any redundant or parallel scripts or services. The end aim is to fully collapse all redundant or overlapping components."

The supplant is now an **adapt-absorb-replace** workstream, not a simple lift:

| Phase | Action | Where |
|---|---|---|
| **ADAPT** | Lift each nexus-sync commit's content into nate-dev — including conflict-surface manual merges | R5 main loop |
| **ABSORB** | Port every shell-path function David's commits add into pipeline-v2 python services (executor.py, evaluate.py, etc.) | R5 follow-up commits per Category B commit |
| **REPLACE-prep** | Rewire dispatcher / event-watcher / pulsar callers OFF shell scripts and ONTO python services | R5 final stage |
| **REPLACE** (deferred to post-David-merge) | Full removal of executor.sh, dispatcher.sh, etc. after David merges nate-dev to AIFred-Pro main | NOT in this supplant; future cleanup |

**Steady-state after this supplant**: shell scripts (executor.sh, dispatcher.sh, audit-log.sh, etc.) preserved in commit history with David's authorship intact, but disconnected from any live execution path. Live system runs entirely on python services in `.claude/jobs/services/`.

### Phase 5.1 Schema Verification (R3-Q4)

**Status**: schema NOT present in `pulse_dev`. The pulse PostgreSQL container has 10 baseline tables (api_requests, events, tasks, etc.) — no `pulse.audit_log`, no `pulse.cost_events`, no `pulse.decision_events`, no `pulse` schema namespace.

**Schema source**: NOT available in either branch. The Phase 5.1 schema lives in David's separate AIProjects repository (referenced by `~/AIProjects` in audit-ingest.py defaults). However, audit-ingest.py's INSERT column lists give us the full column inventory:

```
pulse.audit_log:       ts, thread_id, actor, action, entity_type, entity_id, task_id,
                       project_id, session_id, severity, details, source_file
pulse.cost_events:     ts, thread_id, task_id, session_id, job, persona, model, engine,
                       cost_usd, input_tokens, output_tokens, cache_read_tokens,
                       cache_creation_tokens, cache_hit_ratio, duration_s, success,
                       router_model, router_overridden, company, project_id
pulse.decision_events: ts, thread_id, parent_id, task_id, actor, decision_type, outcome,
                       alternatives, signals_matched, confidence, rationale,
                       downstream_effect
```

**Migration plan** (added to R6):
1. Author `pulse/migrations/0002-phase-5-1-observability-tables.sql` based on audit-ingest column lists + reasonable type inference (TIMESTAMPTZ, TEXT, JSONB, NUMERIC, INTEGER, BOOLEAN)
2. Run against `pulse_dev` during R6 verification
3. Confirm audit-ingest.py exits 0 on `--dry-run` against the migrated DB

**Connection config divergence** (also surfaced by R3-Q4):

audit-ingest.py defaults assume:
- host=localhost, port=**5434**, dbname=**pulse**, user=**vadmin**, password=`password`
- PROJECT_DIR defaults to `~/AIProjects`

Our reality:
- aifred-dev-postgres @ port 5432, dbname=`pulse_dev`, user=`pulse_dev`, password from `.env`
- PROJECT_DIR is `/Users/nathanielcannon/Claude/Alfred-Dev`

**Connection adaptation**: when lifting `ea298c2`, ADAPT the audit-ingest.sh wrapper to source Alfred-Dev's `.env.dev` (PULSE_DB_PORT=5432, PULSE_DB_NAME=pulse_dev, PULSE_DB_USER=pulse_dev, PULSE_DB_PASSWORD from secret). Set PROJECT_DIR via env. This is part of ea298c2's ADAPT strategy now.

---

## How to Read This Document

| Classification | Meaning | R5 action |
|---|---|---|
| **ADOPT** | Cherry-pick clean. No adaptation. | `git cherry-pick -x <sha>` |
| **ADOPT-empty** | Cherry-pick produces empty/near-empty commit because content already in nate-dev. | `git cherry-pick -x --allow-empty <sha>` (preserves authorship + message) |
| **ADAPT** | Cherry-pick + manual conflict resolution per stated strategy | `git cherry-pick -x --no-commit <sha>` → resolve → `git commit --author="<david>" --message="<adapted>"` |
| **REQUIRES_DECISION** | Joint R3 review needed. Cannot proceed to R5 until resolved to ADOPT or ADAPT. | — |

R3 exit gate: zero REQUIRES_DECISION remaining.

---

## R2 Verification Findings (added to R1 baseline)

| Spot-check | Result | Implication |
|---|---|---|
| `a450f61` App.tsx top 10 lines match nate-dev current | **Match exactly** | Most/all of dashboard already present in nate-dev. Cherry-pick may be empty or near-empty. |
| Persona dirs already flat in nate-dev (`ai-reviewer`, `infrastructure-deployer`, `librarian`) | **Already flat** | `b0d4ff8` flattening work already done; commit will be near-empty |
| `common.sh` does NOT yet source `decision-log.sh` | **Confirmed** | 93f5320's addition of that line is a clean append |
| `executor.sh` branding: 3× "AIfred"/"Headless Claude", 1× "Nexus" | Mixed state | Rebrand `3ada792` will conflict with our pipeline-v2 edits where they introduced new strings |

Net effect: at least 2 commits (`a450f61`, `b0d4ff8`) will be lighter than R1 anticipated. R5 estimate revises **down** slightly to ~3–6 hours likely.

---

## R5 Lift Order (Chronological + Dependency-Aware)

Sequence with rationale:

```
 1. 0e6e1a2   security hygiene (foundation, no deps)
 2. 7c4db38   executor MODEL pin + watchdog
 3. 3ada792   ⚠ REBRAND — must land before further code edits
 4. a450f61   dashboard bundle (largely already present)
 5. 7bc1538   ⚠ COMPREHENSIVE SYNC (largest single commit)
 6. 7f80e16   VERSION 4.0.0 (after Nexus identity)
 7. b0d4ff8   flatten nested persona dirs (largely already done)
 8. 16ed6d5   executor.sh sync + workflows + system docs
 9. abee226   sync gaps cleanup
10. 54dda47   ⚠ Phase 5.2 — dual-write libs + thread_id (foundational for 5.x)
11. 4689195   Phase 5.2 SC2155 fix
12. ea298c2   ⚠ Phase 5.3 — audit-ingest (B2)
13. 93f5320   ⚠ Phase 5.5 — decision rationale (B1)
14. 613a71e   Phase 5.5 shellcheck
15. 0641bc3   Phase 5.5 hardening
16. c4058bf   mirror Phase 5.0+5.8
17. f933c72   Phase 5.0 TZ discipline follow-up
18. 40290c4   ⚠ dashboard viz: conditional/loops/retry/output
19. f5f98ea   dashboard viz fixes (depends on 40290c4)
20. 1e618ef   dashboard viz cleanup (depends on 40290c4)
21. ee9b155   README refresh (last)
```

⚠ = high-risk or load-bearing. Smoke-test after each ⚠ commit, plus every 3-5 commits otherwise.

---

## Per-Commit Plan

### Stage 1 — Foundation hygiene + rebrand (commits 1-3)

#### 1. `0e6e1a2` — Remove hardcoded paths and secrets

- **Files**: 7 (`docker-deployer.md`, 3 patterns, `executor.sh`, 2 scripts)
- **Conflict surface**: `executor.sh` (we have edits via pipeline-v2). Patterns may also have nate-dev edits.
- **Classification**: **ADAPT**
- **Strategy**: cherry-pick `--no-commit`. Resolve `executor.sh` by accepting hardcoded-path removals and merging with our pipeline-v2 path logic. Patterns: prefer David's templated versions, port any pipeline-v2-specific notes forward.
- **Estimated effort**: 15 min

#### 2. `7c4db38` — Executor MODEL pin + watchdog improvements

- **Files**: 2 (`executor.sh`, `lib/dispatcher-watchdog.sh`)
- **Conflict surface**: `executor.sh` (our edits)
- **Classification**: **ADAPT**
- **Strategy**: cherry-pick `--no-commit`. Apply MODEL pin verbatim. For watchdog, accept David's improvements — we haven't touched dispatcher-watchdog.sh.
- **Estimated effort**: 10 min

#### 3. `3ada792` — Rebrand to Nexus ⚠

- **Files**: 64 (mostly mechanical text replacement; one rename `lib/jobsdb.py → lib/nexusdb.py`)
- **Conflict surface**: HIGH textual churn. Many of these files have nate-dev edits.
- **Classification**: **ADAPT**
- **Strategy**: cherry-pick `--no-commit`. For each conflict file, run a regex pass `s/AIfred Jobs/Nexus/g; s/Headless Claude Jobs/Nexus/g` (preserving "headless" as technical term per commit message), then resolve any remaining textual conflicts. Verify `lib/jobsdb.py` rename still applies to nexusdb.py target. Update `registry.yaml` header.
- **Sequencing rationale**: must land before commits 4+ to prevent each subsequent rebrand fragment from reigniting renames in conflict resolution.
- **Estimated effort**: 30-45 min

---

### Stage 2 — Foundational adds (commits 4-9)

#### 4. `a450f61` — Bundle Pulse Dashboard as Docker service

- **Files**: 252 (entire `dashboard/` directory — Dockerfile, frontend, server)
- **Conflict surface**: spot-check confirmed App.tsx matches between David's commit and our nate-dev. Most/all files already present.
- **Classification**: **ADOPT-empty** (likely)
- **Strategy**: `git cherry-pick -x --allow-empty a450f61`. If the commit produces a near-empty diff, accept it (preserves David's authorship + message in our log). If it produces *some* changes, examine: if files differ in ways that suggest David has older content, ADAPT with our newer code preserved; if content is genuinely new, ADOPT.
- **Risk**: there *may* be 5-10 files where David's content differs from ours (we've worked the dashboard heavily). Resolve those individually preferring nate-dev's newer code unless David's adds new functionality.
- **Estimated effort**: 10-30 min depending on how many files genuinely differ

#### 5. `7bc1538` — Comprehensive Nexus sync ⚠

- **Files**: 151 (libs, scripts, hooks, personas, workflows, docs, registries, pulsars)
- **Conflict surface**: 
  - **Mostly additive**: 17 system docs (`.claude/context/systems/*.md`) — should land cleanly, none in nate-dev currently.
  - **Likely conflicts**: hooks (`persona-guard.js`, `document-guard.js`, `credential-guard.js` — 40-70% expansions; we may have made small edits), existing personas (`ai-reviewer`, `infrastructure-deployer`, `librarian`, `project-manager` — David's "templatized" versions may differ from ours).
  - **New additions clean**: `pulsars.yaml`, `bin/pulsar-runner.sh`, new personas (orchestrator, cortex, content-writer, researcher-readonly, skill-experimenter), 39 workflows, 4 registries, `loom-*` docs.
- **Classification**: **ADAPT**
- **Strategy** (R3-resolved, Q1 = Option C): cherry-pick `--no-commit`. **Manual line-by-line merge for ALL conflict surfaces** — never accept "lose nate-dev's edits" or "lose David's edits"; combine substance from both. For ai-reviewer/prompt.md, walk both versions section-by-section, integrating David's "templatized" structural additions with our recent prompt edits. For hooks, integrate David's expansions (40-70% larger) WITH any nate-dev edits — preserve all functionality from both sides.
- **R3 resolution**: full integration mandate applies — no "lose half" shortcuts.
- **Estimated effort**: **75-100 min** (revised up from 45-60 due to line-by-line merge mandate)

#### 6. `7f80e16` — VERSION bump to 4.0.0

- **Files**: 1 (`VERSION`)
- **Classification**: **ADOPT** (or ADOPT-empty if we already had it via main)
- **Strategy**: `git cherry-pick -x 7f80e16`
- **Estimated effort**: 1 min

#### 7. `b0d4ff8` — Flatten nested persona directories

- **Files**: 40 (deletes nested `*/dirname/dirname/` patterns)
- **Conflict surface**: spot-check confirms personas already flat in nate-dev (`ai-reviewer/ai-david/` does NOT exist; same for infrastructure-deployer, librarian).
- **Classification**: **ADOPT-empty** (likely)
- **Strategy**: `git cherry-pick -x --allow-empty b0d4ff8`. If empty, message is preserved for audit. If not empty (some nested dir we missed), resolve by accepting the deletions.
- **Estimated effort**: 5 min

#### 8. `16ed6d5` — Complete executor.sh sync + workflows + docs

- **Files**: 20 (executor.sh + 18 workflow markdown files + `_index.md`, `_template-service.md`, etc.)
- **Conflict surface**: `executor.sh` (heavy churn). Workflows are likely new files (we don't have agent-infra-check, agent-troubleshoot, creative-build, github-issue-poller, etc.).
- **Classification**: **ADAPT**
- **Strategy** (R3-resolved, Q2 = Option C + isolate): cherry-pick `--no-commit`. ADAPT David's executor.sh expansions into executor.sh AND port the same logic into `services/executor.py` for live execution parity. After all Category B commits land, REWIRE dispatcher.sh / event-watcher.sh callers to invoke `services/executor.py` instead of `executor.sh` (in a final R5 commit). executor.sh is preserved with full content but disconnected.
- **R3 resolution**: dual-write the lift (shell + python) plus isolation rewire. Workflow markdown files land additively unchanged.
- **Estimated effort**: **60 min** (was 30) — added ~30 min for python port of executor.sh deltas
- **Sub-commit structure**:
  1. Cherry-pick the shell adaptations (preserves David's authorship)
  2. Author follow-up commit: `feat(services/executor): port executor.sh sync deltas to python (adapt-absorb)`

#### 9. `abee226` — Sync gaps: templatize allowlist, missing libs, theklyx refs

- **Files**: 6 (`bin/exposure-audit.sh`, `lib/caddyfile-lint.py`, `lib/creative-activity-digest.sh`, `pulsars.yaml`, `registries/public-endpoints-allowlist.yaml`, `dashboard/PLAN.md`)
- **Conflict surface**: `pulsars.yaml` was added by `7bc1538` (commit 5) so we already have it; this commit modifies it. dashboard/PLAN.md may exist or not. Other files likely new.
- **Classification**: **ADAPT** (light)
- **Strategy**: cherry-pick `--no-commit`. Resolve any conflicts on pulsars.yaml + dashboard/PLAN.md. New files land cleanly.
- **Estimated effort**: 10 min

---

### Stage 3 — Phase 5.x observability rollout (commits 10-15)

#### 10. `54dda47` — Phase 5.2 dual-write libs + thread_id ⚠

- **Files**: 5 (`dispatcher.sh`, `executor.sh`, **NEW** `lib/audit-log.sh`, **NEW** `lib/cost-log.sh`, **NEW** `lib/decision-log.sh`)
- **Conflict surface**: dispatcher.sh + executor.sh have our edits. Three new lib files are clean adds.
- **Classification**: **ADAPT**
- **Strategy** (R3-resolved, Q3 = Option A): cherry-pick `--no-commit`. Three lib files (audit-log.sh, cost-log.sh, decision-log.sh) land cleanly. ADAPT dispatcher.sh + executor.sh shell adaptations. THEN supplant authorship adds:
  - `services/_shared.py`: thread_id env propagation helper (read NEXUS_THREAD_ID, generate if absent)
  - All pipeline-v2 services updated to read/propagate thread_id
  - Python equivalents of audit-log/cost-log/decision-log as a `services/observability/` module (or extend `_shared.py`)
- **R3 resolution**: full thread_id parity in python services. Shell logs and python logs converge into the same Pulse tables.
- **Estimated effort**: **75 min** (was 25) — added 50 min for python port (3 lib files + thread_id propagation across 5 services)
- **Sub-commit structure**:
  1. Cherry-pick shell adaptations
  2. `feat(services/observability): port audit/cost/decision logging to python (adapt-absorb)`
  3. `feat(services): NEXUS_THREAD_ID propagation across pipeline-v2 services`

#### 11. `4689195` — Phase 5.2 SC2155 fix

- **Files**: 2 (`dispatcher.sh`, `executor.sh`)
- **Classification**: **ADOPT** (small follow-up to 54dda47, will apply cleanly after 54dda47 lands)
- **Strategy**: `git cherry-pick -x 4689195`
- **Estimated effort**: 2 min

#### 12. `ea298c2` — Phase 5.3 audit-ingest (B2) ⚠

- **Files**: 2 NEW (`audit-ingest.py`, `audit-ingest.sh`)
- **Conflict surface**: NONE. Both files are new.
- **Classification**: **ADAPT** (was ADOPT — upgraded due to schema gap and config divergence)
- **Strategy** (R3-resolved, Q4 = Option B verified):
  1. Cherry-pick the two new files
  2. ADAPT `audit-ingest.sh` wrapper to source Alfred-Dev's dev env (port 5432, db=pulse_dev, user=pulse_dev, PROJECT_DIR=$AIFRED_DEV_ROOT)
  3. Author Phase 5.1 schema migration: `pulse/migrations/0002-phase-5-1-observability-tables.sql` (column lists derived from audit-ingest INSERT statements; type inference: TIMESTAMPTZ for ts, TEXT for strings, JSONB for alternatives/details, NUMERIC for cost_usd, etc.)
  4. Apply migration to pulse_dev in R6 verification
  5. Author `services/observability/audit_ingest.py`: python port of audit-ingest.py for the live pipeline-v2 path. Same logic, native python service.
- **R3 resolution (Q4)**: schema verified absent; derive from audit-ingest column lists; apply in R6.
- **R3 resolution (adapt-absorb)**: python service port lands as supplant authorship.
- **Estimated effort**: **45 min** (was 5) — added ~40 min for migration authoring + python port
- **Dependencies**: schema must land BEFORE R6 smoke-tests audit-ingest functionality.
- **Sub-commit structure**:
  1. Cherry-pick shell + adapt env config (preserves David's audit-ingest.py authorship)
  2. `feat(pulse): Phase 5.1 observability schema migration (audit_log/cost_events/decision_events)` — our authorship
  3. `feat(services/observability): port audit-ingest to pipeline-v2 (adapt-absorb)` — our authorship

#### 13. `93f5320` — Phase 5.5 decision rationale (B1) ⚠

- **Files**: 7 (`lib/common.sh` +4, `executor.sh` +227, `pipeline-watchdog.sh` +47, `bin/pulsar-runner.sh` +32, 3 persona prompts +131 total)
- **Conflict surface**:
  - `lib/common.sh`: we don't yet source decision-log.sh (verified). Clean append.
  - `executor.sh`: heavy adds. After 54dda47 + 16ed6d5 land, the conflict-free portion may be larger; remaining conflicts manageable.
  - `pipeline-watchdog.sh`: we may have edits. Resolve.
  - Persona prompts (ai-reviewer, task-evaluator, task-investigator): pure additions of `decisions[]` array specs and Step 7b. Personas in nate-dev DO NOT yet have these. Clean append.
- **Classification**: **ADAPT**
- **Strategy** (R3-resolved, Q5 = Option A + full absorb-replace): cherry-pick `--no-commit`. Lib + personas + pulsar-runner land clean. executor.sh + watchdog conflicts resolve manually with line-by-line merge. THEN supplant authorship adds:
  - `services/executor.py`: equivalent of `_parse_and_emit_persona_decisions` — walks SDK persona report JSON, extracts `decisions[]` array, calls observability.log_decision for each entry
  - `services/diagnose.py` (pipeline-watchdog python equivalent): apply_fix tracking + log_health decision emission
  - `services/_shared.py`: budget_gate / task_claim / retry decision-emission helpers used by all services
- **R3 resolution**: full python-side decision emission parity. Decision events fire from BOTH shell-path and python-path executions. Eventually shell paths get isolated.
- **Estimated effort**: **90 min** (was 30) — added 60 min for the python ports (function + watchdog + helpers)
- **Sub-commit structure**:
  1. Cherry-pick shell adaptations + persona prompt updates
  2. `feat(services/executor): port _parse_and_emit_persona_decisions to python (adapt-absorb)`
  3. `feat(services/diagnose): port pipeline-watchdog log_health to python (adapt-absorb)`

#### 14. `613a71e` — Phase 5.5 shellcheck SC2038 fix

- **Files**: 1 (`executor.sh`)
- **Classification**: **ADOPT** (will apply cleanly after 93f5320 lands)
- **Estimated effort**: 2 min

#### 15. `0641bc3` — Phase 5.5 hardening: audit-ingest dedup ON CONFLICT + watchdog fix guard

- **Files**: 2 (`audit-ingest.py`, `pipeline-watchdog.sh`)
- **Classification**: **ADAPT** (light — pipeline-watchdog.sh may have small conflict)
- **Strategy**: cherry-pick `--no-commit`. audit-ingest.py applies clean. Resolve watchdog conflict.
- **Note**: This commit fixes the audit-ingest dedup gap that the comprehensive review §3 flagged as a known limitation in B1. After this lands, the gap is closed.
- **Estimated effort**: 10 min

---

### Stage 4 — Mirror + dashboard fixes (commits 16-21)

#### 16. `c4058bf` — Mirror observability Phases 5.0+5.8 from AIProjects

- **Files**: 8 (`bin/pulsar-runner.sh`, `event-watcher.sh`, `executor.sh`, `lib/audit-log.sh`, `lib/common.sh`, `lib/cost-log.sh`, `pipeline-runner.sh`, `pipeline-watchdog.sh`)
- **Conflict surface**: Multiple files with our edits + David's prior commits' adds (audit-log.sh, cost-log.sh just landed in 54dda47).
- **Classification**: **ADAPT**
- **Strategy**: cherry-pick `--no-commit`. After 54dda47 lands, the libs are present; this commit refines them. Resolve conflicts in executor.sh, pipeline-runner.sh.
- **Estimated effort**: 20 min

#### 17. `f933c72` — Phase 5.0 TZ discipline → msg-relay + telegram-callback

- **Files**: 2 (`lib/msg-relay.sh`, `lib/telegram-callback-handler.sh`)
- **Classification**: **ADOPT** (trivial — 2 lines, no conflict expected)
- **Estimated effort**: 2 min

#### 18. `40290c4` — Dashboard visualize conditional/loops/retry/output ⚠

- **Files**: 4 (`api/orchestrations.ts`, `OrchestrationGraphView.tsx`, `OrchestrationTaskNode.tsx`, `pages/ProjectDetailPage.tsx`)
- **Conflict surface**: `ProjectDetailPage.tsx` exists in nate-dev. Need to verify `OrchestrationGraphView.tsx` and `OrchestrationTaskNode.tsx` exist (likely yes from a450f61 or main).
- **Classification**: **ADAPT** (light)
- **Strategy**: cherry-pick `--no-commit`. Resolve ProjectDetailPage conflict (we have edits for Project Creator). Accept orchestration component additions.
- **Estimated effort**: 15 min

#### 19. `f5f98ea` — Dashboard viz: guard dangling edges + hasOutput badge

- **Files**: 2 (`OrchestrationGraphView.tsx`, `OrchestrationTaskNode.tsx`)
- **Classification**: **ADOPT** (depends on 40290c4; will apply cleanly after)
- **Estimated effort**: 2 min

#### 20. `1e618ef` — Dashboard viz: remove dead has_retry badge

- **Files**: 4 (`api/orchestrations.ts`, `OrchestrationGraphView.tsx`, `OrchestrationTaskNode.tsx`, `pages/ProjectDetailPage.tsx`)
- **Classification**: **ADOPT** (depends on 40290c4)
- **Estimated effort**: 2 min

#### 21. `ee9b155` — README refresh

- **Files**: 1 (`README.md`)
- **Conflict surface**: David's README describes nexus-sync state. nate-dev's current README (if any) may describe pipeline-v2 work or be the unchanged repo template.
- **Classification**: **ADAPT** (rewrite informed by both inputs)
- **Strategy**: cherry-pick `--no-commit`. Adapt the resulting README to describe the merged state: Alfred-Dev nate-dev branch contains both the comprehensive Nexus sync (David's authorship) AND pipeline-v2 work (our authorship). Acknowledge David's contribution in the README.
- **Estimated effort**: 20 min (write-from-merge)

---

## R3 Resolutions (Historical — for audit trail)

All five questions resolved in joint review on 2026-05-04. Original questions and resolutions preserved below for traceability.

### R3-Q1: ai-reviewer reconciliation under `7bc1538`

**Context**: David's "templatized from ai-david" version of `personas/ai-reviewer/` may differ structurally from nate-dev's current version. Both versions are likely substantive (220+ lines of prompt.md each).

**Options**:
- (a) Accept David's structure entirely; lose any nate-dev-specific prompt edits since merge-base
- (b) Keep nate-dev's prompt.md, accept only David's methodology.yaml + permissions.yaml
- (c) Manual line-by-line merge (most expensive)

**Recommendation**: (b) — preserves continuity of our recent prompt work, accepts structural improvements without conflict.

### R3-Q2: `executor.sh` deprecation timing under `16ed6d5`

**Context**: nate-dev has both `executor.sh` (65 KB) and pipeline-v2 `executor.py`. The comprehensive review §5.2 flagged executor.sh deprecation as "unclear; possibly removable." David's commits add ~280 lines to executor.sh across multiple commits.

**Options**:
- (a) ADOPT all David's executor.sh expansions; defer deprecation decision to post-supplant
- (b) Resolve deprecation NOW — declare executor.sh either active or vestigial — and either accept David's edits (active) or skip them (vestigial) which violates no-REJECT
- (c) ADAPT David's expansions both into executor.sh AND port to executor.py, doubling maintenance burden but preserving both paths

**Recommendation**: (a) — keeps the no-REJECT directive intact, defers the architecture decision to a separate workstream.

### R3-Q3: NEXUS_THREAD_ID propagation in pipeline-v2 services

**Context**: `54dda47` adds NEXUS_THREAD_ID env var propagation through dispatcher.sh and executor.sh. Pipeline-v2 services (executor.py, evaluate.py, orchestrate.py, reviewer.py) don't currently have equivalent.

**Options**:
- (a) Supplant includes a follow-up commit porting thread_id propagation to python services
- (b) Python services run without thread_id; only shell-script chains have decision rationale
- (c) Defer to R8 (post-supplant work)

**Recommendation**: (a) — preserves observability symmetry across both execution paths.

### R3-Q4: Pulse Phase 5.1 schema availability for `ea298c2`

**Context**: audit-ingest depends on `pulse.audit_log`, `pulse.cost_events`, `pulse.decision_events` tables in PostgreSQL. These were shipped in Phase 5.1 (a commit BELOW our merge-base or independently in Pulse). Need to verify.

**Options**:
- (a) Verify in R6; if missing, run schema migration as part of R6 verification
- (b) Verify NOW (during R3) before committing to supplant order
- (c) Defer audit-ingest functionality verification to R8

**Recommendation**: (b) — quick check now (`docker exec aifred-pulse-dev psql ... -c "\dt pulse.*"`); if missing, R6 includes migration. Avoids R5/R6 surprise.

### R3-Q5: `_parse_and_emit_persona_decisions` parity in executor.py under `93f5320`

**Context**: `93f5320` adds 227 lines to executor.sh, mostly the `_parse_and_emit_persona_decisions` function. Pipeline-v2's executor.py has no equivalent.

**Options**:
- (a) Supplant includes a follow-up commit porting the function to python (~50-100 lines)
- (b) executor.py runs without decision emission; decision telemetry only flows from shell-path executions
- (c) Defer parity to R8

**Recommendation**: (a) — same reasoning as R3-Q3. Parity preserves the value of the supplant.

---

## Aggregate R5 Effort Estimate (R3-resolved)

| Stage | Commits + sub-commits | Total estimated effort |
|---|---|---|
| Stage 1 (foundation + rebrand) | 1-3 | 75-90 min (manual merge upweight) |
| Stage 2 (foundational adds) | 4-9 | 165-210 min (Q1 line-by-line merge in 7bc1538; Q2 python port in 16ed6d5) |
| Stage 3 (Phase 5.x + absorb work) | 10-15 + 6 sub-commits | 240-300 min (3 substantial python port commits) |
| Stage 4 (mirror + dashboard) | 16-21 | ~60-75 min |
| **Final isolation rewire commit** | 1 (our authorship) | 30-45 min — rewire dispatcher / event-watcher to call `services/executor.py` instead of `executor.sh`; isolate shell scripts |
| Schema migration (R6, but plumbed in R5 design) | 1 (our authorship) | 30 min — pulse/migrations/0002-phase-5-1-observability-tables.sql |
| Smoke-test interludes (after each ⚠ commit + every 3-5) | — | 45-60 min |
| **R5 total** | 21 + 7 sub-commits | **~10-13 hours expected** |

**Critical implication**: R5 cannot complete in a single session at this scale. Recommend planning R5 across 2-3 sessions with checkpoint commits between. R6+R7 then a third session.

### Python ports added by adapt-absorb mandate

| Port | Source commit | Estimate |
|---|---|---|
| `services/executor.py` deltas (executor.sh sync) | 16ed6d5 | 30 min |
| `services/observability/` module (audit/cost/decision logs) | 54dda47 | 50 min |
| NEXUS_THREAD_ID propagation across services | 54dda47 | 25 min |
| `pulse/migrations/0002-phase-5-1-...` | ea298c2 (our auth) | 30 min |
| `services/observability/audit_ingest.py` | ea298c2 (port) | 30 min |
| `services/executor` decision emission (parse_and_emit) | 93f5320 | 30 min |
| `services/diagnose` log_health (watchdog port) | 93f5320 | 30 min |
| Final isolation rewire (dispatcher / event-watcher → services) | our auth | 30-45 min |
| **Total port effort** | | **~4 hours** added to base lift |

---

## Smoke-Test Plan for R5

After each ⚠ commit and every 3-5 commits otherwise:

1. `bash .claude/jobs/dispatcher.sh --check` — does dispatcher still parse registry.yaml?
2. `python -c "from .claude.jobs.services import executor"` — does pipeline-v2 still import?
3. `cd dashboard && docker build -t aifred-dashboard:r5-progress .` — does dashboard still build?
4. `cd .claude/jobs && bash audit-ingest.sh --dry-run` (after commit 12) — does audit-ingest run?
5. After commit 21: full gospel-synopsis test suite

Failure of any smoke-test stops R5. Diagnose, fix in place, then continue. No deferring.

---

## Files I Plan to Create / Touch

| File | Phase | Purpose |
|---|---|---|
| `projects/project-aion/reports/nexus-sync-supplant-r5-progress-2026-05-04.md` | R5 | Per-commit checklist updated as we go |
| `projects/project-aion/reports/nexus-sync-supplant-r6-validation-2026-05-04.md` | R6 | Smoke-test results, integration verification |
| `Shared_Projects/Debriefs/AIFred-Pro/2026-05-04-nexus-sync-supplant-completion.md` | R7 | Milestone debrief for David |
| Updates to `.active-plan`, `session-state.md`, `Status/Archon/focus-areas.md` | R7 | State sync after milestone |

---

## Status

R3 joint review complete (2026-05-04). All 5 REQUIRES_DECISION items resolved.

**Adapt-absorb-replace mandate applied**: every Category B commit (8 commits touching shell scripts) has a paired python-port sub-commit. Final R5 stage rewires callers to python services and isolates shell scripts. Steady-state: shell scripts preserved with David's authorship for his code-review continuity, but disconnected from live execution paths.

**R5 effort revised to ~10-13 hours** — cannot complete in single session. Recommend 2-3 session chunks with checkpoint commits.

**Ready to begin R4 (baseline tag + working branch setup, ~10 min) on your go-signal.**
