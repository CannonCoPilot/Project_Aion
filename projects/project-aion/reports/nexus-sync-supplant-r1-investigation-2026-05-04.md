---
type: investigation
version: "1.0"
date: 2026-05-04
author: Jarvis
project: AIFred-Pro
workstream: nexus-sync supplant onto nate-dev
phase: R1
status: read-only investigation complete
---

# R1 — Pre-Supplant Investigation

Read-only investigation findings preceding R2 (per-commit classification). No branch state changes during R1.

---

## Executive Summary

The supplant is **larger than the comprehensive review estimated** but **structurally tractable**. Three load-bearing findings:

1. **Dashboard build is clean in nate-dev** (`aifred-dashboard:supplant-baseline` exported successfully). The `/personas` page is not a build defect; the page code (PersonasPage.tsx, 221 lines) and backend route (`dashboard/server/routes/personas.ts`, 42 lines) are well-structured. If `/personas` renders empty or errors, it's a runtime data-source issue (`services/personas.js`) — likely fixable inside R5/R6 without depending on nexus-sync.

2. **Pipeline-v2 architectural overlap is significant but not fatal.** Both `executor.sh` (65 KB shell) and `executor.py` (pipeline-v2 service) coexist in nate-dev. David's nexus-sync commits assume `executor.sh` is primary and add ~280 lines to it across multiple commits. Under the no-REJECT directive, these changes ADOPT into executor.sh and a follow-up (within the supplant scope) ports them to executor.py for parity.

3. **The Nexus rebrand has NOT landed in nate-dev.** `registry.yaml` still self-identifies as "AIfred Jobs — Headless Claude Job Registry"; `dispatcher.sh` header reads "Master headless scheduler... Part of the Headless Claude system." Commit `3ada792` (rebrand to Nexus) is sequencing-critical: it should land **early** in R5 to prevent every subsequent commit from refighting renames in conflict resolution.

**Estimated R5 duration revision**: 4–7 hours likely (was 3–6 originally), driven by `a450f61` (entire dashboard add, 252 files / 58k insertions) and `7bc1538` (151 files / 22k insertions). Most other commits are cleaner than expected.

---

## R0 Baseline (Confirmed)

| Check | Result |
|---|---|
| `nate-dev` working tree | **Clean** (no uncommitted changes) |
| `git fetch origin --prune --tags` | Silent — refs were current from prior fetch |
| `nate-dev` ↔ `origin/nate-dev` | **Parity** — no unpushed, no incoming |
| `origin/main` ↔ `nate-dev` | Parity at merge-base; nate-dev contains all of main |
| `nate-dev` HEAD | `e8ccf64` (style: routing-rules yamllint truthy) |
| Merge-base with nexus-sync | `dfd40c5` (post-sync cleanup, dated 2026-04-22) |
| Existing baseline branch | `pre-sync-safety-2026-04-23 → dfd40c5` (artifact of prior sync; reuse-name conflict for our `pre-supplant-baseline-2026-05-04` is avoided) |
| Dashboard build | **Exit 0** — `aifred-dashboard:supplant-baseline` image exported successfully |

R0 is fully closed.

---

## R1.A — `/personas` and `/board` UI Diagnosis

### `/personas` page

**Frontend** (`dashboard/frontend/src/pages/PersonasPage.tsx`, 221 lines): well-structured React component with list + detail panel layout, loading/error states, edit-prompt mutation. Imports from `../api/personas`.

**Frontend API hooks** (`dashboard/frontend/src/api/personas.ts`, 65 lines): three React Query hooks against three endpoints:
- `GET /api/personas` → `{ personas: PersonaSummary[] }`
- `GET /api/personas/:name` → `{ persona: PersonaDetail }`
- `PUT /api/personas/:name/prompt` → mutation

**Backend route** (`dashboard/server/routes/personas.ts`, 42 lines): clean Fastify routes that delegate to `../services/personas.js` (`listPersonas`, `getPersonaDetail`, `updatePersonaPrompt`). Input validation via `SAFE_NAME = /^[a-z0-9_-]+$/`.

**Verdict**: page architecture is sound. Dashboard build clears. If the user reports `/personas` as broken, the breakage is downstream of the route — most likely in `services/personas.js` (filesystem reads of persona files in the container) or persona file shape mismatch (e.g. a persona missing required YAML fields). This is fixable in R6 verification; it is **not a supplant gating concern**.

### `/board` page (KanbanPage.tsx)

Already has 3-mode toggle infrastructure:
```typescript
const [viewMode, setViewMode] = useState<ViewMode>('pipeline');  // line 95
viewMode === 'pipeline' | 'stage' | 'status'
```

Visible labels: "Pipeline" (line 395) + "Classic" (line 405). The third value `'stage'` is `LEGACY_STAGE_COLUMNS`-based and may not have a UI button (vestigial).

**Verdict**: adding a fourth viewMode `'pipeline-personas'` (per your reframing) is **structurally trivial** — append to the ViewMode union, add a third visible toggle button, define a `PIPELINE_PERSONAS_COLUMNS` constant or use a different rendering path. The scaffolding is there; this is post-supplant work in R8, not a supplant blocker.

### `/personas` and `/board` together

Neither is broken in a way that gates R5. Both are *enrichable* by content from nexus-sync (pipeline-v2 graph node fixes + comprehensive persona library + rebrand cosmetics) but neither requires supplant completion to render its current functionality.

---

## R1.B — Sample Commit Deep Reads

Six commits read in depth. Calibration findings below.

### `93f5320` — Phase 5.5 decision-rationale rollout (B1)

- **Files**: 7 changed, 428+/13− = 415 net additions
- **Touch surface**: `lib/common.sh` (4 lines, sources `decision-log.sh`); `executor.sh` (227 lines, `_parse_and_emit_persona_decisions` + 9 inline `log_decision` sites); `pipeline-watchdog.sh` (47 lines); `bin/pulsar-runner.sh` (32 lines, gate_fire decisions); 3 persona prompts (ai-reviewer +54, task-evaluator +33, task-investigator +44)
- **Conflict surface**: `executor.sh` is heavily modified by both David and (separately) by us. The 227 lines David adds are largely orthogonal to pipeline-v2 work (decision logging vs. live monitoring), but textual conflicts likely. Persona prompts in nate-dev currently lack the `decisions[]` array specification — David's additions are pure additions, no conflict expected.
- **Dependencies**: Requires `lib/decision-log.sh` (added in `54dda47` Phase 5.2). Phase 5.5 must land AFTER Phase 5.2 in R5.
- **Classification preview**: ADAPT for `executor.sh` (likely manual conflict resolution); ADOPT for the rest.

### `7bc1538` — Comprehensive Nexus sync (foundational)

- **Files**: 151 changed, 22720+/931− = 21789 net additions
- **Touch surface**: 18 libraries, 13 scripts, 14 hooks, 11 personas, 39 workflows, 4 registries, pulsars + pulsar-runner, 17 system docs (Loom, Nexus governance/security/notifications, Aurora). Includes new personas: orchestrator, cortex, content-writer, researcher-readonly, skill-experimenter, ai-reviewer (templatized from ai-david).
- **Conflict surface**: Mostly additive (.claude/context/systems/ docs are new). Hooks may conflict (we may have updated persona-guard, document-guard). Existing personas (ai-reviewer, infrastructure-deployer, librarian, project-manager) may have nate-dev modifications.
- **Risk**: Largest single commit by volume. Conflict resolution may take 30–60 min alone. But mostly additive, so most files land cleanly.
- **Classification preview**: ADAPT — large volume + likely 3–8 file-level conflicts on existing hooks/personas.

### `ea298c2` — Phase 5.3 audit-ingest (B2)

- **Files**: 2 NEW files, 676+/0− = pure addition
- **Touch surface**: `audit-ingest.py` (core logic — byte-offset tracking, batched INSERTs, 6 source transforms) + `audit-ingest.sh` (thin venv-aware wrapper)
- **Conflict surface**: NONE — both files are new; nate-dev does not have them.
- **Dependencies**: Requires Pulse Phase 5.1 schema (`pulse.audit_log`, `pulse.cost_events`, `pulse.decision_events` tables). These are NOT in our 21-commit set — they're in commits BELOW the merge-base or are assumed to be already in Pulse's database. **Verify in R6** that Pulse has these tables.
- **Classification preview**: ADOPT (clean cherry-pick).

### `3ada792` — Rebrand to Nexus

- **Files**: 64 changed, 126+/126− = pure rename
- **Touch surface**: 64 files including `lib/jobsdb.py → lib/nexusdb.py` (file rename); LOG_COMPONENT changes; log filename changes. Touches `executor.sh`, `dispatcher.sh`, `lib/common.sh`, all personas' methodology/prompt files (mechanical text replacement).
- **Conflict surface**: HIGH textual churn. If we've made any other edits to these files since merge-base, conflicts everywhere.
- **Strategic implication**: this commit MUST land first or near-first in R5. If it lands late, every commit before it fights renames in conflict resolution. If it lands early, subsequent commits work against the renamed files cleanly.
- **Classification preview**: ADAPT — high churn, but the change pattern is mechanical (replace "AIfred Jobs"/"Headless Claude Jobs" → "Nexus"). Once we resolve conflicts in our changed files, the rest is automatic.

### `a450f61` — Bundle Pulse Dashboard as Docker service

- **Files**: 252 changed, 58792+/0− = pure addition
- **Touch surface**: ENTIRE `dashboard/` directory including Dockerfile, docker-compose.yml, frontend (App.tsx, all api hooks, all pages), server, etc.
- **Conflict surface**: SHOULD be conflict-rich because we've been modifying dashboard extensively (TokenCompressionPage, ProjectCreator, ActivityTimeline, KanbanPage glow). However, since this commit is dated **April 9** (well before our merge-base April 22), one of two things must be true:
  - (a) The dashboard was added in main between April 9 and our branching, and `a450f61` adds an *earlier* version of the same files. In which case our supplant produces conflicts where each side has a different version.
  - (b) `a450f61` brought a fresh dashboard onto nexus-sync that wasn't in main at our branching point. We have a *different* dashboard in nate-dev (added separately).
- **Verification needed in R2**: `git show a450f61 -- dashboard/frontend/src/pages/KanbanPage.tsx | head -30` — see if it matches our current file or differs substantially.
- **Classification preview**: REQUIRES_DECISION — depends on whether nate-dev already has these files (in which case the commit may degenerate to no-op or conflict on every byte) or genuinely is missing them (in which case it's a clean lift). Initial guess: REQUIRES_DECISION leaning ADAPT.

### `40290c4` — Dashboard visualize conditional / loops / retry / output flow

- **Files**: 4 changed, 139+/4−
- **Touch surface**: `dashboard/frontend/src/api/orchestrations.ts`, `OrchestrationGraphView.tsx`, `OrchestrationTaskNode.tsx`, `pages/ProjectDetailPage.tsx`
- **Conflict surface**: We have `ProjectDetailPage.tsx` in nate-dev. Need to check whether OrchestrationGraphView/OrchestrationTaskNode exist in nate-dev — if not, this is partial new + partial modification.
- **Classification preview**: ADAPT — likely small surface, can resolve manually.

---

## R1.C — All-21 Conflict Zone Map

Categorized by load-bearing file class. Each category has different ADOPT/ADAPT/REQUIRES_DECISION default expectations.

### Category A: dashboard/ touches (5 commits — concentrate here for our work)

| SHA | Subject | Files | LOC change | Initial expectation |
|---|---|---|---|---|
| `a450f61` | Bundle Pulse Dashboard as Docker service | 252 | +58792 | REQUIRES_DECISION (whether dashboard is "added" or "replaced") |
| `40290c4` | Dashboard viz: conditional/loops/retry/output | 4 | +139/-4 | ADAPT (small surface) |
| `f5f98ea` | Dashboard: guard dangling edges + hasOutput badge | 2 | +4/-1 | ADOPT (depends on 40290c4) |
| `1e618ef` | Dashboard: remove dead has_retry badge | 4 | +1/-11 | ADOPT (depends on 40290c4) |
| `abee226` | (1 dashboard/PLAN.md among 6 files) | 6 | +436/-225 | ADAPT (mostly non-dashboard) |

### Category B: `.claude/jobs/executor.sh` and core libs (8 commits — pipeline-v2 conflict)

| SHA | Subject | Files | LOC change | Initial expectation |
|---|---|---|---|---|
| `0e6e1a2` | Remove hardcoded paths and secrets | 7 | +47/-41 | ADOPT (security hygiene) |
| `7c4db38` | Critical bug fixes — executor MODEL pin + watchdog | 2 | +89/-34 | ADAPT (executor.sh conflicts) |
| `3ada792` | **REBRAND** to Nexus | 64 | +126/-126 | ADAPT (high churn — sequence early in R5) |
| `54dda47` | Phase 5.2 — dual-write Nexus libs + thread_id | 5 | +601/-8 | ADAPT (adds new libs + modifies executor/dispatcher) |
| `4689195` | Phase 5.2 SC2155 fix | 2 | +4/-2 | ADOPT (small follow-up) |
| `93f5320` | **Phase 5.5 decision rationale (B1)** | 7 | +428/-13 | ADAPT (executor.sh + watchdog + 3 personas) |
| `613a71e` | Phase 5.5 shellcheck | 1 | +3/-2 | ADOPT (trivial) |
| `c4058bf` | Mirror Phase 5.0+5.8 from AIProjects | 8 | +59/-53 | ADAPT (multi-file, lib/runtime touches) |

### Category C: orthogonal new files (5 commits — clean ADOPT likely)

| SHA | Subject | Files | LOC change | Initial expectation |
|---|---|---|---|---|
| `ea298c2` | **Phase 5.3 audit-ingest (B2)** | 2 NEW | +676 | ADOPT |
| `0641bc3` | Phase 5.5 hardening (audit-ingest dedup + watchdog) | 2 | +12/-2 | ADOPT |
| `f933c72` | Phase 5.0 TZ discipline → msg-relay + telegram-callback | 2 | +2/-2 | ADOPT (trivial) |
| `7f80e16` | Bump VERSION to 4.0.0 | 1 | +1/-1 | ADOPT (after rebrand) |
| `ee9b155` | docs(readme): refresh project overview | 1 | +47/-18 | ADAPT (must reflect our actual state) |

### Category D: persona files (2 commits)

| SHA | Subject | Files | LOC change | Initial expectation |
|---|---|---|---|---|
| `b0d4ff8` | Flatten nested persona dirs from cp -r | 40 | +502/-2860 | ADAPT — net deletion (removes nested ai-reviewer/ai-david/, infrastructure-deployer/infrastructure-deployer/, etc.). Verify nate-dev doesn't already have these flattened |
| `7bc1538` | **Comprehensive Nexus sync** (libs/scripts/hooks/personas/workflows/docs) | 151 | +22720/-931 | ADAPT (large but mostly additive — hooks/personas conflicts likely) |

### Category E: bookkeeping (1 commit)

| SHA | Subject | Files | Initial expectation |
|---|---|---|---|
| `16ed6d5` | Complete executor.sh sync + missing workflows + docs | 20 | ADAPT (executor.sh churn + 17 new workflow + system docs files) |

### Sequence implication

The dependency chain dictates R5 ordering. Approximate ladder (chronological + dependency-aware):

1. `0e6e1a2` (security hygiene — earliest, foundation)
2. `7c4db38` (executor bug fixes)
3. `3ada792` (rebrand — MUST land before further code edits)
4. `a450f61` (dashboard bundle — earliest dashboard reference state)
5. `7bc1538` (comprehensive Nexus sync — foundational identity)
6. `7f80e16` (VERSION bump after Nexus identity established)
7. `b0d4ff8` (cleanup nested directories)
8. `16ed6d5` (executor.sh + workflows + docs)
9. `abee226` (sync gaps cleanup)
10. `54dda47` (Phase 5.2 — adds decision-log.sh, audit-log.sh, cost-log.sh)
11. `4689195` (Phase 5.2 SC2155 fix)
12. `ea298c2` (Phase 5.3 audit-ingest — depends on Phase 5.2 libs)
13. `93f5320` (Phase 5.5 decision rationale — depends on Phase 5.2 libs)
14. `613a71e` (Phase 5.5 shellcheck)
15. `0641bc3` (Phase 5.5 hardening)
16. `c4058bf` (mirror Phase 5.0+5.8)
17. `f933c72` (Phase 5.0 TZ discipline follow-up)
18. `40290c4` (dashboard viz)
19. `f5f98ea` (dashboard viz fixes — depends on 40290c4)
20. `1e618ef` (dashboard viz cleanup — depends on 40290c4)
21. `ee9b155` (README refresh — last)

---

## Critical Architectural Questions Surfaced for R3

1. **`executor.sh` deprecation in pipeline-v2**: We have BOTH `executor.sh` (65 KB) and `executor.py` (in services/). David's commits add ~280 lines to `executor.sh` across multiple commits. Three handling options:
   - (a) ADOPT into executor.sh, port to executor.py as a follow-up commit within the supplant
   - (b) ADOPT into executor.sh as-is and document the divergence (executor.sh keeps decision logging; executor.py runs without it)
   - (c) ADAPT directly into executor.py and skip executor.sh (creates divergence with David's authorship)
   - **Recommend (a)** — preserves authorship + keeps both paths working; follow-up port is bounded work

2. **`a450f61` dashboard bundle**: Need to verify whether nate-dev's `dashboard/` directory existed before merge-base (and `a450f61` provides upgrades) OR was added separately on each branch (and we have entirely different code). Verification: spot-check 3 files via `git show a450f61 -- dashboard/frontend/src/App.tsx | diff - dashboard/frontend/src/App.tsx`. **Plan to do this in R2.**

3. **Nexus rebrand timing**: `3ada792` should land at R5 step 3 (early). Confirm acceptable. If we move it later, every subsequent commit has additional rename conflicts.

4. **`7bc1538` adds new personas (orchestrator, cortex, content-writer, researcher-readonly, skill-experimenter)**: do these belong in our pipeline-personas vs task-personas taxonomy? The orchestrator is a strong candidate for *pipeline persona* per your reframing. R3 conversation point.

5. **`ee9b155` README refresh**: David's README describes the nexus-sync state. We need to either ADAPT it to describe nate-dev's actual state (which now includes BOTH our pipeline-v2 work AND the lifted nexus-sync content) or restructure. Likely a write-from-scratch in R5 informed by both inputs.

6. **`b0d4ff8` flattens nested persona directories** (e.g. `ai-reviewer/ai-david/` → `ai-reviewer/`). nate-dev has `personas/ai-reviewer/` already as a flat directory. The commit may be a no-op or may try to delete files that don't exist. **Spot-check in R2** whether nate-dev still has nested ones.

---

## Sizing Estimate Revision

| Phase | R1 estimate | Revision |
|---|---|---|
| R1 | 30–45 min | Took ~25 min — slightly under |
| R2 | 60–90 min | **75–105 min** — additional verification reads needed (a450f61 spot-checks, b0d4ff8 nested-dir state, hooks conflicts) |
| R3 | 30–90 min | **45–75 min** — at least 6 REQUIRES_DECISION items expected (per "Critical Architectural Questions" above) |
| R4 | 10 min | Unchanged |
| R5 | 3–6 hours | **4–7 hours** — driven by `a450f61` (252 files) and `7bc1538` (151 files) |
| R6 | 75–120 min | Unchanged |
| R7 | 45 min | Unchanged |
| **Total** | 6–12 hr | **~8–14 hr** likely |

R0–R3 still fits in this session (~3 hours total). R4–R7 is a second session of similar duration to slightly longer.

---

## Recommendations for R2

1. **Add verification reads** before classifying: `git show a450f61 -- dashboard/Dockerfile`, `git show 3ada792 -- .claude/jobs/dispatcher.sh`, `git show 54dda47 -- .claude/jobs/lib/decision-log.sh` (since this is a new file). These ground classifications in actual diff content rather than commit-message inference.
2. **For each Category B commit**, capture the executor.sh adaptation strategy explicitly — it will be the most-repeated pattern in R5.
3. **Flag the four "ADAPT or worse" expected commits** (`a450f61`, `7bc1538`, `3ada792`, `54dda47`) for extra detail in R2 — they will dominate R5's time.
4. **Document the sequencing constraint** (rebrand early; Phase 5.x in dependency order) in R2 plan, so R5 has it built-in.

---

## What R1 explicitly did NOT do

- No branch state changes (no commits, tags, branches, pushes).
- No reads of David's persona content (e.g. orchestrator/cortex prompts) — those are R5/R6 detail-level work.
- No verification of Pulse PostgreSQL schema (Phase 5.1 tables) — needed for `ea298c2` to function; R6 verification.
- No exhaustive read of the 30 nate-dev commits' content; relied on commit messages + file-list grep.

---

*R1 complete. Proceeding to R2 — per-commit classification with adaptation strategies.*
