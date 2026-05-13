---
title: /personas Rebuild — Visualization & UX Audit of 8 GitHub Repos
date: 2026-05-12
status: AUDIT-COMPLETE (all 4 agent waves returned 2026-05-12; ready as input to v4 design)
project: Alfred-Dev
related:
  - ../designs/current/personas-rebuild-design-2026-05-12.md (v3 → v4 input)
audience: Sir, future-Jarvis
purpose: Source repos audited per Sir's 2026-05-12 directive ("Incorporate at least one major visualization concept from each one of the following github repos, and thoroughly audit each one to decide what other architecture, design, UI/UX features and layouts to use as quality standards")
---

# /personas Rebuild — Visualization & UX Audit

## Overview

Sir's directive (2026-05-12): audit 8 GitHub repos for visualization concepts + UI/UX patterns + architectural ideas, incorporating ≥1 major concept from each into the /personas rebuild. "If in doubt as to where ideas should be slotted into the UI/UX layout and design, add as a wholly new tab. Always better to overbuild and cut back unneeded features later."

8 repos split across 4 deep-research agents (themed pairs). 3 returned; 1 pending.

| Pair | Theme | Status |
|---|---|---|
| pokegents + openpets | Mascot / village paradigm | PENDING |
| Octopoda-OS + agent-teams-ai | Agent OS + team coordination | ✓ |
| Claude-Code-Agent-Monitor + agent-flow | Monitoring + flow viz | ✓ |
| agent-mission-control + netclaw | Mission control + network viz | ✓ |

---

## Wave 1 — agent-mission-control + netclaw (returned)

### `glglak/agent-mission-control`

**Major viz**: Three coexistent modes in one app — **pixel-art office canvas** (agents as sprites in themed rooms: Dev Area, QA Lab, Planning, Coffee Shop), **analytics dashboard** (cards + graphs + event log), **split mode**. Agents physically move between zones based on task type. Speech bubbles, particle beams for agent-to-agent comms, animated halos for "dismissed agents go to Agent Heaven", timeline replay scrubber.

**Tech**: Next.js + TS + Zustand + ReactFlow (for comms graph) + raw Canvas (for pixel-art) + Fastify telemetry bridge :4700 + WebSocket + SQLite.

**Adoptable patterns**:
- **Grid-layout default**: `cols = Math.ceil(Math.sqrt(agents.length))`; one-liner that gives clean default layout for any N agents. Baseline for our Matrix view before drag-to-rearrange.
- **Edge decay encoding**: `animated: conn.decay > 0.5`, `opacity: Math.max(0.2, conn.decay)`. Recency as derived value, zero extra state.
- **Sliding event window**: `state.events.slice(-999)` with `event_id` dedup. Direct pattern for our Activity feed.
- **Zone-to-activity mapping**: persona cluster → spatial zone. Reviewer cluster = QA Lab; executor cluster = Dev Area; planner cluster = Planning.

**Best-fit slot**: Matrix view cluster zones + Activity panel edge-decay. → Strong candidate for "Office" / "Village" tab too.

**Source**: `apps/web/src/components/graphs/CommunicationGraph.tsx`, `apps/web/src/stores/session-store.ts`

### `automateyournetwork/netclaw`

**Major viz**: **Three.js 3D operations dashboard** — 48 integrations + 103 skills + device fleet + live BGP topology in browser. Triangular core node with icosahedron shell, rotating torus rings, orbital sphere nodes for integration categories, animated data-flow tubes (ribbon geometry with Bezier curves), dendrite wire routes for BGP peers. **10-pass post-processing pipeline**: bloom + film grain + RGB shift + vignette + SMAA. Quality modes (focus / balanced / broadcast) for low-power → cinematic.

**Tech**: Three.js + Vite + Express :3001 + WebSocket + custom GLSL shaders + Python (MCP fleet) + SQLite.

**Adoptable patterns**:
- **Holographic shader material**: Fresnel rim glow + scan lines + data grid pattern, parameterized by `uColor` uniform. CSS analog: `box-shadow` + `background` pattern.
- **Ribbon geometry with in-place buffer updates**: pre-allocates edge geometry; updates position buffer per-frame. Zero GC pressure for animated edges.
- **Category color map**: cyan=monitoring, green=config, orange=security, magenta=compute, yellow=routing. Applied identically across node mesh, halo ring, tube geometry. Our analog: reviewer=amber, executor=blue, planner=violet, diagnose=red, creative=emerald, meta=slate.
- **Click-select raycasting → detail panel**: `hit.userData.type` dispatches panel content (integration vs device vs BGP routes). Generalizes to ReactFlow `node.data.type` for our 6-tab detail panel.
- **Identity file system** (`SOUL.md`, `AGENTS.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`) — externalized persona spec as named human-readable files. Architecturally adjacent to our config.yaml + permissions.yaml + methodology.yaml + prompt.md structure.

**Best-fit slot**: Graph view node rendering + click-select pattern for detail panel.

**Source**: `ui/netclaw-visual/src/main.js`

### Top 3 from Wave 1
1. **Category color map** enforced across all visual surfaces simultaneously (netclaw). Zero design at render-time; color is pure function of `persona.cluster`.
2. **Edge decay as recency indicator** (agent-mission-control). `opacity = Math.max(0.2, lastInvokedDecay)`, `animated = decay > 0.5`. Live-quality graph for free.
3. **Click-select → context-specific detail panel** (netclaw). `userData.type` dispatch generalizes the 6-tab content switch.

---

## Wave 2 — Octopoda-OS + agent-teams-ai (returned)

### `RyjoxTechnologies/Octopoda-OS`

**Major viz**: Card-tiled observability dashboard at `localhost:7842`. Four named screens — **Agent Performance** (per-agent tiles with latency/error/memory + composite health score), **Memory Explorer** (temporal browse with version-diff inspection), **Audit Trail Timeline** (hash-chained event log filterable per agent; each row is decision/crash/recovery with frozen memory snapshot), **Anomaly Stream** (real-time loop-detection event feed). KPI bar: "5 agents, 226 ops, 382 loops caught, $12.45 wasted".

**Tech**: Python backend (FastAPI inferred). Frontend ships as compiled artifact — stack not exposed in repo. SQLite (local) + PostgreSQL/pgvector (cloud).

**Adoptable patterns**:
- **Audit trail with frozen memory snapshot**: every decision row carries full agent memory state at decision-time. Direct analog: Activity tab rows carry frozen prompt + permissions snapshot at job-fire time. Reproducibility record, not just a log.
- **Per-agent health score composite**: `health_score = f(latency, error_rate, loop_count)` → single scalar drives tile color/fill, not just text. Better than binary active/idle.
- **Hash-chained log**: tamper-evident audit. Applicable to permissions-change log.
- **Dollar-denominated KPI display**: "$12.45 wasted on loops" converts abstract observability into user impact. Phase 4 dollar tracking benefits from this framing.

**Best-fit slot**: Activity tab → audit row with frozen snapshot.

### `777genius/agent-teams-ai`

**Major viz**: Three viz paradigms — **TeamListView grid** (responsive `grid-cols-1 md:2 xl:3` cards with color-coded LEFT BORDER, member chips, status badge, pulsing dot for active), **force-directed agent graph** with **STABLE_SLOT_LAYOUT** (Lead-centered, six canonical sectors, drag snaps to slot or swaps), **per-slot embedded kanban** (each member slot in the graph contains a bounded kanban board).

**Tech**: Electron 40 + React 19 + TS 5 + Tailwind 3 + Zustand 4 + d3-force v3. Custom SVG renderer on top of d3-force (no Cytoscape/Reaflow/Three.js).

**Adoptable patterns**:
- **`STABLE_SLOT_LAYOUT`**: deterministic sector-based placement; 6 sectors map directly to our 6-cluster structure (reviewer/executor/planner/diagnose/creative/meta). Prevents layout thrash on live updates.
- **`LiveRuntimeStatusSection` 6-state palette**: Running / Starting / Waiting / Degraded / Stopped / Unknown with Tailwind tokens (emerald-500, sky-500, amber-500, rose-500, zinc-400, muted zinc) + relative timestamps ("45s ago"). Cheaper than live counter; signals staleness instantly.
- **TeamListView pulsing dot**: `animate-pulse` for running state. Zero-cost signal.
- **MemberBadge color-coded chips**: role → color, directly mapping to our `TIER_COLORS` (research/builder/executor/creative/analyst/admin).
- **Color-coded LEFT BORDER as category identifier**: 4px border in cluster color on each card. The border IS the label. Works at any density.

**Best-fit slot**: Matrix view tile grid + new "Cluster Graph" tab (STABLE_SLOT_LAYOUT for 6 sectors).

**Source**: `src/renderer/components/team/{TeamListView,LiveRuntimeStatusSection}.tsx`, `src/features/agent-graph/STABLE_SLOT_LAYOUT_PLAN.md`

### Top 3 from Wave 2
1. **Six-state status palette with relative timestamps** (agent-teams-ai). Replaces binary active/idle across matrix + detail + badges. "45s ago" as freshness proxy.
2. **Color-coded left border = cluster identity** (agent-teams-ai). 4px border per tile in cluster color; label-free identification at density.
3. **Audit row with frozen execution snapshot** (Octopoda-OS). Activity tab as reproducibility record, not just timestamp log.

---

## Wave 3 — Claude-Code-Agent-Monitor + agent-flow (returned)

### `hoangsonww/Claude-Code-Agent-Monitor`

**Major viz**: **11 D3.js visualizations** including DAGs, Sankey diagrams, force-directed networks. Six-card stat surface (live counters), activity heatmaps (time-of-day tool-use density), token trend charts (time-series in/out per session), tool-frequency bar charts (ranked by invocations), cost breakdown per session (model-priced, compaction-aware). **Sankey** is standout — tool-call flow through agent session, node width ∝ call count.

**Tech**: React 18.3 + Vite + TS + Tailwind + Lucide + D3.js v7 + Socket.io (WebSocket, zero polling) + Node/Express + SQLite + Claude Code hooks (SessionStart/PostToolUse/Stop) + 25+ MCP tools.

**Adoptable patterns**:
- **Dual state machine**: explicit `agent-state` (working/waiting/completed/error) + `session-state` (active/completed/error/abandoned). Prevents ambiguous "is this done?". Analog: `persona-state` (idle / scheduled-running / on-demand / error).
- **Hook-event ingestion pipeline**: Claude Code JSON hook events → Express → SQLite → Socket.io broadcast → React. Already our exact integration surface.
- **Cost-aware compaction tracker**: flags tokens lost to `/compact`; preserves per-session cost accuracy through context resets. Directly applicable to JICM-aware token accounting (Phase 2).
- **`KanbanPage` lifecycle board**: agents as cards in columns by state. Transplantable to personas filtered by status.

**Best-fit slot**: Persona-state column in catalog matrix + Socket.io push from Pulse observability events.

### `patoles/agent-flow`

**Major viz**: **Custom 2D Canvas force-layout graph** with **post-processing bloom pass**. NOT D3-SVG — hand-rolled canvas with `requestAnimationFrame` loop, delta-time smooth animation, camera/transform system. Node types: agents, tool calls, discoveries, particles. **Holographic glow** via multi-pass blur at half-res upscaled with additive blending. Secondary panels: **Timeline panel** (canvas Gantt swimlanes per agent, color-coded by status, live playhead at `currentTime`), **File attention panel** (ranked heat-colored progress bars sorted by tokens), **Session transcript + message feed**.

**Tech**: Next.js 16 + React 19 + Vite + Tailwind v4 + d3-force v3 + custom Canvas 2D renderer + HTTP hook server + VS Code extension (Cursor/Windsurf compat) + JSONL event log replay.

**Adoptable patterns**:
- **Ref-synced canvas loop**: simulation data in ref, updated each frame via rAF, React state changes happen independently. Prevents "graph freezes during sidebar update".
- **`detectStateChangesPure`**: pure-function diff between previous/current agent state → emits particle effects on transition. Persona transitions `idle → scheduled-running` emit pulse ring on canvas node.
- **Timeline swimlane with live playhead**: Gantt rows on canvas (not SVG); playhead is vertical line at `currentTime`. Data shape (`Map<string, TimelineEntry>` with typed `blocks[]`) maps directly to our Pulse audit_log + decision_events join.
- **File attention heatmap pattern**: items ranked by token cost, heat-colored progress bars. Analog: "persona attention" — most-token-consuming, most-error-outcome personas, sorted descending.
- **Glass-morphism + bloom aesthetic**: `glass-card.tsx`, `glass-context-menu.tsx`, `SlidingPanel` Y-axis animation. Systematic visual language.

**Best-fit slot**: PRIMARY GRAPH VIEW — the "live dynamic network" Sir explicitly requested. Personas as glowing nodes; edges from decision-event actor→target pairs; bloom intensity ∝ recent activity.

**Source**: `web/components/agent-visualizer/{canvas,timeline-panel,file-attention-panel,bloom-renderer}.tsx/.ts`; YouTube demo `https://www.youtube.com/watch?v=Ud6eDrFN-TA`

### Top 3 from Wave 3
1. **agent-flow custom Canvas + d3-force + bloom-renderer** → primary Graph tab. The "live dynamic network" directive. Ref-synced loop avoids React thrash.
2. **Claude-Code-Agent-Monitor dual state machine + Socket.io push** → persona-state enum across catalog + matrix; zero polling.
3. **agent-flow timeline swimlane with playhead** → Activity tab's primary surface; replaces v3's "bar charts + sparkline + donut" with single coherent canvas timeline.

---

## Wave 4 — pokegents + openpets (returned)

Theme: Mascot / village paradigm — Sir's explicit "pokemon wandering their village, persona mascots with animations" reference.

### `tRidha/pokegents`

**Major viz**: **Pixel-art town map with BFS-pathfinding wandering agents**. `TownView.tsx` is a DOM-rendered 544×480 tile grid; each agent occupies a cell and moves autonomously. Busy agents path-find toward "busy zones" (painted `b` cells); idle agents wander locally with 850–1400ms cooldown pauses. Two movement speeds: 30ms/step transit, 225ms/step amble. Tile encoding: `.`=walkable, `b`=busy zone, `#`=wall. Agent sprites animate emotion states (hop, bump, shake, wiggle, nod, jump, lean — 8 weighted variants). **"PC Box" session browser** for dormant/past sessions as collectibles in a storage grid. **Pokéball deploy/recall animation** frames agent lifecycle as ritual.

**Tech**: React + Vite + TS + Tailwind + Go backend + SSE for streaming + WebSocket per agent for chat. CSS keyframes for sprites (no canvas, no Phaser, no Framer Motion). BFS pathfinding in plain TypeScript.

**Adoptable patterns**:
- **Weighted random animation selector** (`spriteAnimations.ts`) — avoids repeating same animation twice; configurable probability weights per variant.
- **Dual-speed movement with zone semantics** — `STEP_MS_TRANSIT` (30ms) vs `STEP_MS_IDLE` (225ms) tied to busy vs idle state. Maps cleanly to our "active scheduled job running" vs "on-demand/idle" persona states.
- **String-mask walkability grid** — encodes tile type as plain string array; zero dependency; trivially serializable.
- **BFS `stepToward()` function** — queue-based, null-safe, handles blocked paths gracefully.
- **`agentState → animationSet` mapping** — `busy → BUSY_ANIMATIONS`, `idle → IDLE_ANIMATIONS`, `done → DONE_ANIMATIONS`.
- **HealthBar with color threshold** — `>50%` green / `20–50%` yellow / `<20%` red, formatted `150k/200k`. Direct analog: persona context-window remaining indicator.
- **"Done flash" green glow** (layered `box-shadow` with opacity pulse, 18px) — task completion signal without modal.

**Best-fit slot**: **NEW "/personas/village" tab** — wandering tile map with our 32 persona sprites. Busy zones = cluster zones with active scheduled jobs (e.g. reviewer cluster has a "QA zone" with `pipeline-reviewer` sprite walking toward it during scheduled run). Pokéball deploy fires when persona spawns or job starts.

**Source**: `dashboard/web/src/components/{TownView,AgentCard,spriteAnimations}.tsx/.ts`

### `alvinunreal/openpets`

**Major viz**: **Transparent frameless desktop overlay with CSS sprite sheet animation**. Pets are Electron windows with `frame: false`, `transparent: true`, `alwaysOnTop: "floating"`, visible on all macOS Spaces. Sprite sheets 192×208px per frame, 8 columns × 9 rows. Animation driven by HTML `data-reaction-state` + `data-motion-state` attributes; CSS selectors adjust `--sprite-row-y` and `--sprite-frames` custom properties. Pure CSS `steps()` keyframe animation cycling background-position through the sheet. **NO canvas, NO JS animation loop**. **Reaction → idle decay pipeline** with two-phase timer (animation completes BEFORE speech bubble disappears, creating visible "reaction → settle" arc). **Mouse passthrough by default** (`setIgnoreMouseEvents(true, { forward: true })`) — pets never block work. **Lease-based agent routing** with 15s TTL + heartbeat for concurrent multi-agent pets.

**Tech**: Electron (Node 20 + TS); CSS `steps()` keyframes only; IPC via Unix socket / named pipe; pnpm monorepo (8 packages); v2.0.5 released 2026-05-12; 372 stars.

**Adoptable patterns**:
- **CSS `steps()` sprite sheet animator** — `animation: pet-frames var(--sprite-duration) steps(var(--sprite-frames))`. Entirely data-driven via CSS custom props. Zero JS loop. Drop-in for React component using `data-*` attrs.
- **`data-reaction-state` + `data-motion-state` attribute-driven CSS** — avoids className churn; CSS selects correct `--sprite-row-y` automatically. Clean separation.
- **Reaction → settle two-phase timer** — `if (animationMs < transientDisplayMs)` arc prevents jarring hard-cut from reacting to idle.
- **Speech bubble validation schema** — `HookSpeechCategory` union (`thinking | success | error | permission`) with 1–140 char limit, no code/URLs/paths/secrets. Pool-based random selection prevents accidentally leaking context.
- **Lease-based concurrent routing** — 15s TTL + heartbeat. Applicable to "active job" persona highlighting.

**Best-fit slot**: **PERSONA CARD ANIMATION ENGINE** — drop-in CSS sprite system used everywhere (matrix view, list view, village view, detail panel, flow diagram nodes). One sprite sheet per persona; framework-agnostic; zero runtime overhead.

**Source**: `apps/desktop/src/{pet-window,agent-pet-controller}.ts`, `packages/agent-events/src/index.ts`

### Top 3 from Wave 4
1. **pokegents wandering tile map with BFS** — new "/personas/village" tab; faithful "pokemon wandering" implementation; 2-3d effort.
2. **openpets CSS `steps()` sprite sheet system** — universal persona-card animation engine; zero-dependency; 0.5d for engine, sprite production is bottleneck.
3. **openpets reaction → settle timer + speech pools** — micro-personality arc for persona cards; plugs into Pulse job-event stream (job.started → thinking, task.completed → success, task.error → error); 0.5d.

---

## Cross-wave synthesis — REVISED with all 4 waves

**Primary visual surfaces** (each becomes top-level tab or in-tab section):

| Surface | Concept | Source repos | Phase 1 priority |
|---|---|---|---|
| **List** (default) | Color-coded left border tiles + 6-state status palette + pulsing dot + 4-tier section grouping | agent-teams-ai TeamListView + LiveRuntimeStatusSection | HIGH |
| **Matrix** | Persona × tool matrix; cluster-zone grouping; category color enforced across cell borders | netclaw + agent-mission-control | HIGH |
| **Graph** (PRIMARY differentiator) | Custom Canvas 2D + d3-force + bloom-renderer; ref-synced rAF loop; edge decay as recency; holographic node shader | agent-flow + netclaw + agent-mission-control | HIGH |
| **Flow** | ReactFlow swim-lane (pipeline-v2 + creative-pipeline) with click-select-to-detail dispatch | netclaw click-select + Claude-Code-Agent-Monitor lifecycle | HIGH |
| **Village** (NEW per Wave 4) | Pixel-art tile map with BFS pathfinding, dual-speed movement (transit/amble), zone semantics (busy = active-job clusters), persona sprites with weighted animations, Pokéball deploy ritual | **pokegents** + agent-mission-control office mode | HIGH (Sir explicit ask) |
| **Timeline** | Canvas Gantt swimlane per persona with live playhead at `currentTime`; color-coded by event type | agent-flow timeline-panel | HIGH |
| **Mission Control** | KPI bar ("$X / N decisions / M loops caught") + agent cards + event ticker + alert stream | Octopoda-OS + agent-mission-control | MEDIUM |
| **Heatmap** | Time-of-day tool-usage heatmap; token trend charts; Sankey of tool-call flow | Claude-Code-Agent-Monitor | MEDIUM |
| **Audit / Replay** | Hash-chained audit log; scrubbable timeline with frozen prompt+permissions snapshot per row | Octopoda-OS audit trail | HIGH (in Activity tab) |
| **PC Box** (NEW per Wave 4) | Dormant/past session browser as collectibles grid — Pokemon-box metaphor for persona history/learned-patterns archive | **pokegents** PC Box pattern | LOW (over-build candidate) |
| **Per-persona detail tabs** | Overview / Config / Permissions / Methodology / Prompt / Activity / Relationships / Tool-attention | Octopoda Audit + netclaw click-select dispatch | HIGH |

**Cross-cutting design system** (refined):
- **Tailwind 6-state palette** (emerald/sky/amber/rose/zinc/muted-zinc) for persona status (Wave 2)
- **Cluster color map** (reviewer=amber, executor=blue, planner=violet, diagnose=red, creative=emerald, meta=slate) applied identically across all surfaces (Wave 1)
- **Glass-morphism cards + bloom-glow accents** (Wave 3 agent-flow aesthetic)
- **4px left border = cluster identity** on cards (Wave 2 agent-teams-ai)
- **Animate-pulse dot** for running state (Wave 2)
- **CSS `steps()` sprite sheet animation engine** — universal persona-mascot system (Wave 4 openpets)
- **Weighted random idle animations** prevent visual repetition (Wave 4 pokegents)
- **"Done flash" green glow** for job completion (Wave 4 pokegents)
- **Speech bubble pools** with validated content (Wave 4 openpets)

**State + real-time infrastructure** (refined):
- **Dual state machine** (`persona-state` + `task-state` enums) (Wave 3)
- **Socket.io / WebSocket push** from Pulse → dashboard (no polling) (Wave 3)
- **Lease-based active-job routing** with 15s TTL + heartbeat (Wave 4 openpets)
- **Hook-event ingestion** Claude Code → Express → Pulse → Socket.io broadcast → React (Wave 3)
- **Ref-synced canvas loop** for graph + village views (avoids React re-render thrash) (Wave 3 agent-flow)

**Tech stack recommendation (audit-grounded, REVISED)**:

| Layer | Recommendation | Source |
|---|---|---|
| **State** | Zustand | Waves 1, 2, 3 |
| **Real-time** | Socket.io | Wave 3 |
| **Animation engine** | CSS `steps()` sprite sheets via `data-*` attribute routing | Wave 4 openpets |
| **Graph view** | Custom Canvas 2D + `d3-force` v3 + bloom renderer (per agent-flow pattern) | Wave 3 |
| **Flow view** | ReactFlow (lighter than Reaflow; matches agent-mission-control's CommunicationGraph) | Waves 1, 3 |
| **Village view** | DOM-rendered tile grid + BFS pathfinding + CSS keyframe sprites | Wave 4 pokegents |
| **Timeline view** | Canvas Gantt with live playhead (NOT D3-SVG) | Wave 3 agent-flow |
| **Charts/heatmaps** | D3.js v7 | Wave 3 Claude-Code-Agent-Monitor |
| **Card animations** | Tailwind `animate-pulse` + Framer Motion for panel transitions | Wave 2 |
| **3D (optional, defer)** | Three.js + custom GLSL shaders | Wave 1 netclaw (over-build candidate) |

(Replaces v3's tentative "Cytoscape.js + Reaflow" with audit-grounded choices.)

---

## Final top-12 must-adopt ideas (across all 8 repos)

1. **Cluster color map** enforced across all surfaces (netclaw)
2. **CSS `steps()` sprite sheet animation engine** universal across all views (openpets)
3. **6-state status palette with relative timestamps** (agent-teams-ai)
4. **Pokemon-village tile map with BFS pathfinding** as dedicated tab (pokegents)
5. **Custom Canvas 2D + d3-force + bloom** for primary Graph view (agent-flow)
6. **Audit row with frozen execution snapshot** in Activity tab (Octopoda-OS)
7. **Color-coded left border = cluster identity** on persona cards (agent-teams-ai)
8. **Click-select → context-specific detail panel** dispatch (netclaw)
9. **Edge decay as recency indicator** (agent-mission-control)
10. **Reaction → settle two-phase timer** for persona micro-personality (openpets)
11. **Dual state machine + Socket.io push** for persona-state (Claude-Code-Agent-Monitor)
12. **Timeline canvas Gantt with playhead** in Activity tab (agent-flow)

---

## Quality bar adopted from audit

- **Color-coded everything**: same cluster color on card border, node fill, edge color, accent strips
- **Live-quality without spinners**: pulsing dots, edge decay, particle effects on state transitions, "done flash" green glow
- **Reproducibility**: every activity row carries a frozen snapshot (Octopoda-OS pattern)
- **Multi-resolution viz**: zoom out = clusters/rooms/zones; zoom in = individuals (agent-mission-control + netclaw + pokegents)
- **Real-time push**: zero polling; Socket.io WebSocket
- **Deterministic layouts**: STABLE_SLOT_LAYOUT prevents re-shuffle thrash (agent-teams-ai)
- **Mascot micro-personality**: react→settle arc with speech pools (openpets)
- **Anti-repetition**: weighted random animation selector prevents visual fatigue (pokegents)
- **Zero-dependency animation engine**: CSS sprite sheets, no JS loop (openpets)

---

## Sources (all 8 repos audited)

- ✓ https://github.com/glglak/agent-mission-control
- ✓ https://github.com/automateyournetwork/netclaw
- ✓ https://github.com/RyjoxTechnologies/Octopoda-OS
- ✓ https://github.com/777genius/agent-teams-ai
- ✓ https://github.com/hoangsonww/Claude-Code-Agent-Monitor
- ✓ https://github.com/patoles/agent-flow
- ✓ https://github.com/tRidha/pokegents
- ✓ https://github.com/alvinunreal/openpets

---

## Cross-wave synthesis — top adoptions for /personas v4

**Primary visual surfaces** (each becomes its own top-level tab or in-tab section):

| Surface | Concept | Source repos | Phase 1 priority |
|---|---|---|---|
| **List** (default) | Color-coded left border tiles + 6-state status palette + pulsing dot + 4-tier section grouping | agent-teams-ai TeamListView + LiveRuntimeStatusSection | HIGH |
| **Matrix** | Persona × tool matrix; cluster-zone grouping (Dev Area / QA Lab / Planning rooms inspiration); category color enforced across cell borders | netclaw + agent-mission-control | HIGH |
| **Graph** (PRIMARY differentiator) | Custom Canvas 2D + d3-force + bloom-renderer; ref-synced rAF loop; edge decay as recency; holographic node shader | agent-flow + netclaw + agent-mission-control | HIGH |
| **Flow** | ReactFlow swim-lane (pipeline-v2 + creative-pipeline + creative side-arm) with click-select-to-detail | netclaw click-select pattern + Claude-Code-Agent-Monitor lifecycle | HIGH |
| **Office / Village** | Pixel-art canvas with zones-by-cluster; persona sprites; speech bubbles; particle comm beams | agent-mission-control + pokegents/openpets (pending) | MEDIUM (over-build candidate) |
| **Timeline** | Canvas Gantt swimlane per persona with live playhead at `currentTime`; color-coded by event type | agent-flow timeline-panel | HIGH |
| **Mission Control** | KPI bar ("$X spent / N decisions / M loops caught") + agent cards + event ticker + alert stream | Octopoda-OS + agent-mission-control | MEDIUM |
| **Heatmap** | Time-of-day tool-usage heatmap; token trend charts; Sankey of tool-call flow | Claude-Code-Agent-Monitor | MEDIUM |
| **Audit / Replay** | Hash-chained audit log; scrubbable timeline with frozen prompt+permissions snapshot per row | Octopoda-OS audit trail | HIGH (in Activity tab) |
| **Per-persona detail tabs** (within selected persona) | Overview / Config / Permissions / Methodology / Prompt / Activity / Relationships / Tool-attention | Octopoda Audit + netclaw click-select dispatch | HIGH |

**Cross-cutting design system**:
- **Tailwind 6-state palette** (emerald/sky/amber/rose/zinc/muted-zinc) for persona status
- **Cluster color map** (reviewer=amber, executor=blue, planner=violet, diagnose=red, creative=emerald, meta=slate) applied identically across all surfaces
- **Glass-morphism cards + bloom-glow accents** (agent-flow aesthetic)
- **4px left border = cluster identity** on cards (agent-teams-ai)
- **Animate-pulse dot** for running state (agent-teams-ai)

**State + real-time infrastructure**:
- **Dual state machine** (`persona-state` + `task-state` enums)
- **Socket.io / WebSocket push** from Pulse → dashboard (no polling)
- **Hook-event ingestion** Claude Code → Express → Pulse → Socket.io broadcast → React
- **Ref-synced canvas loop** for graph view (avoids React re-render thrash)

**Tech stack recommendation (audit-grounded)**:

Replacing v3's tentative "Cytoscape.js + Reaflow":
- **Graph view**: Custom Canvas 2D + `d3-force` v3 + bloom renderer (per agent-flow pattern)
- **Flow view**: ReactFlow (lighter than Reaflow; matches agent-mission-control's CommunicationGraph)
- **Office view** (if adopted): raw Canvas API for pixel-art rendering
- **Timeline view**: Canvas Gantt (per agent-flow timeline-panel) — NOT D3-SVG
- **Charts/heatmaps**: D3.js v7 (per Claude-Code-Agent-Monitor)
- **State**: Zustand
- **Real-time**: Socket.io
- **Animation**: Tailwind `animate-pulse` + Framer Motion for panel transitions

---

## Quality bar adopted from audit

- **Color-coded everything**: same cluster color on card border, node fill, edge color, accent strips
- **Live-quality without spinners**: pulsing dots, edge decay, particle effects on state transitions
- **Reproducibility**: every activity row carries a frozen snapshot (Octopoda-OS pattern)
- **Multi-resolution viz**: zoom out = clusters; zoom in = individuals (agent-mission-control + netclaw)
- **Real-time push**: zero polling; Socket.io WebSocket (Claude-Code-Agent-Monitor)
- **Deterministic layouts**: STABLE_SLOT_LAYOUT prevents re-shuffle thrash (agent-teams-ai)

---

## Sources (all 8 repos cited; 3 audited)

- ✓ https://github.com/glglak/agent-mission-control
- ✓ https://github.com/automateyournetwork/netclaw
- ✓ https://github.com/RyjoxTechnologies/Octopoda-OS
- ✓ https://github.com/777genius/agent-teams-ai
- ✓ https://github.com/hoangsonww/Claude-Code-Agent-Monitor
- ✓ https://github.com/patoles/agent-flow
- ⏳ https://github.com/tRidha/pokegents (pending)
- ⏳ https://github.com/alvinunreal/openpets (pending)

---

*Visualization & UX audit v1 — 2026-05-12 — all 4 agent waves complete (8 repos audited). Findings feed v4 of personas-rebuild-design-2026-05-12.md (held for Sir's tier-boundary + investigator + archival answers).*
