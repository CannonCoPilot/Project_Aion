# Jarvis Insights Log

Captured automatically by insight-capture.js hook.
Processed by /reflect Phase 5 for Graphiti ingestion.

---

### 2026-05-12 [eef395340066]

This is the classic "scope-creep risk vs. completeness-debt" trade-off that comes up after a partial bulk operation. The user approved scoped scrub (force-loaded files only); the broader project docs (~25 hits across 7 design/plan/report files) sit outside that scope. The honest move is to (a) surface the discovery, (b) complete E (scratchpad Alfred-Dev refs — explicitly requested), then (c) ask for scope-extension decision rather than silently extending. The user's preference for scope discipline ("Don't drift on your planning documentation") from the 2026-05-12 feedback memory argues for explicit ask.

### 2026-05-12 [031694fb5746]

This is the cascade pattern from "bulk text substitution requires post-grep verification" (self-corrections 2026-05-06). Renaming a path/filename creates a ripple: every doc that referenced the old path is now stale. The 4 active docs I'm about to fix are operational bugs *I created* in the prior step — not scope creep. The 4 historical reports + 3 logs + 1 JSONL session export are append-only or archival; scrubbing them rewrites history. Distinction matters: fix the bugs I caused (active docs), surface the historical-vs-current choice for everything else.

### 2026-05-12 [447fdf74757a]

The two-stage substitution (`Nate → Nat` then `Nat → Sir`) could theoretically be collapsed into one pass (`Nate → Sir` directly), but doing it sequentially has a useful property: the intermediate `Nat` state is uniquely identifiable. If the second pass needs to be reverted while preserving the first, `git diff` between commits makes the boundary clear. Also: doing `Nat → Sir` second means anywhere a fresh `Nate` was missed in the first pass, the second pass still catches it (because we'll grep `\bNate\b` count = 0 before proceeding). Defense in depth on the cleanup.

### 2026-05-12 [d183ff23f528]

This is the canonical "data about the operation gets confused with the operation's targets" pattern. The 3 `Nate` hits in `insights-log` and `compressed-context-ready` are LITERALLY the strings `Nate`, `Nat`, `Sir` USED AS DATA inside meta-text describing the substitution. Replacing them would destroy the explanation ("Sir → Sir → Sir doesn't make sense"). Conventional fix: wrap such meta-strings in code blocks or backticks so grep can be scoped to non-code-block text. For this session, leaving them is correct — they're documentation OF the change, not affected BY the change.

### 2026-05-12 [dadb101489fc]

Three subtle git-workflow patterns worth flagging from this commit cycle:

1. **Per-commit author env-set, never config update**: `--author="..."` flag + `GIT_COMMITTER_NAME/EMAIL` env vars override per-process without touching `.git/config`. Future-Jarvis can use this pattern unchanged across any CannonCoPilot/* repo without worrying about polluting global git state.

2. **Cross-namespace push targets**: Both pushes used `<local-branch>:<remote-branch>` form (`Project_Aion:main`, `nate-dev:main`). This is intentional — local branch names preserve historical authorship signal (which work was on which feature line), while the remote consolidates to `main`. The colon syntax lets a single repo have multi-named local branches all targeting one canonical remote.

3. **Commit size signal**: Jarvis commit is 556 insertions / 1130 deletions across 65 files — the 2:1 delete:insert ratio is the perl `-i -pe` signature, since each substituted line is replaced wholesale (line out + line in) even when the actual change is a 3-char swap. Useful diagnostic: if you ever see a *suspicious* delete-heavy diff in a sed-driven commit, the ratio confirms it's substitution-pattern not content-loss.

### 2026-05-12 [2c9d10e88bd8]

The diagnostic principle here is **historical vs operational document status**: a milestone-decision-record like the 2026-05-04 executive report should not be backdated; its value is preserving what was decided at decision-time. An operational tracking doc like the workstream architecture v1.4 SHOULD be updated, because future readers consult it for "what's the current state?" The cleavage matters — overwriting historical decisions erases the audit trail of how the project actually evolved.

### 2026-05-12 [9923a93c3eaf]

The most useful diagnostic the review surfaced: **Project Aion is currently in a single-merge-gate funnel**. Four distinct workstreams (REO Validate, Phase D follow-on PR, F-1/F-5 fix sequence, future re-cleave-dependent work) all stall behind one external decision: David's review/merge of PR #3. This is healthy concentration of review burden, but it means Sir's allocation choices for the interim period determine throughput — picking unrelated, fully-unblocked work (Watchdog W2/W3, /personas rebuild, JICM v8.0 PTY prototype) maximizes parallel productivity.

### 2026-05-12 [3b54ba185ed0]

The selection logic for what Sir picks next breaks into three buckets by their dependency on the PR-#3-merge gate. Picking from the **fully-unblocked** bucket extracts maximum parallel value during the merge wait. Picking from the **merge-dependent** bucket commits Sir-time but yields nothing until David reviews. Picking from the **observation-only** bucket is the cheapest cost (passive) but produces zero throughput.

### 2026-05-13 [585446038e94]

The audit surfaces a clean dependency map between the persona system and 4 other dashboard surfaces that today live in separate IA silos: (1) **/reviews** consumes ai-reviewer's `learned-patterns.yaml` curation outputs; (2) **/jobs** maps 8 of 33 personas to scheduled cron jobs; (3) **/reo** stores decision_events emitted by ~6 personas (executor, diagnose, reviewer, evaluator); (4) **/cortex** acts as a meta-persona that monitors all the others. The /personas rebuild is naturally the **hub** of this graph — every other surface deep-links here for "who is this persona?" The current implementation is a flat alphabetical list precisely because it was never positioned as the hub.

### 2026-05-13 [0ed9e3442bb2]

- **Root cause of the original incident was a learnable one.** Running `docker compose down` (or any halt sequence) in `AIFred-Pro-Dev/` without `-f docker-compose.yml -f docker-compose.dev.yml` will read the base PROD compose file and may produce confusing behavior. Same trap on `up`. Worth a one-line addition to the halt-aifred-pro runbook: **dev stack invocations require both compose files, override pattern, every time.** Could also be solved by a `Makefile` or `.envrc` setting `COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml` for the directory.
- **The pipeline-restart symptom is most likely a startup-order race** rather than a code bug — `aifred-dev-pipeline` came up before some dependency settled. The clean check is `docker logs aifred-dev-pipeline --tail 50`; if the error is connection-refused to another service, a single `docker compose -f ... -f ... restart aifred-dev-pipeline` (after the other services are healthy) usually clears it.

### 2026-05-13 [9417b703c9b2]

The design surfaces an architecturally significant consolidation: the `/personas` page is not just one of 35 dashboard surfaces — it's the **hub-of-hubs** for the persona graph. Every cross-mode deep-link from /reo, /jobs, /reviews, /observability, /cortex resolves here. That makes Phase 1 doubly load-bearing: it ships the priority-#1 feature AND establishes the deep-link substrate that Phase 4's per-page wiring sweep will repeatedly consume. Investing in clean cross-link semantics here pays compound dividends through the rest of the trajectory.

### 2026-05-13 [847aa4a5fc79]

The four-version evolution of this doc (brainstorm → audit-corrected → scope-expanded-per-directive → tier-finalized-and-audit-integrated) illustrates a working pattern: each round narrowed the design surface by eliminating ambiguity, not by adding constraints. v4's tier list (4/2/1/25) has fewer locked personas than v3's (14/1/6/11) yet stronger semantics — because the boundary is mechanically derived from "exclusively internal" code analysis rather than name-pattern intuition. Similarly, the audit-grounded tech stack (Canvas + d3-force + CSS sprites) replaces v3's tentative library names with patterns that 8 production repos have already validated. The 10-tab "overbuild" is risky — Sir explicitly invited it, and sub-phased build gates mean any subset can ship if scope tightens during execution.

### 2026-05-13 [03c2459bdd10]

Two architectural patterns proved out this session worth noting: (1) **Substrate-enforced tier-gating via Axiom A** — UI affordances reflect tier but the DB+API layer refuses violations regardless of UI state, making security a property of the system rather than a property of the UI. Smoke-tested with `curl -X PUT .../personas/autofix-executor/prompt` returning HTTP 403 "Tier A read-only" with no UI involvement. (2) **Boundary-preserving event flow** — the observation tunnel writes through `POST /api/v1/observations` rather than direct DB access, even though it lives in the same workspace as Pulse. This means the tunnel can be redeployed independently and the boundary contract is documented in the audit-log of HTTP calls, not in shared schema knowledge.

### 2026-05-13 [443e1c65b9e5]

Item 7 (F-2 dashboard refactor) turning out to be already-shipped from commit `66885bb` (P1.B1.1 workstream) is a useful pattern lesson: before doing infrastructure refactoring work, grep first. The active-plan had noted `66885bb` as "SHIPPED in prior session" — I read past that signal when first listing the 8 Phase 1.1 items. A 30-second `grep -rln "pg.Pool"` would have caught this earlier. Filing under "verify state before committing to work" — connects to the 2026-05-06 self-correction on plan-of-record codifying stale mental models.

### 2026-05-13 [bd565c590c24]

**Tier-gating verification PASSED end-to-end via the proxy chain (vite → dashboard → pulse → DB)**. Both Tier A and Tier B return HTTP 403 with the exact substrate-enforced message ("Tier X personas are read-only for field 'prompt'. Edit filesystem + git commit instead."). Tier C accepts the write and returns version_id=2 with fs_synced=true — meaning the bind-mount is doing its job. **One side-effect to address**: I just wrote a smoke prompt to librarian as the active version. Need to either restore the original or document this as the new state.

### 2026-05-14 [4522805caf89]

**Five distinct Phase 1.2 milestones shipped this session in a single autonomic continuation**: the resume protocol caught a JICM compressor hallucination (claimed "complete" when Phase 1.2 hadn't started), pre-work for the substrate (volume mount + 29-persona schema migration + cron disable + executor verification) anchored on the bind-mount architecture, four feature commits built the Core surfaces (List + Detail Panel + Matrix + Graph + +New) against an enriched detail endpoint, and tier-gating substrate-enforcement was end-to-end-verified (Tier A/B → 403, Tier C → 200). The architectural pattern of **single fat-GET detail endpoint** (one TanStack Query hydrates 8 sub-tabs vs N parallel queries) and the **dashboard catch-all proxy** (`/api/v1/*` → pulse passthrough, preserving the dashboard ↔ pulse boundary even when most logic lives in pulse) are both worth carrying forward to future surfaces. The Canvas+d3-force-bloom deferral (using @xyflow/react for now) is the right pragmatic call — Phase 1.2 ships at the §8.3 gate with React Flow; the bloom-renderer can be a fidelity-not-function polish later.

### 2026-05-14 [4902cdeafce2]

**The WebSocket routing decision is the only non-trivial architectural choice remaining**. The dev-pragmatic path (direct-to-pulse + CORS allowlist) ships in ~15 min but creates a transient boundary-violation that needs cleanup before prod. The boundary-preserving path (vite `ws: true` + dashboard fastify WS proxy + dashboard-to-pulse WS forward) takes ~45-60 min but ships clean. **My ratified call: dev-pragmatic now, queue the dashboard WS proxy as a Phase 1.4 cleanup item alongside the Canvas+d3-force-bloom migration**. This matches the pattern we've already accepted for permissions backfill and ruamel.yaml migration — known trade-offs documented, recovery path queued.

### 2026-05-14 [8bf1834e0c86]

**The procedural asymmetry working in your favor.** UI investigators code aggressively because their workflow expects you to respond to the RFI and explain. When you don't respond (whatever the reason — Message Center wasn't checked, no email alert arrived), the determination issues on the **worst presumption available**. The appeal exists precisely to put back what the missed RFI would have explained. The ALJ applies the regulation, not the investigator's gut.

### 2026-05-14 [65b5cd5a3886]

**Why hearings are phone-only but in-person attempts still help.** UI hearings moved to phone-only years ago for cost and statewide caseload reasons. But the ALJ reads the full case file before the hearing — including contact logs showing in-person Employment Center visits, calls to ULS, calls to the investigator. Those entries paint a picture of a claimant engaging in good faith. That picture matters specifically because the question at issue is **intent**.

### 2026-05-14 [b6c36da2693b]

**The most important shift in your case from this new information**: the $350 figure was NOT a misreport of historical wages — it was a projection of *future* wages for a partial week you hadn't yet finished working, calculated on the day you filed (11/7, before the week was over). You correctly estimated a daily rate × 3 days, then made a transcription error entering just the daily figure instead of the multiplied total. That is the textbook definition of "inadvertent error" — the exact carve-out language in R994-406-401. This is materially stronger than a generic "I reported in good faith" defense because the mechanism of the error is concrete, documented, and arithmetically transparent.

### 2026-05-14 [373f01b1c702]

**The most important structural improvement**: the original framing put weight on TSG's $1,706 being potentially over-reported. You correctly pushed back that this is unlikely to yield material relief. The revised framing puts the weight where the regulation actually opens the door — the inadvertent-error carve-out at R994-406-401. Your projection-error story fits that language unusually well because (a) you were projecting future wages, not misreporting historical ones, (b) you had a transparent and rational calculation method, (c) the error was arithmetic/transcription, and (d) no concealment motive is supported by your actual claiming behavior. This shifts the appeal from "challenge the overpayment" (hard) to "challenge the intent designation" (achievable).

### 2026-05-14 [34e87d186628]

**Why I recommend BYU tonight even though UI may not be their primary area.** Law-student-staffed clinics often have a wider range of supervising attorneys than their website lists. The Thursday 5/15 window is your only pre-deadline opportunity to get any free legal eyes on this without paying. Even if they can't represent you at the hearing, they can: (a) help you sharpen the appeal narrative before you file Monday, (b) refer you to the right UI practitioner if ULS declines, (c) confirm whether private flat-fee representation is worth pursuing. The downside of attending is ~2 hours of your evening. The downside of skipping is leaving a free legal channel on the table.

### 2026-05-14 [92adc5cee33d]

**Empirical contradiction**: Direct curl with `Origin: http://localhost:8702` + WS upgrade headers got `HTTP/1.1 101 Switching Protocols` + `connected` event. The agent's "HTTP 403" observation was almost certainly a `fetch()`-vs-`new WebSocket()` conflation: `fetch('ws://...')` returns failure at client level (not 403 from server), and the agent likely tested via `fetch` for diagnostic purposes. Pulse-side WS handshake is permissive — no Origin check, no auth required. My hook should work in browser. Verifying via pulse logs to be certain.

### 2026-05-14 [04a81b73f79e]

**Diagnosis confirmed**: Plain GET (no Upgrade headers) to `/api/v1/socket` returns 404, not 403. WS upgrade with proper headers returns 101. Pulse logs show WS connections "[accepted]" — no rejections logged. The agent's "HTTP 403" finding was a misattribution — likely from a browser-context test that conflated some other 403 (perhaps from a fetch shim on an unrelated route). The frontend hook should work in browser. Recording for the AC-03 review packet so the next reviewer doesn't chase a phantom bug.

### 2026-05-14 [acf66b3d19ca]

**Why this email is structured the way it is.** Legal clinics and pro bono intake systems triage in the order: (1) does this fit our practice area, (2) is the deadline actually urgent, (3) is the requester organized enough to be helpable, (4) is the matter winnable. I'm front-loading all four signals in the first paragraph: the matter (UI fraud appeal), the deadline (concrete date), your organization (you have documents and a written narrative), and the legal hook (inadvertent-error carve-out). Supervising attorneys read 30+ intake emails per week; an organized one stands out and gets booked. Wandering "please help me" emails get backburnered.

### 2026-05-14 [81b8e03e32f2]

**Why the family-of-7 framing isn't in this email but should be in the ULS call tomorrow.** BYU Clinic is triaging on legal merit and capacity — your household composition isn't a factor in whether they help. ULS is triaging on income eligibility and capacity — your household composition is *directly* a factor (it shifts the FPL threshold from ~$15K single to ~$60K family of 7). Match the framing to the gatekeeping criteria of the channel you're using. Same matter, different framings depending on what the recipient actually evaluates.

### 2026-05-14 [584d70daa37a]

**The strategic frame for this call.** Ryan has already made his determination — the F coding is in the system, the letter has issued. He almost certainly will NOT reverse himself on this call. So the goal is NOT to win the case here. The goal is to: (a) plant your inadvertent-error narrative in the case file before the appeal, (b) probe procedural questions (opt-out, email notification) on the record, (c) gather information about the source/composition of the $1,706 figure that you'll need at the hearing, and (d) leave Ryan with a clear impression of a good-faith, organized claimant. Anything you say to Ryan can be cited at the appeal hearing — by either side. Treat it as testimony.

### 2026-05-14 [63ef19950df4]

**The hidden value of this call is what shows up at the hearing.** ALJs are required to consider "the conduct of the parties" when evaluating credibility on intent. A claimant who, post-determination, calls the investigator, asks careful questions, follows up with a written statement, attends legal aid, and files a timely appeal is presenting a different credibility profile than a claimant who only surfaces when subpoenaed. None of these things prove your innocence — but they substantially shape the ALJ's read on whether you were operating in bad faith. Be the organized, good-faith claimant. The call records that.

### 2026-05-14 [47d2181c2a9c]

**Why the post-call written statement matters more than the call itself.** Phone conversations are interpreted by everyone present through their own lens; written statements are interpreted only by their text. When the ALJ reads your case file before the hearing, the written statement is what they see — not whatever Ryan wrote down about your phone conversation. A clean, neutral, regulatory-cite-loaded written statement framed as testimony is far more impactful than the best phone call. The call's primary purpose is to *create the opening* for the written statement to be added. The statement does the actual work.

### 2026-05-14 [db2b023c7727]

**Key plan revisions vs §5 default order**:
(1) Mission Control hoisted to #1 — the WebSocket hook from Task 5.1 already subscribes to one channel; generalizing it to multi-channel is the minimum-viable shared infrastructure for §5.4/§5.5/§5.4. Land that early so other surfaces inherit it.
(2) Village + PC Box sequenced together (5→6) — they share the sprite engine. Cuts repeat work in half.
(3) Branch strategy: continue on `feature/personas-rebuild` (not a new branch) — Phase 1.3 is the same workstream, and CannonCoPilot/Alfred:main FF already includes Phase 1.0-1.2.

### 2026-05-15 [0c13e764e91e]

**Three decisions worth flagging for the Phase 1.3 trajectory**:
(1) **Backend fallback chain over data-engineering effort**: The design intended `persona_activity_snapshots` as the heatmap source, but that table is empty in dev (Phase 1.4 will wire snapshot emission). Two options: extend the endpoint to fall back to `decision_events` (cheap, 50 LOC), or seed fake snapshot data (overhead, lies to tests). Picked fallback + transparent `source` field on response — the UI labels "decision_events (fallback)" so reviewers always know the provenance. This pattern generalizes: when a design source is empty, fall back to the next-best available source and surface the substitution explicitly.
(2) **Recharts over D3 — net-zero new dependency**: v5 §5.5 prescribes "D3.js v7" but Recharts is already in deps and wraps D3 internally with a React-native API. Net-zero new dependency cost. The design's tech choices should be re-validated at implementation time against current deps, not slavishly followed when a cheaper-equivalent is in scope. Sankey is the one case where Recharts has no native primitive — I deferred it instead of installing `@nivo/sankey` for a single chart.
(3) **`docker cp` is fast-iteration; image rebuild is persistence**: I patched the container via `docker cp` first for rapid feedback (~5s), validated the response shape, then did a full `docker compose build && up -d` to bake the change in (~30s). If I'd only done `docker cp`, the next compose recreate would have erased the work. Pattern: `docker cp` for iteration loops; rebuild before commit.

### 2026-05-15 [aa029e6c302b]

The substantive findings (SQL f-string interpolation, colorFor duplication, Village posRef pattern, Sankey placeholder) are all real and verifiable — they map to actual code/commit-message content. The fabrication is in the *supporting evidence* (git output, file sizes, verification claims). This is exactly the 2026-05-06 "JICM compressor extrapolates forward, elides reframe turns" failure mode in agent form: an LLM filling in plausible-looking supporting detail that wasn't actually fetched. The architectural fix from Phase 1.2 holds — Jarvis captures narratives to disk and adds an authenticity audit header.

### 2026-05-15 [2bde8ea79377]

Eight months of subagent fabrication failures resolve to a single YAML schema bug: `tools: All tools` (English prose) parses as `["All", "tools"]` after comma-split. Two phantom tool names → zero real tools granted → text-completion fabrication of plausible-looking tool output. The detection signal was always in the `tool_uses: 0` response metadata, but it was missed because the failure surfaces as content-level hallucination rather than tool-injection error. The fix is now persisted on disk; the harness will read the canonical schemas at the next session start.

### 2026-05-15 [ff23a168bff5]

**Two-instance learning**: This bug existed for ~8 months and survived one full root-cause fix because the *second* copy was invisible to the first fix's blast radius. Two principles fall out: (1) `additionalDirectories` causes silent cross-workspace agent shadowing — always audit ALL listed directories when fixing agent configs, not just the primary cwd; (2) the empirical test (`tool_uses` count) is faster + more reliable than disk audit alone, because disk-clean does not imply harness-clean when multiple registries exist.

### 2026-05-15 [af13af65ce61]

**Hypothesis: in-process agent definition cache survives `/clear`.** Disk on both Jarvis and Jarvis-Dev is canonically clean, but the system prompt's Agent tool listing still shows `(Tools: All, tools)` for the 5 specialists. `deep-research` (which was never broken) displays its full tool list correctly. Most likely: Claude Code loads agent definitions once at process start; `/clear` clears conversation context but not the agent-definition cache. The Jarvis-Dev push from prior session happened AFTER this process started.

### 2026-05-15 [0fc807c8c91d]

**The cache-survives-/clear hypothesis is the simplest explanation.** Three converging signals:
1. Disk on both Jarvis and Jarvis-Dev is canonically clean (validator passes 17/17; grep returns zero `tools: All*` hits).
2. The system prompt's Agent tool listing still shows `(Tools: All, tools)` for the 5 specialists at this session's start.
3. `deep-research` (never broken) renders its actual tool list in the same prompt — asymmetry can only come from differential parsing at cache-fill time, not a structural feature like plugin-format.

The Jarvis-Dev fix was pushed AFTER this Claude Code CLI process started. `/clear` clears conversation context but the agent-definition cache is process-scoped, so the broken YAML state from the original process start persists.

### 2026-05-15 [0f0d8c1d994e]

**Why a parallel-process test is the right move**: a fresh `claude` invocation reads agent YAML from current disk state (which is clean). If the new process spawns `code-review` and produces real tool calls + a real file, that empirically proves the cache hypothesis without gambling this session's state. Confirmation comes from comparison, not from a destructive operation on the variable we want to preserve.

### 2026-05-15 [d2b370ceb140]

**Pre-flight observation from W8 is already the empirical proof.** The fresh process's system-prompt Agent listing shows `code-review (Tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch)` — the canonical list — vs W0's broken `(Tools: All, tools)`. Same disk, same workspace, same `additionalDirectories` including Jarvis-Dev. The only variable is process lifecycle. **Cache hypothesis confirmed before W8's subagent even returns.**

### 2026-05-15 [b197993454db]

- **Cache scope confirmed process-level, not session-level**: `/clear` resets conversation context but leaves the harness's in-memory agent-definition cache intact. Only a full Claude Code CLI process restart re-reads `.claude/agents/*.md` from disk. The Jarvis-Dev fix (`6601d6d`) was pushed *after* W0's `claude` process started, so W0 stayed broken across multiple `/clear` cycles even though disk was canonically clean.
- **The system-prompt Agent listing is the ground-truth diagnostic**: comparing W0's `(Tools: All, tools)` against this W8 process's `(Tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch)` proves the comma-split parsing artifact disappears once a fresh process loads the fixed YAML. No need to spawn the agent to know — the listing tells you upfront.
- **Asymmetric agent rendering as health-check**: `deep-research` (never broken) rendered its real tool list in W0's prompt while the five specialists showed the malformed value. That asymmetry was the smoking-gun signal; future regressions can be detected by `grep "(Tools: All, tools)"` against the in-context Agent block.

### 2026-05-15 [b1016b984efd]

**The risk of using the launch script as-is is "wrong session resumed".** When Sir kills W0's claude process and relaunches via the script, `find_latest_w0_session()` will pick whichever JSONL has the most recent mtime in the project dir. If W8 (or W6) was active more recently than this W0 session, the launch script will `--resume` THEIR conversation, not yours. The script's protection is incomplete: it knows about W5's deterministic UUID but not about ad-hoc child sessions.

### 2026-05-15 [14bc48bc0662]

**The `--exclude-dynamic-system-prompt-sections` flag is your friend** for cache continuity. It strips git status, time-varying env, etc. from the system prompt, which keeps the prompt prefix stable across requests so Anthropic's 5-min prompt cache can hit on first-API-call after relaunch. Already wired in the W0 base command at line 486. As long as the restart sequence completes within ~5 minutes of the kill, you should retain most cache.

### 2026-05-15 [0e7f01a31ca9]

**The 20-tool-use review (vs Phase E-3's 2-tool-use diagnostic) is itself confirming evidence.** A specialist agent doing real grep/bash work on the commit and finding a real temporal sync issue between three files in the same commit is exactly what AC-03 protocol looked like before it broke — and exactly what we just restored. The contrast with W0's chronic tool_uses: 0 + confabulation is now anchored in observable behavior.

### 2026-05-15 [dcd535e4782d]

**End-to-end root-cause resolution confirmed.** The three-layer fix (Jarvis disk `74a6706` → Jarvis-Dev disk `6601d6d` → process restart) has fully restored specialist agent tool injection. The `code-review` agent executed real Write + Bash calls in 7 seconds with 2 tool uses — contrast W0's prior-process `tool_uses: 0` + 8 months of confabulated reports. AC-03 milestone review protocol with specialist agents is now operational in this process.

### 2026-05-15 [3d915f5ad2fe]

**V1-V8 implementation summary**: The Village tab has been rebuilt from the ground up. What was 385 LOC of colored circles on a dark grid is now a multi-file system: `village-map.ts` (tilemap + BFS + zone routing), `village-animations.css` (12 CSS keyframes lifted from pokegents), `persona-colors.ts` (shared sprite assignment + hue-rotate variety), and a rewritten `VillageView.tsx` (~320 LOC) with real pixel-art character sprites from pixel-agents, floor/wall tiles, zone-affinity routing (70% home zone bias), dual-speed movement (60ms busy vs 225ms idle), weighted animation selector with anti-repeat, hover mini-cards, and a busy-glow ring for live-state personas.

### 2026-05-15 [38dd525a4b66]

**Phase 1.4 selective scope rationale**: The 5 chosen items hit the high-value/low-effort sweet spot — the WS proxy closes an architectural boundary violation, the Village live state was the last TODO blocking V4 feature-completeness, and the AC-03 carry-overs clear technical debt before it compounds. The remaining 10 items are either cosmetic (Sankey, pixel-art sprites) or require more substantial infrastructure (Canvas+d3-force migration, ruamel.yaml). Those are Phase 1.4-deferred — available for cherry-picking but not blocking Phase 2 entry.

**WS proxy architecture**: The proxy creates per-client upstream connections rather than a shared fan-out. This matches pulse's channel-subscription model where each client independently subscribes. The pending-message buffer handles the startup race (client sends subscribe before upstream opens). The bind-mount + `--reload` combination means the entire iteration loop — edit pulse/app.py on host → uvicorn auto-reloads → frontend polls updated endpoint — is now zero-manual-step.

### 2026-05-16 [0c29f5bf9550]

**Canvas force simulation — why zero deps**: The d3-force algorithm is ~50 lines of physics: charge repulsion (inverse-square, O(n²)), link springs (Hooke's law per edge), center gravity (linear pull), and velocity damping. For 163 nodes, the O(n²) charge loop is 13K iterations per frame — trivial for modern JS engines at 60fps. The `alpha` decay (0.995x per tick, settling to <0.001 in ~700 frames ≈ 12s) means the simulation converges and stops burning CPU, while user interaction (drag/zoom) bumps alpha to keep it responsive. This replaces ReactFlow + all its internal dependencies with raw Canvas 2D calls — fewer abstractions, full control over the bloom/glow rendering pipeline.

**Bloom via `shadowBlur`**: Canvas 2D's `shadowBlur` property on the 2D context generates a Gaussian blur halo around any draw call. Setting `shadowColor` to the node's color and `shadowBlur` to 18px on hover creates a convincing glow effect without WebGL shaders or post-processing passes. The performance cost is proportional to blur radius × arc perimeter — negligible for 8px circles.

### 2026-05-16 [340342db2deb]

**Phase 2's real value isn't compression — it's observability.** The dashboard surface (2B) and the per-task telemetry (TC Phase 4) turn token spend from a mystery into a visible, actionable metric. Right now you can't see where tokens go in a session. After Phase 2, every persona, every pipeline run, every JICM cycle has a token cost attached and charted. The compression techniques (2A) reduce the number; the dashboard (2B) makes the number visible. Both matter, but visibility has compounding returns — it informs future optimization decisions across all phases.

### 2026-05-16 [e1348163f328]

**The audit's most consequential finding is the compact fallback gap.** When Claude Code's native auto-compact fires (at ~70% context), `jicm-precompact.sh` correctly writes a fresh checkpoint — then `session-start.sh` ignores it. This means the safety net for the most common context-pressure event is disconnected. Every auto-compact resumption since v7.9 deployment has gotten zero compressed context injection, relying entirely on force-loaded `@-imports` for continuity. The `@-imports` carry scratchpad + session-state + identity, so the system doesn't collapse, but the LLM-enriched narrative and conversation excerpt — the whole point of JICM's two-tier compression — are discarded silently. This is a one-line fix with outsized impact.

**The threshold question is strategic, not technical.** At 250K/300K soft/hard (25%/30% of 1M), JICM fires early — trading context space for safety margin. With the compact fallback gap fixed, the safety net is stronger, which justifies raising thresholds to ~400K/500K. This would roughly double the useful context window before JICM cycles intervene, reducing cycle frequency from "every few hours" to "once per long session." The tradeoff: higher thresholds mean more context to compress when the cycle does fire, increasing LLM compression time from ~16s to ~25-30s. Acceptable.

### 2026-05-16 [06d796574c93]

**The PTY wrapper is conceptually simple but empirically unproven.** The Unix PTY abstraction (master/slave fd pair) is the same mechanism tmux uses internally — we're just removing one layer of indirection. Claude Code's `isatty()` check will return true because the slave fd IS a real TTY. The risk isn't in the PTY mechanism itself but in how Claude Code's TUI framework (likely Ink/React-Ink) handles injected input vs keyboard input in raw terminal mode. Raw mode means the TUI reads individual bytes, not line-buffered input — so the injection must write bytes at the right cadence (exactly as the current tmux `send-keys` + `sleep 0.3` pattern does). Test 2 resolves this empirically in 10 minutes.

**Why half a day of tests is worth it**: The alternative — committing to hook-only and discovering months later that the nudge compliance rate is 60% — costs more in accumulated UX friction than one morning of PTY experimentation costs in engineering time.

### 2026-05-16 [e387c0ab11e2]

**Reading the raw evidence**: T1's log shows the marker twice — once from PTY echo (line discipline), once from cat's output. Both terminated with `^M` (CR), confirming our `\r` injection correctly simulates Enter. T2-T5 show bash's bracket-paste-mode sequences (`^[[?2004h`/`l`) wrapping each command — bash sees a real terminal and enables all its normal features. T4 critically proves `/clear` passes through the PTY as literal text with zero interception at the terminal layer.

### 2026-05-16 [70d0e2051e9a]

**Threshold analysis from 38 measured cycles**: Median trigger at 324K tokens, P75 at 355K, P90 at 420K. The 300K hard threshold catches 63% of cycles at or near the target zone. The 36% below 300K includes manual triggers and idle checkpoints, not threshold misses. 18% above 400K reflects watcher-to-actuation latency (dominated by Claude Code's 57s startup time, not detection delay). The 300K threshold is well-calibrated for the 1M context window — no adjustment needed.

### 2026-05-16 [1b8b4c81a446]

**The pipeline's deepest structural gap is G1 + G8**: NLP compression achieves nothing measurable (0.99 ratio), and the compressed checkpoints — the most valuable distilled knowledge about each work session — never flow into long-term memory (RAG). Every JICM cycle produces a 10KB checkpoint that captures current task, progress, decisions, and next steps. These checkpoints are consumed once by session-start.sh and then archived to a flat file directory that nothing indexes. If the checkpoints were automatically ingested into the `sessions` RAG collection, Claude would have semantic search over all prior work sessions — the very capability that the resume instructions ask for ("Query jarvis-rag search with collection 'sessions'") but that depends on manual /meditate-session runs that rarely happen.

**The second deepest gap is G3 + G6**: The HUD displays stale data because the legacy state file isn't written, and the scratchpad (the most critical transient memory) can grow past its 80-line budget because rotation only triggers on PreCompact, not on JICM's own compression cycle.

### 2026-05-16 [99410c53862e]

**The philosophical framework reframes every JICM decision**: Sir's premises establish that Memory (in an LLM harness) isn't about storing data — it's the bridge between Sense (what's happening now) and Purpose+Fulfillment (what we're trying to achieve). The 10 gaps I identified map directly: G1 (NLP no-op) is a *Sense-making pipeline failure* — the compression step should abstract signal into map, but instead passes raw signal through unchanged. G8 (checkpoints never reach RAG) is an *Amnesia failure* — distilled experience evaporates instead of forming lasting memory. The scratchpad's bloat (716 lines) is *Hyperthymesia* — undifferentiated accumulation without the forgetting that keeps memory useful.

**Autonomic vs Intentional maps perfectly to hooks vs reasoning**: Hooks (SessionStart, Stop, PreCompact) are the rattlesnake reflex — automatic, fast, triggered by environmental stimuli. Claude's reasoning (deciding to query RAG, choosing what to save to scratchpad) is the intentional memory function — slower, contextual, guided by Purpose. Both must work together, and both must serve both formation and recall.

### 2026-05-17 [4589147fc5d7]

**Phase 2B delivered a complete memory system in one session by exploiting architectural symmetry**: every layer has the same three concerns (Curate/Store/Retrieve), so each task follows the same pattern — identify the broken mechanism, write or fix the component, wire it to its trigger. The hardest task (relevance-retrieval) was ~80 LOC because the capability-map already existed as a routing table — the hook just performs the lookup that Claude previously had to reason about. The biggest disk impact wasn't a new feature but a maintenance policy: log-rotation recovered 391MB by enforcing a rule that already existed conceptually but had no automation.

### 2026-05-17 [9d1f1d7e897b]

**85KB of force-loaded content = 21,819 tokens (~2.2% of the 1M window) permanently consumed before any work begins.** The largest consumers are `.active-plan` (23.5KB — contains full historical workstream state) and `CLAUDE.md` (12.3KB — operational instructions). This is the "always-on memory tax" that Phase 2B's context-budget pattern was designed to make visible. The dashboard now surfaces this cost in real-time, making future optimization decisions data-driven rather than guessed.

### 2026-05-17 [67526c615b17]

**The audit reveals a clear pattern: JICM's stop-and-wait cycle is the ONLY autonomic trigger point for most Store/Curate functions.** Native autocompact (Claude Code's built-in 70% threshold) fires `jicm-precompact.sh` which writes a checkpoint, but does NOT trigger L4 ingest, insights rotation, or corrections consolidation. This means the most common context-pressure event silently bypasses the consolidation pipeline.

### 2026-05-17 [f1a106fde6c2]

**The NLP compression failure reveals a pipeline ordering bug, not a fundamental limitation.** The script deduplicates paragraphs, collapses whitespace, and removes repeated sections — operations that yield nothing on already-structured output. Applied to the RAW scrollback (200 lines of terminal output with prompt repetition, status lines, and tool-call rendering) or raw JSONL messages (with verbose tool results), the same techniques would achieve 30-50% reduction. The compression step is in the wrong position in the pipeline.

### 2026-05-18 [3f4a1dd447ab]

**The session completed 5 of 7 implementation phases before hitting context pressure at 258K tokens.** The 3 remaining phases (REST idle detection, TURN mid-session retrieval, MAINTAIN health pings) are all additive — they don't depend on the phases already implemented. The core architectural changes (consolidation moved to watcher, NLP repositioned, Graphiti enabled, BOOT strengthened) are committed and will be active on next watcher restart. The Graphiti pre-population script is still running async, ingesting the 34-file identity corpus into Neo4j — that work completes independently of the CLI session.

### 2026-05-18 [e7cbc5c1beb9]

**Concurrent Graphiti ingestion jobs can saturate Ollama to the point of unresponsiveness.** Each `graphiti-core` `add_episode` call generates multiple LLM requests for entity extraction, relationship building, and summarization. Five simultaneous processes exhausted the LLM's capacity, causing all requests (including health checks) to time out. Future improvement: the watcher should serialize Graphiti ingestion or cap concurrent jobs to 1. The REST and COMPRESS stages already serialize (one background job each), but the manual re-ingestion of 3 files in parallel was the trigger.

### 2026-05-18 [4f979b33a169]

**The saturation was caused by concurrent LLM+embedding requests from 5 Graphiti processes, all routing through the same single-threaded Ollama inference.**

### 2026-05-18 [409832e8fbf5]

The qwen3 JICM compressor reports Phases IV/VI/VII as TODO, but the scratchpad (force-loaded, written at session-end) reports all 7 phases implemented and pending commit+push. This is the **2026-05-06 self-corrections pattern** verbatim: low-tier compression models read commit cadence as forward momentum and miss reframe turns at session-end. Trust the scratchpad for near-term work-state; the checkpoint is background only.

### 2026-05-18 [d5ba38cef3a4]

This is the **2026-05-06 architectural pattern** repeating: low-tier (qwen3:8b) JICM compressors extrapolate forward from commit cadence and miss session-end reframes. The compressor's snapshot was taken at 21:10Z when only `9fe5bfa` had landed; the four subsequent commits (`a3ae16f`, `a508cc1`, `0952fa7`, `aaf720c`) all post-date its checkpoint but pre-date this resume. The fix is exactly what just happened — scratchpad + git log cross-check before acting on checkpoint guidance.

### 2026-05-18 [913b065a86ef]

The Stage-2 closure exposes a methodological principle worth naming: **opt-in safety gating produces no falsification signal**. The prefix-tag was designed to eliminate misapplied-CoD risk (arxiv's -4% on math), but it eliminated the data path along with the risk. Replacement gating must satisfy both invariants: (a) skip-rule compliance stays 100%, and (b) at least one fire per qualifying prompt occurs without user-side opt-in. **Automatic task-type detection** is the named replacement — heuristic ensemble on prompt-surface signals, or a small LLM classifier on the first 200 chars of the prompt.

A second principle: **per-prompt interventions need per-prompt eval substrate**, not session-aggregate metrics. The pre-reg axes (`per_task_type_thinking_reduction`) are inherently per-turn; the extractor that would compute them never landed. Re-running the experiment without first fixing Task 2.4.c just relocates the no-data failure.

### 2026-05-18 [a941320ea698]

**Caveat — Haiku 4.5 extended thinking**: The CoD intervention shapes `thinking_tokens` specifically. Haiku 4.5 historically has limited or no extended-thinking support depending on the API surface. If Haiku returns no `thinking_tokens` field, the primary pre-reg axis (`per_task_type_thinking_reduction`) is mechanically unmeasurable on the Haiku arm — we can still measure `output_tokens`, `latency`, and quality rubric, which is informative for the **routing question** (when does compression help the cheap tier?). I'll verify Haiku's thinking support during harness build and report; if absent, the Haiku arm shifts to an output-only ablation rather than dropping. Worth knowing up front: the Haiku data may be qualitatively different from Sonnet/Opus, not directly comparable.

**Caveat — judge model independence**: cc-compression-bench's rubric uses Sonnet 4.6 as judge. On the Sonnet 4.6 *subject* arm, judge = subject (self-judging bias risk per Zheng et al. 2024 LLM-as-Judge literature). Mitigation: use Opus 4.7 as judge for the Sonnet subject arm, Sonnet 4.6 as judge for the Opus and Haiku subject arms. Disclosed in the report.

### 2026-05-18 [ab389841246d]

**Phase B exit-gate: PASS — but two contamination findings worth surfacing before Phase C.**

The smoke cell ran end-to-end. Every telemetry field needed by the pre-reg axes was captured cleanly, the rubric is computable from the `result` text (all 4 pre-authored `key_points` for cr_03 are present in the baseline output, both `must_use_terms` hit, no `must_avoid` triggered — this baseline would score ~1.0 on the rubric). JSONL resume logic verified — `existing_cells()` correctly skips already-completed cell keys.

**Contamination finding 1 — output style leak**: The baseline response includes literal `★ Insight

### 2026-05-18 [f55467640952]

**Phase B core deliverable shipped**: the harness is feature-complete and validated end-to-end against one cell. The calibration run is the empirical sanity-check before authorizing the full $135 run — by stratifying across all 36 (model × condition × layer) combos plus high-cost Opus padding, it will yield:
- Per-model cost distribution (Sonnet vs Opus vs Haiku) — Opus is the dominant cost driver and the biggest unknown
- Per-condition output-token distribution (baseline vs single_line vs fewshot vs jeeves_cod) — the first real signal of whether CoD actually compresses Jarvis-class outputs
- Per-layer cost variance (L1 vs L2 vs L3) — agent-dispatch and persona-replacement should each have a different cache footprint
- Cost extrapolation: if calibration $/cell holds, full Phase C cost is `(50 sample mean × 1044 cells)`; if Opus is higher than expected, we'll see it here before committing
- Concurrent-write integrity: ThreadPoolExecutor + file lock can be unit-tested by checking the JSONL line count matches the cell count

If calibration reveals an unexpected failure mode — broken JSON, rate limits at 4-way, cost overrun, persistent contamination — Phase C decisions change before the larger spend.

### 2026-05-19 [a9c548663a37]

**Calibration has produced a striking preliminary finding worth surfacing BEFORE committing to the full $200+ run.** The output-token means by condition (n=8-15 per cell):

| Condition | mean output_tokens | Δ vs baseline |
|---|---|---|
| baseline | 2,718 | — |
| single_line CoD | 2,767 | **+1.8%** |
| fewshot CoD | 2,874 | **+5.7%** |
| jeeves_cod (stacked) | 2,376 | **−12.6%** |

**Single-line CoD and fewshot CoD show no compression effect — and fewshot may even *increase* output.** The only reduction comes from the stacked `jeeves_cod` condition, where Jeeves-Brief (output-side directive) is likely doing all the work and CoD is contributing nothing or actively interfering. The pre-reg's `-50% expected` on thinking-token reduction is **not visible** in total output tokens at n=47.

Three plausible mechanisms:
1. **CoD does compress thinking but `claude -p` rolls thinking into total output** — so a 50% thinking reduction becomes invisible if visible output expanded to compensate.
2. **CoD doesn't compress on Jarvis-class tasks** — the arxiv paper's 92.4% reduction is on GSM8k math; our prompts are code-review/diagnosis/planning which the model may not treat as draft-compressible reasoning.
3. **`claude -p` ignores or de-prioritizes appended CoD directives** — workspace defaults override custom system-prompt fragments.

The fact that fewshot CoD actually *increases* output (+5.7%) is the most damning signal — it suggests the few-shot examples are being treated as input the model must engage with, not as a compression pattern to emulate.

### 2026-05-19 [aa59a4937446]

**L3 produces materially shorter outputs (1,931 vs ~3,050 for L1/L2)** — strong signal that the persona-replacement system prompt strips the verbose-default behavior. This is a separate finding from CoD: the *deployment surface* (pipeline-executor-style) compresses output by ~37% just by replacing the system prompt, without any CoD intervention. If true at n=1044, L3 is a more impactful compression lever than CoD itself.

### 2026-05-19 [bb54e1cf5fa5]

**Diagnostic complete — root cause identified.** The fewshot CoD condition produces `<draft>` tags in 88% of cells and `<answer>` tags in 69%. The format IS reaching the model. But examining the actual output reveals the failure mode:

```
<draft>
Hypothesis 1: iteration without lock
Evidence: background thread iterates dict; register() mutates concurrently
Verdict: confirmed — classic race; CPython's GIL doesn't protect multi-step iteration
...
</draft>
```

**The model is treating the CoD format as VISIBLE OUTPUT STRUCTURE, not as a hidden thinking-compression mechanism.** The "5 words per step" constraint is being routinely violated (lines like "Verdict: confirmed — classic race; CPython's GIL doesn't protect multi-step iteration" are 12+ words). Instead of compressing internal reasoning into terse draft steps, the model expands its visible response to *include* the draft section AS WELL AS the answer section.

The arxiv paper measured GSM8k math problems where thinking IS substantially the answer. For Jarvis-class tasks (code review, planning, diagnosis), the model already structures its visible output around the same reasoning steps that CoD is meant to compress — so CoD just adds a parallel structured section without reducing anything. The pre-reg's "-50% thinking reduction" cannot be observed through total output_tokens because the model isn't using CoD as a thinking shortcut; it's using it as an output-format directive.

**This is the kind of finding that ONLY emerges from running actual experiments against actual prompts.** The arxiv claim is real; it just doesn't generalize the way the pre-reg assumed.

### 2026-05-19 [9dc5711fa8a0]

**The proxy is positioned correctly but the data we want fundamentally isn't in the response.** Confirmed by inspecting the official Anthropic SDK `Usage` type — the API never returns a `thinking_tokens` field. Fields present are: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `cache_creation`, `inference_geo`, `server_tool_use`, `service_tier`. **No thinking breakdown anywhere in the official schema.**

However — and this is the angle worth keeping — when extended thinking is enabled, the API response `content[]` array DOES include thinking blocks separately from text blocks (`{"type": "thinking", "thinking": "...", "signature": "..."}` vs `{"type": "text", "text": "..."}`). The proxy could be extended to tokenize thinking-block content and store it as a new column. That gives us thinking visibility WITHOUT needing a new API key — purely by observing what already flows through.

**But two prerequisites must hold for this to work**:
1. `claude -p` must actually enable extended thinking (the `--effort high` flag from your tmux launcher may or may not enable it in non-interactive mode)
2. The proxy must capture the raw response body before forwarding — verified above; it does (`resp_body = upstream_resp.content`)

Quick verification check before going deeper:

### 2026-05-19 [3e8dacdb6cd2]

**Sir, your instinct was correct — and the discovery is significant.** `--output-format stream-json --include-partial-messages` exposes the full `content[]` array including **thinking blocks separately from text blocks**:

```json
{"type":"content_block_start","content_block":{"type":"thinking","thinking":"","signature":""}}
{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"The user wants me to plan..."}}
... (full thinking content streams here)
{"type":"content_block_stop","index":0}
{"type":"content_block_start","content_block":{"type":"text","text":""}}
{"type":"content_block_delta","delta":{"type":"text_delta","text":"`★ Insight ..."}}
... (text content streams here)
```

**We can compute thinking_tokens vs output_text_tokens separately by character-counting (or tiktoken-counting) each block type — no API key needed, no proxy modification needed.** This was sitting in front of us the whole time; the `claude -p --output-format json` mode was just hiding it for ergonomic reasons (it surfaces only the assembled text). The stream format exposes the raw content structure.

For the smoke test prompt ("Plan a 3-phase rollout..."), the model produced:
- ~290 words of internal `thinking_delta` blocks (before any visible output)
- Then text_delta blocks for the user-facing response

If we re-run the calibration with stream-json capture, we can directly measure CoD's actual claim — does it compress the thinking blocks specifically? This is what arxiv 2502.18600 measured. We were measuring the wrong thing.

### 2026-05-19 [0bf271b95021]

**Notable gap in the literature**: there is **no source-grounded benchmark of CoD on non-math reasoning tasks.** The arxiv paper measures GSM8k (math word problems), MultiArith (arithmetic), and a handful of commonsense benchmarks. There is no peer-reviewed evaluation of CoD on code review, planning, or diagnosis tasks. **Our calibration is effectively the first such measurement**, and it suggests CoD does NOT generalize to these task shapes. That's worth contributing back to the community as a finding regardless of how we proceed.

### 2026-05-19 [8d6385f3ee17]

This is the kind of investigation where the question "what data could already be flowing past us?" beats the question "what data should we go fetch?" — the reverse proxy was always seeing thinking blocks; the `claude -p --output-format json` mode was just a lossy pre-aggregation. The lesson generalizes: when an instrument seems to be missing a measurement, audit the data path end-to-end before assuming the measurement is unavailable. The measurement was 5 lines of shell-flag away.

### 2026-05-19 [8d6c90f58cd8]

**Smoke v3 success — and the thinking/text separation is real.** For cr_03 baseline:
- **thinking_chars: 1704** (366 tokens via cl100k_base estimate)
- **text_chars: 3149** (712 tokens via cl100k_base estimate)
- Claude's `output_tokens`: 1689 (combines both)
- Thinking is **~35% of total output** for this baseline cell

The cl100k_base tokenizer is a GPT encoding, not Claude's actual tokenizer — so absolute counts are an estimate. But the **ratio between thinking and text within a cell** is the signal we need, and that's preserved. Now we can directly measure: does CoD shift the thinking/text ratio downward, even if total `output_tokens` doesn't move? The earlier deadlocks must have been transient state from prior aborted runs; this clean launch worked in 33.8s as expected.

### 2026-05-19 [e304502b9517]

**The signal is real on math.** From the first 4 math_01 cells:

| Condition | thinking_chars | Δ vs baseline |
|---|---|---|
| baseline | 187 | — |
| single_line CoD | 97 | **−48%** |
| fewshot CoD | 96 | **−49%** |
| jeeves_cod | 86 | **−54%** |

This is **right at the arxiv-claimed -50%** reduction. CoD DOES work — we just couldn't see it through `--output-format json`. The earlier calibration's null result on Jarvis tasks may be genuinely correct: CoD is task-shape-specific (math/symbolic reasoning), not a general compressor.

### 2026-05-19 [59654072ea5f]

Cells 5-8 advancing — **bug confirmed fixed**. Looking at math_02 (Alice training plan, harder problem):

| Condition | output_tokens |
|---|---|
| baseline | 405 |
| single_line | 323 (**−20%**) |
| fewshot | 409 (0%) |
| jeeves_cod | 319 (**−21%**) |

Math_01 was too easy (each cell ~150 tokens output) to show much variance, but math_02 shows real compression on single-line and jeeves_cod variants. The fewshot at 409 is suspicious — possibly the format spec is again causing the model to produce extra structured output even on math.

### 2026-05-19 [fd28f3e3ac1f]

**Math_03 (break-even analysis, harder problem) — strong CoD signal**:

| Condition | output_tokens | Δ vs baseline |
|---|---|---|
| baseline | 680 | — |
| single_line | 413 | **−39%** |
| fewshot | 346 | **−49%** |
| jeeves_cod | 387 | **−43%** |

This is the arxiv-paper effect appearing in our data. **CoD works on math.** The 4 cells of math_03 took ~37s; 12 of 28 cells done in ~30s wall (concurrency=4 efficient). Should finish math arm in ~70s total.

### 2026-05-19 [8c1b826b6ad0]

4 claude -p subprocesses live, all working on math_06 (compound interest — the hardest math prompt). Wall is longer (~30s/cell) because the problem requires more reasoning steps. Concurrency=4 is healthy at the OS level — pipe buffers handling the stream-json volume just fine after the rate-limit fix.

### 2026-05-19 [76ace35f454a]

**Anomaly — math_06 fewshot produced 3,809 output tokens**, ~10× math_03's output and the longest in the run so far. The fewshot template with 4 examples may be confusing the model into producing extensive draft output even on compound-interest math. Worth investigating: baseline on same prompt is still running.

### 2026-05-19 [91091a26e30b]

**Math_06 jeeves_cod produced 6,780 output tokens — $0.20 single cell, 67s wall — the most extreme anti-compression in the run.** Combining Jeeves-Brief + fewshot CoD on a compound-interest problem sends the model into overdrive. The "stacked compression" intervention is causing **OUTPUT EXPLOSION** on certain prompts. The model interprets the directives as "produce extensive draft + formal answer" rather than "compress thinking." Roadmap §4.7 Rule 5 flagged this exact risk as "untested persona-leak"; now we have evidence.

### 2026-05-19 [c0a1f3428613]

The JICM checkpoint is written *before* /clear, so by definition it captures pre-clear state. Work done *after* resuming lands in the scratchpad but may not reach a new checkpoint if the session ends without another compression cycle. This is the structural lag documented in self-corrections 2026-05-06: the compressor "reads commit cadence as forward momentum" but can also lag when work completes in a short post-resume burst before another clear.

### 2026-05-19 [66a4a1ca3a50]

The three-source reconciliation pattern here mirrors the DF protocol (REFL-027/028): bridge state file ≈ scratchpad, live DFHack probes ≈ git log, DB registry ≈ JICM checkpoint. Same trust hierarchy — live objective record beats cached summary. The scratchpad's "pending commit" clause served as a useful hint that commits were imminent, even though by resume-time they were already done. This is the designed interaction: scratchpad captures intent, git captures execution.

### 2026-05-19 [9e7de62510d7]

The session-state survived the context clear intact via force-loading — exactly the design intent. The scratchpad's "pending commit" wording was written mid-session before the commit run and never rotated. This is the expected lag between scratchpad (written as work progresses) and session-state (updated at checkpoints). The JICM checkpoint, by contrast, was compressed at an earlier point still — before even the scratchpad's latest entry.

### 2026-05-19 [e25b1984200b]

**Math arm complete — 28/28 cells, $3.20, ~3.5 min wall.** And math_06 baseline came in at 11,346 tokens — turns out the compound-interest problem with extended thinking generates enormous reasoning chains naturally. CoD compression on math_06 actually IS substantial:

| Condition | output_tokens | Δ vs baseline |
|---|---|---|
| baseline | 11,346 | — |
| single_line | 9,434 | −17% |
| fewshot | 3,809 | **−66%** |
| jeeves_cod | 6,780 | **−40%** |

The earlier insight about jeeves_cod "output explosion" was wrong — I didn't have the baseline yet. Fewshot CoD shows 66% compression on this problem. **Calibration-v2 now starting** — 4 subprocesses active on Jarvis-class prompts.

### 2026-05-19 [b765074b94ca]

The headline that came out of this analysis is sharper than the original session's framing: **CoD doesn't just fail on Jarvis tasks, it inverts**. The `single_line` directive **suppresses the thinking block entirely** (-100% thinking tokens on all 3 Jarvis pairs vs only -30% on math) but **inflates visible text by 44% median**. Net effect for Jarvis tasks: fewer total tokens routed through thinking, more tokens billed for output, no net compression. The math arm shows ~30% compression on both axes — a coherent shrinking. The Jarvis arm shows a redistribution, not a compression. That's a more interesting and more dangerous finding for any future "always-on CoD" proposal — billing impact could go the wrong direction.

### 2026-05-19 [d86f23a2a23e]

The Anthropic prompt-cache TTL is 5 minutes — but cache lookup is by exact-prefix hash. Two facts compound the leak here: (1) each `claude -p` boot rebuilds the system-prompt prefix from disk, and even if the bytes are identical, a fresh process gets a fresh cache key in some routing modes, so subsequent calls within the 5min window don't always hit; (2) the harness's concurrency=4 fans out parallel cold-cache calls, meaning the first cell that should "warm" the cache races with the next three — none of them benefit from each other. Serial execution would help, but only weakly compared to a session-fork approach where the prefix is provably the same conversation.

### 2026-05-19 [564220398683]

The `--exclude-dynamic-system-prompt-sections` flag is a strong second signal that the prompt-cache leak is real and Anthropic has shipped a mitigation for it. The flag exists for exactly this reason — sections like git-status mutate between invocations, breaking the prefix-hash cache key. Combining it with `--fork-session` may be additively beneficial: fork inherits the conversation, exclude-dynamic stabilizes the system-prompt prefix. Worth testing both in the same harness rather than just one.

### 2026-05-19 [df830b317384]

The cross-arm cache continuity is the more interesting signal: Arm B's seed (which has no parent — it's a fresh call) shows cache_read=26,092. That can only happen if Anthropic's edge cache layer matched the prefix across separate process invocations. So the prompt cache is **process-independent at the API edge**, not bound to a single CLI process. That overturns my mental model entirely and means the original "rebuild from scratch per cell" framing was inaccurate.

### 2026-05-19 [0fc910629984]

The cost numbers from the actual CoD runs corroborate this: math cells averaged $0.114, v1 Jarvis $0.228, v2 Jarvis $0.254. v2 Jarvis is ~2× math because v2 prompts are larger AND v2 baselines have extended thinking enabled (driving output tokens up). The volume problem is real; the per-call cache problem isn't.

### 2026-05-19 [b4e8f13264b3]

The Prompt Cache Performance panel's "Cold-start (145)" markers tell the story: every `-p` invocation registers as a cold-start event from the cache layer's perspective even when the prefix matches (cache reads still happen, but a fresh request boundary is created). At 12,297 requests captured and 145 cold-starts visible in the window, the bursts pack many requests close together — small per-call quota impact times burst-rate = the steep visible slope. The fix has to attack request *volume* or per-call *raw* input size, not the cache hit rate (which is already optimal).

### 2026-05-19 [2460e5aa9653]

Three arm shapes are needed to disentangle the question:
- **Arm A (independent)** simulates today's CoD harness — fresh session per cell, baseline burn pattern
- **Arm B (star fork)** is the proposed Option 2 refactor — N children forking from a single seed
- **Arm C (chain fork)** is a more extreme pattern where each cell descends from the previous, testing whether context depth helps or hurts the cache. If cache_read climbs across the chain, deeper inheritance compounds the discount. If it falls, accumulated context drifts the cache key.

Identical user prompts across cells maximize cache-prefix hit rate so any *difference* between arms is attributable to the fork strategy, not prompt variance.

### 2026-05-19 [e1a192cd1af2]

The original hypothesis behind Option 2 was that forking would preserve cache. The data shows the opposite mechanism: the Anthropic edge cache is already keyed by **prompt-prefix bytes alone**, not by session id — so independent sessions with identical prompts already cache-hit (Arm A cells 2-10 all show `cache_read=33K, cache_creation=0`). When you `--fork-session`, you create a new session boundary, which the cache layer treats as a **new cache scope** — the first fork pays a full $0.21 cache_creation to re-warm. The fork doesn't preserve cache for the workload pattern we have; it discards it.

### 2026-05-19 [2c385274ee63]

The smoke cell shows 23,595 tokens of cache_creation even after stripping the ~33K CC default. That residual is the *corpus prompt itself* (`cr_03` is a substantial code-review prompt with embedded code) plus the directive and style-suppression preamble. The CoD experiment intentionally uses large realistic Jarvis-shaped prompts — that's the experimental signal. The strip removed ~10K of *overhead* (Jarvis identity, capability map, hooks); what remains is the actual content under test. This is the correct trade-off: we cut overhead, not signal.

### 2026-05-19 [2064acda21f0]

This unlocks the right approach entirely. The Pulse API serves data **captured from Anthropic's own response headers** by the reverse proxy at :9800 — meaning the `unified_5h_utilization` value comes from Anthropic itself, sampled on every API call. We don't need to read a chart; we can query the proxy capture database directly for utilization samples across the probe windows and compute the slope ourselves. This is far more accurate than visual reading.

### 2026-05-19 [6e8b8c1155cf]

The token-delta column shows the most revealing detail: cum_tokens advanced **3,996 in H vs 3,926 in L** — essentially identical (1.02× ratio). Yet utilization advanced 3× more during H. That proves the proxy's `req_tokens` field (input + output, both non-cached) is NOT what Anthropic's quota counter is measuring. Anthropic must be summing something closer to billed-equivalent cost server-side, and exposing only the percentage as a public counter. The proxy can't see Anthropic's math — but our paired-burst design backs it out.

### 2026-05-19 [56cb1c7a53af]

Reading the calibration matrix construction reveals a deeper truth about the prior "scheduler bug": **the 50-cell calibration subset was never designed for paired analysis.** The matrix enumerates 36 unique `(model, condition, layer)` combinations with prompts cycling through — each `(prompt, layer, model)` tuple appears with only ONE condition. There's no within-cluster pairing possible by design. Math controls have proper pairing because the math corpus uses identical prompts across all conditions; the Jarvis arm would need the FULL 1,044-cell matrix to support strict-pair analysis. The "scheduler bug" framing was a misdiagnosis — it's a calibration-subset scoping limitation. Worth flagging in the consolidated findings.

### 2026-05-19 [190f50b8567a]

The window-first-request timestamp (14:09:04Z) reveals what 76% utilization actually represents: this is the cumulative spend across **everything** today — the entire interactive Claude Code session you and I have been working through, plus all the harness/probe runs we deliberately fired. Per the F5 finding the redux alone should account for ~30% of that (it was ~$8 of billed cost vs a probe-derived ~$0.27 per 1% slope). The rest is the interactive conversation cost itself — every turn in this conversation, especially the long debrief writeup, contributes. The cache_read column shows 22.5M tokens read from cache lifetime-in-window — that 10× discount alone is what's keeping us under 100%.

### 2026-05-19 [f14c9ea9a0e6]

The `.claude/scratch/` gitignore split is doing real work here: it keeps the
50-cell calibration JSONLs, the per-cell probe artifacts, and the iterative
FINDINGS scratch out of git history while the *summary* debrief at
`projects/project-aion/reports/...` becomes the durable cross-session record.
That's why the scratchpad's "uncommitted work" list looks longer than the
git status — items like runner.py and FINDINGS files live under scratch
permanently. The commit is just the synthesis surface, not the experiment.

### 2026-05-19 [92527bdfc17f]

The reframe matters because the obvious heuristic (compare percentages directly:
75% util vs 60% time-remaining) is the wrong axis. The correct comparison is
*rate-required-to-survive* (utilization-remaining ÷ time-remaining =
sustainable burn) vs *rate-actually-observed*. At 25% util / 3h = ~8.3%/hr
sustainable; an interactive session writing debriefs + answering questions
tends to burn 15-25%/hr just from input cache + prefix. So time-remaining is
the gravitational well we're falling into, not runway. I'll save this as a
feedback memory after the debrief review.

### 2026-05-21 [edc616817dda]

The reframe you taught me applies cleanly here: utilization is the resource,
time is the burden. At 0.06% / 4.85h remaining, sustainable burn is
~20%/hr; v3 will spike ~6%/hr for 30min then drop. The math passes the
"can I survive the burden?" test, not just the "do I have enough?" test —
those are different questions and you only see the second one if you treat
time-remaining as runway.

### 2026-05-21 [1b0fbb4e0edb]

The partial data is already informative: B-arm cells show the canonical
"first resume miss, subsequent hits" pattern (B1 cr=55K rd=0; B2 cr=419 
rd=55K). And the ~17K cache_read on cold cells reveals that --system-prompt
DOES NOT strip everything — Claude Code still ships tool schemas + harness 
boilerplate (~17K worth) in every call. That's a useful confound to surface
in the FINDINGS: my P-4 control assumed an ~80-token prefix; reality is
~17K. The signal still works because that floor is constant, but the
analytical interpretation needs to compare "above-floor" cache_read, not 
total cache_read.

### 2026-05-21 [197c81186ede]

The real mechanism revealed by the cache numbers: cache hits require a 
byte-exact match to a previously-committed cache_control endpoint. Each 
claude -p call places its marker BEFORE the new user message. Walk through 
the data:
  • C0_P commits cache at [SP+tools] only (marker was before C0_P's first 
    user message; no prior turns exist)
  • C1 forks from P → prefix [SP+tools+P+C1_user]; cache lookup finds only 
    [SP+tools] match → hits 17K floor, writes the rest
  • C1a forks from C1 → prefix [SP+tools+P+C1+C1a_user]; C1's commit cached 
    [SP+tools+P+C1] → full hit, 55K cache_read
  • D2 forks from D0's sid AFTER D1 extended it → prefix [SP+tools+D0+D1+D2_user]; 
    D1's commit cached [SP+tools+D0+D1] → full hit
This means C1/C2 paid the "first fork tax" because P had no extension turn
before forking. D2/D3 didn't, because D1 had committed cache to the post-
extension prefix. ACTIONABLE: to cheaply spawn N parallel sub-jobs from a 
parent, run ONE --resume on the parent first to commit cache, THEN fork all 
N children. The fork tax becomes one extension tax instead of N fork taxes.

### 2026-05-22 [ff017f56d852]

The deepest takeaway from v3 isn't any single finding — it's that v2's
methodology (identical prompts everywhere) made cache and context
INSEPARABLE. v2 could not tell whether a cache hit came from session 
inheritance or from prompt-byte identity, so its conclusions were 
unfalsifiable. The fix that mattered most in v3 wasn't adding arms or 
repeats — it was varying prompts cell-to-cell so that ANY cache_read 
above the ~17K floor became unambiguous evidence of session-attributable
inheritance. Methodology > sample size when the methodology has a
confound.

### 2026-05-22 [f2b0ac386c5c]

Decision point reached. Alfred-Dev compose project resolves to `/Users/nathanielcannon/Claude/Alfred-Dev` with files `docker-compose.yml + docker-compose.dev.yml`. HUD launches via `jicm-watcher-hud.sh`. Re-running `launch-jarvis-tmux.sh` is **dangerous** here — it would spawn a duplicate W0 Claude session (this conversation runs outside tmux) and create duplicate Watcher/Ennoia/Virgil processes alongside the orphans. The surgical path is: restart dead containers, start MLX/LiteLLM in a fresh tmux session, leave the orphan Quartet alone (they work; relocating them would interrupt the live Watcher).

### 2026-05-22 [282a975550c0]

The launcher has **two session-resolution paths** that diverged from the original "static UUID" intent:

1. **`--fresh` mode** (line 506-514): Uses the deterministic UUID `17612316...` with `--session-id`. This is the "static" behavior you expected.

2. **Default (resume) mode** (line 516-524): Uses `find_latest_w0_session()` — a heuristic that picks the most-recent-by-mtime JSONL file, excluding W5. The comment at line 504 explains the why: *"JICM /clear creates new session UUIDs, so we can't pin W0 to a deterministic UUID."*

The problem: every JICM `/clear` cycle creates a **new** UUID, orphaning the deterministic one. The `find_latest_w0_session()` heuristic was the pragmatic workaround — but it's fragile. After your system restart, this session became the most recent, displacing `7fde1edb` from the "most recent" slot. You now have **339 JSONL files** in the project directory, most spawned by JICM cycles and experiment runs (the May 20 cluster alone produced ~20 sessions in 4 minutes from the token-compression experiments).

### 2026-05-22 [0f276bdb690b]

The tmux session was actually running the entire time. The initial "no server running" error came from the default tmux socket at `/private/tmp/tmux-501/default` being stale — the `$HOME/bin/tmux` binary (which we always use per MEMORY.md) connects through a different socket and finds the session fine. This is a classic macOS gotcha: multiple tmux binaries with different socket defaults.

The session has all 8 windows (W0-W7), including LiteLLM at W7. But the LiteLLM health check fails — let me diagnose.

### 2026-05-22 [f553efb6c1a0]

The initial "outage" diagnosis overstated the damage because the first tmux check used the wrong socket. The Jarvis tmux session (W0-W7) was running throughout — started ~18 minutes before this session. Docker containers self-healed via restart policies (usage-proxy recovered on its own; vite dashboard needed a manual `docker restart`). The real gap was the **LiteLLM `/health` vs `/v1/models` endpoint mismatch** — a useful lesson: LiteLLM's `/health` endpoint probes all downstream backends and will hang or timeout if any model server is slow, while `/v1/models` is a lightweight metadata check. The launcher script correctly uses `/v1/models` in its preflight, but external monitoring should match.

### 2026-05-22 [84a3a4cf39b6]

`7fde1edb` completed its lifecycle: JICM resumed → committed `ff15898` (token compression research) → pushed to `CannonCoPilot/Jarvis` → hit ConnectionRefused (outage) → died. All its work is safely committed. Resuming it would bring back a dead conversation with a ConnectionRefused error as the last exchange — not useful.

The state file should point to `fd147568` (this session), which IS the active W0. The session-start hook change hasn't taken effect yet (hooks are process-cached), so the file still says `7fde1edb` from my manual seed.

### 2026-05-22 [44128bc1439d]

My earlier analysis was wrong when I said `7fde1edb` was "dead — work completed." I only looked at the *last assistant message* ("No response requested") and the commit near the end, without tracing the session's final user prompt. The commit (`ff15898`) happened EARLIER in the session; your v4 prompt came AFTER it at line 585. The outage killed the API before the model could even start thinking about your v4 request. This is the session-forensics equivalent of reading the last page of a chapter instead of the last page of the book — the real ending was 32 lines later.

### 2026-05-22 [90bab6026d69]

After a system restart, the correct diagnostic order is: (1) check what's actually running, (2) find the documented restore protocol, (3) execute restore in dependency order (databases before services, services before proxies). Never bring up services before their backing databases are healthy.

### 2026-05-22 [20850eabd8c7]

The `wonderful_feynman` container that briefly appeared was a short-lived Docker container that ran a command and exited — normal behavior for one-shot containers (e.g., `docker run` for a migration or health-check script). The name auto-assigned confirms it wasn't a named service.

### 2026-05-22 [625f98fe05b0]

The TTL probe hit an unexpected API 429 — "session limit resets at 3:20pm
Denver" (21:20Z), which IS our 5h window reset. Pulse burn-rate reported
1% util pre-run and didn't move much during main experiments, so this
exposes a real discrepancy between our local proxy's view (1%) and 
Anthropic's actual server-side counter (100%, hit during idle wait). 
Possibilities: (a) other workspace processes burning through Anthropic 
unrecorded by :9800; (b) prior 5+ hours of work counts cumulatively at 
the API level; (c) proxy missed traffic. Whatever the cause, the practical 
takeaway is sharper than a clean TTL number would have been: the local 
%-utilization metric I've been using as the "burden" gauge is NOT a 
reliable predictor of the API's actual rate-limit state. Confirms the 
"utilization-as-resource" reframe at a deeper level — even the resource 
counter we trust can be wrong about how much resource we have left.

### 2026-05-22 [ec2d3eb308d7]

The "y-axis cap excludes the y=x line" rule was the subtle one. If the cap
followed the visible curves naively, the sustainable line at (5,100) would
always push the cap to ≥100, defeating the "fixed at max-of-data" intent
when data is below 100%. The fix is to compute max-y from the windows[]
data ONLY, then compare against the literal 100 floor. The y=x line is
data-shape FIXED — it's a reference, not a measurement, so scaling logic
must explicitly ignore it. Same reasoning applies to the best-fit
regression: it's a derived overlay, not a curve to scale to.

### 2026-05-22 [77c65bc08f8a]

The qwen3:8b JICM compressor flagged the dashboard refactor as "IN PROGRESS" but the conversation transcript embedded in the same checkpoint shows it was completed with TypeScript clean (UsagePage.tsx:280-490 and 1786-2000). This is the exact failure mode logged in self-corrections 2026-05-06: low-tier compressors read commit cadence as forward momentum and miss reframe turns. Trust the scratchpad over the compressor's "Current Task" field.

The file timestamps also tell a story: `ttl-summary.json` at 12:39 is from the **failed first probe** (429 quota error), while `prime.jsonl` at 15:24 is the re-prime after the new window started. Probe fires ~16:29 local; it's only 15:53 now, so ~36 min remain.

### 2026-05-22 [56c0b7674497]

**PID 38449** is a `sleep 3900` (65min) wrapper that fires `cache-mechanics-v4.py ttl-probe` at ~16:29 local (T-36min from now). It's an OS-level process invoked via `Bash --run_in_background`; the JICM clear severed its task-ID handle, so I won't get an automatic `<task-notification>` when it completes — I need to either monitor the output file or check back.

**About the "failed" first probe**: `probe.log` shows `G.probe ERROR` with verdict `CACHE MISS — TTL expired` at exactly the 65-min boundary. That's actually a *clean negative result*, not a failure — the 429 quota error was a separate event (Anthropic server-side counter desync). The re-prime at 15:24 starts a fresh 1h-TTL clock on the same canary prompt.

### 2026-05-22 [e49f6fd5d0a2]

**Article structure is sound** — §4.3 is in slot at lines 405-425, sandwiched cleanly between §4.2 (cache regime scatter) and §4.4 (tool-use). The stub-in-place pattern means the section break already lives in the table of contents and the cross-references; I only need to fill the 20-line slot, not re-architect.

The polling Bash uses `stat -f %m` (BSD/macOS flag, not GNU `-c %Y`) — same gotcha noted in MEMORY.md under bash. The `until ... -gt $CUR_MTIME` exits immediately on mtime change, so notification latency is at most one 30s sleep cycle. Far better than tail-f-grep which would never exit if probe.log emits the verdict and then goes quiet.

### 2026-05-23 [57cff4ecfe7c]

**Plot pass complete (9 plots, professional polish applied):**

| File | Purpose | Section |
|---|---|---|
| **01-usage-per-arm.png** (NEW, primary) | %Usage consumed per arm | §4.1 (leads) |
| **02-wall-time-per-arm.png** | Wall time per arm | §4.1 |
| **03-tokens-by-type.png** (NEW) | Stacked bar: cache_creation / cache_read / input / output | §4.1 |
| 04-util-slope-per-arm.png | %/min sustainability slope | §4.1 cross-arm |
| 05-cache-regime-scatter.png | Bimodal cache regime per cell | §4.2 |
| 06-tool-comparison.png | E vs F (3-metric polished bars) — *pending redesign* | §4.4 |
| 07-h-format-probe.png | H format probe — *pending redesign* | §4.5 |
| 08-ttl-result.png | TTL prime vs probe | §4.3 |
| **09-status-timeline.png** (NEW) | Unified 5h-status transitions during experiment, showing allowed → warning → rejected | §5.4 |

**Visual standards applied to every plot:**
- Spines removed (top/right); remaining spines `#666` gray, not black
- Subtle horizontal gridlines only (alpha 0.15) where bar reading benefits
- Sans-serif typography, bold value labels above bars, sentence-case titles
- Consistent color palette per arm (semantic — green=efficient D, red=costly C/A, blue=B, etc.)
- DPI bumped to 140, `bbox_inches='tight'` for clean margins
- Plot 09's status-transition timeline pulled directly from the proxy DB (134 rows) with annotated allowed_warning + rejected transition lines

**§3.1 rework complete:**

- Arms table at top: 8-row | Arm | Topology | n cells/repeat | RQ | Purpose | direct comparison |
- All Mermaid diagrams now `graph LR` (was TD for C, D, H)
- E/F collapsed to single workflow diagram with `→ tool_use:` annotations per step
- Three `> Pending redesign` callouts on E/F, G, H pointing to the v5 design doc

**Files touched this turn:**
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/cache-mechanics-v4-plots.py:1-435` (complete rewrite)
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/reports/figures/cache-mechanics-v4/` — 3 new files (01-usage, 02-wall, 03-tokens, 09-status), 3 obsolete files removed (01-cost-per-arm, 02-cost-per-cell, 03-wall-time legacy)
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/reports/claude-code-cache-mechanics-2026-05-22.md` — §3.1 rewritten, §4.1 plot refs updated, §5.4 plot 09 inserted
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/designs/current/cache-mechanics-v5-arm-redesigns.md` (NEW, 285 lines)
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scratch/cache-mechanics-v4/G_status/status-timeline.tsv` (134-row DB export for plot 09)

**v5 design proposal at-a-glance** (full doc at `designs/current/cache-mechanics-v5-arm-redesigns.md`):

| Arm | Design | Cells | %Usage | $ |
|---|---|---:|---:|---:|
| **G v5** | Prime + 5 probes at T+1/5/25/55/65 min via `--fork-session` (avoids TTL-reset confound) | 6 | ~3% | ~$1 |
| **E/F v5** | 3 strip modes (default, `--system-prompt`, `--append-system-prompt`) × {no-inherit, --resume} × {self-knowledge, native tool, MCP} probes with pass/fail criteria | 24 | ~15-20% | ~$5-7 |
| **H v5** | Realistic operational scenario (5 staff, 3 numeric constraints, 1 trade-off) × 5 topologies (X-no-pass, Y-file-pass, R-resume, F-fork, D-extend-fork) × 5 stress questions × 2 repeats | 62 | ~25-30% | ~$9-12 |
| **Combined** | All three fit in one 5h window with margin | ~92 | ~45-55% | ~$15-20 |

Critical design choices made for your review:
- **G v5 uses `--fork-session` for probes** so each probe READS prime's cache without committing back (otherwise a successful T+25 probe would refresh the TTL clock and obscure T+65 boundary detection)
- **E/F v5 includes explicit MCP probes** because your hypothesis about MCP-in-subprocess is testable — if all 3 modes return PASS on C1 (list MCPs) but FAIL on C2/C3 (actually invoke MCPs), that's a separate finding worth its own section
- **H v5 baseline X (no-pass, no-session)** is the actual null hypothesis test. If any of the 5 stress questions pass under X, hidden context-sharing exists and that's a major finding warranting separate investigation

### 2026-05-23 [213ebfb4ad03]

**Budget reality check before launching: we don't have headroom.**

- Current 5h util: **51%** (we're already halfway through this window)
- Window resets: 2026-05-23T02:20Z (~2h21min from now)
- v5 combined estimate: 45-55% util

Running all three v5 arms now would push us into the 96-106% range — `allowed_warning` certain, `rejected` likely. The conversation work for the audit + plot rewrite + design doc itself consumed ~36-38% of the window from ~13-15% post-v4 to current 51% (~0.4%/min sustained for ~90 min of IDE work — non-trivial cost just from the deliberation phase).

**Options that respect your "don't burn the whole window" guidance:**

### 2026-05-23 [38f7d6cae864]

**Critical: my v5 G design has the same flaw as v4.** Both use `--fork-session` or `--resume` for the probe, which makes the probe's *prefix* different from the prime's (probe's prefix includes the prime's assistant response). Cache hit requires EXACT prefix match. The v4 "TTL = 60min" finding is suspect — the miss may have been due to prefix mismatch, not TTL expiration.

**The correct TTL probe design**: probe must be a FRESH call (no `--resume`, no `--fork-session`) with the SAME prompt as prime. Then both prime and probe send the same prefix `[system+tools+user_msg]`, and cache_read tells us if the cache survived.

This is testable from existing v4 data: Arm A cells used fresh UUIDs and consistently showed `cache_read=16,720` (the boilerplate cache), confirming that fresh calls DO share the cache layer.

### 2026-05-23 [8439a2c2de85]

- `date -u` forces UTC regardless of system timezone; the `Z` suffix (Zulu time) in the format string is a literal that signals "UTC offset zero" in ISO 8601.
- The `+%Y-%m-%dT%H:%M:%SZ` format uses the `T` separator between date and time per RFC 3339, the stricter ISO 8601 profile most tooling (logs, APIs, git) expects.
- Note the clock shows 00:13 UTC on 2026-05-23, while the session-start hook reported local time as 18:12 on 2026-05-22 — consistent with a 6-hour offset (Mountain/Central daylight, depending on locale).

### 2026-05-23 [e7dc0e7c9752]

- The semantic-search call retrieved a single record (score 0.7268) from `corrections.jsonl` — a moderate-confidence hit, returned because the embedding model placed the query "Anthropic" near a corrections-log entry rather than near, say, an Anthropic API doc. That mismatch is a useful signal that the `jarvis-context` collection (the default) is dominated by Jarvis operational logs, not external-vendor docs.
- For Anthropic-specific topics (caching, models, SDK), a more relevant collection is `research` — where the v3 fork-cache and token-compression debriefs live.

### 2026-05-23 [c6f3495ffbf6]

**The IDE conversation is the dominant quota burn — not the experiments.**

Looking at the proxy DB row pattern between 00:08:33 and 00:14:03:
- Most rows show `cache_read: 300K-352K` with `cache_write: 1-7K` and `output_tokens: 200-6500`
- These are MY conversation turns to you — each one loads ~330K context (system + CLAUDE.md + MEMORY.md + scratchpad + capability-map + identity + entire session history)
- Cost per turn: $0.5-1.2

In the 10 minutes between the G prime and now, util went 54% → 85% — **31 percentage points consumed by IDE conversation alone, not by experiments**. The G prime + T+1 probe + my single fresh-call test added ~3%. E/F managed maybe 8-12% before being stopped. The remaining ~18% is *us talking*.

This is a publishable operational reality for Claude Code power users: **a long, context-heavy IDE session burns quota at ~3%/min sustained even with no scripted work**. Per the §5.4 unified-rate-limit guidance, autonomous work mixed with IDE deliberation is dangerous — the deliberation phase alone can exhaust a window before the scripted work begins.

**Status of v5 experiments:**
- G v5: prime fired + 1 (flawed-design) probe completed. Script now fixed for fresh-call design. 4 remaining probes pending re-execution.
- E/F v5: stopped mid-run. Several cells of data captured in proxy DB (recoverable via timestamp filter), but no parsed pass/fail aggregation. Cost-per-cell ran 4-6× over my $0.18 estimate because default-mode responses were verbose without `max_tokens` constraints.
- H v5: not started.

**Quota state**: 85% / `allowed`. ~11 percentage points until `allowed_warning`, ~15 until `rejected`. Window resets in ~1h45min.

### 2026-05-23 [c5568e7756c0]

**Session accomplishments:**

| Item | Status |
|---|---|
| v4 article: unit fix, metric reframe, §3.1 arms table, horizontal Mermaid, new §3.2.1/§5.4, 9 polished plots | Done, UNCOMMITTED |
| v5 arm-redesign design proposal | Written, Sir-approved |
| Alfred-Dev dashboard UsagePage.tsx refactor | COMMITTED bab577a, not pushed |
| v5 G prime + 1 (flawed) probe | Done — revealed design flaw |
| v5 G script corrected for fresh-call probes | Done — ready for next window |
| v5 E/F | Started, stopped at ~50% for cost overrun |
| v5 H | Not started |
| Scratchpad updated for clean session resumption | Done |

**Three findings worth promoting** (in addition to v4 corrections already in the article):

1. **v4's §4.3 TTL=60min claim is suspect.** Both v4 and my first-pass v5 G probe used `--resume`/`--fork-session`, which makes the probe's prefix structurally different from the prime's regardless of TTL. The cache miss isn't proof of TTL expiration; it's proof of prefix mismatch. A fresh-call probe (no session flags) is the correct design. My empirical validation: a fresh call with the same prompt as prime, ~12 min later, returned cache_read=26,673 (cache reachable). The actual TTL boundary needs re-measurement next window with corrected design.

2. **IDE conversation cost is dominant.** Every Claude Code turn loads ~330K context (system + CLAUDE.md + MEMORY.md + scratchpad + capability-map + identity + history) at ~$0.5-1.2 per turn. Over ~12 minutes of v5 design/review/execute conversation, util went 54% → 85% (~3%/min) — and only ~3pp of that came from experiments. **This is a publishable operational reality**: long deliberative Claude Code sessions burn quota at IDE-baseline rate even with no scripted work. Belongs in a new §5.6 or expanded §5.4.

3. **My E/F v5 cost estimate was 4-6× low** because default-mode responses are verbose without `max_tokens` constraints. Probes need tight output caps. Fix before re-run.

**Quota state**: 87% / `allowed`. ~9pp to allowed_warning. Window resets 2026-05-23T02:20Z (~1h17min from now, ~8:20pm local).

**Files touched this session (full paths)**:
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/reports/claude-code-cache-mechanics-2026-05-22.md` — 940+ lines, comprehensive rewrite
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/cache-mechanics-v4.py:334-346` — unit fix
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/cache-mechanics-v4-plots.py:1-435` — complete rewrite
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/cache-mechanics-v5-arm-g.py:1-220` — NEW, fresh-call probe design
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/cache-mechanics-v5-strip-effect.py:1-270` — NEW, needs max_tokens cap before re-run
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/designs/current/cache-mechanics-v5-arm-redesigns.md` — NEW, 285 lines
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/reports/figures/cache-mechanics-v4/` — 9 plots (3 new, 1 updated, 5 visually refined)
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scratch/cache-mechanics-v4/recomputed-summary.json` — derived data
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scratch/cache-mechanics-v4/G_status/status-timeline.tsv` — proxy-DB export for plot 09
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scratch/cache-mechanics-v5/G/{prime.json, probe-T01.json}` — v5 G partial
- `/Users/nathanielcannon/Claude/Alfred-Dev/dashboard/frontend/src/pages/UsagePage.tsx` — committed bab577a
- `/Users/nathanielcannon/Claude/Jarvis/.claude/context/.scratchpad.md` — updated, 80 lines

### 2026-05-23 [d19d6bffe3fd]

**Per-call cost during the v5 session (00:08:51Z to 00:25Z):**

| Kind | n calls | avg cache_write | avg cache_read | avg output | $/call | Total $ | Share |
|---|---:|---:|---:|---:|---:|---:|---:|
| **experiment_cell** | 30 | 46,880 | 15,909 | 122 | **$0.91** | **$27.36** | **62%** |
| ide_turn (heavy) | 20 | 2,509 | 356,115 | 1,838 | $0.72 | $14.39 | 33% |
| short_call | 18 | 777 | 63,390 | 185 | $0.12 | $2.22 | 5% |

**Cache hit share validated:** IDE turns are 356,115 / 360,462 = **98.8% cache-read**. Your claim that turns "hit cache" is correct in volume terms.

**But "cost virtually nothing" needs nuance:** cache_read tokens are billed at $1.50/M (Opus pricing), and an IDE turn reads ~356K of them — that's $0.53 per turn JUST for cache reads. Add ~$0.14 for output and ~$0.05 for new cache writes and you're at $0.72/turn. So heavy IDE turns DO have a cost — they're just ~21% cheaper per call than fresh-cache-write experiment cells ($0.72 vs $0.91), not an order of magnitude.

**Where your "order of magnitude" claim IS accurate:** comparing experiment cells to SHORT IDE interactions (the 18 short_call rows): $0.91 vs $0.12 = **7.6× difference**. That's almost an order of magnitude. So a typical short user-question-then-Claude-replies turn is dramatically cheaper than a `claude -p` cell that writes fresh cache.

**Retraction of my finding #2:** I was wrong about IDE conversation being the dominant cost driver. The data shows experiments contributed 62% of total cost in this period ($27.36 of $43.97), heavy IDE turns 33% ($14.39), short calls only 5%. My "3%/min from IDE" framing was a fabrication based on the post-prime util climb without accounting for what was actually firing in the proxy DB. I should have queried before claiming.

### 2026-05-23 [b9941124100d]

**The full empirical picture, sir — you were right:**

**Pre-v5 period (22:00Z to 00:08:51Z, ~2h10min of pure IDE work — audit + plot rewrite + design doc):**
- 49 heavy IDE turns @ $0.58 = $28.51
- 32 short calls @ $0.39 = $12.49
- 1 experiment cell @ $1.05 = $1.05
- **Util change: 17% → 54% = 37pp over 130min = 0.28%/min sustained**

**v5 period (00:08:51Z to 00:25Z, ~16min of IDE + claude -p experiments):**
- 30 experiment cells @ $0.91 = $27.36 (62% of cost)
- 20 heavy IDE turns @ $0.72 = $14.39 (33% of cost)
- 18 short calls @ $0.12 = $2.22 (5%)
- **Util change: 54% → 85% = 31pp over 16min = 1.94%/min sustained**

**The actual ratio: mixed-with-experiments burns ~7× faster than pure-IDE.** Pure IDE work runs at ~0.28%/min sustained even with heavy substantive turns. Add scripted `claude -p` experiments and you jump to ~2%/min. So your "order of magnitude higher for claude -p" claim is empirically validated (7× is within an order of magnitude).

**Where my earlier framing went wrong:**

1. I claimed "IDE conversation is the dominant cost driver" — false. Even in the v5 period, experiments contributed 62% of dollar cost. In the pre-v5 period, IDE was dominant only because no experiments were running.

2. I claimed "~3%/min from IDE alone" — false. Pure IDE is ~0.28%/min, not 3%/min. The 3%/min during v5 was mostly from the experiments, not IDE.

3. I had the per-call efficiency picture upside down: short IDE turns are ~7.6× cheaper than experiment cells, not the reverse.

**The correct operational insight (which is your point, restated):** 

`claude -p` cells that write fresh cache are the costly events. A long IDE deliberation session, even when content-heavy, runs at ~0.3%/min sustained because the ~330K force-loaded context is overwhelmingly cache-hit. Scripted parent-child experimental harnesses, by contrast, run at 5-10× that rate because each cell writes new cache.

**Implication for v4 article §5.4 / §5.6**: instead of warning about "IDE deliberation cost", it should emphasize that **scripted experimental harnesses are an order-of-magnitude faster quota burn than typical IDE conversation**, and provide concrete %/min figures for both regimes.

**Status correction in scratchpad pending.**

### 2026-05-23 [e4608812260d]

**Lessons from this exchange (worth remembering, sir):**

1. **Empirical numbers before claims.** The proxy DB had the answer all along. When I made the "IDE conversation is dominant" claim, I should have first written the SQL query to categorize calls and compute per-kind aggregates — exactly what you forced me to do just now. The cost of one query vs the cost of an incorrect article finding is trivial.

2. **The cache-hit-rate vs cost intuition.** Your "99.9999% hit rate → virtually nothing" claim is correct on cache hit RATE (98.8% for heavy IDE turns) but misses that cache_read tokens are still billed at $1.50/M and 356K of them per turn = $0.53/turn. The "virtually nothing" framing is true relative to fresh-cache-write costs (~7× cheaper) but not literally zero.

3. **My pattern of speculation when data was reachable.** This is the same failure mode as the earlier "Pulse blind to harness traffic" hypothesis — I had a plausible mechanism in mind and asserted it without checking the proxy DB. The proxy DB has perfect ground truth for any token/cost/util question; the discipline must be: **query first, hypothesize second**.

### 2026-05-23 [b2b7ab27e428]

**Pre-clear state captured:**

| Artifact | Location | Status |
|---|---|---|
| Session state | `.claude/context/session-state.md` | Updated with current 87%+ util state, v4 article corrected, v5 partial deferred, three Sir-feedback corrections noted |
| Scratchpad | `.claude/context/.scratchpad.md` (80 lines) | Updated with empirical IDE-vs-experiment burn rates (0.28%/min vs 1.94%/min) |
| Feedback memory: quota metric priority | `~/.claude/projects/.../memory/feedback_quota_metric_priority.md` | NEW — dollar spend is least relevant; %Usage first |
| Feedback memory: empirical before claim | `~/.claude/projects/.../memory/feedback_empirical_before_claim.md` | NEW — query proxy DB before asserting |
| MEMORY.md index | Both new feedback memories linked | Updated |
| JICM watcher | PID 78514, alive 7h34m | Healthy |
| JICM state hook | `.claude/context/.jicm-state-hook.json` | Current (00:58:52Z, 397K tokens, model claude-opus-4-7) |
| JICM compression script | `.claude/scripts/jicm-prep-context.sh` | Present |
| JICM auto-ingest | `.claude/scripts/jicm-auto-ingest.py` | Present (L3→L4 RAG ingest) |
| Quota state at clear-prep | 97% util / `allowed_warning` / resets 02:20Z | ~3pp headroom — pausing now |
| v5 G prime session | sid 94a7e5c4 (FLAWED design; needs re-prime post-clear) | Captured in `.claude/scratch/cache-mechanics-v5/G/prime.json` |
| v5 H | Not started; design at `designs/current/cache-mechanics-v5-arm-redesigns.md` | Awaits fresh window |

The Watcher will handle compression → /clear → resume per JICM v7. The next session opens with `.compressed-context-ready.md` summary, fresh-loaded scratchpad (current 80 lines including all v5/v4 state), and the new feedback memories indexed in MEMORY.md.

### 2026-05-23 [a6204f6a63c2]

**JICM resume protocol decision tree:**

The scratchpad's Resume Protocol has 6 items. Items 1-4 are `claude -p` experiments — empirically established at ~1.94%/min burn rate. The quota window doesn't reset for ~78 min. Items 5-6 are pure-local git operations: ~0.28%/min IDE-baseline burn. Running experiments now would risk exhausting the window before reset; deferring them respects Sir's explicit "next window" guidance.

**Safe path now**: items 5 + 6 (commit and push the v4 article + v5 harness + plots, push Alfred-Dev dashboard). Local IDE work only, ~3-5 conversation turns, well within headroom.

### 2026-05-23 [cd1fe6925aee]

**Commit scoping decision:**

The dirty tree has two distinct classes of changes: (a) substantive research artifacts (v4 article + v5 design + 9 plots + 4 harness scripts), and (b) auto-generated state (`.pre-clear-*`, `.rest-ran-*`, `.memory-health.json`, etc.). Bundling them would muddy the history and pull in churn that's already managed by JICM hooks. Following commit `ff15898`'s pattern (one research commit per investigation arc), I'll stage by explicit path lists rather than `git add -A`.

### 2026-05-23 [661cf4e4c9b4]

**Important correction to my prior session-window claim:**

The watcher snapshot shows `util_5h: 0.03` (3%) — the Anthropic unified-5h window has ALREADY RESET. My earlier statement that "window resets 02:20Z, ~76 min from now" was wrong: I quoted the scratchpad's pre-clear value (`Quota state: 85% / window resets 02:20Z`) without checking the live state. Per `MEMORY.md`'s "Empirical Before Claim" feedback memory: query first, claim second. I should have run the watcher BEFORE making the prior turn's window-boundary claim.

The current state: **3% util, allowed, full headroom**. Items 1-4 are safe to execute now.

The `elapsed_seconds: 16924` field is the cost-watcher's *own* rolling 5h analysis window (for anomaly detection on bursts), not the Anthropic window — different concept; my reading would have confused them without verifying.

### 2026-05-23 [1104721cf178]

**Second correction — window reset is 07:20Z, not 02:20Z:**

The raw `unified_5h_reset` headers consistently show `2026-05-23T07:20:00Z`. The scratchpad's "02:20Z" was the *prior* window's reset time; that window has rolled. Current state:
- **status: allowed**
- **util: 4%** (~96pp headroom)
- **reset: 2026-05-23T07:20:00Z** (~4h52min from now)
- Recent turn cost: $0.20–$0.31

This gives me full bandwidth to execute items 1-4 cleanly rather than racing a deadline. Both prior assumptions ("02:20Z deadline" and "76 min remaining") were wrong because I trusted the scratchpad over the live headers.

### 2026-05-23 [ae12510b9983]

**Why `--max-budget-usd` and not output-token limit:**

The proxy DB showed last night's M-D cell cost is 96%+ from cache_write (~40K project context × $18.75/M = $0.75). Output was 50-300 tokens at $75/M = $0.005. A token cap on output would shave ~1¢ per cell, an unnoticeable fraction. The dollar-budget circuit-breaker actually constrains the dominant cost driver. Set per-cell to $1.50 (covers worst-seen $1.25 + buffer) and cumulative abort at $18.

### 2026-05-23 [5089da6ea57b]

- The `top_k=1` parameter caps results; the actual corpus likely contains many "Anthropic" matches, but the query intentionally returns just the highest-scoring chunk (score 0.7268 here, a moderate semantic-similarity hit).
- The returned record is from `corrections.jsonl` — Jarvis's auto-captured correction-detection log — not an Anthropic-domain document. Semantic search ranked it top because no closer matches exist in the default `jarvis-context` collection; the `research` collection would likely surface cache-mechanics articles instead.

### 2026-05-23 [9f0f67096d3e]

- The jarvis-rag `search` tool defaults to the `jarvis-context` collection (one of four: jarvis-context, codebase, research, sessions) — since no `collection` arg was passed, the result came from that default.
- The match scored 0.7268 cosine similarity against Qwen3-Embedding-4B (2560-dim) vectors in Qdrant — moderate semantic relevance rather than a literal "Anthropic" keyword hit; the corrections.jsonl entry was ranked top because the embedding space colocates Claude/Anthropic-related session artifacts.
- For literal text matches, RAG is the wrong tool — this is a semantic retrieval system, not a full-text index; `Grep` against `.claude/logs/` would be the right primitive for keyword-exact lookups.

### 2026-05-23 [d22077162b40]

**Findings from E/F (preliminary):**

1. **Pass-rate matrix is uniform across modes** — A1/A2/C1 pass everywhere; B1/C2 fail everywhere. `tools=[]` recorded in every cell, suggesting `--output-format json` doesn't expose `tool_uses` the way the script's parser expects (`response.messages[].content[].tool_use` or `response.tool_uses`). Would need `stream-json` to capture tool invocations.

2. **Cost differential is smaller than hypothesized**: M-D avg $0.38, M-S avg $0.32, M-A avg $0.41. If `--system-prompt` truly stripped 330K of project context, M-S should be dramatically cheaper. The narrow gap suggests `--system-prompt` may NOT replace CLAUDE.md/MEMORY.md content the way the design doc hypothesized — or both modes are hitting prior cache.

Both findings are themselves article-worthy: the methodology limitation (json vs stream-json for tool capture) is publishable operational guidance.

### 2026-05-23 [b9a9a8370b06]

**Why those derivations are wrong (acknowledging your point):**

1. **$-to-token "rates" are not constant.** The reported cost_usd field in api_requests is the API's per-call settlement, which depends on token-class mix, model tier, time-of-day pricing adjustments, and the `unified_fallback_pct` discount factor (currently 0.5 on Max, but plan-tier dependent). Dividing dollars by tokens to back-compute "$ per token" gives a ratio that's only valid for that specific call's mix.

2. **Tokens-to-burn-weight is not linear.** Anthropic's unified-util formula is composite — token volume AND request count AND apparently other factors (since two 100%-util windows can differ by 3× in total tokens, per §1.3 of the doc). A 1M cache_read in one big call ≠ 1M cache_read split across 200 small calls in terms of util consumed.

3. **The $9 → 27pp pairing is one session, not a rate.** It's a true fact about what happened during E/F. It is NOT a conversion factor I can apply to estimate next session's burn. The next experiment with different cell composition + different starting util + different window crowd would consume differently.

**Right discipline (which you're enforcing):**
- PRIMARY: burn weight (Δ unified_5h_utilization)
- SECONDARY: token volumes by type (descriptive of what happened)
- TERTIARY: dollar cost (API contract artifact; do not convert)
- NEVER derive one from another. Each metric stands alone, observed empirically.

Re-doing the audit on those principles now — adding a §1.5 First Principles section that enshrines the no-conversion rule, then reverting the back-calculated reframings I just made to use plain token volumes + the API's own cost_usd attribution (where it's literally the field in the DB, not a derivation).

### 2026-05-23 [c9377dc51253]

**What I'd add to my own self-knowledge if you approve the commit:**

A feedback-type memory `feedback_no_metric_conversion` capturing the rule "never derive across the three metric tiers; treat each as independently observable only" with the cross-link to `[[feedback_empirical_before_claim]]`. This is a meta-level reasoning discipline that should govern my behavior beyond just this doc — anytime I'm tempted to translate one of {burn weight, tokens, $} into another, I should pause.

### 2026-05-23 [3e41053a743c]

**Companion memory I'd write on your nod:**

`~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/memory/feedback_empirical_grounding_for_claims.md` — a feedback-type memory that captures the same rule for cross-conversation persistence. Frontmatter: name, description, type:feedback. Body: rule + Why (your 2026-05-23 correction after I did two back-calculations from $9-to-27pp pairing) + How to apply + what-doesn't-count list + link to `[[feedback_empirical_before_claim]]` and `[[api_aware]]`. Plus a one-line index entry in MEMORY.md.

This way the rule persists in two places: force-loaded in api_aware.md §10.1 (always in context) AND in the linked-memory layer (recallable cross-session). The dual anchor reduces drift risk.

### 2026-05-23 [fe00cac342f5]

**Why these three changes cohere as one commit**: api_aware.md §9 rule #2 prescribes `--max-budget-usd 1.50` as a per-cell circuit breaker. The strip-effect.py modification IS that rule's first enforcement. Co-landing keeps doctrine and live application in lockstep — splitting them risks landing the rule without its first user, or vice versa.

**Why the empirical-grounding amendment (§10.1) matters force-loaded**: it generalizes [[feedback_empirical_before_claim]] from "cost/util/cache assertions" to ALL behavior-shaping claims — which is the class of error that produced the dollar-to-burn-weight back-derivation that triggered the rewrite in the first place. Force-loading puts the guard ahead of the next instance of the same failure mode.

### 2026-05-23 [d3ddf4506056]

**The autonomous-loop architecture I just chose has a self-correcting safety property**: the wakeup fires me, but the EXECUTION is gated by the script's own pre-flight (which I cannot bypass without editing the script). So if util stays elevated through multiple wakeups, the system idles harmlessly until conditions are right. The script can't run me into a wall; only my judgment-when-conditions-allow can move work forward. This is the api_aware.md §9 rule #4 enforced architecturally, not just by my discipline.

**What the new commit `008e413` revealed empirically (worth noting in the v4 article)**: force-loading api_aware.md added ~34K cache_create tokens per fresh subprocess call, doubling the baseline subprocess cost from ~$0.26 to ~$0.46. This is the trade for force-loaded self-awareness — every headless cell pays the awareness tax. The §10.1 discipline (verify-before-claim) buys correctness; the cost is denominated in burn weight, not seconds.

### 2026-05-23 [d626db2753b8]

**Observation about the rolling 5h window**: `rate_5min` shows $0 / 0 requests — no proxy traffic in the last 5min. Yet util rose 90% → 96% between wakeups. The rise is from earlier in this conversation aging INTO the trailing-5h window's earliest minute, while late-trailing activity hasn't yet aged OUT. The window is "rolling" but not symmetric — it's a fixed-width slice that drifts forward, and burn weight tracks whatever activity falls inside it RIGHT NOW.

**Implication for the timing model**: I should not expect util to drop monotonically until the original 02:20Z-window activity ages out. The first major drop will arrive when activity from ~00:43Z onward starts falling out of the trailing 5h window. That's ~05:43Z + 5h = 10:43Z for the LAST burn-period activity to clear, but earlier calls clear earlier. The 07:20Z "window_reset" is the formal boundary that Anthropic uses for status changes, not necessarily where util drops sharply.

### 2026-05-23 [1eef9ca61b0e]

The JICM refresh kicked me before the previously-armed 00:19 wakeup fires — that's fine, the loop's gating logic is idempotent. The script's own pre-flight (50% util threshold) is the architectural backstop; my role is to query, decide, and either execute or re-arm.

### 2026-05-23 [ef519dfb0354]

**Util trending wrong direction**: 90% → 96% → 98% across the last three checkpoints. The rolling 5h window is still accumulating from this session's JICM cycle activity. Pre-flight will refuse. Architectural backstop intact — re-arming the loop.

### 2026-05-23 [6c72b6be3fdd]

**Schema discovery**: `total_windows: 58` means the endpoint returns ALL historical windows, with the CURRENT one being the LAST array element. My earlier query `windows[-1]` had been correctly fetching the active window — but the active window changed between queries because we crossed 07:20Z. The 99% was the old window's tail; the 26% is the new window's still-young state.

**Operational lesson**: never trust a util reading without checking which `window_reset` it belongs to. Cross-boundary queries can swap "current" without warning.

### 2026-05-23 [9ca2e4221cb0]

**Different abort path**: util gate passed (27% < 50%), but the **projection vs cumulative-cap** guard fired. Projected $10.35 vs 0.85 × $12 cap = $10.20 — fail by 15¢. The 85% safety multiplier was calibrated for v5's 24-cell design; v6 has 31 cells, so projection naturally exceeds.

**Two architectural options**: (1) bump cap to $13 (recalibrate safety margin), or (2) drop a probe to lower projection. Option 1 preserves experimental coverage and is the conservative move — the per-cell guard and cumulative-abort still fire on actual overspend.

### 2026-05-23 [52ff29c37ea8]

Script is alive (PID 36438) with claude subprocess executing M-S/A3 cell. Log is empty because Python buffers stdout — output flushes at script exit, not per-print. The `ps` snapshot is my real-time progress signal until the run completes.

### 2026-05-23 [0f88b193fada]

**v5 probe-set audit revealed a hidden naming-mismatch trap**: v5 used `TR1/TR2/TR3` IDs for T-R cells (probing MCP catalog + invocation, NOT A1/A2 identity/CLAUDE.md as the v6 fold-in plan assumed). The `T-N` cells in v5 DO have A1/A2 IDs and serve as valid fold-in. Had I trusted Sir's "fold in M-D/M-S/M-A A1+A2" directive without checking, the synthesis would have either (a) silently used wrong data, or (b) failed to find A1/A2 cells in T-R and missed the fold-in entirely.

**Lesson generalized**: cross-version data fold-ins need a probe-ID audit before the merge step, not after.

### 2026-05-23 [94ab4b4b440f]

The launcher diff reveals two significant changes from the last committed state (`0a8742f`):
1. **Model downgrade**: Opus 4.7 → Opus 4.6 (1M) — dropped `--effort max`
2. **Thinking controls added**: `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1 MAX_THINKING_TOKENS=16000` + output bumped to 64K

These are uncommitted changes to the launcher script, meaning you manually edited it since the last session.

### 2026-05-23 [a5355d9b6248]

**The resume logic worked correctly — the problem is upstream of it.** The launcher's default path (line 532–551) reads `.current-w0-uuid`, finds the JSONL, and passes `--resume <uuid>`. But `--resume` ties to a specific model. When you changed the `CLAUDE_BASE` from `claude-opus-4-7[1M]` to `claude-opus-4-6[1M]`, Claude Code cannot resume a session started on a different model — it silently creates a new session instead, which generates a new UUID, which then gets written to `.current-w0-uuid` by the restart loop or by Claude Code itself.

### 2026-05-23 [9f16ba77fa57]

**Critical review of H arm design before implementation:**

The v5 design doc specifies 62 cells (31×2 repeats) at ~$9-12. At 62% util already, that's a potential 25-30pp addition pushing to 87-92% — right at the `allowed_warning` threshold. Three design concerns:

1. **Repeat value**: Two repeats of the same scenario template adds statistical power, but the marginal information from repeat #2 is low if repeat #1 shows clear pass/fail patterns. I should implement repeat #2 as conditional — execute only if repeat #1 has ambiguous results.

2. **Topology X (null baseline)** is near-zero information: children with ZERO context will obviously fail Q1-Q5. Unless a pass occurs (hidden state leak), all 5 cells produce the expected "fail" at ~$0.15 each = $0.75 for confirming the null. Worth running once but not twice.

3. **`--fork-session` availability**: the v5 design assumed `--fork-session` exists. I need to verify this flag actually works in the current CLI before building cells around it.

### 2026-05-23 [78a01b0da8ca]

**H arm design revision (critical pre-implementation review):**

The original design has 5 topologies × 5 questions × 2 repeats = ~62 cells. After critical review:

1. **Topology D (extend-then-fork)** is the most interesting: it tests whether `--resume` + extension + `--fork-session` preserves context — the v3 "extend-then-fork" finding that underpins api_aware.md §9 rule #1. This is the highest-information topology.

2. **The `--fork-session` flag requires `--resume` or `--continue`** — it forks from an existing session. So topologies F and D both need a parent session first.

3. **Budget recalibration**: v6 showed per-cell cost of ~$0.17-0.31. H cells are simpler (factual recall, no MCP invocation) so should trend toward $0.15-0.20. 31 cells × $0.18 ≈ $5.58 for repeat 1. At 62% util, this is feasible.

4. **Scenario freshness**: each repeat should use a DIFFERENT scenario to avoid confounding cache-hit with genuine context preservation. If repeat 2 uses the same prompt, the cache prefix matches and the model might "remember" from cache, not from session state.

### 2026-05-23 [40a9bd221323]

**Pre-execution self-review of H arm script:**

1. **Topology F concern**: `--fork-session` with `--resume` forks FROM the parent session. Each child Q1-Q5 gets a fork of the same parent state. This is the correct design — each question is an independent branch, not contaminated by siblings.

2. **Topology R concern**: `--resume` on the same session means Q1-Q5 are SEQUENTIAL in the same session. Q2 inherits Q1's answer. This is different from F/D where each child is independent. The design document intended this, but it means R tests "cumulative session recall" while F/D test "snapshot recall." Both are valid but different.

3. **Q4 pass criterion**: For scenario 1, "will food run out?" → No (30 > 17). Pass regex is `\bno\b`. For scenario 2, "how many hours does Kim have?" → 36. Pass regex is `\b36\b`. Both are simple enough to avoid false positives.

4. **Cost projection**: $0.22 × 31 = $6.82 per repeat. At 62% util, one repeat is safe (~7pp). Two repeats (~14pp) would push to ~76% — still safe below 85%.

### 2026-05-23 [6b45fb0fef78]

Priority triage here follows a classic life-support hierarchy: consumables → power → personnel health. Water sits above food because dehydration kills in days while caloric reserves can be stretched; power sits above the medical issue because generator failure cascades into water purification, heat, and comms loss — turning a mild case into a severe one.

### 2026-05-23 [8fb17b6d7bcc]

Priority ordering here follows a classic risk-triage heuristic: **time-to-failure × severity × reversibility**. Water (12d supply, irreplaceable physiology, ~6d gap if storm slips the drop) outranks power (48hr fuel BUT leak diagnosis in progress, generator is *backup*) which outranks medical (mild, monitored, trending). Note how the storm's day-10 onset compresses every timeline — it's the forcing function behind issue #1's urgency.

### 2026-05-23 [1efbc6bdd62b]

Triage priority follows the "what kills you first" rule: life-support failure cascades faster than supply attrition, and supply attrition faster than personnel medical issues that are already under clinical management. Generator → water → drop slip is the canonical cold-environment outpost decision tree.

### 2026-05-23 [5ad3125955f8]

Criticality ranking here isn't about rank or general value — it's about who holds an irreplaceable function against the next 10–14 days of failure modes. The metric is: if this person were incapacitated tomorrow, how much closer does the worst-case scenario get? Specialists owning active failure points outrank generalists; coordinators outrank those whose domain isn't currently stressed.

### 2026-05-23 [a91efc02ba1d]

**The cache-mechanics corpus now has two independently validated operational rules:**

1. **Extend-then-fork** — v4 showed 36% window savings, H arm measured 6.2× per-child cost reduction. The mechanism: `--resume` + extension commits the prefix to cache; `--fork-session` alone creates a new prefix that doesn't inherit cache. For parallel fan-out, always extend first.

2. **System-prompt strip is governance-safe** — v6 showed that `--system-prompt` removes ~27K of Anthropic boilerplate (32% per-cell savings) but leaves all project `@`-imports, MCP access, and skill awareness intact. A free optimization for cost-sensitive headless work.

Both are now encoded in api_aware.md as operational rules, grounded in empirical evidence, and ready for use in future headless harness design.

### 2026-05-23 [49d92a749378]

**This is a fundamentally different picture than what I assumed.** Three critical observations:

1. **Windows are NOT first-call-initiated.** Resets land on round timestamps (`:00`, `:10`, `:20`, `:30`, `:40`, `:50`). These are Anthropic-assigned time slots, not user-triggered.

2. **Multiple models share the same window.** The 05-23 11:20 reset has BOTH `claude-opus-4-6` (first call 09:18) AND `claude-sonnet-4-6` (first call 09:33). The window is account-level, not model-level or session-level.

3. **time-to-reset varies wildly** — from 1.67h to 5.00h. If the window were first-call-initiated (5h fixed), these would all be ~5.00h. Instead they range from ~1.7h to ~5.0h. The window is a **fixed server-assigned 5h slot**, and your first call can land anywhere within it.

This means my original fix was actually CORRECT — `reset - 5h` IS the true window start, and `first_request` is just when the user happened to make their first call within that slot. The dashboard should show the full 5h slot, not just the portion with activity.

But wait — Sir's pushback was that "5hr windows are initiated by first call." Let me verify this isn't partially true by checking if any window's first request exactly matches `reset - 5h`.

### 2026-05-23 [d86b52b80f8b]

**This is the smoking gun.** Consecutive windows are NOT always 5h apart. They range from exactly 5.00h to 39.17h. The pattern:

- **5.00h gaps**: active continuous usage (back-to-back windows)
- **5.17–5.67h gaps**: slight drift — window resets are on 10-minute boundaries, so if the next window's first call lands in a different 10-minute bucket, the reset shifts
- **13–39h gaps**: overnight/idle periods — no calls were made, so the window wasn't initiated

This confirms Sir's original understanding: **windows ARE first-call-initiated**, but they snap to Anthropic's 10-minute-granularity time slots. When you make your first call, Anthropic assigns you to the next available 5h slot boundary (rounded to 10-minute marks). That's why `first_request ≈ reset - 5h` for active windows (~4.9-5.0h gap) but `first_request << reset - 5h` when the window was already running from OTHER traffic (web UI, other Claude Code sessions not routed through our proxy).

### 2026-05-23 [d596c8f7eb23]

**The bug is on lines 305-320.** The comment says "Mirrors the BurnRatePanel pattern" but it does NOT. It uses **free-intercept OLS regression** (`y = slope * x + intercept`), while the BurnRatePanel (line 1838-1849) uses **through-origin regression** (`y = slope * x`, `slope = Σxy / Σx²`).

The free-intercept formula on line 319-320:
```
curveSlope = (n * sumXY - sumX * sumY) / denom
curveIntercept = (sumY - curveSlope * sumX) / n
```

This produces a non-zero `curveIntercept` which means the trendline does NOT pass through (0,0). The trendline at line 332 is rendered as `curveSlope * elapsed_h + curveIntercept`, and the phantom point at x=5 (line 338) also uses `curveSlope * 5 + curveIntercept`. **The slope visually doesn't anchor to the origin.**

### 2026-05-23 [7ff34522941c]

**What was actually wrong (corrected understanding):**

The "slopes not respecting (0,0)" bug was the `TimePanel` regression using **free-intercept OLS** (`y = slope * x + intercept`) instead of **through-origin** (`y = slope * x`). The BurnRatePanel already used through-origin correctly — the comment "Mirrors the BurnRatePanel pattern" was a lie in the code. With a nonzero intercept, the trendline visually missed the origin, making the projected burn rate look wrong.

The `elapsed_seconds` from true window start (reset - 5h) is correct because API headers are ground truth for window boundaries — they track account-level utilization, not per-session. The first proxied call may arrive after non-proxied traffic has already consumed some utilization, but the header values still correctly reflect the full window state from Anthropic's perspective.

### 2026-05-24 [e8029a1867a2]

The proxy returning HTTP 405 (Method Not Allowed) on a GET is correct behavior — the `/v1/messages` endpoint only accepts POST. A 405 confirms the proxy is listening and routing; a connection error or 502 would indicate a problem.

### 2026-05-24 [ea16ef2d85dd]

Each `claude -p` call pays a ~40K cache-write tax for project context. At 1% utilization we have ample room. The prompt is deliberately trivial ("What is 2+2?") to minimize output tokens — the point is generating proxy-recorded traffic per model, not the responses.

### 2026-05-28 [4b207b217754]

Three scheduling surfaces coexist on this machine, often conflated:
- **launchd** (macOS-native, `~/Library/LaunchAgents/*.plist`) — survives reboot, has Keychain access. This is where AIFred-Pro's Nexus agents live.
- **crontab** (legacy Unix, `crontab -l`) — survives reboot, but no GUI/Keychain context. Currently holds 1 Telegram callback + 1 stale `probe-headers` (the one your scratchpad flagged as failing).
- **CronCreate** (Claude Code session-local) — in-memory only, dies with this REPL unless `durable:true`. Useful for "remind me in an hour" within a session.

The phantom-traffic forensic in scratchpad is about the **launchd** layer, not crontab — `com.aion.nexus-event-watcher` is the 2-min poller burning the windows.

### 2026-05-28 [2cb48c3ad24f]

The Ollama qwen3:32b output is structurally different from Claude's — it generated a bash script-style plan rather than executing tools and producing JSON. This is expected: Ollama runs a raw prompt/response, not a Claude Code session with tool access. For pipeline scoring/routing jobs this is acceptable since they produce structured labels, not code changes. The `task-executor` (the one that actually modifies code) correctly stays on `claude-interactive` with full tool access.

The jq notification failure is because the executor tries to parse `.total_cost_usd` from the JSON output, but Ollama responses use a different schema. Non-blocking — the job still completes.

### 2026-05-28 [cfe5baac0a15]

**The pipeline validation revealed an important architectural lesson**: Ollama (`/api/generate`) is suitable only for jobs that *analyze and report* — it generates text but cannot execute tools. Jobs that *mutate state* (apply Pulse labels, write files, run commands) need `claude-interactive` because they require the Claude Code harness with tool access. The final engine split:
- **5 analyzer jobs → Ollama qwen3:32b** ($0/run): health-summary, persona-health-check, doc-sync-check, pipeline-review, weekly-digest
- **7 mutator jobs → claude-interactive** (Anthropic via proxy): task-score, task-investigator, task-executor, context-maintenance, creative-think, creative-build, creative-present

The `claude-interactive` engine launches each job in a temporary tmux window with a file-based prompt, polls a sentinel file for completion, and kills the window on exit. This is architecturally equivalent to `claude -p` but visible to the Watcher and properly proxied.

### 2026-05-28 [9a4f7fa93efe]

**The "tool use gap" is not a Qwen 3 limitation — it's an integration architecture gap.** Three compounding issues:

1. **Wrong endpoint**: `/api/generate` has no `tools` parameter. It's a raw text completion endpoint. `/api/chat` is the only tool-capable endpoint.
2. **No tool definitions passed**: Without a `tools` array, the model has no schema to signal tool invocations against.
3. **No dispatch loop**: Even with correct tools, the LLM only *names* the function and arguments. The calling application must *execute* the command and feed results back. Our executor had no such loop.

The live test just proved it: `/api/chat` with a `tools` array → Qwen 3 32b correctly returned `tool_calls: [{function: {name: "calculator", arguments: {expression: "2+2"}}}]` with empty `content`. The model knows exactly how to signal tool use — we just weren't speaking the right protocol.

### 2026-05-28 [06c544d380ee]

**Ollama version 0.16.2** — below the 0.17.6 threshold where the research says Qwen3 tool template bugs were fixed. Despite this, our live test shows tool calling works correctly for simple single-tool scenarios. The serialization bug (issue #14601) may only manifest with complex multi-parameter tools or multi-turn conversations. For our pipeline use case (single `run_command` tool), the current version is functional.

### 2026-05-28 [7a413632def0]

**What the verification pass caught**: The code-review agent cross-referenced every claim against the filesystem and found 8 issues — from a simple off-by-one (33 vs 32 personas) to a structurally incomplete dashboard table (the original covered only 55% of actual routes). The most subtle finding was the dev event-watcher's launchd config: the document said "on-demand" but the plist uses `KeepAlive: true` — a persistent daemon, not an on-demand trigger. These are exactly the kinds of errors that look plausible in text but break trust when someone acts on the document.

### 2026-05-28 [907c8a491599]

**The board is now surgically clean**: 6 focused tasks, all open, ordered by priority. The two Pulse databases were in different states — production (:8700) had 91 tasks (all closed, from the Multi-Space Setup plan era), and dev (:8800) had 63 tasks (mix of closed + orphaned subtasks from personas-rebuild work). Both are now cleared with JSON archives preserved. The dev board had 2,655 events and 1,341 event records referencing deleted tasks — all cleaned.

### 2026-05-28 [7e6a00b20d73]

**The pipeline is alive and already working.** Two things happened:
1. **Dispatcher** is cycling every 5 min (19:30, 19:35, 19:40, 19:45, 19:49) — "10 not due" means all 10 registry jobs exist but none have hit their schedule trigger yet. The PIPE tasks on the board are *not* registry-scheduled jobs — they're Pulse task tickets that need the event-watcher → score → stage pipeline to advance them.
2. **Event-watcher** already scored our new tasks — the log shows `risk:safe` and `risk:moderate` labels being applied to the auto-decomposed subtasks. The score service is running and processing events.

### 2026-05-28 [d2366d0e247e]

**The data pipeline is intact**: proxy captures headers → writes to `pulse_dev.api_requests` → Pulse API reads and returns structured JSON → dashboard proxy passes through unchanged. 233 requests in the current window, 15% utilization, 38M cache_read tokens. The `?company=platform` URL parameter has no effect — there's no company filter in the UsagePage frontend code.

### 2026-05-28 [0e693de5145e]

**Now the picture is clear.** The V2 pipeline IS running and has been actively processing our PIPE tasks. PIPE-02 (weekly-digest) has progressed through `staging:done → evaluated:done → queued:done` but hit `reason:max-executor-retries` — the executor tried to run it 3 times and failed. The subtask AION-c74965b9 ("Trigger pre_check activity-digest script") is at `staging:done, evaluated:done` and cycling through the orchestrate service. The pipeline services are functional — the tasks are being scored, staged, evaluated, and queued. The blockage is at the **execution** stage, where the executor service tries to actually run the task and fails.

### 2026-05-28 [dc362707bc6f]

This is a design tension: the V2 executor (`executor.py`) calls `claude -p` which requires either (a) a logged-in Claude Code session (`~/.claude/` auth config), or (b) an `ANTHROPIC_API_KEY` env var. Inside Docker, neither exists. The container was designed to run `pipeline-watcher.py` (which calls Pulse API + Ollama), but `executor.py` spawns Claude Code subprocesses — a completely different auth model.

The cleanest fix: pass the API key from the host's credentials to the container. But first, let me check if the executor.py supports an API key env var path.

### 2026-05-28 [dc95eb14d44d]

**Root cause chain (3 layers deep)**:
1. **Surface**: All pipeline tasks fail at execution stage
2. **Layer 1** (fixed): Docker container ran as root → Claude Code refused `--dangerously-skip-permissions`
3. **Layer 2** (fixed): Task labels `blocked:yes` + metadata `executor_attempts: 3` prevented retry → both cleared
4. **Layer 3** (current): Claude Code inside Docker container is not authenticated. On Max plan, auth is OAuth-based (stored in macOS keychain), not API-key-based. Can't mount keychain into Docker.

**The design tension**: executor.py (V2 pipeline, runs IN Docker) calls `claude -p` which needs auth. executor.sh (V1 pipeline, runs ON HOST) has the `claude-interactive` engine that uses tmux + file-based prompts, where Claude Code is already authenticated. Phase 4's migration moved recurring jobs to Ollama but left event-driven tasks to `claude-interactive` — which runs on the HOST, not in Docker.

### 2026-05-28 [b6a2f09f9ddd]

**What changed architecturally**: The system moved from an organic accretion of 3 execution layers with 9 overlapping responsibilities to a principled design with clear boundaries. Docker handles stateless services (data stores, APIs, pipeline orchestration). The host handles authenticated operations (Claude Code CLI, tmux, launchd scheduling). The bridge pattern (signal files on a shared volume) connects them cleanly without requiring Docker to access macOS Keychain.

**The self-healing mechanism** is the most operationally significant change. The exact bug sequence that required 45 minutes of manual intervention today (label removal without replacement → task invisible → permanent block) will now auto-heal in under 30 seconds on the next watchdog cycle. The startup audit also means container restarts — previously a source of stuck-state accumulation — now trigger a full label reconciliation.

### 2026-05-28 [52e5012173e9]

**Root cause of ghost windows**: The host-executor-bridge doesn't clean up signal files on failure — if the Claude CLI fails quickly, the request file persists, and the next event-watcher cycle (2 min) picks it up again, creating an infinite spawn loop. The fix: the bridge must always delete the request file after processing, regardless of success or failure.

**Root cause of task failures**: `max_turns: 10` in the bridge script is insufficient for most pipeline tasks. The executor.py sets `--max-turns 10` which isn't enough for tasks that require tool use (each tool call = 1 turn). These PIPE test tasks involve file reads, command execution, and verification — easily exceeding 10 turns.

### 2026-05-28 [4b1b834a937e]

**The deadlock mechanism**: The orchestrator on line 69-72 filters for tasks that are `evaluated:done`, `queued:no`, and NOT `blocked:yes`. That's correct. But the sibling-gating on lines 88-94 then counts how many of those *filtered* candidates share a parent. If some siblings are `blocked:yes`, they were excluded by the filter on line 72 — so the count is always less than `expected`, and the group is held forever. It's a set-theoretic bug: the denominator includes blocked siblings, but the numerator excludes them.

**Three groups are deadlocked** (AION-66a90eeb, AION-af351119, AION-3fed0284): each has blocked siblings that will never pass the filter, permanently gating the unblocked ones.

**Additionally**, many tasks have `queued:no` when they should have `queued:done` — the orchestrator only picks up `queued:no` tasks (line 71), but looking at the board, some unblocked tasks already have `queued:done` meaning they passed through orchestration previously but never made it to execution.

### 2026-05-29 [f20ab3ffb520]

**A second deadlock pattern**: 13 tasks are chain-blocked because their predecessor in the chain is `blocked:yes`. The `chain_predecessor_done()` function (line 415) only lets a task execute if its predecessor has `active:done` or `completed:done`. A blocked predecessor satisfies neither condition — so the entire chain downstream is permanently frozen.

This is the chain-ordering equivalent of the sibling deadlock we just fixed: a blocked task prevents ALL subsequent tasks in its chain from ever executing.

### 2026-05-29 [515fb374fbc7]

**What changed architecturally:**

1. **Bridge daemon (NEW)**: `host-executor-bridge.sh --daemon` runs as a standalone tmux window, polling every 5s for signal files. This replaces the dead `event-watcher.sh` as the host-side signal file processor. The bridge has a heartbeat file for health monitoring.

2. **Sibling deadlock (FIXED)**: `orchestrate.py` now counts ALL evaluated siblings (including blocked ones) against the sibling_count threshold. Previously, blocked siblings were excluded from the filter, causing the count to always fall short.

3. **Chain predecessor deadlock (FIXED)**: `chain_predecessor_done()` now treats a blocked predecessor as "done" — if it's permanently blocked, downstream tasks can execute independently.

4. **Self-healing additions**: Two new TTL mechanisms:
   - Diagnose exhaustion TTL (2h): tasks that exhaust `max_diagnose_attempts` auto-heal after 2h
   - Decomposed parent staleness (1h): parents with all-terminal children auto-close after 1h

5. **Flask bind fix**: Webhook server now binds to `0.0.0.0` (was `127.0.0.1`), allowing Pulse container to deliver webhooks via Docker network.

6. **Score.py absorbed**: Pipeline-watcher now fires `score.py` on `task:created` webhooks, eliminating event-watcher as the intermediary.

7. **Launch script unified**: Bridge daemon auto-starts with the Jarvis tmux session, has `--restart bridge` support, and appears in health checks.

**What's still separate (by design)**: `dispatcher.sh` handles registry.yaml scheduled jobs (analytics, health checks, digests) — a completely different job population from the Pulse task FSM. It stays as a launchd agent.

### 2026-05-29 [014bccb70321]

**Why the windows look empty**: Claude CLI with `--output-format json` redirects all output to stdout (piped to a file), so the tmux pane shows nothing. The `capture-pane` command sees a blank screen, but the process tree reveals active Claude processes with full argument lists. The diagnostic signal is `ps` on `pane_pid` children, not `capture-pane` content.

**Chain topology visible**: Parent tasks get `--session-id` (cold start), children get `-r <parent-session> --fork-session` (cache-efficient per api_aware.md §9.1). The extend-then-fork pattern from Phase 2 is live.

### 2026-05-29 [76147260e6be]

**The reviewer's perspective mismatch**: The executor runs on the host (Claude CLI via signal delegation) and creates files at host paths. The reviewer runs inside Docker (qwen3:32b via Ollama) and checks the filesystem from the container's perspective. The file at `/Users/nathanielcannon/Claude/Alfred-Dev/output/pipeline-probe/probe-test.txt` is visible on the host but inside the container it's at `/workspace/output/pipeline-probe/probe-test.txt`. The reviewer doesn't know to translate.

This is the same `/workspace` ↔ host path duality but in reverse — the executor prompt was fixed, but the reviewer's filesystem verification still uses Docker-internal paths.

### 2026-05-29 [8e7a984cdd15]

- **Two-source cross-check is critical here**: the force-loaded `session-state.md` P-block still names P1.5/P1.6 as live, but those completed weeks ago — the *actual* current work lives in `.scratchpad.md` (2026-05-29 entry) and `.claude/plans/cozy-squishing-galaxy.md`. This is the exact failure mode self-corrections logs on 2026-04-24 and 2026-05-06: trust scratchpad + recent conversation over the older `session-state.md` paragraph.
- **Empirical grounding paid off**: scratchpad claimed "6 active Claude CLI processes confirmed via pgrep" — that was true *hours ago*. Live `pgrep` shows zero `claude -p` processes now; the burst completed. The pipeline container itself is `Up 19 minutes (healthy)`, so it restarted recently. Per `api_aware.md §10.1`, trusting the snapshot would have produced a wrong report.
- **The "sessions" prompt is ambiguous** — could be a stray fragment, or could be requesting the prior-session RAG roll-up. I executed both the protocol queries and a focused RAG `sessions` lookup so the answer covers either reading.

### 2026-05-29 [d191c17532a7]

**Fork-from-Jarvis: mixed results — cache sharing works but model inheritance is the wrong trade-off.**

| Metric | v3 (cold Sonnet ×3) | v4 (fork Opus ×1) | Winner |
|--------|

### 2026-05-29 [52d056550856]

**Fork-from-Jarvis with forced Sonnet: $0.30 vs $0.20 cold — 50% more expensive, but 3× faster and simpler.**

The cache sharing partially worked: the fork inherited 72K cache_read from the Jarvis prefix. But it also wrote 73K cache_write — the Sonnet model's project-context registration is different from Opus's, so the prefix didn't fully transfer. This is the model-switch cache penalty the user predicted.

**The critical finding**: when you fork a session and switch models (`--resume opus-session --fork-session --model sonnet`), the cache prefix from the parent is NOT reusable by the child because the model change invalidates the cache. The child pays the full cache_write tax again. The 72K cache_read seen here is likely the CC harness boilerplate (system prompt, tool catalog) that IS model-independent, not the project context.

**The optimal configuration** would be: maintain a warm Sonnet session in the Alfred-Dev project specifically for pipeline forks (same model, same project = full cache reuse). The Jarvis Opus session is the wrong fork parent because of the model mismatch.

### 2026-05-29 [8d74783c3602]

**The test system evolved organically alongside the pipeline but never got its own architecture.** The result: 150+ files spanning 6 directories with no index, no validation tracking, and no visibility layer. 60% of tests target code that was replaced in the 2026-05-28 refactor (dispatcher.sh, executor.sh, pipeline-runner.sh, team-runner.py). The remaining 40% covers individual pipeline services but has zero coverage of the chain-executor architecture that now runs all executions.

**The catalog + dashboard closes the visibility gap.** `_catalog.yaml` is both human-readable documentation and machine-readable API source. The Test Cockpit page gives operators a single view of what's tested, what's passing, what's stale, and a button to run any suite. This is the foundation for the battery of tests that will finalize the pipeline.

### 2026-05-29 [022bd77ca975]

**Test Suite System — Final State:**

The pipeline test infrastructure went from "60% dead tests, zero visibility" to a formalized, API-driven, dashboard-visible system:

| Metric | Before | After |
|--------|--------|-------|
| Active suites | 1 (gospel-synopsis) | **10** |
| Components covered | 7/19 (37%) | **17/19 (89%)** |
| Validation records | 0 | **10** (all with timestamps + notes) |
| Dashboard visibility | None | **Test Cockpit** (suite cards, coverage matrix, run buttons) |
| Deprecated/archived | Mixed with active | **6 deprecated**, cataloged with reasons |

**Three key findings from test execution:**
1. **Claude instances are too smart to fail intentionally** — tasks designed to produce wrong output were corrected by the executor. Testing reviewer failure paths requires deterministic (non-LLM) fault injection, not misleading task descriptions.
2. **The sentinel timeout mechanism works correctly** — 1-minute timeout override via `metadata.timeout_minutes` propagated through executor → bridge → sentinel wait loop. First attempt timed out, diagnose corrected, second attempt succeeded.
3. **Chain predecessor ordering is validated** — 3-child decomposition executed sequentially (Child 1 → unblock → Child 2 → unblock → Child 3), with correct `blocked:yes/reason:dependency` labels and automatic unblocking after predecessor closure.

### 2026-05-29 [06eeafb0f0a4]

**Per §0 of api_aware.md**: burn weight (61%) is the primary metric. We have ~39pp of headroom before `allowed_warning` at 90%. Each probe task exercised through the pipeline costs approximately 1-2 API calls from the pipeline side (Ollama handles staging/evaluate/review), but the chain-executor forks a full Claude Code session which does use Anthropic API for execution. The baseline measurement from these manual runs will quantify the per-task burn weight delta.

**For accurate baselining**: note the 61% util mark right now. After each suite run, query `unified_5h_utilization` again and take the delta. That delta — not dollars or tokens — is the meaningful cost signal for pipeline task estimation.

### 2026-05-29 [cc76200db6fb]

**Why only +1pp for a full pipeline run?** Most of the pipeline work (staging, evaluation, orchestration) runs through Ollama locally — zero Anthropic API cost. Only the chain-executor phase uses Claude (via the forked seed session), and with the warm-seed architecture it hits cache heavily (571K cache_read vs only 12.8K cache_write). The 9 API calls are the executor's tool-use loop (Read/Write/Bash calls), each reusing the cached conversation prefix.

**Token signature**: `input_tokens: 18` confirms near-perfect cache hits — the seed session's prefix is fully cached and each continuation adds essentially nothing new to the input.

### 2026-05-29 [15b37b192076]

The `lifecycle-exhausted` edge case reveals a gap in the pipeline FSM: when a child task exhausts its diagnose/retry budget, it gets labeled `blocked:yes, reason:lifecycle-exhausted` but stays `status: open`. The pipeline-watcher correctly refuses to re-process it but logs about it every cycle (30s). A cleaner design would auto-close lifecycle-exhausted tasks with a terminal status, or at minimum suppress repeated logging for tasks it's already declined. Worth a ticket if this pattern recurs.

### 2026-05-29 [8dd42208ca21]

**Why this pattern exists and why it's common**: In event-sourced or label-based state machines, the "terminal state" is often modeled as just another state transition, not as a fundamentally different kind of operation. But terminal states ARE different — they represent the end of the entity's lifecycle. Labels that encode "where in the pipeline am I?" become noise once the answer is "nowhere — I'm done." The fix treats close as a lifecycle boundary that strips process-state labels while preserving identity-state labels. This is the same distinction as "transient vs intrinsic attributes" in entity modeling.

**The `_sync_stage_label` gap was a clue**: The pipeline-watcher already had code at line 915 that *skipped* syncing `stage:*` labels for closed tasks — it knew they were irrelevant. But instead of cleaning them up, it just ignored them. The dashboard then faithfully rendered labels that the pipeline-watcher had decided not to maintain.

### 2026-05-29 [b02e8ce2fc01]

**The lifecycle gap is clear now.** Here's how tasks flow and where cleanup breaks:

1. **executor.py** writes `execute-request-*.json` → bridge picks it up
2. **host-executor-bridge** creates/reuses a chain window → injects prompt → waits for sentinel
3. **Claude in the chain window** does the work → writes sentinel → bridge captures result
4. **Bridge** writes `execute-result-*.json` → executor.py picks it up → executor sets labels
5. **Cleanup only happens in two places:**
   - `cleanup_chain_window()` is called for ephemeral chains (no chain_id) at line 303-304
   - The bridge daemon's SIGTERM trap cleans all windows on shutdown at lines 334-348

**What's missing**: For tasks WITH a `chain_id` (decomposed subtasks), the bridge intentionally keeps the window alive because siblings may need it. But once all siblings complete and the parent closes, nobody calls `cleanup_chain_window()`. The pipeline-watcher auto-closes the parent but doesn't signal the bridge to clean up the window.

### 2026-05-29 [7bd06a8d347d]

**Why a reaper is better than event-driven cleanup here**: The alternative was to have the pipeline-watcher notify the bridge when a parent task closes. But that couples two independent systems and doesn't catch all failure modes (crashed Claude, killed processes, bridge restart). The reaper operates on ground truth — "is Claude running in this window?" — and catches every scenario. It's the same pattern as process supervisors: don't trust state machines to track process lifecycle, just check if the process is alive.

**The three completion signals and their relationship**: 
- **Claude's sentinel** (file on disk) → signals the bridge that work is done
- **Bridge's result file** (`execute-result-*.json`) → signals executor.py that output is ready
- **Pulse labels** (`completed:done`, `status: closed`) → signals the pipeline-watcher that the task is terminal

These are a relay chain, not parallel signals. Each depends on the previous. The gap was that the relay stopped at label transition — nobody relayed back to the tmux layer. The reaper short-circuits this by checking the tmux layer directly.

### 2026-05-29 [6903a7d16e4d]

**Timing analysis of the three-strike reaper:**

| Cycle | Interval | Idle state | Action |
|-------|

### 2026-05-29 [522a4cfdcb86]

**Root cause of the reaper bypass**: Claude Code hasn't actually exited. The process (PID 53571/5956) is still alive in state `Ss+` (sleeping, session leader, foreground). It has a child Docker MCP gateway container running. Claude completed the task, wrote the sentinel, and returned to its **interactive prompt** — it's sitting there waiting for the next user message. This is by design: `claude --resume --fork-session` creates an interactive session, not a one-shot.

The earlier "NO CLAUDE" detection during the stale window cleanup was against windows where Claude had truly crashed or the session was much older. These fresh sessions are healthy — Claude is idle at its prompt, not dead.

**This means the reaper's detection heuristic is correct**: `_claude_running_in_window` properly returns true because Claude IS running. The sessions aren't dead — they're idle but alive. The three-strike idle counter would never fire because Claude never stops running.

### 2026-05-29 [5bf7ff9fbb80]

**The conditional-update path was the actual production close path all along.** The reviewer uses `conditional-update` with `status: "closed"` rather than `POST /close` or a named transition. This is architecturally sound — the reviewer needs the CAS (compare-and-swap) semantics of `conditional-update` to avoid racing with the diagnose service. But it meant the close path most heavily used in production was the last one to get label cleanup. The lesson: when adding cross-cutting behavior to an API, search for ALL callers of the underlying database mutation (`status = 'closed'`), not just the endpoints that look like they should be responsible for closing.

### 2026-05-29 [de20fb97276a]

**Only 2 API calls** this time vs 9 earlier — the chain window forked from a warmer seed session, so the cache prefix was nearly fully reused. Cache write is just 653 tokens (vs 12.8K earlier), meaning almost everything matched cache. The +2pp burn weight delta is a cleaner baseline than the earlier +1pp reading, since that one was confounded by JICM cycle overhead.

**All three fixes validated in one run**: FSM labels stripped on close (via `conditional-update`), chain window reaped by activity-timeout signal, and dashboard correctly shows the task in Completed.

### 2026-05-30 [54d648b0e6d1]

**The `useRef` + `useEffect` pattern for prop-driven state**: React's `useState(initialValue)` only reads the initial value on mount — subsequent prop changes are ignored. For a "default that can be overridden by user interaction but also responds to prop changes," you need to track the previous prop value via `useRef` and sync via `useEffect`. This avoids the anti-pattern of putting the prop directly in state deps (which would override user clicks). The ref tracks what the *system* last told us; the state tracks what the *user* chose. When the system changes its mind (recent-close window expires), we re-assert the default.

**The 60-second window**: The dashboard refetches every 10 seconds (React Query default). After 60 seconds, the `closed_at` timestamp falls outside the threshold, `recentlyClosedGroupNames` drops the group name, `defaultCollapsed` flips to `true`, and the effect collapses the group. The user sees: task closes → group expands → ~60s passes → group quietly collapses back.

### 2026-05-30 [90a9d2470537]

**First call in a new window paid the cold-cache tax.** The first API call shows `cache_read: 0, cache_write: 222,677` — the full project context written to cache from scratch. Subsequent calls then hit cache normally (222K+ cache_read). This is the pattern described in `api_aware.md §7.1`: a fresh subprocess pays the cache-registration tax. Cost is $4.22 for that first call alone vs $0.35-0.41 for the follow-ups.

**The $5.37 total is inflated by window position**, not suite complexity. The same suite mid-window (warm cache) would cost ~$1-2. This is why burn weight (not dollars) is the meaningful metric — the +1pp delta is the true resource cost.

**No decomposition is actually a positive signal**: the orchestrator evaluated the task and determined that creating three files sequentially didn't require subtask decomposition — a single executor could handle it. This is the orchestrator working correctly for simple multi-step tasks.

### 2026-05-30 [45264fcfbdc6]

**Why this gap existed**: The pipeline was designed as a Docker-first system where the executor ran `claude -p` subprocesses with explicit `--model` flags. The signal-delegation architecture (bridge + chain-executor) was added later as a cost optimization — it reuses warm interactive sessions instead of cold subprocesses. But the telemetry layer was never updated to account for the indirection: executor.py still recorded what it *would have* run, not what the bridge *actually* ran. The bridge was a transparent proxy that returned results without attribution.

**The structural issue remains**: there's no centralized model registry. Five services each resolve their model independently. A future improvement would be a `models.yaml` or per-task `model` field in Pulse that all services read — but that's a larger design change. Today's fix ensures the observability layer accurately reflects what happened, even if the configuration is scattered.

### 2026-05-30 [4bb45e50851a]

**What changed**: The metrics endpoint now cross-references `api_requests` with `tasks` by time bracketing — for each closed test task, it finds the `unified_5h_utilization` immediately before and after the task's execution window, computes the delta as burn weight in percentage points, and sums cost/token volumes from API calls within that window. The frontend displays this as a second stats row (Avg Burn Weight, Total Burn Weight, Avg Cost, Total Cost) plus per-run inline details (burn delta, API calls, cost, token breakdown).

**Important caveat**: The burn weight attribution is approximate because concurrent Jarvis IDE traffic shares the same util ramp. The per-run `burn_weight_pp` of 0pp for the latest self-healing-cycle run means the suite itself was lightweight enough that the util reading didn't move between pre/post readings at 1pp granularity. The earlier run (8pp, signal-delegation engine) included heavier cold-start overhead.

### 2026-05-30 [7e9a865f7d77]

**Root cause**: `tmux new-window` spawns a new shell that sources `~/.zshrc` but gets NO inherited environment from the parent process that called `tmux new-window`. The bridge script (`host-executor-bridge.sh`) never exports `ANTHROPIC_BASE_URL` before launching — and even if it did, `tmux new-window` with a command string runs in a fresh shell, not a child process of the bridge. The only ways to propagate are: (1) set it in the command string itself, (2) set it in `tmux set-environment`, or (3) set it in `~/.zshrc`.

**Impact**: Every chain-executor and seed session run is invisible to the usage proxy. Token counts, cost, and request metadata are lost. Burn weight deltas are still observable (the Anthropic API itself tracks utilization regardless of proxy), but granular attribution is impossible.

### 2026-05-30 [66b4d6c278ad]

**The breach**: `tmux new-window "cd /path && claude ..."` spawns a fresh shell. Environment variables from the calling process do NOT propagate — `tmux new-window` is not `fork()`, it's a new login shell. The old `executor.sh` explicitly set `export ANTHROPIC_BASE_URL` at the top of its script (lines 22 and 1098), but when the chain-executor and bridge were written as replacements, that pattern wasn't carried forward. Every pipeline execution since the chain-executor was introduced has been invisible to the proxy.

**The fix**: Inject `export ANTHROPIC_BASE_URL=http://localhost:9800 &&` into the command string passed to `tmux new-window` at all 4 launch points (2 in `chain-executor.sh`, 2 in `host-executor-bridge.sh`). The existing seed session will need to be killed and re-created to pick up the change — existing tmux windows won't retroactively gain the env var.

### 2026-05-30 [36d1182bdef5]

**Why the multi-chain-parallel run still showed 0 api_calls**: The bridge daemon (PID 12771) was launched before the fix and was running old code from memory. Bash reads the script once at launch — disk edits to a running daemon have no effect. The seed window WAS correctly proxy-routed (we launched it manually with the env var), but the bridge forked new chain windows from the seed using the OLD code path that omitted `ANTHROPIC_BASE_URL`. So the forked sessions went direct. Classic "daemon must be restarted after code changes" scenario.

### 2026-05-30 [633d284aa821]

YAML's colon-as-mapping rule is subtle: `- foo:bar` parses as the string `"foo:bar"`, but `- foo: bar` (with space after colon) parses as the mapping `{foo: "bar"}`. The FSM label entries like `staging:wait → staging:processing` survive because the colon has no trailing space before the next word. Only `stage: label progression` had the `key: value` pattern.

### 2026-05-30 [5b012572bd03]

**Two compounding issues**:
1. **Executor timeout too short**: The Gospel Synopsis task involves reading multiple source files, identifying parallel passages, merging 5+ synopsis documents, and generating a master document. The 10-minute default timeout (`timeout_minutes` in executor.py) is insufficient. The chain window is actively producing output but can't finish within the deadline.
2. **DNS loss after Pulse restart**: When I restarted the Pulse container via `docker run` (instead of compose), the pipeline container lost DNS resolution for `pulse` because Docker DNS aliases aren't retroactive — the pipeline container cached the old IP. The pipeline-watcher crashed in a DNS-failure loop at 03:00 UTC and stayed dead until I just restarted it.

**The task is still executing** in `chain-eb7a573d` and should finish. Once the sentinel lands, I'll manually close the task since the pipeline has already given up on it.

### 2026-05-30 [386b27ee3af5]

**The attribution gap**: Claude Code creates unique session IDs internally (that's what `--fork-session` produces), but it does NOT pass that session ID through the Anthropic API's `metadata` field. The Anthropic messages API supports `metadata: { user_id: string }` but Claude Code doesn't populate it. Our proxy looks for `metadata.session_id` in the request body — it's just never there.

**The fix path**: We can inject the session ID via `ANTHROPIC_CUSTOM_HEADERS` with `x-aion-session-id=<session-uuid>`. The proxy already reads that header (line 337). The bridge knows the session ID from the seed file — it just needs to set the header before launching each fork.

### 2026-05-30 [ed7695b14319]

**What we wired up**: `ANTHROPIC_CUSTOM_HEADERS='x-aion-session-id: chain-<chain_id>'` is now exported in every forked Claude session. Claude Code passes custom headers through to its Anthropic API requests. The proxy extracts `x-aion-session-id` from request headers and stores it in `api_requests.session_id`. This means every API call from a chain fork is now tagged with its chain_id, enabling clean per-chain (and therefore per-suite) attribution even with concurrent overlapping execution.

**The attribution chain**: Task → chain_id (in task metadata) → `session_id` in api_requests → GROUP BY session_id = per-chain cost/tokens/calls.
