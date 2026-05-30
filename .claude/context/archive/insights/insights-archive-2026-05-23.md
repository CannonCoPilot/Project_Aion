# Insights Archive — 2026-05-23
# Rotated: 2026-05-23T16:41:31Z (21 entries)

### 2026-05-07 [4df66b2f039e]

The user-feedback-connector + lessons-learned wire is architecturally significant beyond just being a UI feature. It turns REO from a passive *observability* surface into an active *reinforcement* surface. The pipeline emits decisions; the user judges them; the judgments become persona context; future decisions improve. That's a closed loop with the user as the outer-loop optimizer — essentially RLHF without the gradient-descent step, using prompt-context retrieval as the update mechanism. This is why getting the schema right matters: a sloppy `feedback.right_or_wrong` boolean leaks through into persona prompts as low-signal noise; a well-structured `{verdict, comment, suggested-correction, context-shape}` distills into actionable lesson entries. I want to spec this carefully in the plan, marked DRAFT pending your review and David's input on whether existing infrastructure exists.

### 2026-05-07 [6d1953f9f18f]

The Question/ takes a deliberate shape worth flagging: rather than a "what should we do?" open-ended ask (which forces David to do design work), it presents a concrete proposal and asks him to accept / redirect / refine specific parts. This is the highest-leverage form of cross-stakeholder coordination — a draft memo with revisable claims, not a blank page. The five questions are scoped so that *any* answer (including silence) lets us proceed: Q1 (inventory completeness) is checkable on his next code push; Q2/Q3 (lessons-learned) are blockers only for Harden phase, not Build; Q4/Q5 are alignment questions where his preference is welcome but not required. This is why "draft → build" sequencing works even without a David response — the Build phase is fully specified by what's in the plan-of-record alone.

### 2026-05-07 [53eb4f9f6e1d]

**This reveals a third curation pattern I didn't have in my taxonomy**: *AI-mediated curation*. My original framing offered "human-curated" (proposals queued for review) vs "autonomic with gates" (low-confidence auto-apply). The discovered mechanism is neither — *the persona itself processes its own feedback and updates its own patterns*. Closed loop with no separate process: feedback arrives in JSONL → persona reads it on next run → persona updates its learned-patterns YAML in-place using three actions (agreed / wrong / adjusted). 7+ months of accumulation (104 agreed reinforcements, 3 wrong corrections, 13 adjustments) shows this works at sustained scale without human curation overhead. This is structurally cleaner than what I was proposing, and probably the right primitive for REO MVP.

### 2026-05-07 [8b87d5a61d60]

**The architecture is persona-scoped, not pipeline-wide**, with one important secondary surface for cross-cutting lessons. There's a `.claude/context/lessons/corrections.md` placeholder template referencing an unimplemented `self-correction-capture` hook — designed for human-authored pipeline-wide lessons (cross-persona patterns like "always defer destructive ops on `tag:experimental` regardless of which persona handles them"). David started this design but never wired it. The right architectural shape for REO is therefore: **per-persona `learned-patterns.yaml` (extend ai-reviewer's pattern to 5 more personas) + cross-cutting `corrections.md` hook (implement)**. REO's feedback connector routes by `decision_event.actor` — feedback on a reviewer decision goes to reviewer's feedback.jsonl; feedback on an executor decision goes to executor's feedback.jsonl. Cortex (the Meta-Learning Advisor persona) already monitors pattern-health system-wide and writes recommendations — REO could surface those too, but that's a separate question.

### 2026-05-07 [880cc9557885]

The canonical `log_decision()` signature lives in `diagnose.py:116-129`: positional `(actor, decision_type, outcome)` then kwargs `(rationale, confidence, downstream_effect, task_id)`. Confidence is a float 0-1, but reviewer's review_output uses string levels (`"high"|"medium"|"low"`) — I'll map them via a module-level `_CONFIDENCE_MAP = {"high": 0.9, "medium": 0.6, "low": 0.3}` constant. The `decision_type` stays `"review_outcome"` across all 5 branches; what varies is the `outcome` string (`passed | engine_failed | failed_diagnose_triggered | blocked_max_retries`). This keeps downstream queries simple — one `decision_type` filter surfaces all reviewer activity, then group by `outcome` for the actual semantics.

### 2026-05-07 [b682506092ef]

This workstream's plan separates per-step Build verification (curl + tsc) from end-to-end visual validation (Sir walks the UI in Phase 3). That's actually a thoughtful separation: each Bx is a small, isolated change that's easy to smoke-curl, while a single Validate pass at end-of-Build catches integration drift across all Bx pieces at once. The cost is that browser regressions slip into the Build phase undetected — but the count of Bx pieces is small enough that the trade is worth it.

### 2026-05-07 [6d8699ecd62f]

The pattern here is interesting: `.claude/context/.active-plan` is force-loaded via `@`-import from CLAUDE.md but gitignored. That means cross-machine sessions hydrate the active-plan content not from git but from a *snapshot in session-state.md* that gets rewritten on each meditation. session-state is the durable cross-session truth; .active-plan is a working scratchpad whose canonical source is whatever the conversation just decided. Avoids merge conflicts on tactical state, at the cost of needing discipline about updating session-state at phase boundaries.

### 2026-05-07 [222582ef0ea1]

Two observations from how this session went, sir. First: the JICM compressor's stale-checkpoint failure mode (Chronicler Phase 3 surfacing instead of REO Build) was caught in under a minute by the documented self-correction's cross-check discipline — the scratchpad-as-source-of-truth pattern paid back its setup cost on its first real use. Second: B7's decomposition (UI stub absorbed into B6, backend deferred to Harden H5) demonstrates a useful planning idiom — when a feature has a UI surface and a backend wire, splitting them across phases lets the UI ship in Build (where it's load-bearing for the drawer's visual completeness) while the more invasive schema/migration work waits for Harden's higher confirmation bar. Same pattern as B5 (copy-only) absorbed into B3 (rename).

### 2026-05-07 [229f1cf04f29]

The W1 implementation was the most architecturally interesting piece, sir. The motivating incident (AION-13dc7b96, 4466 errors over 74h with no alert) had two existing watchdog mechanisms in place that should have caught it: the sliding-window burst threshold (50 errors / 5 min) and the task-LABEL stuck-state watchdog. Both missed because the failure was *low-rate persistent* — each cycle dies the same way at ~1 error/minute, never bursts, no individual task gets stuck. W1 closes that exact gap by tracking *consecutive* cycle exceptions as a different signal type. Two independent watchdogs catching different failure surfaces is what defense-in-depth looks like in practice; the lesson is that "we already alert on errors" can hide a class of slow-fail that requires an entirely separate signal to detect.

### 2026-05-07 [adde23c10332]

This is a recoverable ergonomic gap, sir. Three paths from cleanest to fastest:

| Path | Effort | What you get |
|---|---|---|
| Fix the dev compose properly | ~1-2h | Add a `dashboard-dev` service that mounts `dashboard/frontend/` source and runs `vite` with hot-reload. Preserves the unified `docker compose up` ergonomics |
| Drop the stale `build: !reset null` | ~10min | Rebuild dashboard from source on every `docker compose up --build`. Slow (~30s vite-build per launch) but eliminates the prod/dev image divergence |
| Status quo + manual `npm run dev` | 0 | What you've been doing. Works but adds a sidecar process that doesn't appear in `docker ps` |

The middle path is the most defensible — `build: !reset null` was a workaround for a problem that no longer exists, and removing it surfaces the real Dockerfile in dev so any future drift gets caught immediately. The vite-dev-in-container path is more ergonomic for actual frontend coding (sub-second hot reload vs. 30s rebuild) but requires more compose plumbing.

### 2026-05-07 [07a57c28c728]

- The `!reset null` override was a documented opt-out from `docker-compose.dev.yml`'s build layer, but the *justification* (a "bd binary not shipped with upstream") no longer holds — `dashboard/bd` is a 25-byte shell script, not referenced in the Dockerfile, and `docker compose build nexus-dashboard` succeeds cleanly. This is the canonical failure mode of stale exclusions outliving their reason.
- "Are all components wired together to auto-start" answers crisply: **yes** — the dev compose brings up all 5 services together (`postgres`, `pulse`, `nexus-dashboard`, `pipeline`, `usage-proxy`). The gap is auto-*rebuild* on source change, not auto-start.
- Path 2 is the smallest diff that surfaces the real Dockerfile in dev. It also de-risks Path 1: if the rebuild reveals a hidden Dockerfile bug, we want to know that before investing in a hot-reload sidecar service.

### 2026-05-07 [e27c9fd4991b]

The "/reviews JSONL" finding reframes the whole REO Harden H5 conversation. We've been planning to build `pulse.decision_feedback` from scratch (database table + POST + lessons-learned wire), but the production feedback path already exists at the filesystem layer with a working AI-mediated curation loop on top. The optimal Harden play may be: write the DB table, BUT have the POST endpoint *also* append to the existing JSONL so existing curation scripts keep working unchanged — a parallel-write, not a cutover. Saves rewriting `learned-patterns.yaml` ingestion.

### 2026-05-07 [039fab577612]

The "Nexus" sidebar group is where IA collapsed. The label suggests "the orchestration platform's pages" — and that's a *technical* boundary, not a user-mode boundary. So everything Nexus-touching landed there regardless of what the user is *doing* on each page. This is exactly the "code organization leaking into UX organization" anti-pattern. The fix isn't to rename Nexus — it's to dissolve the Nexus group entirely and re-shelve every page by user mode.

### 2026-05-07 [323397abadd4]

The honest read of the dashboard's *intent* is in `dashboard/PLAN.md:1-3`: "Transform tasks.example.com from a basic task viewer into an actionable task management interface that handles 86+ tasks efficiently." That's a TASK MANAGEMENT INTERFACE — not the operations console for an AI organization. Everything beyond that primary intent (Nexus, Cortex, decision streams, persona configuration, observability) was bolted on later because the underlying system grew faster than the UX vocabulary to describe it. The current dashboard is a task manager that *also* shows you the AI org's internals because the AI org's internals are increasingly important. It's not an integrated console; it's a task manager + 27 ops/diagnostics/feedback pages.

### 2026-05-11 [3e0819b357d2]

- **Why the milestones are sized at ~1.5d each rather than e.g. one big "go"**: each milestone produces a *visible, testable* intermediate state. After M1, the sidebar is new but every page still works as before — you can use it. After M2, /decisions URLs redirect — you can verify deep-links resolve. After M3, /pipeline is monitoring-only — you can verify approvals work in their new home. If anything regresses, we catch it at the milestone boundary, not at PR assembly. This is also exactly the pattern AC-03 milestone reviews are designed for.
- **Why the AppShell.tsx rebuild (M1) is *just* IA, no functional changes**: the most likely failure mode for this kind of work is conflating "where pages live in nav" with "what pages do". Keeping M1 nav-only de-risks both — if M1 breaks, it breaks navigation, which is loud and easy to diagnose; it can't silently break feedback persistence or task state transitions.
- **The DecisionsPage.tsx "kept in tree" choice has a specific cost**: it creates dead code drift for one release cycle. The risk register (§6 of plan) names this explicitly and schedules its deletion in REO Phase 5.5 audit, when the parity verification will be repeated as a final check. If you'd prefer to delete it in the same PR as the redirect, that's a defensible alternative — say so and I'll revise M2.

### 2026-05-11 [22029d7b3176]

- **Star-count distribution is informative.** Top tier (10K+ stars): graphify (46.7K), get-shit-done (61.6K), trendradar (57.3K), claude-flow (49.1K), ccstatusline (9K), claude-context cluster, Serena (24.1K), Archon (21.3K), trycua/cua (15.9K), ccusage (14K), unity-mcp (9.5K), GhidraMCP+Ghidra (8.8K+68.3K), watchtower (24.6K), next-ai-draw-io (28.9K). The high star count rarely correlates 1:1 with AIFred-Pro fit — watchtower is archived, trendradar is Chinese-platform-only, GhidraMCP needs a domain you don't have.
- **The three "buy without thinking" picks** are graphify (P0/P1, codebase knowledge graph + Neo4j federation candidate), Serena (P0, token-efficient symbol-graph editing), and codebase-memory-mcp (P0, zero-dependency blast-radius + ADR tooling). All three are decomposition-free, install in minutes, and fill genuine gaps in the existing stack.
- **The "extract patterns, do not adopt wholesale" cluster** is claude-flow (210 MCP tools + HNSW memory), Archon (YAML DAG + worktree isolation), claude-octopus (PostToolUse compression hooks), and Octopoda-OS (5-signal loop detection). Each has 1-2 patterns worth extracting; each duplicates Nexus if installed whole.
- **The DF/Chronicler cluster** (myDFHackScripts, df-sites-analyzer) carries strong relevance for the Phase 3→4 gap-1 problem — death/invasion/artifact event capture is exactly what Chronicler needs.
- **Honest exclusions.** Out of 48 repos: 13 are P4 (skip), including watchtower (archived, dangerous for mixed-DB stack), GhidraMCP (wrong domain), bacdive-AI/agapi/genetic-inheritance (out-of-scope bio/materials science), trendradar (Chinese-platform-only + GPL), ObsidiBot (no Obsidian use), unity-mcp / one-shot-unity (no Unity project), and a handful of weak novelties.

### 2026-05-12 [b818a52c2c02]

- **Why the ref pattern over removing auto-flip**: I could have deleted the auto-flip useEffect entirely (simplest fix), but then deep-linking to /reo from a Slack/email link while the toggle says PROD would leave the sidebar visually incoherent until the user manually flipped. The ref pattern keeps the auto-sync UX without the revert bug. This is a textbook use of `useRef` to break dependency cycles — when you need to read state inside an effect but don't want the effect re-running when that state changes. Common cases: subscribing to external events, debouncing handlers, observers that need stable identity.
- **Why naming changed everything visually**: "Work | Diagnose" framed the dichotomy as "active vs investigative", but most dashboard pages are passive observation of running processes — neither active work nor an investigation. "Prod | Ops" reframes it as "where the artifacts live" (production-side surface vs operations-side surface), which matches how operators actually mentally bucket dashboards. The ratification in §11.2 picked the binary dichotomy correctly; this rename refined the *names* without changing the *cut*. Worth saving as a pattern: when ratification feels right but labels feel off, the cut is usually fine — try renaming before re-cleaving.

### 2026-05-12 [4a701f2c2462]

- **"Default landing page" is already true mechanically**: `App.tsx` has `<Route path="/" element={<OverviewPage />} />`, so any user hitting the bare host:port lands on Dashboard. No code change needed for the routing — your instruction is enforced by the existing route table. I'll preserve this and add an explicit acceptance criterion so future-Jarvis doesn't accidentally break it during M2/M3.
- **Why pulling Dashboard out of the cluster is structurally cleaner**: when Dashboard sat at index 0 inside PROJECTS, it was nominally a "project page" — but conceptually it's a meta-page (rollup of everything). Pinning it above the expander makes the hierarchy honest: Dashboard = global home; PROJECTS expander = project artifacts. The plain-vs-nested distinction also signals different click semantics to the user — pinned items are quick-access, nested items are sub-domain navigation.

### 2026-05-12 [7b126db12c92]

- **The "pinned items" pattern is reusable**: I added a single `PROD_PINNED_TOP: NavItem[]` constant and a 9-line conditional render block. If you later want pinned items in OPS mode too (e.g., a primary OPS dashboard like `/reo` or `/health`), it's a 2-line addition: `const OPS_PINNED_TOP: NavItem[] = [...]` and an `else if (activeMode === 'ops')` branch. Avoiding a generalized `pinnedTop: NavItem[]` field per-mode was deliberate — the count is small, and explicit per-mode arrays read better than a polymorphic data structure. If you ever need 3+ pinned items per mode, that's the refactor signal.
- **Why /projects belongs at top of the PROJECTS sub-cluster**: the cluster bears its name; visitors looking for "where do I see all projects?" should hit the cluster label and find /projects as the first option. The previous order (/projects at index 5) was a historical artifact of MAIN_NAV vs NEXUS_NAV's old grouping. Index 0 within a same-named cluster is the canonical home for the "list view" of that domain — same principle that puts /tasks at index 0 of a hypothetical "Tasks" cluster, /reviews at index 0 of "Reviews", etc.
- **Default landing page already enforced by routing**: `<Route path="/" element={<OverviewPage />} />` in `App.tsx` is the contract. There's no "default landing" config knob in Pulse — the bare URL is `/`, and `/` is bound to OverviewPage at module load. As long as that route declaration exists, Dashboard is default. The new AC in §5.1 codifies "don't accidentally delete or redirect that route" for M2/M3 self-review.

### 2026-05-12 [0990eb5bcfdb]

- **Why the audit-first sequence paid off**: the natural temptation is to dive into porting — "obviously ReoPage is better, just wire the redirect." But spending 30 minutes cataloguing every affordance surfaced two findings I'd have missed: (1) the confidence-bar gap was invisible until I scanned DecisionsPage's render code carefully (REO showed confidence in the drawer but not the row; for active monitoring, at-a-glance is the right signal); (2) the URL search-param translation was load-bearing in a way that wasn't obvious from the plan text — historical Slack/email links to `/decisions?actor=X` would have broken silently without the wrapper component. Both worth catching pre-redirect, not after.
- **The 8 "intentional drops" are the canonical decision log**: when David or future-Jarvis asks "wait, /decisions used to show top-actor / per-hour rate / recent-threads — where did those go?", the answer is in the audit report. Section "Items explicitly NOT ported" gives each one a why-dropped rationale tied to either (a) REO already covers it with better UX, (b) the underlying data model changed (drawer thread_id → event_id), or (c) the original was stale (OfflineBanner PULSE_DB_* hint, superseded by P1.B1.1). Decision logs like this aren't just bureaucracy — they save future debate-cycles.
- **The "DecisionsRedirect wrapper" pattern is a small but important react-router-v7 gotcha**: bare `<Navigate to="/reo" replace />` strips the search string. You'd discover this only by actually navigating to `/decisions?actor=X` and watching the URL bar update to `/reo` with NO params. The wrapper that calls `useLocation()` and synthesizes the `{ pathname, search }` object is the canonical fix. Worth saving as a pattern for future URL-preserving redirects in this codebase (other candidates: `/queue`, `/ready`, `/approvals` are currently using bare `Navigate` — they don't have meaningful search params today but might later).

### 2026-05-12 [ae8f77c6d5d2]

- **The audit-first sequence saved a day of churn**: had I dived straight into "redirect and call it done", I would have shipped a redirect that broke historical `/decisions?actor=X` deep-links silently, AND missed the confidence-bar opportunity that gives at-a-glance signal in the timeline. The audit took ~30 minutes; both portable items were the load-bearing 20% of the M2 effort. The other 80% (the redirect mechanic + deprecation hygiene + tracking docs) was straightforward execution. Worth promoting "audit-first" as a pattern for any future feature-consolidation milestones.
- **M1 vs M2 effort comparison**: M1 was 0.5d real-time + 1 visual-validate iteration. M2 was 0.5d real-time + 0 visual-validate iterations. Same time budget, fewer iterations on M2 — not because M2 was easier but because the audit caught issues pre-impl that visual-validate would have caught post-impl. The cost of catching at audit-time is one careful read; the cost of catching at visual-time is a fix-then-recheck cycle. For UX-touching work especially, audit-first is the cheaper diagnostic loop.
- **M3 will be different**: M1 was IA (low blast radius — CSS/layout only). M2 was URL contract (medium blast radius — affects bookmarks and external links). M3 is functional behavior (HIGH blast radius — touches the approval flow that pipeline-watcher.py depends on). The plan §6 risk register flags this; M3 should probably start with an investigation of where the approval-flow consumers actually live (sidebar banner, /pipeline page, possibly /board, possibly /tasks itself) BEFORE drafting the move. Like M2's audit, but for the consumer side rather than the affordance side.

