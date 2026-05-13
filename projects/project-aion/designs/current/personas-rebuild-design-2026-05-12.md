---
title: /personas Page Rebuild — Phase 1 Design (Project Aion)
date: 2026-05-13
version: 5.0 (concept-first rewrite; Core/Add-on split; primitives-derived)
status: DESIGN — Sir granted full execution autonomy 2026-05-13; design-gate unlocked; Jarvis self-judges
project: Alfred-Dev
target_branch: feature/personas-rebuild
priority: Project Aion Phase 1 (Sir's #1 priority)
master_plan: ../../plans/project-aion-final-phases-2026-05-12.md
related:
  - ../../reports/personas-rebuild-viz-audit-2026-05-12.md (8-repo viz audit; consumed by §5 Add-on surfaces)
  - ../project-aion-workstream-architecture-2026-05-05.md §7.2
  - ../../reports/aifred-pro-dev-dashboard-foundational-analysis-2026-05-07.md §5 + §11
audience: future-Jarvis (build-stage execution; self-review surface)
---

# /personas Page Rebuild — Phase 1 Design (v5)

## 0. How to read this document

The document follows the Concept → Purpose → UI Visuals → Code/Plumbing arc:

| Section | Concern | Authority |
|---|---|---|
| §1 Conceptual primitives | What objects exist; how they relate | Foundation — everything downstream derives from this |
| §2 Page purpose | What user/system tasks the page serves | Justifies why the primitives need a surface |
| §3 Tier model | The Group-1/Group-2 lock that gates everything | Locked by Sir 2026-05-12; revisit only at late-stage dev |
| §4 Core surfaces | Elegant, primitives-derived UI (must be production-grade) | Must ship at quality bar in §7.1 |
| §5 Add-on surfaces | PoC mockups for ideation (best-guess wiring; revision later) | Must ship at PoC quality bar in §7.2 |
| §6 Code and plumbing | Endpoints, schema, services that realize §4 + §5 | Implementation surface |
| §7 Acceptance criteria | Quality bars + deep-link convention | Self-review gate |
| §8 Build-stage gates | Phases 1.0–1.4 with effort estimates | Execution plan |
| §9 Audit ground truth | Pipeline-binding / orphan / MCP / registry facts | Preserved verbatim from v4; revision deferred per Sir Q5 |
| §10 Risk register | Known risks + mitigations | |
| §11 Out of scope | Explicit deferrals | |
| §12 Future-work stubs | Optimization candidates for post-Phase-1 | |
| Appendix A | Version history (v1 → v5) | |

The Core / Add-on split is the central architectural commitment of this design (Sir 2026-05-13: "there is a core that must be elegant, sophisticated, visually appealing and conceptually grounded and then also a slew of add-ons that must demonstrate proof-of-concept functionality for the user to be able to explore and ideate next-stage evolutions"). Core surfaces are derived from primitives and must be ratification-grade. Add-on surfaces are PoC sandboxes for user exploration — wired fast, accepted with rough edges, refined later if usage data justifies.

---

## 1. Conceptual primitives

The `/personas` page is a catalog of ten primitive objects and the relations among them. Every UI surface and every backend endpoint in this design derives from these primitives. If a feature does not trace back to a primitive, it does not belong in Core (§4).

### 1.1 The ten primitives

| # | Primitive | Definition | Source-of-truth | Mutation rules |
|---|---|---|---|---|
| 1 | **Persona** | Registered system actor: id, prompt, model, methodology, permissions, tier, cluster | Filesystem YAMLs (`personas/<name>/{config,permissions,methodology,prompt.md}`) + DB metadata (`pulse.persona_metadata`) | Tier-gated; Tier A/B filesystem-only; Tier C/D UI-editable with confirmation |
| 2 | **Tier** | Locking grade A / B / C / D governing edit + routing semantics | DB `persona_metadata.tier` | Admin only; transitions D↔C allowed via UI; A↔B↔others filesystem-only |
| 3 | **Group** | Coarse axis: Group 1 (Tier A+B = internal-reserved) vs Group 2 (Tier C+D = free-for-use) | Derived from Tier; not stored | Cannot be mutated independently of Tier |
| 4 | **Cluster** | Thematic axis cross-cutting Group 2: Engineering / Quality / Research / Creative / Planner | DB `persona_metadata.cluster` | Tier D editable; Tier C admin only; Group 1 personas grouped under "Internal Reserved" not by cluster |
| 5 | **Tool** | Invokable capability: Skill / MCP / Command / Built-in. Sourced from Alfred + Jarvis workspaces + plugins | Filesystem catalogs + plugins manifests; DB `tool_catalog` ingests on-demand | Ingestion-derived; not user-mutable |
| 6 | **Permission** | Persona × Tool binding: allowed / denied / admin-only / unassigned | Filesystem `permissions.yaml`; DB `persona_tool_assignments` mirrors | Tier-gated; Tier D editable with confirmation gate + diff preview + audit emission |
| 7 | **Claim** | Runtime MCP allocation made by a persona during task execution (on-demand loading) | DB `mcp_claims` (transient) | Created by Pulse `POST /mcp/claim`; released by `DELETE /mcp/claim/{id}` |
| 8 | **Job-binding** | Scheduled task that "owns" a persona via `registry.yaml` | Filesystem `registry.yaml` (Alfred-Dev) | Admin only; surfaces as orthogonal badge, not a tier boundary |
| 9 | **Observation** | Task-runtime telemetry: stuck / infinite / runaway-cost / loop / permission-violation | DB `task_observation` | Emitted by observation tunnel daemon; not user-mutable |
| 10 | **Activity record** | Frozen execution snapshot: prompt + permissions + config at job-fire time | DB `persona_activity_snapshots` | Append-only; immutable history (Octopoda-OS pattern) |

### 1.2 Relations among primitives

Five relations carry semantic weight:

- **Persona × Tool → Permission** (§4.3 Matrix renders this directly)
- **Persona × Persona → MentionsInPrompt** (cross-reference graph; rendered in §4.4 Graph)
- **Persona × Job-binding → ScheduledOwnership** (badge annotation in §4.1 List)
- **Persona × Claim → ActiveMCPs** (transient runtime relation; surfaced in §4.2 Detail Activity tab)
- **Persona × Activity-record → ExecutionHistory** (timeline of frozen snapshots; renders in §4.2 Activity sub-tab)

### 1.3 Two derived axioms

These follow from the primitives + relations; they govern UI affordance design throughout §4 and §5.

**Axiom A — Tier-gating is substrate-enforced, not UI-policed**:
The DB `pulse.persona_metadata.tier` field gates every write endpoint server-side. UI affordances reflect tier (hide / disable / require-confirmation), but the substrate refuses tier-violating mutations regardless of UI state. This is what makes Group 1 / Group 2 locking *mechanically enforced* rather than self-policed.

**Axiom B — Core surfaces show primitives directly; Add-on surfaces show derived narratives**:
A Core surface renders a primitive (Persona = List, Permission = Matrix, primitive-graph = Graph). An Add-on surface renders a *narrative built from primitives* (pipeline flow, village wandering, time-series heatmap). This division justifies the quality-bar split: primitives are ground truth and must render correctly; narratives are interpretive and can ship as PoC.

---

## 2. Page purpose

The `/personas` page aggregates three user concerns into one surface:

| Concern | Primitives involved | User task |
|---|---|---|
| **Persona registry** | Persona, Tier, Group, Cluster | Find, identify, configure, version, soft-delete |
| **Tool catalog** | Tool, Permission, Claim | See what's available, assign tools, audit unmapped tools, monitor on-demand MCP claims |
| **Observability** | Observation, Activity-record | Watch live state, replay history, investigate stuck/infinite/runaway events |

The page is the **canonical deep-link source** for any persona reference anywhere in the dashboard. Routes such as `/reo?actor=<persona>`, `/tasks?persona=<persona>`, or `/findings?persona=<persona>` always link back to `/personas/<name>` for the actor's full context. This is what answers Sir's scrutiny point #1 ("What makes the /personas page a 'deep-links' source?"): the page is the only surface where the complete primitive set for a persona is rendered.

The page enforces **Group 1 / Group 2 locking** (Axiom A above). Group 1 personas (Tier A + B, 6 personas total) are internal machinery — invokable only by their owning code component. Group 2 personas (Tier C + D, 26 personas total) are free for user routing, editing, and task-ticket assignment.

The page does **not** attempt to be a generic admin console, an audit explorer (that's `/reo`), or a job scheduler (that's `/jobs`). It is the catalog. Cross-page deep-links handle workflows that span surfaces.

---

## 3. 4-tier persona model (LOCKED per Sir 2026-05-12)

This section preserves v4 §3 verbatim. Sir's directive (Q1 2026-05-13): "Keep, lock. Tier concepts will only be revisited at a late-stage development arc." Treat the four-tier model as ground truth for the duration of Phase 1.

### 3.1 Two-axis classification

**Axis 1: TIER** (editable / not, routable / not):
- Tier A — Pipeline-locked (Group 1, internal machinery)
- Tier B — System-locked (Group 1, internal machinery)
- Tier C — Job-specific recurring non-internal (Group 2, free)
- Tier D — General-use (Group 2, free)

**Axis 2: CLUSTER** (thematic affinity, cross-cuts Group 2 only):
- Engineering / Quality / Research / Creative / Planner
- Cluster assignment is presentational + filtering; doesn't gate editing/routing.

**Job-assigned BADGE** (orthogonal to both axes):
- Per-persona annotation indicating "this persona is bound to ≥1 active scheduled job"
- Surfaces as a visual badge on the persona card; doesn't define a cluster or tier boundary.

### 3.2 Tier A — Pipeline-locked (4 personas; Group 1)

Strict interpretation per Sir 2026-05-12: "exclusively meant for use by such internal mechanics".

| Persona | Active binding | Role |
|---|---|---|
| `autofix-executor` | `services/evaluate.py:204` default suggested-persona | Auto-fix execution within pipeline-v2 |
| `task-investigator` | `services/team-runner.py:746` default | Team-internal task investigation |
| `team-verdict` | `services/team-runner.py:268` default | Team-vote consensus aggregation |
| `pipeline-reviewer` | Phase 1 creates `services/pipeline_reviewer.py` service stub; current binding is `pipeline-review` scheduled job | Pipeline health analysis (will become internal service) |

**Locking semantics**: UI fully read-only (prompt, config, permissions, methodology). Cannot be routed by task pipelines. Cannot be called by user one-offs / SDK / ad-hoc prompts. Cannot be assigned to new scheduled jobs. Cannot be deleted. Maintainer override: filesystem + git commit + `pulse.persona_metadata.unlocked_until` admin field.

### 3.3 Tier B — System-locked (2 personas; Group 1)

| Persona | Active binding | Role |
|---|---|---|
| `cortex` | AC-06 self-evolution + AC-08 maintenance workflows | Meta-learning advisor |
| `context-maintainer` | Currently `context-maintenance` scheduled job; Phase 1+ integrates with JICM (Sir's directive: "JICM is going to take the context-maintainer for itself") | Evaluator Brief maintenance → JICM context ops |

**Locking semantics**: Same as Tier A — UI fully read-only; not routable; not callable. Subsystem owner (Alfred core / JICM) updates via filesystem + commit.

**Future Tier B candidates** (tracked in §12 future-work; not in scope for Phase 1):
- `jicm-compressor` (Phase 3A/B)
- `token-budget-advisor` (Phase 2)
- `aion-orchestrator` (Aion-Quartet coordinator)
- `archon-migration-orchestrator` (Phase 5)
- `ops-center-coordinator` (Phase 4)

### 3.4 Tier C — Job-specific recurring non-internal (1 persona; Group 2)

Per Sir 2026-05-12 strict definition: "personas custom-made ONLY for recurring/scheduled jobs that are not part of internal ops".

| Persona | Bound job | Role |
|---|---|---|
| `librarian` | (historical AudioBooks-library job; currently dormant; persona retained for future) | AudioBooks/Plex-style domain-specific recurring job |

**Locking semantics**:
- Prompt + methodology EDITABLE (version-tracked)
- Config EDITABLE (model preference, output spec)
- Permissions VIEW-ONLY in UI (filesystem + commit)
- Cannot be deleted while job-binding active
- AVAILABLE for ad-hoc task routing if task domain matches persona's expertise

### 3.5 Tier D — General-use (25 personas; Group 2)

Investigator demoted from Tier A candidate list; all capability-routed personas, creative pipeline, research, engineering, quality, and orphaned-in-pipeline personas land here.

| Cluster | Personas |
|---|---|
| **Engineering** | content-writer, infrastructure-deployer, test-writer, backend-eng, db-eng, ux-eng |
| **Quality** | test-reviewer, test-researcher, security-reviewer, bug-fixer, troubleshooter, ai-reviewer |
| **Research** | analyst, researcher, researcher-readonly, skill-experimenter, investigator |
| **Creative** | creative-action, aurora-feedback (renamed from creative-feedback per G14), creative-thinker, creative-builder, creative-presenter |
| **Planner** | orchestrator, project-manager, task-evaluator |

Total: 6 + 6 + 5 + 5 + 3 = 25 ✓

**Locking semantics**:
- FULLY EDITABLE (prompt, config, permissions with confirmation gate, methodology)
- Routable to any task
- Available for new scheduled job assignment
- Soft-deletable with 30d retention
- CRUD-able (new personas land here via wizard)

### 3.6 Job-assigned badge (orthogonal annotation)

Active scheduled-job-bound personas as of 2026-05-12:
- `investigator` (4 jobs: health-summary, persona-health-check, doc-sync-check, weekly-digest)
- `context-maintainer` (1 job: context-maintenance) — Tier B, integrates with JICM Phase 1+
- `pipeline-reviewer` (1 job: pipeline-review) — Tier A, becomes service stub
- `creative-thinker` (1 job: creative-think) — Tier D
- `creative-builder` (1 job: creative-build) — Tier D
- `creative-presenter` (1 job: creative-present) — Tier D

Badge surfaces as a calendar icon + count on the persona card. Click → jumps to `/jobs?persona=<name>`.

### 3.7 Tier transition rules

| From → To | Allowed? | Mechanism |
|---|---|---|
| D → C | YES | Admin promotes when binding to new scheduled job with strict "custom for this job" intent |
| C → D | YES (after job removal) | Admin demotes when job permanently disabled |
| D → A or B | NO (filesystem only) | Requires code change in `services/*.py` |
| A or B → D | NO (filesystem only) | Requires removing all internal references |

---

## 4. Core surfaces (production-grade, primitives-derived)

Five surfaces. Each renders a primitive directly. Each must ship at the quality bar in §7.1.

### 4.1 List view — Persona Catalog (default tab)

**Concept**: enumerate the Persona primitive; group by Group → Tier → Cluster; render a sortable, filterable sidebar.

**Purpose**: first-stop for any persona-related user task. Identify a persona by tier-affinity, cluster, status, or job-binding; click into detail.

**UI visuals**:

```
┌─ /personas ─────────────────────────────────────────────────────────────┐
│ Header: "Personas (32)"  [Filter: tier|cluster|tool|status]  [Search]   │
│ Top tabs: [List] [Matrix] [Graph] [+New] | [Flow] [Village] [Timeline]  │
│           [Mission Control] [Heatmap] [PC Box]                          │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─ Sidebar ──────────────┐ ┌─ Detail Panel (4.2) ─────────────────────┐ │
│ │ ▼ Internal Reserved    │ │  (renders when persona selected)         │ │
│ │   ▼ Tier A — Locked (4)│ │                                          │ │
│ │     🔒 autofix-executor│ │                                          │ │
│ │     🔒 task-investigat │ │                                          │ │
│ │     🔒 team-verdict    │ │                                          │ │
│ │     🔒 pipeline-review │ │                                          │ │
│ │   ▼ Tier B — System (2)│ │                                          │ │
│ │     🔒 cortex          │ │                                          │ │
│ │     🔒 context-maintai │ │                                          │ │
│ │ ▼ Free-for-use         │ │                                          │ │
│ │   ▼ Tier C — Job (1)   │ │                                          │ │
│ │     🔧 librarian       │ │                                          │ │
│ │   ▼ Tier D (25)        │ │                                          │ │
│ │     ▼ Engineering (6)  │ │                                          │ │
│ │       ✏ backend-eng    │ │                                          │ │
│ │       ✏ content-writer │ │                                          │ │
│ │       ...              │ │                                          │ │
│ │     ▶ Quality (6)      │ │                                          │ │
│ │     ▶ Research (5)     │ │                                          │ │
│ │     ▶ Creative (5)     │ │                                          │ │
│ │     ▶ Planner (3)      │ │                                          │ │
│ └────────────────────────┘ └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

**Card anatomy** (audit-grounded; sources from `personas-rebuild-viz-audit-2026-05-12.md`):
- 4px left border = cluster color (agent-teams-ai TeamListView pattern)
- Top-right: tier badge (🔒 A/B / 🔧 C / ✏ D)
- Mid: persona-mascot sprite (CSS `steps()` from openpets pattern) — animated state from `data-reaction-state` attr
- Bottom: status pill (6-state palette: emerald=running / sky=starting / amber=waiting / rose=degraded / zinc=stopped / muted=unknown) + relative timestamp ("45s ago")
- Job-assigned badge (calendar icon + count) if applicable
- Pulsing dot for active state (Tailwind `animate-pulse`)

Selecting a card opens the per-persona detail panel (§4.2). Cluster color map is the cross-cutting design-system anchor (netclaw category-map pattern): reviewer=amber, executor=blue, planner=violet, diagnose=red, creative=emerald, meta=slate.

**Code**: GET `/api/v1/personas` returns the catalog with tier/cluster/status/job-bindings. WebSocket subscription updates status pills live.

### 4.2 Per-persona Detail Panel (8 sub-tabs)

**Concept**: expand the Persona primitive into its constituent aspects; each sub-tab surfaces a distinct primitive or relation.

**Purpose**: deep-dive on a single persona. Each sub-tab answers one user question.

**UI visuals**: Right-side panel triggered by clicking any persona node in any top-level view.

| # | Sub-tab | Primitive surfaced | User question |
|---|---|---|---|
| 1 | **Overview** | Persona identity | "Who is this persona?" |
| 2 | **Config** | engine + model + fallback + output spec + session settings | "How is it configured?" |
| 3 | **Permissions** | Persona × Tool relation | "What can it use?" |
| 4 | **Methodology** | methodology.yaml (process, success criteria, common failure modes) | "How does it work?" |
| 5 | **Prompt** | persona prompt + version history + diff + token-compression placeholder toggles | "What is it told to do?" |
| 6 | **Activity** | Activity-record stream (Octopoda-OS frozen-snapshot pattern) | "What has it done?" |
| 7 | **Relationships** | Persona × {Tool, Job, Persona} sub-graph (local neighborhood) | "What is it connected to?" |
| 8 | **Tool-attention** | ranked tool-use with token-cost weighting (file-attention pattern from agent-flow) | "What does it use most?" |

**Sub-tab specifics**:

1. **Overview**: top strip (name, persona-id, tier, cluster, model, status, running pill, deprecation pill); identity section (description, methodology summary); deprecation controls (Tier D only — soft-delete + 30d restore); connected scheduled jobs inline with deep-link to `/jobs?persona=<name>`.

2. **Config**: engine, model, fallback, output.format, output.save_to, session.persist, schema_version. **No `max_turns` / `max_budget_usd` / `timeout_minutes`** — these hard-coded limits are removed system-wide (see §6.5 Observation tunnel; resolves Sir scrutiny #4). Edit affordance tier-gated per §6.8.

3. **Permissions**: tier-gated edit (read-only for A/B/C; editable for D with confirmation gate + diff preview + audit emission). Tool list grouped by family (Built-in / MCP / Command / Skill). Each row shows source workspace (Alfred / Jarvis / plugin).

4. **Methodology**: rendered `methodology.yaml` sections. Conditional render; "Create stub" affordance for Tier C/D when absent.

5. **Prompt**: version selector dropdown + diff view + active-version toggle + syntax-color-coded body (pipeline service / pulse artifact / tool / MCP / persona / prose). Token-compression placeholder toggles (Caveman / Rocky / CoD / Brief / custom) — *visual polish only, no estimator wired in Phase 1*; state saved to DB for Phase 2 consumption. Char-count + cross-references panel (which other prompts mention this persona).

6. **Activity**: Octopoda-OS audit-row pattern — each row carries `timestamp + event_type + outcome + frozen snapshot of {prompt + permissions + config at fire-time} + tokens (input/output/total)`. Token-first reporting (dollars deferred to Phase 4). Filter by event-type, date-range. Click row → expand to view frozen snapshot. Embedded mini-timeline at top (agent-flow pattern).

7. **Relationships**: local sub-graph view of this persona's neighborhood — tools assigned, jobs bound, personas mentioned in prompt, personas mentioning this one. Smaller-scale Canvas+d3-force render than the top-level Graph tab (§4.4); reuses the same renderer with a filtered node set.

8. **Tool-attention**: file-attention pattern from agent-flow — ranked heat-colored progress bars showing which tools this persona uses most, with token-cost weighting. Identifies high-cost tools for cost-optimization.

**Code**:
- GET `/api/v1/personas/{name}` returns full detail (all sub-tab data joined)
- GET `/api/v1/personas/{name}/activity` returns Activity-record stream
- GET `/api/v1/personas/{name}/prompt-versions` returns version history
- PUT endpoints per sub-tab for editable fields (tier-gated)

### 4.3 Matrix view — Persona × Tool

**Concept**: direct rendering of the Permission primitive. Rows = 32 personas; columns = ~150 tools (Skills + MCPs + Commands + Built-ins). Cells = permission state.

**Purpose**: assignment management (Sir scrutiny #3: "visual representation of Persona-Tool assignment and domains"); orphan detection (tools with no persona access surface in the UNASSIGNED row).

**UI visuals**:

```
                  ┌─Built-in─┐ ┌──MCP──┐ ┌─Command─┐ ┌──Skill──┐
                  R W E B G T  rag grph pls /jicm   git filesystem ...
backend-eng       ✓ ✓ ✓ ✓ ✓ -  ✓   -    -   ✓       ✓   ✓
db-eng            ✓ ✓ ✓ ✓ ✓ -  -   -    ✓   ✓       ✓   ✓
test-writer       ✓ ✓ ✓ ✓ ✓ -  -   -    -   ✓       -   -
...
[UNASSIGNED]      - - - - - -  -   ✓    -   -       -   ✓    ← orphans
```

**Features**:
- Group rows by tier or cluster (toggle)
- UNASSIGNED row surfaces orphaned tools (no persona has access)
- Bulk operations for Tier D rows (multi-select + grant/revoke)
- Click cell → diff-preview confirmation + audit emission on save
- Export CSV / JSON

**Code**:
- GET `/api/v1/tool-catalog` returns the full tool inventory across all sources
- GET `/api/v1/persona-tool-matrix` returns the joined view
- POST `/api/v1/personas/{name}/tools/{tool_id}` assigns
- DELETE `/api/v1/personas/{name}/tools/{tool_id}` revokes

### 4.4 Graph view — Persona Topology (PRIMARY DIFFERENTIATOR)

**Concept**: primitives + relations as nodes/edges; force-directed layout. The Graph is the highest-information-density Core surface — every primitive and every relation is visible at once.

**Purpose**: spatial pattern recognition; orphan identification (disconnected nodes); cluster cohesion visualization; one-glance "what's the persona system look like right now" answer.

**UI visuals**:
- **Nodes**: 32 Persona (color by cluster) + ~150 Tool (color by source: Skill=blue / MCP=teal / Command=orange / Built-in=gray) + ~6 active Job (yellow) + Domain group anchors (faint, structural)
- **Edges**: Persona→Tool (Permission allowed); Persona→Tool denied (red dashed); Persona→Job (binding); Persona→Persona (prompt mentions)
- **Render mechanics**: ref-synced rAF loop (simulation data in ref; React state updates independently — no re-render thrash); bloom-glow on nodes; intensity ∝ recent activity (agent-flow `bloom-renderer.ts`); edge decay `opacity = Math.max(0.2, lastInvokedDecay)`, `animated = decay > 0.5` (agent-mission-control pattern); holographic shader-like styling (CSS analog of netclaw's shader: box-shadow + background pattern)
- **Interactions**: hover → highlight neighborhood; click node → open detail panel; drag → rearrange (saved as user-pref layout); filter → hide by tier / cluster / source

**Tech stack**: Custom Canvas 2D + d3-force v3 + bloom renderer (audit Wave 3 agent-flow pattern). NOT Cytoscape.js — the audit found that Canvas + d3-force scales better past 100 nodes and offers richer visual effects.

**Code**:
- GET `/api/v1/persona-graph` returns nodes + edges in a force-graph-ready payload
- Layout persistence: user-pref `grid_x/grid_y` saved per user (deferred to Phase 1.4 if scope tight)

### 4.5 +New tab — CRUD wizard (Tier D only)

**Concept**: instantiate a new Persona primitive.

**Purpose**: user-friendly persona creation without filesystem manipulation. Always lands at Tier D; promotion to C requires admin + job-binding.

**UI visuals**: 8-step wizard
1. Identity (name kebab-case, description, thematic cluster)
2. Base template (clone existing persona or `_template/` scaffold)
3. Engine + model
4. Tool assignments (drag from catalog; tier-derived defaults)
5. Permissions tier (research / builder / executor / creative / analyst — NOT admin)
6. Prompt (paste/type with live token-count)
7. Methodology (optional)
8. Review + create

**Code**:
- POST `/api/v1/personas` with full payload
- On submit: Pulse creates `persona_metadata` row (`tier=D`, `status=active`, `owner=<user>`), writes YAMLs to filesystem, surfaces in sidebar immediately
- ✏ "uncommitted edits" indicator until commit-from-UI button used

### 4.6 Cross-cutting design system (Core)

Applied uniformly across §4.1–4.5:

| Element | Spec | Source repo |
|---|---|---|
| Cluster colors | reviewer=amber, executor=blue, planner=violet, diagnose=red, creative=emerald, meta=slate | netclaw category map |
| Status palette | emerald-500 (running), sky-500 (starting), amber-500 (waiting), rose-500 (degraded), zinc-400 (stopped), muted-zinc (unknown) | agent-teams-ai LiveRuntimeStatusSection |
| Tier indicators | 🔒 A/B (lock), 🔧 C (wrench), ✏ D (pencil) | Convention |
| Left border | 4px cluster color on every card | agent-teams-ai TeamListView |
| Running indicator | Tailwind `animate-pulse` dot | agent-teams-ai |
| Sprite animation | CSS `steps()` with `data-reaction-state` + `data-motion-state` attrs | openpets |
| Glass-morphism cards | systematic glass aesthetic for panels | agent-flow |

---

## 5. Add-on surfaces (PoC quality; user-ideation sandboxes)

Per Sir 2026-05-13: "mock up all of the other ideas and wire them fast with best-guess approaches first, revision later". These six surfaces ship at the PoC quality bar in §7.2 — functional enough for user exploration and ideation, not polished. The user evaluates which add-ons earn promotion to Core (in a future refinement pass) and which get cut.

Each add-on follows the same template: **Concept** → **Purpose** → **PoC bar** → **Deferred-polish list** → **Source repo**.

### 5.1 Flow view — Pipeline Swim-lane

**Concept**: visualize pipeline-v2 stages + creative-pipeline + scheduled-jobs as a flow diagram with personas attached to stages they participate in.

**Purpose**: answer "where in the pipeline does each persona run?" at a glance. Surfaces decision branches (capability routing, fallbacks, retries).

**PoC bar**:
- 5 pipeline-v2 stages render as swim-lane columns: `Pulse event → score → evaluate → executor → reviewer → close`
- Personas appear as draggable nodes on the stages they participate in
- Click-select dispatch via `node.data.type` works (netclaw pattern)
- Side-arm: creative-pipeline (think → build → present) as separate swim-lane
- Job-arm: scheduled-jobs surfaced with their persona bindings

**Deferred-polish**: animations, advanced filters, branch-collapse, multi-pipeline overlay.

**Tech**: ReactFlow (audit Wave 1+3 finding: lighter than Reaflow; matches agent-mission-control's `CommunicationGraph`).

### 5.2 Village view — Pokemon-village Paradigm

**Concept**: pixel-art tile map where persona sprites move around themed zones via BFS pathfinding (pokegents `TownView.tsx` pattern faithful).

**Purpose**: ambient awareness viz; persona-as-character anthropomorphization for cognitive grip; visual delight that demos system liveness.

**PoC bar**:
- 544×480px DOM-rendered grid with 32 persona sprites
- Cluster zones = themed rooms (Engineering Workshop, QA Lab, Research Library, Creative Studio, Planner Office, Internal Reserved Quarter)
- BFS pathfinding works; sprites don't overlap walls (`#` tiles)
- Active scheduled-job personas: path-find toward busy zones at 30ms/step transit speed
- Idle personas: wander locally at 225ms/step amble speed; 850-1400ms cooldown pauses
- 8 weighted-random animation variants (hop, bump, shake, wiggle, nod, jump, lean) — anti-repetition
- Pokéball deploy animation when persona spawns (CRUD create)

**Deferred-polish**: speech-bubble integration with Pulse event stream; richer zone aesthetics; persona-mascot art uniqueness; 60fps optimization beyond 32 sprites.

**Tech**: pure CSS keyframes + plain TS BFS + string-mask grid. No canvas, no Phaser, no Framer Motion. Zero dependency animation engine.

### 5.3 Timeline view — Canvas Gantt

**Concept**: time-axis activity stream per persona; events render as colored blocks in horizontal rows.

**Purpose**: see "what happened when" across all personas at once; orthogonal complement to per-persona Activity sub-tab (§4.2 #6).

**PoC bar**:
- Canvas Gantt swimlane (agent-flow `timeline-panel.tsx` pattern)
- Each row = one persona
- Time axis (horizontal): static 1h window (multi-window selector deferred)
- Blocks = events: decisions / audit-log / costs / errors / job-runs (color-coded)
- Static playhead at `currentTime` (scrubbing deferred)
- Click block → open Activity sub-tab on detail panel filtered to that event

**Deferred-polish**: scrubbable playhead with time-travel state reconstruction; multi-window selector (6h / 24h / 7d); event clustering at high zoom-out.

**Tech**: Canvas Gantt (audit Wave 3 agent-flow pattern).

### 5.4 Mission Control view

**Concept**: Octopoda-OS + agent-mission-control mash-up — a live dashboard of system health.

**Purpose**: ops-room glance view; surfaces what's running, what's alerting, what just happened.

**PoC bar**:
- KPI bar (top): live counters — "32 personas / N decisions today / M loops caught / X audits emitted / Active running: K" (WebSocket-fed)
- Agent cards grid (per-persona tiles with state) — reuses §4.1 List card anatomy
- Event ticker (right sidebar): real-time Pulse event feed (audit_log + decision_events + cost_events streamed via Socket.io)
- Alert stream: observation-tunnel interventions with severity color (rose for critical / amber for warning)

**Deferred-polish**: replay scrubber (scrub to a past time → state reconstructs from snapshot index); customizable layouts; sound alerts; full-screen mode.

**Tech**: existing dashboard components + Socket.io subscription.

### 5.5 Heatmap view

**Concept**: D3 v7 analytics visualizations (Claude-Code-Agent-Monitor audit pattern).

**Purpose**: cross-persona pattern detection (when does the system run hottest? which tools are over-used? which persona dominates token consumption?).

**PoC bar**:
- Calendar-heatmap (days × hours; cell color = activity intensity) — tool-use time-of-day
- Time-series line chart — per-persona input/output token streams
- Ranked bar chart — tool-frequency by invocation
- Sankey diagram — tool-call flow (node width ∝ call count)

All four visualizations render with static color schemes; no interaction beyond hover.

**Deferred-polish**: drill-down on heatmap cells; brush-zoom on time-series; configurable bar-chart sort orders; Sankey filtering.

**Tech**: D3.js v7 (audit Wave 1 finding).

### 5.6 PC Box view (lowest priority; defer-safe)

**Concept**: pokegents PC storage metaphor — roster grid of all personas including soft-deleted (30d retention window).

**Purpose**: archive surface; "where did I park my deprecated personas?"

**PoC bar**:
- Grid renders (8 cols × N rows)
- Each cell = persona mascot sprite + name + tier badge
- Click opens detail panel
- Soft-deleted personas appear with reduced opacity

**Deferred-polish**: animated transfer-out (move-back-to-active animation); sort/filter controls; bulk operations.

**Tech**: same sprite engine as §5.2 Village.

### 5.7 Add-on surface meta

These six surfaces total ~5-7d of Phase 1.3 effort (§8.4). The user evaluates after Phase 1.4 ships which to promote, refine, or cut. None is load-bearing — Phase 1 can ship with Core surfaces (§4) alone and the page still satisfies its purpose (§2).

---

## 6. Code and plumbing

### 6.1 Pulse endpoint set (18 endpoints; Core vs Add-on tagged)

| Method | Path | Purpose | Core/Add-on |
|---|---|---|---|
| GET | `/api/v1/personas` | List with metadata | **Core** (§4.1) |
| GET | `/api/v1/personas/{name}` | Full detail | **Core** (§4.2) |
| GET | `/api/v1/personas/running` | Live-state set | **Core** (§4.1) |
| GET | `/api/v1/personas/{name}/activity` | Token-first decisions + audit + costs | **Core** (§4.2 #6) |
| PUT | `/api/v1/personas/{name}/prompt` | Save as new version | **Core** (§4.2 #5) |
| PUT | `/api/v1/personas/{name}/config` | Update config.yaml (tier-gated) | **Core** (§4.2 #2) |
| PUT | `/api/v1/personas/{name}/methodology` | Update methodology.yaml | **Core** (§4.2 #4) |
| PUT | `/api/v1/personas/{name}/permissions` | Update permissions.yaml (Tier D + confirmation) | **Core** (§4.2 #3) |
| PUT | `/api/v1/personas/{name}/metadata` | Update DB metadata (tier-gated) | **Core** |
| GET | `/api/v1/personas/{name}/prompt-versions` | History | **Core** (§4.2 #5) |
| POST | `/api/v1/personas/{name}/prompt-versions/{vid}/restore` | Set active | **Core** |
| POST | `/api/v1/personas` | Create new (Tier D) | **Core** (§4.5) |
| DELETE | `/api/v1/personas/{name}` | Soft-delete (Tier D) | **Core** |
| GET | `/api/v1/tool-catalog` | Inventory across all sources | **Core** (§4.3) |
| GET | `/api/v1/persona-tool-matrix` | Joined view | **Core** (§4.3) |
| POST | `/api/v1/personas/{name}/tools/{tool_id}` | Assign tool | **Core** (§4.3) |
| DELETE | `/api/v1/personas/{name}/tools/{tool_id}` | Revoke tool | **Core** (§4.3) |
| GET | `/api/v1/persona-graph` | Graph nodes + edges | **Core** (§4.4) |
| GET | `/api/v1/persona-flow` | Flow diagram stages + bindings | Add-on (§5.1) |
| GET | `/api/v1/persona-village/layout` | Village tile grid + sprite positions | Add-on (§5.2) |
| GET | `/api/v1/persona-timeline` | Canvas Gantt event stream | Add-on (§5.3) |
| GET | `/api/v1/persona-heatmap` | Pre-aggregated heatmap + trends + Sankey | Add-on (§5.5) |
| POST | `/api/v1/mcp/claim` | On-demand MCP claim | **Core** (§6.4) |
| DELETE | `/api/v1/mcp/claim/{claim_id}` | Release MCP claim | **Core** (§6.4) |
| WebSocket | `/api/v1/socket` | Real-time push for all state changes | **Core** (§6.7) |

Phase 1.1 ships all 18 endpoints. Add-on endpoints can return placeholder/aggregated data initially; full data binding lands in Phase 1.3.

### 6.2 DB schema (9 tables)

| Table | Purpose | Core/Add-on |
|---|---|---|
| `persona_metadata` | Tier, cluster, status, owner, tags, schema_version | **Core** |
| `persona_prompt_versions` | Prompt history per persona | **Core** |
| `tool_catalog` | Ingested tool inventory | **Core** |
| `persona_tool_assignments` | Permission relation mirror | **Core** |
| `task_observation` | Observation-tunnel events | **Core** (§6.5) |
| `mcp_claims` | On-demand MCP claim tracking | **Core** (§6.4) |
| `persona_activity_snapshots` | Frozen execution snapshots (Octopoda-OS pattern) | **Core** (§4.2 #6) |
| `persona_village_layout` | User-pref draggable positions | Add-on (§5.2) |
| `persona_pref_graph_layout` | User-pref Graph node positions | **Core** (§4.4; deferable to 1.4) |

Phase 1.1 ships all 9 tables in a single migration. Standard conventions: `BIGSERIAL PRIMARY KEY`, `TIMESTAMPTZ DEFAULT now()` audit fields, `JSONB` for snapshot/evidence payloads, FK to `persona_metadata.name` where applicable. Per-table column details derivable from the purpose summary above; the migration file is the authoritative schema source.

### 6.3 Tool catalog ingestion

Ingestion sources:
- Alfred + Jarvis: `skills/`, `commands/`, `.mcp.json`
- Plugins: `~/.claude/plugins/installed_plugins.json` + `marketplaces/*/external_plugins/*/.mcp.json`
- Built-ins: hard-coded inventory (Read, Write, Edit, Bash, Grep, Glob, Task, TodoWrite, WebFetch, WebSearch, NotebookEdit, ListMcpResourcesTool, ReadMcpResourceTool, ...)

Ingestion runs:
1. On Phase 1.1 backend startup (full scan)
2. Filesystem watcher (inotify-equivalent on macOS via `fswatch` or polling) for `.mcp.json` and `installed_plugins.json` changes
3. Manual `/api/v1/tool-catalog/refresh` for force-rescan

Tool catalog records: `id`, `name`, `family` (Skill / MCP / Command / Built-in), `source_workspace` (Alfred / Jarvis / plugin), `source_path`, `domain` (semantic tag for permission routing), `description`.

### 6.4 MCP on-demand claim API

**The architectural shift** (per Sir scrutiny #3 + #5): MCPs are NOT loaded by default at session start. Each persona's `permissions.yaml` declares `allowed_mcps[]` AND `domain_permissions[]` (e.g. `["search", "memory", "rag"]`). When a task invokes a persona:

1. Pulse looks up the persona's allowed domains
2. Pulse `POST /mcp/claim` spawns the required MCP server(s) for that task's domains, returns connection params to the task runner
3. Task runner uses those params to connect to the MCP
4. On task completion, `DELETE /mcp/claim/{claim_id}` decrements ref count; Pulse tears down MCP server if no other tasks claim it

**Benefits**:
- Session startup is fast (no MCP loading)
- Only relevant MCPs spin up per task
- MCP claim audit-log surfaces in /personas Activity tab
- Concurrent claims handled via DB-level row-lock + ref-count

**Race conditions**: two tasks claiming same MCP simultaneously — Pulse claim API uses row-lock; second claim either piggybacks (ref-count++) or queues if MCP spawn is in-progress.

### 6.5 Observation tunnel (replaces hard-coded execution limits)

Per Sir scrutiny #4 ("we don't need to set things like max turns or max dollars. Instead… introduce an observation layer/tunnel into any task as it runs to watch for 'stuck' or infinite jobs"):

`max_turns`, `max_budget_usd`, `timeout_minutes` are REMOVED from every persona `config.yaml`. Schema-version v1→v2 migration archives legacy values to `pulse.persona_metadata.legacy_limits` JSONB for one release cycle, then drops the field.

**Replacement: observation tunnel** — a pipeline service (new) or expansion of existing `pipeline-watcher`:

| Behavior | Implementation |
|---|---|
| **Stuck** | Watches `audit_log` for thread_id silence > N min (N adaptive per task class via rolling p95) |
| **Infinite** | Watches turn count vs rolling p95×2 |
| **Runaway cost** | Watches cumulative cost_events for thread_id vs rolling p95×3 |
| **Loop** | Detects identical Bash command repeated 5+ times within window |
| **Permission violation** | Catches tool call attempted against persona's denied_tools[] |

**Interventions** (configurable per task class):
- Soft: warning audit_log + Telegram alert
- Medium: pause task (SIGSTOP) + queue for human review
- Hard: terminate (SIGTERM/SIGKILL) + audit + cleanup

Adaptive baselines computed from the same `pulse` tables that record audit/decision/cost rows — no separate telemetry pipeline needed.

### 6.6 Pipeline-reviewer service stub

Phase 1.1 creates `Alfred-Dev/.claude/jobs/services/pipeline_reviewer.py` (minimal stub) that:
- Subscribes to Pulse events (e.g. `pipeline.health.degraded`)
- Loads `pipeline-reviewer` persona spec (model, prompt) from filesystem
- Invokes Claude Code headless with persona context
- Emits decision_events with `actor="persona:pipeline-reviewer"`
- Replaces the current `pipeline-review` scheduled job in `registry.yaml`

Phase 1.1 ships the stub + minimal subscription; full implementation is a Phase 2 follow-on. The stub establishes the architectural pattern — service-driven invocation of Tier A personas — without requiring complete logic.

### 6.7 Real-time architecture (Socket.io)

Per audit Wave 3 (Claude-Code-Agent-Monitor pattern):

- Pulse Python backend exposes `/socket` endpoint
- Dashboard Node Express server proxies WebSocket connection
- React client subscribes via Socket.io client
- Channels: `persona-state`, `task-state`, `decision_events`, `audit_log`, `cost_events`, `observation-tunnel`, `mcp-claims`
- Zero polling for any real-time data

Reconnection logic uses battle-tested `socket.io-client` retry policy (exponential backoff + jitter).

### 6.8 Edit gating + schema versioning

**Edit gating matrix** (Axiom A — substrate-enforced):

| Tier | Prompt | Config | Permissions | Methodology | Metadata |
|---|---|---|---|---|---|
| A | UI read-only | UI read-only | UI read-only | UI read-only | UI read-only |
| B | UI read-only | UI read-only | UI read-only | UI read-only | UI read-only |
| C | UI edit (version-tracked) | UI edit (subset) | UI read-only (filesystem) | UI edit | UI edit (tags) |
| D | UI edit (version-tracked) | UI edit (all) | UI edit (confirm gate + diff + audit) | UI edit | UI edit |

Every PUT/POST endpoint checks `persona_metadata.tier` server-side and refuses tier-violating writes with HTTP 403. UI affordances mirror this matrix.

**Schema versioning**: `schema_version: N` on every persona YAML. Phase 1.1 introduces v1→v2 migration:
- Removes execution limits (`max_turns`, `max_budget_usd`, `timeout_minutes`)
- Adds `schema_version: 2`
- Legacy values archived to `pulse.persona_metadata.legacy_limits` JSONB
- After 30 days observation-tunnel-only operation, `legacy_limits` field dropped

**Working-tree state**: ✏ "uncommitted edits" indicator (30s `git status` cache). "Commit edits" button (Tier D + admin Tier C) — opens commit-message modal, runs `git add` + `git commit` from dashboard backend on behalf of user.

---

## 7. Acceptance criteria

Design-gate is UNLOCKED per Sir 2026-05-13. Jarvis self-judges against the quality bars below; no external ratification gate. Implementation builds against this spec; deviations are tracked in commit messages and rolled into v6 if accumulated.

### 7.1 Core quality bar (production-grade)

Every Core surface (§4.1–4.5) must meet ALL of:

1. **Primitives faithfully rendered** — every primitive in §1 that the surface declares to show is actually rendered with correct data
2. **Edit gating mechanically enforced** — Tier A/B writes refused server-side; UI affordances tier-conditional
3. **Live state via WebSocket** — no polling for state changes
4. **Deep-link URL convention works** (§7.3) — every URL pattern resolves correctly
5. **32 personas + ~150 tools + ~6 jobs** all visible
6. **Soft-delete + 30d restore** works for Tier D
7. **Performance**: List + Matrix + Detail Panel render at 60fps with full dataset; Graph renders at ≥30fps with all nodes
8. **AC-03 review** at Phase 1.2 + Phase 1.4 boundaries: technical ≥4 / progress ≥4

### 7.2 Add-on quality bar (PoC functional)

Every Add-on surface (§5.1–5.6) must meet ALL of:

1. **Renders without errors** with full dataset
2. **Primary interaction works** (click, hover) as specified in per-surface PoC bar
3. **Data binds from backend** (real, not mocked)
4. **Acceptable performance under nominal load** — not optimized, but not unusably slow
5. **Polish-pass items captured** in per-surface deferred-polish list

Add-on surfaces are explicitly NOT required to:
- Match Core surface visual polish
- Handle every edge case
- Pass accessibility audit
- Match Core surface performance bar

### 7.3 Deep-link URL convention

| URL pattern | Meaning |
|---|---|
| `/personas/:name` | Canonical persona detail; opens default sub-tab (Overview) |
| `/personas?tier=<tier>` | Filter by tier |
| `/personas?cluster=<cluster>` | Filter by cluster (Group 2 only) |
| `/personas?view=<list\|matrix\|graph\|flow\|village\|timeline\|mission-control\|heatmap\|pc-box>` | Switch top-level tab |
| `/personas/:name?tab=<tab>` | Open specific sub-tab |
| `/personas/:name?version=<id>` | Open prompt version |
| Cross-page `?persona=<name>` | Filter that page to one persona |
| Cross-page `?focus=<id>` | Highlight without filtering |

Every other dashboard page (`/reo`, `/tasks`, `/jobs`, `/findings`, etc.) deep-links INTO `/personas/<name>` whenever an actor/persona is referenced. This is what makes /personas the canonical deep-link source (Sir scrutiny #1).

---

## 8. Build-stage gates (sub-phased)

### 8.1 Phase 1.0 — Pre-build cleanup (~0.5d)

State at 2026-05-13:
- ✅ DONE locally (uncommitted): `Alfred-Dev/.claude/jobs/registry.yaml` — 3 disabled task-* entries removed
- ⏳ TODO: G14 filesystem rename `creative-feedback/` → `aurora-feedback/`
- ⏳ TODO: G15 close-read `test-researcher/` → repair config or remove directory
- ⏳ TODO: single Alfred-Dev commit on `feature/personas-rebuild` branch covering all three

Commit author convention: CannonCoPilot per MEMORY.md gotcha. Branch is local-only; push deferred until Phase 1.1 backend foundation also lands.

### 8.2 Phase 1.1 — Backend foundation (~5-6d)

Deliverables:
- DB migration: 9 tables (§6.2) + indexes (single migration file)
- 18 Pulse endpoints (§6.1) with ruamel.yaml round-trip for filesystem writes
- Tool catalog ingestion (§6.3) — full scan + filesystem watcher + manual-refresh endpoint
- MCP on-demand claim API (§6.4) — claim/release endpoints + row-lock + ref-count
- Schema v1→v2 migration script (§6.8) — `legacy_limits` archive
- Observation tunnel core (§6.5) — stuck/infinite/runaway detectors + 3-tier interventions
- Pipeline-reviewer service stub (§6.6)
- WebSocket `/socket` endpoint (§6.7) — all channels online
- Dashboard service refactor (F-2 from boundary audit: `pulse-events.ts` consumes Pulse READ endpoints instead of direct pg.Pool)

**Gate**:
- `curl` smoke all 18 endpoints
- Round-trip YAML write tests pass
- Socket.io push validated end-to-end
- Tier-gating returns HTTP 403 for Tier A/B writes
- Baseline `/personas` page still renders against old data (no client work yet)

### 8.3 Phase 1.2 — Core frontend (~6-8d)

Deliverables (all from §4):
- PersonasPage rebuild: List view sidebar (4-tier sections + cluster sub-groups + Job-assigned badges)
- 8 per-persona detail sub-tabs (Overview / Config / Permissions / Methodology / Prompt / Activity / Relationships / Tool-attention)
- Matrix view (Persona × Tool with UNASSIGNED row)
- Graph view (Canvas 2D + d3-force + bloom renderer)
- +New tab (CRUD wizard, 8 steps)
- Deep-link URL convention wired
- Token-first Activity rendering with Octopoda-OS frozen-snapshot pattern
- Prompt syntax color-coding
- Token-compression placeholder toggles (visual only)
- Soft-delete + restore controls
- Edit gating per tier (substrate + UI)
- CSS `steps()` sprite-sheet animation engine
- 6-state status palette + cluster color map enforced everywhere
- Socket.io client subscribed; live state updates

**Gate**:
- All 32 personas render correctly per tier
- Live state surfaces (status pills update via WebSocket)
- Tier A/B controls visibly read-only; PUT attempts return HTTP 403 from server
- Tier D edits work end-to-end (write → commit-from-UI → DB + filesystem updated)
- Graph view renders ≥30fps with 188 nodes (32 persona + 150 tool + 6 job)
- AC-03 review: technical ≥4 / progress ≥4

### 8.4 Phase 1.3 — Add-on PoC surfaces (~5-7d)

Deliverables (all from §5, PoC quality bar):
- Flow view (ReactFlow swim-lane)
- Village view (pokegents pattern: BFS pathfinding + dual-speed wandering)
- Timeline view (Canvas Gantt with static 1h window)
- Mission Control view (KPI bar + agent cards + event ticker + alert stream)
- Heatmap view (calendar-heatmap + line + bar + Sankey)
- PC Box view (lowest priority; defer-safe)

Add-ons can be parallelized — e.g., Village + Timeline can be developed concurrently since they share no state.

**Gate**:
- Each add-on surface renders without errors against full dataset
- Primary interaction works per per-surface PoC bar
- 60fps wandering in Village view (or 30fps acceptable fallback)
- Deferred-polish items recorded per surface

### 8.5 Phase 1.4 — Polish + CRUD finalization + AC-03 (~3-4d)

Deliverables:
- +New tab (CRUD wizard) end-to-end (if not finished in 1.2)
- Prompt version history + diff view + restore
- Bulk export (CSV / JSON) for Matrix view
- Commit-from-UI button (filesystem commit via dashboard backend)
- Visual-validate: 3 personas per tier exercised end-to-end (12 personas total)
- Performance check: catalog with 200+ tools renders smoothly
- AC-03 final gate: technical review + project-manager review

**Gate**: AC-03 PASS (technical ≥4 / progress ≥4) → Phase 1 complete; pushes to CannonCoPilot/Alfred:main.

---

## 9. Audit ground truth (PRESERVED from v4 §2; revision deferred per Sir Q5)

Per Sir 2026-05-13 Q5: "Keep audit ground truth. Audit revision will occur only after substantial PoC and MVP near-prod systems have been finished off." The following six sub-sections are factual findings from the 2026-05-12 audits. Phase 1 builds against these as ground truth.

### 9.1 Pipeline-component active-vs-deprecated audit

| Component | Status | Personas it ACTIVELY binds |
|---|---|---|
| `services/executor.py` | ACTIVE (Phase D pipeline-v2) | None hard-coded (task parameter) |
| `services/evaluate.py` | ACTIVE | **`autofix-executor`** (default suggested) |
| `services/reviewer.py` | ACTIVE | None — uses actor-string `"persona:reviewer"` but loads qwen3:32b directly |
| `services/orchestrate.py` | ACTIVE | None — task-grouping logic only; doesn't invoke `orchestrator` persona |
| `services/score.py`, `stage.py`, `diagnose.py` | ACTIVE | None |
| `executor.sh` (legacy) | ACTIVE for scheduled jobs only; NOT for task-pipeline (subsumed Phase D) | `investigator` (default fallback only; not exclusive) |
| `event-watcher.sh` | ACTIVE (polls Pulse, triggers services/executor.py) | Capability routing: security-reviewer/bug-fixer/troubleshooter/backend-eng/db-eng/ux-eng/project-manager — all general-purpose; not exclusive |
| `team-runner.py` | ACTIVE | **`task-investigator`** + **`team-verdict`** (defaults, internal team-orchestration) |
| `audit-ingest.py` | ACTIVE (15-min cron) | None — READS orchestrator outputs for reconciliation |
| `curate-training-data.sh` | STUB only ("spec only — not implemented") | None |
| `pipeline-review` (scheduled job) | ACTIVE → Phase 1 elevates to `services/pipeline_reviewer.py` | **`pipeline-reviewer`** (Sir directive: elevate to Tier A + create service stub) |

**Conclusion** — only 4 personas are exclusively bound to internal mechanics: `autofix-executor`, `task-investigator`, `team-verdict`, `pipeline-reviewer`.

### 9.2 Orphaned-in-pipeline personas (demoted to Tier D)

These were Tier A candidates in earlier drafts but audit reveals they are no longer actively pipeline-bound:
- `orchestrator` — outputs CONSUMED by audit-ingest (read-only reconciliation); not INVOKED by any active service
- `ai-reviewer` — `services/reviewer.py` uses actor-string `"persona:reviewer"` but loads qwen3:32b directly; persona file is dormant
- `task-evaluator` — only referenced in deprecated `executor.sh` JOB_NAME gates
- `security-reviewer`, `bug-fixer`, `troubleshooter`, `backend-eng`, `db-eng`, `ux-eng`, `project-manager` — capability-routed by event-watcher.sh but general-purpose
- `investigator` — executor.sh fallback default AND 4 user-facing scheduled jobs (health-summary, persona-health-check, doc-sync-check, weekly-digest); general utility persona per Sir's explicit demotion

### 9.3 Scheduled-jobs deprecation cleanup

`registry.yaml` 3 disabled entries removed (Phase 1.0; already landed locally on Alfred-Dev `feature/personas-rebuild`):
- `task-score` (DISABLED 2026-05-12; replaced by `services/score.py`)
- `task-investigator` job (DISABLED 2026-05-12; auto:candidate path dropped under Plan B)
- `task-executor` (DISABLED 2026-05-12; replaced by `services/executor.py` daemon)

Personas referenced by these (autofix-executor, task-investigator persona) remain — they're invoked by `services/` now.

### 9.4 Persona registry — 32 total + `_template`

(Round-trip via ruamel.yaml; G14 resolved at filesystem — `creative-feedback/` renamed to `aurora-feedback/`; G15 disposition determined in Phase 1.0.)

### 9.5 MCP universe

| Location | MCPs | Purpose |
|---|---|---|
| `Jarvis/.mcp.json` (active) | jarvis-rag, jarvis-graphiti, jarvis-pulse | Workspace MCPs |
| `Jarvis/.mcp.json.disabled-2026-05-04` | + local-rag, qdrant-mcp, postgres-mcp, neo4j (7 total) | Disabled but recoverable |
| `Jarvis/infrastructure/.mcp.json` | jarvis-rag (standalone) | Container config |
| `Alfred-Dev/.mcp.json` | mcp-gateway (with memory + fetch sub-servers) | Workspace MCP |
| `AIFred-Pro/.mcp.json` | (similar) | Production mirror |
| `TokenCompressionBench/.mcp.json` | (bench-specific) | Workspace MCP |
| `~/.claude/plugins/marketplaces/claude-plugins-official/external_plugins/` | terraform/.mcp.json, discord/.mcp.json | Plugin-bundled MCPs |
| `~/.claude/plugins/installed_plugins.json` | hookify, code-simplifier, ... | Plugin registry |

Tool catalog (§6.3) ingests from ALL these sources. On-demand MCP loading architecture (§6.4) replaces session-startup MCP loading.

### 9.6 Hard-coded execution limits — confirmed removal

`max_turns`, `max_budget_usd`, `timeout_minutes` are REMOVED from `config.yaml` system-wide. Migrated to `pulse.persona_metadata.legacy_limits` JSONB for one schema version then dropped. Runtime protection moves to observation tunnel (§6.5).

---

## 10. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Tool catalog ingestion misses a plugin source | LOW | Filesystem watcher + manual-refresh endpoint; logged warnings on parse failures |
| MCP on-demand claim race conditions | MEDIUM | DB-level row-lock + ref-count; tested with concurrent claim load |
| Observation tunnel false-positives (stuck detection too aggressive) | MEDIUM | Adaptive per-task-class baselines via rolling p95; soft intervention before medium/hard |
| Schema v1→v2 migration breaks persona load | HIGH | Migration runs in transaction; legacy values archived not deleted; rollback path documented |
| Village view performance with 32 wandering sprites at 60fps | MEDIUM | Pre-test with 50+ sprite stress; fall back to 30fps if needed; pokegents reference shows this works |
| Add-on surface scope creep into production-grade work | MEDIUM | Per-surface PoC bar in §5 is the contract; deferred-polish list captures everything else |
| Graph view rAF loop causes re-render thrash | LOW | Simulation data in ref, React state updates independently — pattern validated in audit |
| Socket.io reconnection logic adds complexity | LOW | Use battle-tested socket.io-client retry policy |
| Pipeline-reviewer service stub Phase 1 scope creep | LOW | Stub is minimal subscribe + invoke; full implementation Phase 2 |
| Tier-gating bypass via direct DB write | LOW | DB access restricted to Pulse backend; admin DB writes audited |
| Cluster color map collisions with other dashboard pages | LOW | Map sourced from netclaw audit — consistent palette across surfaces |
| User accidentally soft-deletes critical Tier D persona | MEDIUM | 30d retention window; restore button in PC Box (§5.6); confirmation gate on delete |

---

## 11. Out of scope (Phase 1)

- **AI Review → learned-patterns auto-routing** — future-work stub; depends on REO H6 post-Phase 2
- **Dollar-denominated cost tracking** — deferred to Phase 4 (per Sir 2026-05-12)
- **Persona auto-generation from natural language** — post-Project_Archon
- **Cross-workspace persona sharing** (Jarvis personas usable by Alfred-Dev) — future-work
- **Persona impact analytics** (correlation with merge-rate / test-pass-rate) — needs more telemetry
- **Tier A code-gen helper** for new pipeline persona registration — speculative
- **Tool catalog auto-tagging via LLM** — speculative

---

## 12. Future-work stubs

To be picked up after Phase 1 ships and operational data accumulates:

- **Persona config + Tier-assignment optimization** (Sir 2026-05-12): Identify Tier D personas effectively never used (archival candidates); identify Tier D personas that should be promoted to C (job-bound); re-evaluate Tier A list if new pipeline services added; audit redundant overlap (e.g. researcher vs researcher-readonly); consolidate creative-pipeline personas if usage data shows overlap. Trigger: scheduled review every 90d, or on-demand via `/maintain` workflow.
- **Add-on surface promotion review**: which §5 add-ons earned production-grade investment based on user usage data? Cut or promote each surface.
- **AI Review → learned-patterns auto-routing** (depends on REO H6)
- **Persona auto-generation from NL** (post-Archon migration)
- **Cross-workspace persona sharing**
- **Persona impact analytics** (merge-rate / test-pass-rate correlations)
- **Tier A code-gen helper** for new pipeline persona registration
- **Tool catalog auto-tagging via LLM**
- **Persona usage routing recommendations** (suggest a persona for a task based on historical task→persona success)

---

*Phase 1 /personas rebuild design v5.0 — 2026-05-13 — concept-first rewrite per Sir 2026-05-13 directive; Core/Add-on quality split; primitives-derived; audit ground truth preserved; ready for Phase 1.0 cleanup completion + Phase 1.1 backend entry.*

---

## Appendix A — Version history

| Version | Date | Driving directive | Key change |
|---|---|---|---|
| v1 | early 2026-05-12 | Initial brainstorm | Free-form scoping |
| v2 | 2026-05-12 midday | Audit corrections + scope tightening | Removed prematurely-locked decisions |
| v3 | 2026-05-12 afternoon | Sir 16-point directive | 4-tier model (14/1/6/11 distribution); tool catalog matrix; DB-backed metadata; observation tunnel design; 14 endpoints |
| v4 | 2026-05-12 evening | Sir 3 tier-boundary answers + viz audit integration | Final tier distribution (4/2/1/25); 10 top-level tabs; 8-repo viz audit integrated; 18 endpoints; 9 DB tables |
| **v5** | **2026-05-13** | **Sir overhaul directive: "first pass best-guess brainstorm; point-by-point build concept, purposes, UI visuals, code/plumbing"** | **Concept-first rewrite; Core (§4: 5 surfaces) / Add-on (§5: 6 surfaces) quality split; primitives explicit (10); audit ground truth preserved §9; ratification claim removed; version history moved to this appendix** |

**v4 → v5 structural deltas**:
- Concept (§1) and Purpose (§2) sections are NEW — they make the primitive set explicit and load-bearing
- §4 Core / §5 Add-on split is NEW — replaces v4's flat 10-tab UX section
- Add-on surfaces have explicit PoC quality bar + deferred-polish list — replaces v4's monolithic UX descriptions
- §6 Code/plumbing is reorganized to mark Core vs Add-on endpoints/tables
- §7 Acceptance criteria splits into Core (§7.1, production-grade) vs Add-on (§7.2, PoC-functional) quality bars
- §6 "LOCKED" assertion (v4) removed — design-gate is unlocked per Sir 2026-05-13
- v4 §0.1 v3→v4 changelog removed from main body (cluttered the current vision); essentials preserved here in Appendix A
- v4 §12 "Paradigm clarification" merged into §2 Page purpose + §3.1 (was Tier model intro)
- Audit findings (v4 §2) moved to §9 (preserves rank as ground truth without bracketing main flow)

The 4-tier persona model (§3), the 22-item ratification body (v4 §6), the deep-link URL convention (§7.3), the audit findings (§9), and the build-phase effort breakdown (§8) are preserved from v4. The remaining content is restructured to satisfy Sir's Concept → Purpose → UI → Code/Plumbing arc.
