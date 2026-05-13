---
title: Project Aion — Final Phases Plan-of-Record (toward Project_Archon)
date: 2026-05-12
status: ACTIVE — Phase 0 baseline-shift in flight
project: Jarvis + Alfred-Dev (CannonCoPilot remotes only)
authoritative_for: Phases 0–5 sequencing through Project_Archon migration
audience: Sir, future-Jarvis
supersedes_priority_for:
  - aifred-pro-dev-dashboard-recleavage.md (re-cleave PR #3 superseded as gate; merge happens via CannonCoPilot push, not PR review)
  - aifred-pro-dev-reo-page.md (Validate work absorbed into Phase 4 dashboard sweep)
  - aifred-pro-dev-pipeline-watcher-watchdog.md (W2/W3 absorbed into Phase 4)
related:
  - ../designs/project-aion-workstream-architecture-2026-05-05.md (v1.6 — phase model lives here as design backbone)
  - ../reports/phase-2-cod-stage-2-data-report-2026-05-12.md (Stage-verdict gating closure)
---

# Project Aion — Final Phases Plan-of-Record

## 1. Vision

Project Aion now executes a 5-phase final-stretch toward a **Project_Archon migration**: the merge of Jarvis (Master Archon) and Alfred (Operations Archon) into a single repository at `CannonCoPilot/Project_Archon`. Phases 0–4 complete the in-flight feature work documented in `project-aion-workstream-architecture-2026-05-05.md` v1.6 §6 (the workstream-arch); Phase 5 executes the migration. Post-migration, a new roadmap begins on the unified repo.

## 2. Process directives (Sir's 2026-05-12 ratifications)

These directives override prior process conventions:

- **CannonCoPilot is the sole canonical remote.** Push to `CannonCoPilot/Alfred:main` directly for Alfred-Dev work; push to `CannonCoPilot/Jarvis:main` directly for Jarvis work. `davidmoneil/AIFred-Pro` is no longer treated as an upstream gate. PR #3 on davidmoneil/AIFred-Pro is left orphaned-but-open per Q3 Read A.
- **No Stage Verdict gating.** Reports from data-as-is replace formal pre-registered verdicts. Incomplete/insufficient experimental investigation is pushed to the tail-end of the relevant workstream. Phase 2 CoD Stage-2 closure was the first execution of this directive — see `../reports/phase-2-cod-stage-2-data-report-2026-05-12.md`.
- **Surfaced risks are overridden by Sir.** Examples: sparse dev observability for dual-write 30-day clock; PR-#3 outreach trigger window; Phase D held-local-by-B2. All de-gated.
- **Short thematic branches.** Each phase opens a `feature/<short-thematic-name>` branch. Branches rebase off the prior phase's branch tip (linear dependency chain). PRs may accumulate in this dependency order without blocking forward progress.
- **Commit minimalism.** Commits per phase kept to the minimum number organized into code-related themes (one commit per logical change, not per file or per session).
- **Sir-review gate at end of #4 dashboard sweep.** Before Phase 5 (Project_Archon migration) starts, Sir reviews the cumulative state of Phases 0–4.

## 3. Phase sequence

### Phase 0 — Baseline shift to CannonCoPilot-sole (in flight)

**Status**: PARTIAL — Stage-verdict closure done; CoD UPS-hook disabled; planning-doc updates this commit; CannonCoPilot push pending.

**Deliverables**:
- ✓ Phase 2 CoD Stage-2 data-as-is report (`../reports/phase-2-cod-stage-2-data-report-2026-05-12.md`)
- ✓ CoD UPS hook removed from `.claude/settings.json`; hook source preserved as deployed-but-disabled artifact
- ✓ pre-registration-phase-2-cod.yaml flipped to `STAGE_2_NO_DATA`; closed_at = 2026-05-12
- ✓ This plan-of-record + workstream-arch v1.6 + active-plan + session-state updates
- ⧖ Push nate-dev (110 commits + Phase D 3 local commits) → `CannonCoPilot/Alfred:main`
- ⧖ Push Jarvis Project_Aion → `CannonCoPilot/Jarvis:main`

**Exit criteria**: both CannonCoPilot remotes carry HEAD that includes all of nate-dev + Phase D + Phase 0 doc updates. nate-dev branch on Alfred-Dev fast-forwarded to match.

### Phase 1 — /personas page rebuild (priority #1; `feature/personas-rebuild`)

**Status**: NOT STARTED — branch creation pending Phase 0 push completion.

**Scope (research+design stage entry-gate)**:
- Audit current `/personas` page implementation + persona registry (30 personas per dashboard foundational analysis §1)
- Map: persona prompt → config → model assignment → scheduled-task connections → Nexus-component connections → tool-use audit-log relationships
- Surface 5-bucket grouping (reviewer-cluster, executor-cluster, diagnose-cluster, planner-cluster, plus catch-all) per workstream-arch §7.2
- Design: interactive nav, domain/tool/model viz, persona-edit UI surface
- F-2 boundary repair: expose Pulse persona-listing endpoint so dashboard doesn't read persona YAMLs from disk

**Build scope (post-design ratification)**:
- Pulse `/api/v1/personas` endpoint (CRUD-light: list, get-by-id) — Pulse-side schema as needed
- Dashboard `/api/personas` proxy refactor to consume Pulse API
- Frontend `/personas` page rebuild — interactive nav + 5-bucket grouping + per-persona drill drawer + edit affordance
- Cross-link wiring: persona row → scheduled jobs page filter; persona row → recent decisions; persona row → audit-log tool-use sampler

**Effort estimate**: ~3-5d (design ~1d, build ~2-4d). AC-03 gate at design-stage exit + build-stage exit.

**Files anticipated**:
- `Alfred-Dev/pulse/app.py` — personas endpoint (~80 LOC)
- `Alfred-Dev/dashboard/server/routes/personas.ts` — refactor to Pulse-proxy (~30 LOC)
- `Alfred-Dev/dashboard/frontend/src/pages/PersonasPage.tsx` — rebuild (~400 LOC)
- `Alfred-Dev/dashboard/frontend/src/components/personas/PersonaDrawer.tsx` — NEW drill drawer (~200 LOC)

**Cross-references**: dashboard foundational analysis §5 (DIRECTING mode), workstream-arch §7.2.

### Phase 2 — Token Compression for JICM + Token Compression dashboard (priority #2; `feature/token-compression-jicm-dashboard`)

**Status**: NOT STARTED — branches off Phase 1 tip.

**Scope (two components)**:

**2A — Token Compression for JICM context compression** (per `token-compression-roadmap.md` Phase 3):
- NLP preprocessing of long-form context before JICM hands off to compressor model
- Signal notation for structured machine-readable context elements
- Tail-end resumption of Phase 2 CoD work with automatic task-type detection replacing prefix-tag opt-in (the gating fix surfaced by the 2026-05-12 data report)

**2B — Token Compression dashboard surface** (per `token-compression-roadmap.md` Phase 5):
- Existing `/token-compression` route audit + rebuild
- Surface compression stats (cache hit rate, token volume by stream, JICM cycle history)
- Cross-link to Phase 1 personas page (persona-specific compression metrics)

**Effort estimate**: ~3-4d (2A ~1-2d, 2B ~1-2d).

**Cross-references**: `../reports/token-compression-roadmap.md`, `../reports/token-compression-implementation-guide.md`, `../designs/cod-injection-architecture.md`.

### Phase 3 — JICM portability (priority #3; two sub-phases)

**3A — `feature/jicm-v8-pty-backend`** (PTY untether, ~6-8d):
- Decouple JICM from iTerm2 + tmux + window-0
- PTY substrate abstraction with backend interface
- Cross-OS smoke tests
- Per `../designs/jicm-portable-architecture.md` v8.0 scope

**3B — `feature/jicm-v8-web-backend`** (web + native Alfred CC integration, ~5-7d, branches off 3A):
- Web backend implementation on top of PTY substrate
- JICM + Watcher + Watcher-HUD wrapping into native Alfred CC sessions
- Task-management work integration (Pulse-aware JICM cycle hooks)
- Per workstream-arch §1.3 candidate ports (JICM → Loom; HUD → Dashboard widget; Aion Quartet → dashboard panes)

**Effort estimate**: ~11-15d combined across 3A + 3B.

**Cross-references**: `../designs/jicm-portable-architecture.md`, `../plans/jicm-implementation-plan-v7-9-to-v8.md`, `../plans/jicm-v8-validation-runbook.md`, `../designs/jicm-roadmap-v7-9-to-v8.md`.

### Phase 4 — Page-by-page dashboard tweaks + wiring fixes (priority #4; `feature/dashboard-tweaks-I-II-III`)

**Per Sir's 2026-05-12 ratification**: I → II → III sequence, **minimum touches every single dashboard page**.

**4-I — Audit-only sweep (~1d)**:
- Visit every page in the 35-page dashboard inventory
- File a finding list per page (broken affordances, half-wired buttons, mismatched copy, missing empty-states, missing loading-skeletons, dead deep-links)
- Output: `Jarvis/projects/project-aion/reports/dashboard-tweaks-audit-2026-05-XX.md`

**4-II — Operations Center top-bar + per-page header consistency (~5-7d)**:
- Implement the long-term vision from dashboard foundational analysis §9.2: top-bar showing active profile + dispatcher heartbeat + $ burn rate + open approvals + last 5 critical events
- Per-page consistent header: page title, mode badge (DOING/DIRECTING/REFLECTING/DIAGNOSING), "as of" timestamp, refresh control, "what is this for?" tooltip
- AC-03 gate at boundary 4-II / 4-III

**4-III — Per-page wiring fixes (~8-12d, depends on 4-I findings)**:
- Close every finding from 4-I
- Includes Watchdog W2 (external launchd liveness probe) + W3 (`/health` panel expansion) — absorbed here since `/health` is one of the 35 pages
- Includes REO Validate UX walkthrough — `/reo` is in the DIAGNOSE → Reflect cluster after re-cleave M1 shipped; Phase 4-III is the natural slot for the walkthrough
- Includes F-1 approval-gate enforcement + F-5 silent-mutation audit (both touch `services/executor.py` claim path) — surface in dashboard wiring as part of /pipeline + /tasks?board=approvals validation
- Includes REO Harden H1-H8 (additional decision-emitter wiring; feedback connector backend with parallel-write JSONL; learned-patterns.yaml templates for 5 new personas)
- AC-03 gate at end of 4-III

**Effort estimate**: ~14-20d total across 4-I + 4-II + 4-III.

**Sir-review gate at end of Phase 4**. Before Phase 5 begins.

### Phase 5 — Project_Archon migration (priority #5; exit-gate for the trajectory)

**Status**: SCOPE DEFERRED — decomposed at end-of-Phase-4 Sir-review gate.

**Vision (per Sir's 2026-05-12 directive)**:
- Merge Jarvis (Master Archon) and Alfred (Operations Archon) into single repo at `CannonCoPilot/Project_Archon`
- Wrap Claude Code Alfred and Jarvis CLI sessions within their own dashboard pages (depends on Phase 3B web backend)
- Conclusion = fully-ready codebase for migrating Alfred/Jarvis to `Project_Archon` and picking up with a new roadmap

**Decomposition factors (to be resolved at Phase-4-end review)**:
- Directory restructure: monorepo layout vs subdirs vs git subtree
- History merge strategy: subtree merge, clean import, or graft
- CLAUDE.md unification: single CLAUDE.md vs project-scoped overrides
- Pulse/Nexus boundary preservation: how Pulse + dashboard live in the unified repo
- Session-wrapping dashboard pages: dependency on Phase 3B web backend's substrate abstraction

### Priority #6 — Certifications-research repo exploration

`Projects/certifications-research-2026-05/REPORT-REPOS.md` and `REPORT-CATEGORY-A.md`. Deferred to post-Project_Archon-migration roadmap unless something surfaces during Phase 4 that pulls it forward.

## 4. Branch and rebase model

```
main (CannonCoPilot/Alfred + CannonCoPilot/Jarvis)
 │
 ├─ Phase 0 commits (planning-doc updates + CoD disable) → push direct to main
 │
 ├─ feature/personas-rebuild (Phase 1)
 │   └─ rebases off main; opens PR when build-stage complete
 │
 ├─ feature/token-compression-jicm-dashboard (Phase 2)
 │   └─ rebases off feature/personas-rebuild tip (whether merged or not)
 │
 ├─ feature/jicm-v8-pty-backend (Phase 3A)
 │   └─ rebases off feature/token-compression-jicm-dashboard tip
 │
 ├─ feature/jicm-v8-web-backend (Phase 3B)
 │   └─ rebases off feature/jicm-v8-pty-backend tip
 │
 ├─ feature/dashboard-tweaks-I-II-III (Phase 4)
 │   └─ rebases off feature/jicm-v8-web-backend tip
 │   └─ Sir-review gate at completion
 │
 └─ feature/project-archon-migration (Phase 5)
     └─ scope decomposed at Sir-review gate; branches per sub-phase
```

PRs may accumulate without blocking; each opens against main on the appropriate CannonCoPilot remote. Merge-conflict resolution happens at PR-assembly time, not at rebase time.

## 5. AC-03 milestone-review gating (per CLAUDE.md AC-03)

Each phase has internal AC-03 gates at sub-milestone boundaries:

- Phase 1: design-stage exit + build-stage exit
- Phase 2: 2A exit + 2B exit
- Phase 3A: PTY substrate validation + cross-OS smoke pass
- Phase 3B: web backend + native CC integration
- Phase 4: 4-I exit + 4-II/4-III boundary + 4-III exit (Sir-review gate)
- Phase 5: per sub-phase as decomposed

AC-03 ratings: technical (1-5) + progress (1-5); proceed criterion ≥4 on both. PROCEED → next milestone; REMEDIATE → fix-and-re-gate.

## 6. Stage-verdict gating closure (codified)

This plan-of-record formally retires the Two-Stage Validation Gating pattern as a workflow gate for in-flight workstreams. The pattern itself remains in `.claude/context/patterns/two-stage-validation-gating.md` as a recoverable methodology — Sir may reactivate it for future work if pre-registration discipline becomes useful again. For Phases 0-5, all "Stage-N verdict" entries in `active-plan` and `workstream-arch §6.3` are closed; tail-end experimental investigation is queued within each relevant phase (notably Phase 2 for CoD and broader compression work).

## 7. Status / next action

**Status**: Phase 0 IN FLIGHT 2026-05-12. CoD UPS-hook removed; pre-reg closed; Stage-2 data report filed; this plan + active-plan + workstream-arch v1.6 + session-state updates in flight; CannonCoPilot pushes pending.

**Next**:
1. Finish Phase 0 doc updates (active-plan + session-state + workstream-arch v1.6).
2. Single Jarvis commit + push to `CannonCoPilot/Jarvis:main` (planning-doc updates).
3. Single Alfred-Dev push of nate-dev → `CannonCoPilot/Alfred:main` (110 commits + Phase D 3 local commits, no rebase needed — fast-forward).
4. Open `feature/personas-rebuild` branch off CannonCoPilot/Alfred:main (post-push).
5. Begin Phase 1 research + design — `/personas` rebuild scope investigation.

---

*Project Aion Final Phases Plan-of-Record v1.0 — 2026-05-12 — supersedes prior Bucket A/B/C ordering as the authoritative phase model through Project_Archon migration.*
