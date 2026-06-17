# Insights Archive — 2026-06-04
# Rotated: 2026-06-04T19:18:35Z (9 entries)

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

# Insights Archive — 2026-06-04
# Rotated: 2026-06-04T23:38:34Z (11 entries)

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

# Insights Archive — 2026-06-04
# Rotated: 2026-06-05T01:17:26Z (7 entries)

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

# Insights Archive — 2026-06-04
# Rotated: 2026-06-05T03:38:35Z (10 entries)

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

# Insights Archive — 2026-06-04
# Rotated: 2026-06-05T05:00:07Z (2 entries)

### 2026-05-14 [584d70daa37a]

**The strategic frame for this call.** Ryan has already made his determination — the F coding is in the system, the letter has issued. He almost certainly will NOT reverse himself on this call. So the goal is NOT to win the case here. The goal is to: (a) plant your inadvertent-error narrative in the case file before the appeal, (b) probe procedural questions (opt-out, email notification) on the record, (c) gather information about the source/composition of the $1,706 figure that you'll need at the hearing, and (d) leave Ryan with a clear impression of a good-faith, organized claimant. Anything you say to Ryan can be cited at the appeal hearing — by either side. Treat it as testimony.

### 2026-05-14 [63ef19950df4]

**The hidden value of this call is what shows up at the hearing.** ALJs are required to consider "the conduct of the parties" when evaluating credibility on intent. A claimant who, post-determination, calls the investigator, asks careful questions, follows up with a written statement, attends legal aid, and files a timely appeal is presenting a different credibility profile than a claimant who only surfaces when subpoenaed. None of these things prove your innocence — but they substantially shape the ALJ's read on whether you were operating in bad faith. Be the organized, good-faith claimant. The call records that.

