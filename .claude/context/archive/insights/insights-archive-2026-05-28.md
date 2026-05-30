# Insights Archive — 2026-05-28
# Rotated: 2026-05-28T07:17:57Z (7 entries)

### 2026-05-12 [4fb9c06694dc]

The qwen3:8b compressor checkpoint at lines 5-32 of `.compressed-context-ready.md` hallucinated the "Current Task" again — it reconstructs M1's PROJ→PROJECTS rename + dashboard-pinning work as if pending, but M1 shipped in commit `d001c75` (PROD|OPS toggle, PROJECTS rename, Dashboard pinned, /projects at top) and M2 shipped in `fc1546f` (/decisions→/reo redirect). This is exactly the failure mode logged 2026-05-06 in `self-corrections.md`: low-tier compression treats fragments of M1-iteration dialogue as forward-looking work. Scratchpad is authoritative — confirms M1+M2 both SHIPPED and the actual pause point is M3 awaiting Sir's go/no-go.

Two confirmations of the architectural pattern from §11 of foundational analysis: (a) M1 (sidebar IA) and M2 (URL consolidation with 35-affordance audit) both passed AC-03 gates 4.5/5.0 with audit-first sequencing; (b) the `DecisionsRedirect` wrapper using `useLocation` + `<Navigate to={{ pathname, search }} replace />` is now the canonical react-router-v7 pattern for URL-preserving redirects in this codebase — applicable later to `/queue`, `/approvals`, `/orchestrations*`, etc. when consolidation reaches them.

### 2026-05-12 [aac985eec52f]

- **The complementarity hypothesis was validated.** Serena = LSP-backed edit/refactor (39 tools, no symbol graph of its own — relies on live LSP queries). codebase-memory-mcp = SQLite-backed indexed retrieval + 14 MCP tools with Cypher subset (no editing — read-only graph). graphify = on-demand NetworkX build + 7 retrieval tools + multi-format export including vis.js HTML. **They genuinely cover three distinct slices**: live edit/refactor, persistent code-graph retrieval, and visualization/exporting. None of the three duplicates more than ~25% of another.
- **The Neo4j sharing question has a definitive answer.** graphify's `push_to_neo4j()` has NO namespace/database parameter and falls back to `Entity` label when `file_type` is absent — which would MERGE-collide with graphiti's `Entity` nodes on `id` property. **Recommendation: create a separate Neo4j database** (`CREATE DATABASE graphify_codebase`) in the existing instance — Neo4j 4.0+ supports this natively. One Neo4j daemon, two logical databases, zero schema collision.
- **Three blocker-grade issues to flag prominently.** (1) Serena's web dashboard breaks Claude Code MCP handshake (issue #898) — must run with `web_dashboard: false`. (2) codebase-memory-mcp has open segfault bugs on 200+ file repos (issues #340, #336) — Alfred-Dev is well over 200 files; staged adoption recommended. (3) graphify's non-determinism issue #741 produces 11K-line diffs on unchanged source — gitignore `graphify-out/` rather than committing it.
- **The UI integration verdict is asymmetric.** graphify → easy iframe embed (self-contained vis.js HTML, no headers blocking embedding). codebase-memory-mcp → must build custom panel (3D viewer has no export API, no embeddable widget). Serena → must build custom panel (dashboard at :24282 conflicts with Claude Code; poll JSON endpoints `/heartbeat`, `/get_config_overview`, `/get_tool_stats` instead).

### 2026-05-12 [117fe8718fef]

- **The "three tools, three slices" verdict is the load-bearing finding.** Each tool covers ≥5 capabilities the other two lack: Serena's LSP-backed live edit (rename across files, find_referencing_symbols at LSP accuracy, get_diagnostics_for_symbol) has no equivalent in the other two. codebase-memory-mcp's `detect_changes` blast-radius and Cypher-subset `query_graph` over persistent SQLite have no equivalent. graphify's Leiden community clustering + multi-format export (vis.js HTML + Obsidian vault + GraphML + Neo4j cypher.txt) have no equivalent. The overlap is real (~20-25%, mostly on basic symbol lookup) but the unique value of each is large — full installation of all three is the correct conclusion.
- **Three operational gates dominate the risk surface.** (1) Serena's `web_dashboard: false` is mandatory when Claude Code is the consumer (issue #898 reproducibly breaks `tools/list`). (2) graphify's `graphify-out/` must be gitignored due to issue #741's 11K-line nondeterministic diffs. (3) codebase-memory-mcp's open segfault on 200+ file repos (issue #340) means Alfred-Dev indexing might crash — recommendation is to attempt, retreat to v0.5.x if needed, and not block other progress on it.
- **The single most important infrastructure decision is the Neo4j second database.** Create `graphify_codebase` alongside the existing graphiti `neo4j` database — Neo4j 4.3+ Community supports unlimited databases on one daemon. This is ~2 minutes of setup that prevents graphify's `Entity`-label MERGE-collision from corrupting graphiti's `jarvis-core` data.
- **Pulse UI integration is asymmetric.** graphify's vis.js → iframe embed (clean, ~2 hr backend wiring). codebase-memory-mcp's 3D viewer → must build wrapped UI (no export API). Serena's dashboard → cannot run during Claude Code; poll JSON endpoints instead. Total UI dashboard work: 16-24 hours.
- **The 4-milestone structure naturally aligns with AC-03 review boundaries.** M1 install+smoke, M2 shared infra wired, M3 Pulse UI tab built, M4 operational glue+docs. Each ships independent value, none blocks the next.

### 2026-05-12 [048f363bf14e]

Investigating L1's deep-link target surfaced another schema question: `ReviewPage` (1842 LOC) doesn't currently support `?decision_id=N` filtering — it has internal filter state but doesn't read URL params on mount, and reviews are task-centric (no `decision_id` field on `Review`). Adding deep-link support would mean ~30-50 LOC + a data-model audit to confirm decision↔review linkage exists.

Combined with L3's missing `/jobs/:id` route, that's two of the five cross-mode buttons with ratification debt. The remaining three (L2, L4, L5) likely have similar nuance.

Stopping core M3 work here is the right call — the load-bearing taxonomy + cleanup is done. Cross-mode buttons deserve their own ratification pass before code. Running mechanical verify on what's shipped, then surfacing for Sir's visual-validate gate + cross-mode-button scope decision.

### 2026-05-12 [732088081e0c]

Tracing the approval-count data path surfaced a pre-existing architectural quirk worth flagging: the sidebar badge count comes from `dashboard/server/services/nexus-db.ts:getPendingApprovals` which queries `getFilteredTasks({ label: 'waiting:david', status: 'open' })` and only counts those that ALSO have `question`, `needs-input`, or `pipeline:needs-approval`. So `waiting:david` is the load-bearing label — `pipeline:needs-approval` alone won't fire the sidebar badge.

This is M3-orthogonal (it's not a regression I introduced) but means the test task needs BOTH labels to exercise the full path: `pipeline:needs-approval` → `?board=approvals` taxonomy + `waiting:david` → sidebar badge count.

### 2026-05-12 [228f2a0f1e4b]

Architectural note about pulse_dev's task lifecycle: the Pulse API has no DELETE endpoint for tasks — only `/labels/{label}` deletion. Closing a task is an API-supported operation (POST `/tasks/{id}/close`), but DELETE-from-tasks requires direct SQL. The asymmetry makes sense — Pulse is designed around an event-sourced task lifecycle where "closed" is a terminal state and deletion is reserved for dev/admin cleanup. The related observability tables (`pulse.audit_log`, `pulse.cost_events`, `pulse.decision_events`) don't have FK constraints back to `tasks(id)`, which is why deletion was safe but also why orphaned rows in those tables remain (they reference the now-deleted task_ids). For prod, this would be a data-integrity concern; for dev pre-M3-validate, it's acceptable noise.

### 2026-05-12 [e21dceb0b02a]

This M3 hit three classifier layers in the same codebase — and aligning them surfaced an architectural pattern worth noting:

1. **Frontend `classifyTask`** (`dashboard/frontend/src/lib/board.ts`) — already M3-D2 from prior session
2. **Server `classifyTask`** (`dashboard/server/routes/stats.ts`) — fixed today; **had a code comment "Must match frontend lib/board.ts classifyTask exactly"** that wasn't being enforced
3. **Badge taxonomy `BLOCKED_REASONS`** (`dashboard/frontend/src/lib/labels.ts`) — naturally ordered correctly via label-array iteration

The server's drift went unnoticed because there's no test asserting the two classifiers agree. A future hardening play: a single-file `classify-task.ts` in `dashboard/shared/` that both frontend and server import from, eliminating the drift surface entirely. That's a P2 refactor, not M3 scope — but flagging it for the F-bucket alongside F-1/F-2/F-4.

# Insights Archive — 2026-05-28
# Rotated: 2026-05-28T20:00:18Z (4 entries)

### 2026-05-12 [4a8daa6b193a]

The observation revealed **two failures in one shot**, not just F-1:
1. **F-1 confirmed**: T1 (with `pipeline:needs-approval` and `blocked:no`) auto-advanced from `staging:wait` through `evaluated:done` to `queued:done`. The approval label did zero work.
2. **F-5 newly surfaced**: T1's `blocked:no` got **flipped to `blocked:yes`** by the executor mid-cycle. Combined with the same outcome for T2 and T3, this suggests the executor is auto-blocking ALL three at the claim step (likely due to dispatcher.status="unknown" or absent persona). So tasks get advanced into `queued:done` but never reach `active:running` because executor refuses to actually claim them.

So F-1 enforcement is missing, AND there's a separate "auto-block-on-claim-failure" behavior that creates noise. Both belong in the same plan-of-record.

### 2026-05-12 [b4010303af48]

The planning-hygiene rule has a non-obvious structural consequence: when F-numbers (or any cross-cutting IDs) live in audit docs, those docs become the AUTHORITATIVE source for "what F-N means right now." Queue entries elsewhere should reference the audit doc by path + section, NOT redefine the meaning. I hit a namespace collision in this consolidation: the workstream-arch already had its own F-1/F-2 entries (Pulse/Nexus boundary leaks from the 2026-05-05 audit), distinct from the M3-audit F-1/F-2. Resolved by explicit cross-references like "M3-audit Appendix A §F-1" in the workstream-arch entry. This is a generalizable pattern: when multiple audit docs spawn F-numbers, refer to them by `<audit-name> §F-N` to avoid collisions.

Saved as feedback memory `feedback_planning_doc_discipline.md` — indexed in MEMORY.md so future sessions inherit the rule rather than re-learning it.

### 2026-05-12 [71db81a49fc5]

The qwen3:8b compressor pulled "Nexus-Sync Supplant" as Current Task from 2026-05-04 — same compressor-extrapolation failure mode I logged at `self-corrections.md` 2026-05-06. Scratchpad cross-check is the canonical guard against this; without it I'd have wandered back to 8-day-old work. Pattern flag: low-tier LLM compressors read commit cadence as forward momentum and lose reframe/decision-point turns at session boundaries.

### 2026-05-12 [2eb57ce0b49d]

Two pattern flags worth filing for future sessions:
1. **Always rev-count `main..<branch>` before PR assembly** even if conversational framing implies a smaller scope. The "5 commits" framing was the push-range this session, not the PR-range. Conflating "what was pushed" with "what's in a PR" is a structural failure mode — `git push` ranges and PR ranges are different units of work. Future-Jarvis: when the user says "PR assembly", treat `gh pr create` as a high-blast-radius action and verify scope before clicking.
2. **`cd` persists across Bash tool calls**, contrary to my mental model that each call is a fresh shell. The `cd /Users/nathanielcannon/Claude/Alfred-Dev` for `gh pr create` leaked into the next git command and caused a "pathspec did not match" error. Defensive move: prefer `git -C <abs-path>` or chained `cd <abs> && <cmd>` to keep cwd containment per Bash-call. This is the second time this has bitten me in recent sessions — should log to self-corrections.

# Insights Archive — 2026-05-28
# Rotated: 2026-05-28T20:05:10Z (1 entries)

### 2026-05-12 [70097efb48d2]

The current board is **not idle Nexus cron traffic** — it's the M3 validation rig's complete decomposition lineage. T1/T2/T3 (the closed parents) spawned 4 children each via v2 pipeline decomposition between the earlier SIGCONT (15:42Z) and re-stop. This is itself an unexpected F-1 manifestation: not only did the parents auto-advance through staging→queued, they **also triggered child-task creation** by the dispatcher. The approval gate failed at *two* layers, not just one.

Also notable in the decision trail: 2 `persona:reviewer review_outcome=passed` decisions — these are REO B1 (`086f08d`) firing in vivo. First time that wire's been exercised on dev data outside the smoke harness. Both reviewer decisions hit `passed` on the path that fed `system:diagnose` failure-mode analysis — so the persona-decision fanout chain works end-to-end.

# Insights Archive — 2026-05-28
# Rotated: 2026-05-28T23:40:18Z (4 entries)

### 2026-05-12 [7997affeb488]

The queued+blocked stall is **not permanent** — it resolves on a `risk` axis I didn't initially see. T1's lineage (`risk:safe`) processed ALL 4 children to closed+completed:done. T2/T3 lineages (`risk:moderate`) remain stuck. This rewrites the F-1/F-5 framing: the approval-gate enforcement gap *interacts with* risk classification. `risk:safe` auto-approves end-to-end; `risk:moderate` falls into the silent dependency-block that doesn't resolve. So the system has more enforcement-by-risk than I credited earlier — `pipeline:needs-approval` doesn't gate, but `risk:moderate` does (incorrectly, via blocked:yes).

**Also surprising**: 6 new grandchildren spawned from AION-4698f774. The "no dispatcher daemon" finding was wrong — decomposition IS firing, just not as a separate daemon process. It's embedded in `evaluate.py` (PID 30312) or `pipeline-watcher.py`. The dispatcher review (step 3) needs to find where decomposition lives in v2.

### 2026-05-12 [82969aef5091]

Your rule has a non-obvious structural consequence: `task-score`, `task-investigator`, `task-executor` — three jobs that the v2 design doc treats as "registered scheduled jobs" — are actually **pipeline-ops on a 20-min cron** under the current registry.yaml. Per your new rule they must be ripped out of dispatcher and replaced with event triggers (e.g., on `task.created` → score; on `auto:candidate` → investigate; on `stage:queue` → execute). That's a significant scope item for D — not just an audit, but a refactor blueprint. I'll lay this out in the audit report.

### 2026-05-12 [5e12a5b84d73]

Grep confirms a structural finding: **auto:candidate / auto:ready are V1-routing labels with ZERO consumers in v2 services** (evaluate.py / executor.py / orchestrate.py / reviewer.py / stage.py / diagnose.py — none reference them). They're consumed only by legacy shell layer (event-watcher.sh, pipeline-watchdog.sh, team-runner.py, registry.yaml jobs). The v2 pipeline drives everything via staging/evaluated/queued/active/completed/blocked dimension labels — auto:* is essentially vestigial in v2.

This means D.6 (`services/investigate.py`) as scoped in the audit would be a **legacy-compat service operating on labels that nothing in v2 actually reads.** Building it parallels the legacy task-investigator's behavior but produces output that no v2 service consumes.

### 2026-05-12 [fc2e62357f20]

**The audit-vs-reality pattern (this turn's biggest technical lesson)**. The Phase D audit doc, written 4 hours earlier from grep + reading patterns, had **5 factual misalignments** with the live codebase, each caught during implementation:

1. `event_type` was bare `created`, not `task.created` (audit speculated the dotted form).
2. event-watcher's existing `is_task_created` handler operated only via the *vestigial* `.beads/events.jsonl` path — no live Pulse-event consumption — so D.7 needed a brand-new polling block, not a "wire-up" of an existing handler.
3. event-watcher launchd labels prefix with `com.aion.nexus-`, not bare `event-watcher` — initial `launchctl list | grep event-watcher` returned empty, falsely suggesting the script wasn't scheduled.
4. `PULSE_API_URL` already contains `/api/v1`; appending `/api/v1/events` produced a double-prefix bug.
5. Bare `+` in URL query strings decodes to space → HTTP 400; silent-fallback `|| echo '{"events":[]}'` masked it as "empty result."

Each course-correction took 5-15 minutes during impl. Cumulative ~1 hour, integrated organically into D.7-D.9. This is the same pattern the 2026-05-06 self-correction (`plan-of-record before investigation locks in misconceptions`) describes. The durable mitigation isn't "write better audits" — it's "budget time for a reality-check pass on audit assumptions during the first implementation hour, and treat the audit as a starting hypothesis rather than ground truth."

**Plan B's saved-effort** was ~3-4 hours from skipping investigate.py. Combined with Plan B's clearer event-driven semantics, total Phase D came in at ~5h actual vs ~3-4d estimate. The audit's "~3-4d" was correctly sized for the audit-default plan; Plan B + the reality-check discipline together cut it down dramatically.

# Insights Archive — 2026-05-28
# Rotated: 2026-05-29T02:50:40Z (3 entries)

### 2026-05-12 [c8abaa10d0b2]

**B2 is a self-imposed policy constraint, not a technical dependency.** That's the load-bearing observation behind any contingency plan. PR #3 controls only what we *publish*; the *code* for Phases B/C/E exists independently and can be developed on whichever branch makes sense. Most of the "blocked" workstreams are blocked by B2's "wait for clean linear history" preference, not by code-level dependency. The contingency plan is therefore mostly about *progressively relaxing B2* as the wait extends — converting policy patience into operational pragmatism on a defined schedule.

**Many "blocked" items aren't truly blocked**: REO Validate is paused for *bundle scope clarity*, not because the validation work is impossible; Watchdog W2 is pure Jarvis-side (launchd liveness probe — no Alfred-Dev surface); Board v2 has no plan-of-record yet, so it's drafting-blocked not review-blocked. Pulling these forward maintains *forward velocity* even while PR #3 sits.

### 2026-05-12 [bdd844ba366d]

**Distinguishing "David updated something" from "David communicated something."** Three files in `Shared_Projects/Status/david/` have a 2026-05-12 timestamp, but all three are **auto-generated**: `nexus-sync-2026-04-recent.md` by the `com.aion.david-nexus-sync-fetch` Jarvis launchd job (every 6h), `projects-summary.md` + `loom-tasks.md` by a Pulse-API auto-generator (frontmatter says "Auto-generated from Pulse API"; the `author: David` field marks *whose* tasks are summarized, not who wrote the file). So the fresh timestamps reflect **Jarvis polling David's data**, not David typing anything. The true signal of David direct communication would be a new entry under `Debriefs/AIFred-Pro/` authored by David, a `Questions/` file with `from: David, to: Archon`, or hand-authored edits to `focus-areas.md` (last touched 2026-04-13).

### 2026-05-12 [c80d6b20db86]

The compressor cut off mid-sentence at "1 par." (parked) in Critical Context — small artifact of qwen3:8b's truncation behavior. More telling: the checkpoint claims the contingency plan is `[TODO]` when it's actually shipped (commit `d760e8c`, scratchpad entry, full tiered plan with trigger dates). This is the same forward-elision failure mode the 2026-05-06 self-correction catalogued — the compressor sees the QUESTION + early DISCUSSION steps and assumes the work is unfinished when the late-turn synthesis is what actually closed it. Scratchpad cross-check correctly identifies the real state.

