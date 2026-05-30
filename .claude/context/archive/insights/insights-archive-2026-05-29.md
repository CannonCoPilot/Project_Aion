# Insights Archive — 2026-05-29
# Rotated: 2026-05-29T16:54:41Z (6 entries)

### 2026-05-12 [07a197f639ed]

**Two truths surfaced by the gh check.** (1) The PR was filed without a designated reviewer — which is why ProjectIntel showed zero David acknowledgment: not "David is busy ignoring it," but "David literally hasn't been told it exists" through GitHub's notification path. (2) The >300-files threshold tripping Copilot is a hard architectural signal that this PR's *shape* (single bundle of 110 commits) is wrong for the review tools that exist in the world, independent of David's bandwidth. Even if we add him as reviewer, he sees a PR that GitHub-side tooling has already refused to engage with — a meaningful trust-loop concern.

This re-frames the contingency: the "T2 → T3 → T4" tier I set assumed time was the variable. It isn't. **Structure is the variable.** T4's "split into thematic PRs" was scoped as a 14+-day fallback, but the Copilot bail-out at submission time is a same-day signal that we should be considering it now, not in two weeks.

### 2026-05-12 [c9dc7b08ab81]

**Two architectural truths the gh check exposed**: (1) PR #3 was filed without a reviewer assignment, so the "5+ business-day wait" tier in the original contingency was measuring against a clock that never started in David's world — `notifications/email pipeline` only fires on explicit reviewer-request, @-mention, or assignee-add. (2) GitHub Copilot bailed at 16:10:18Z (8s post-creation) on >300 files; that's a tool-level rejection of the PR's *shape*, independent of human bandwidth. Even after fixing (1), David walks into a PR that GitHub's own auto-reviewer refused to engage. The "structure is the variable, not time" reframe collapses the T2→T3→T4 schedule from weeks down to same-day.

**B2 is policy, not technical dependency** — the Phase D code now lives in 3 commits (`78693a3..65e2eef`) ready to push when policy clears. Workstream momentum need not wait on it; Watchdog W2 is pure-Jarvis with zero Alfred-Dev surface and can run in parallel regardless of which decision branch you pick.

### 2026-05-12 [a4af412af96e]

**The constraint isn't actually a contradiction — it's a forcing function toward a healthier topology.** "Don't merge nate-dev to main" + "don't gate dev on David" can both be satisfied if we stop using `nate-dev` as a long-lived accumulator and start treating each workstream as its own branch off `origin/main`. The principle: **PR-shape independence**. PR #3 stays exactly as it is (David's call); every new workstream files its own small, thematic PR off main. We ship to main via the same mechanism we always do (David's merge button), but each PR is small enough that the review-friction cost per merge is low. The "wait for PR #3" gate dissolves because nothing downstream needs to live on nate-dev anymore.

**This is also a low-trust-cost shift.** By proactively adopting small-PR discipline (rather than framing it as "PR #3 isn't getting reviewed, so we're routing around it"), we're not signaling distrust — we're signaling we recognized that 110-commit bundles were the wrong shape, and we're correcting going forward. PR #3 becomes a one-off historical artifact ("this is what 4 weeks of unbatched work looked like; we're not doing this again"), not a workaround target.

### 2026-05-12 [7abb6ff07ddc]

**This is the topology question, not a tactical one.** Migrating to CannonCoPilot reframes the entire collaboration model: AIFred-Pro becomes *your* primary repo with David invited as collaborator, rather than David's primary repo where you contribute through PRs. If David is winding down, this is actually the *kindest* path — it gives him a graceful exit (no longer responsible for review velocity), preserves attribution via license + commit history, and keeps the work alive under continuous stewardship. MIT-license permits the fork unilaterally; the relational move is to ask first, but you wouldn't be asking permission, just timing.

**The key architectural insight is that nothing in the running stack depends on the GitHub repo home.** Pulse API runs on localhost, Nexus services run on localhost, Jarvis MCPs all point at local paths, the credentials file references `github.aifred_token` but that's just a PAT not a URL. The migration is *entirely* GitHub-side; the developer workstation, services, and tooling all continue running through the cutover without missing a beat. That's the strong signal that migration is technically low-risk.

### 2026-05-12 [13bf23f32081]

**The migration is mostly already done.** `CannonCoPilot/AIFred-Pro` is a registered GitHub fork (`parent: davidmoneil/AIFred-Pro`, last pushed 2026-04-23), with `main`, `nate-dev`, and `nexus-sync-2026-04` already mirrored. `main` is exactly aligned with davidmoneil. `nate-dev` is at `e136fbc` (~3 weeks stale, before the May session series). The "migration" reduces to bringing the fork current with `git push my-fork nate-dev` plus adjusting remote conventions and workspace references. The infrastructure was set up for exactly this scenario — the April-30 prior-thinking plan exists in the workspace, which suggests you anticipated this exact pivot.

**Repo is technically clean for migration.** No submodules, no LFS, small (.git = 10MB, working tree = 312MB total). MIT-licensed (fork legally clean, attribution carried by LICENSE + commit history). No runtime dependency on the GitHub repo home — Pulse/Nexus services run from local paths, MCPs reference localhost. There are minor hygiene items (stash, exposed PAT in remote URL, drift on prod mirror) but none are blockers.

### 2026-05-12 [9a3539206e2d]

**The prior plan is the template for this one — it solves an isomorphic problem.** The April-30 plan re-pointed Jarvis origin from `davidmoneil/AIfred` → `CannonCoPilot/Jarvis`; this plan re-points Alfred-Dev origin from `davidmoneil/AIFred-Pro` → `CannonCoPilot/AIFred-Pro`. Same shape, same mechanisms. Most of my morning outline already mirrors the prior plan's stages by accident. The improvements come from extracting the prior plan's *philosophical commitments* (§5 "not our repo, not our deletion") and applying them consistently here.

**The §5 principle is load-bearing for the David conversation.** The prior plan's most-considered move was *not* deleting `davidmoneil/AIfred:Project_Aion` after the Jarvis migration — kept as fossil at David's discretion. Same logic must apply to PR #3 and `davidmoneil/AIFred-Pro:nate-dev`. We do not close PR #3 unilaterally. We do not push to davidmoneil/AIFred-Pro:nate-dev after migration. We leave both as fossils — PR #3 stays open at David's discretion. This is courteous AND preserves audit trail AND avoids forcing his hand. It also gives the Question/ to David a *softer* framing: "we're shifting our work to a primary home; your repo + PR #3 are unchanged and yours to dispose of as you see fit."

# Insights Archive — 2026-05-29
# Rotated: 2026-05-29T19:09:39Z (1 entries)

### 2026-05-12 [c2283ecd98a8]

**Three different "scrub" surfaces, each with different reversibility.** (1) **Forward-only content scrub** — easy and recommended: change 49 tracked files (per just-completed grep) before they ever touch CannonCoPilot/Alfred. Cost: per-file judgment, ~1-2 hr. (2) **Historical commit-message scrub** — destructive: requires `git filter-repo` to rewrite every commit's SHA in the 110-commit nate-dev range plus all ancestor history. Breaks PR #3's commit links, breaks any external SHA references, breaks David's local clones, breaks reflogs. Generally a bad idea even when scrub goals are real. (3) **Username-in-absolute-paths scrub** — pervasive but local-only: `/Users/nathanielcannon/...` appears in launchd plists, JSON archives, log files, but those don't go to GitHub (since they're not in tracked source). Recommended: not in scope.

**The pseudonymous author identity is already in place.** Recent commits show author = `CannonCoPilot <177279335+CannonCoPilot@users.noreply.github.com>` — already neutralized via GitHub's noreply email. No personal name in author lines on commits. **The only commit-history "Sir" references are 3 stash entries** (`On nate-dev: stash E2E executor artifacts`) which won't get pushed since stashes don't propagate. The real scrub work is the 49 tracked files.

**The rename is bigger than the topology migration.** Renaming `AIFred-Pro` → `Alfred` cascades through ~10 launchd plists, Pulse runtime, dispatchers, event-watchers, watchdogs — all currently running services bound to the old path name. This requires either a maintenance window (5-15 min downtime) or symlink-bridge (zero downtime, technical debt). Worth treating as its own dedicated phase, not folded into the topology push.

# Insights Archive — 2026-05-29
# Rotated: 2026-05-30T02:44:50Z (13 entries)

### 2026-05-12 [f5ea91af334e]

**The Question/ is doing two jobs simultaneously: courtesy notification *and* trust-loop preservation.** A migration like this could easily be read as "I'm done with you" by David — especially the rename, which symbolically distances. The draft addresses that risk by leaning hard on optionality: he can accept admin, decline, set custom permissions; PR #3 stays open at his discretion; davidmoneil/AIFred-Pro is unchanged; reversibility called out explicitly. The "future shared Archon repo" mention is intentional — it frames the rename as forward-looking architecture, not a break.

**The "no urgency" language is load-bearing.** Three places in the draft explicitly disclaim time-pressure on David's response. That's deliberate: if he's winding down, the worst experience for him is reading a Question that implies "you need to respond." The draft is designed to be acknowledgeable with a single thumbs-up reply, or to sit unread without any harm.

### 2026-05-12 [cc3973102881]

**`CannonCoPilot/Alfred` already exists as a separate repo**, created 2026-04-23 (~21 days ago, same day as the AIFred-Pro fork). Description: "Cloned dev version of Dave O'Neil AIfred project." Not a fork (parent=none), private. The rename command silently failed (or my JSON parser swallowed the conflict error) because GitHub doesn't allow rename to an existing name. The canonical state is now: AIFred-Pro and Alfred both still exist as distinct repos under CannonCoPilot. No data lost; no rename executed.

**This is exactly the kind of gotcha that destructive-action protocols catch.** The Phase 1.1 step assumed a clean target name; reality has prior history at that name. Resolution requires checking what's in the existing Alfred repo and deciding fate (delete, rename to something else, merge content) before retrying the rename.

### 2026-05-12 [52e52d61ac9a]

- **W0's API path runs through the cost-attribution proxy.** Per the launch script, W0 (and W5) export `ANTHROPIC_BASE_URL=http://localhost:9800` so every Claude API call routes through `usage-proxy/proxy.py` for cost telemetry. If that proxy dies, the session gets exactly this error — the Claude CLI tries to TCP-connect to `localhost:9800` and gets `ECONNREFUSED` because nothing is listening.
- **Other plausible failures** are LiteLLM on `:4000` (if the session routes through it instead), the MLX-Embed service on `:8000` (less likely — only affects embeddings, not chat), or a Docker network drop. Triage in order of likelihood, fastest checks first.
- **Diagnostic order:** `lsof -iTCP -P -n` for what's actually listening; `docker ps` for container state; tmux capture of W0 to see the exact error context; then env-var inspection of W0's shell.

### 2026-05-12 [db662ca68739]

- The PROD `com.aion.anthropic-proxy` launchd job (PID 97735) is still alive on `:8877` — but the recent scratchpad flagged that one as an **orphan with its source file moved**. Repointing W0 to it as a quick fix is technically possible but risks routing live cost telemetry through code you've already decided to decom.
- The session is still recoverable from inside W0 — it's at 23% context (226K tokens), idle, and just waiting on the next API response. No state is lost; you just need `:9800` back or a fresh env without `ANTHROPIC_BASE_URL`.
- LiteLLM at `:4000` is alive and could in principle serve as a substitute API endpoint, but its config is for the Litellm-routed model fleet, not the Anthropic-direct path W0 wants. Don't repoint there.

### 2026-05-12 [94c9e9c2885f]

The scratchpad was *correct as of the moment it was written* but the session continued past it. Between scratchpad-save and JICM trigger, a whole topology migration began executing: PR #3 contingency → fork-rather-than-wait pivot → repo rename on GitHub (CannonCoPilot/AIFred-Pro → CannonCoPilot/Alfred; pre-existing Alfred → Alfred-prod-archive-2026-04) → 113 commits pushed to Alfred:main → maintenance window opened (Phase 2.2 service stops). The error that triggered JICM landed mid-Phase-2.2.

### 2026-05-12 [79df854d87c4]

**Phase 2 maintenance window CLOSED but unfinished.** Containers are back UP — but local directories were never renamed (`Alfred-Dev` still exists at the original path; no `Alfred-Dev` anywhere). The JICM-triggering error (`ConnectionRefused`) was likely an Anthropic API blip mid-Phase-2.2; *something* brought Docker back up (autorestart/manual) before the rename step. Phase 2.3-2.5 never executed. **And `aifred-dev-pipeline` is in a restart loop** — likely the Phase D event-watcher/score.py code hitting a runtime issue the direct-invocation smoke didn't catch.

### 2026-05-12 [f6fad6c18e2b]

**Pre-existing latent bug from 2026-04-30, NOT a Phase D regression.** Commit `77145a9` did three things together: (a) renamed `event-watcher-v2.py` → `pipeline-watcher.py` ("canonical name"), (b) added the `pipeline` Docker service, and (c) wrote the new service's `Cmd:` + healthcheck to the *old* filename. The container has been silently restart-looping for 12 days. Nobody noticed because the **host-side** `pipeline-watcher.py` (PID 15622 — killed in Phase 2.2 today) was doing all the actual orchestration work. Now PID 15622 is gone and the container has never functioned, so there's currently zero pipeline-watching happening anywhere. This is what the Wiggum-loop "Drift" check is for — the layered failures (container broken at infra + host-side killed at session-level) hid the issue until the host-side fallback was removed.

### 2026-05-12 [97cdd42f60d8]

**Pipeline container is healthy for the first time in 12 days.** It registered as webhook subscriber id=2 (the stale id=1 from the old host-side process is now the durable "Pulse webhook hygiene" future-work entry already in §6.2 row 445 — the symptom just got worse since both old and new subscribers now exist). It also picked up an in-flight task (AION-4c7cd284) immediately, confirming the container is doing real work, not just a healthy-no-op. Flask-poll-only mode is acceptable fallback (the heartbeat poll loop runs independently).

### 2026-05-12 [bda43962ca0a]

`--print` is the cleaner pick — no `send-keys` timing complexity, no multi-line gotcha, and the prompt arrives atomically as one command-line arg. The worker just becomes: spawn → run → exit → window self-kills. The trade-off is no mid-stream intervention, but that's acceptable since the recipe JSON encodes the entire decision tree upfront. Building v1 now with this design.

### 2026-05-12 [0cbb793cf0c1]

**Order matters for the :9800 window.** Git pushes don't route through :9800 (SSH direct to GitHub), but the *tool-result delivery* from each Bash call does. So all commits + pushes happen BEFORE the worker run (while :9800 is up), the scratchpad gets a pre-worker checkpoint, then the worker fires with `run_in_background=true` so W0's tool call returns instantly and the :9800 outage doesn't strand a pending result.

### 2026-05-12 [bfa91ca30512]

**Recipe completed in 101 seconds** (21:26:38Z → 21:28:19Z), with phases tracked cleanly: launching → preflight → down → repair[0..5] → wait_healthy → validate → complete. All 6 containers healthy at new path. :9800 healthy.

**Two flags to inspect**: (1) `/Users/nathanielcannon/Claude/Alfred-Dev` still exists with 1 child — something recreated it after the mv (worker reported the mv succeeded). (2) `stale_refs_in_dir: 2623` — the audit found 2623 Alfred-Dev references inside `/Alfred-Dev`. Worker classified them as "caches/logs/archives, non-failing" but that count is high enough to warrant a Phase 3 inventory.

### 2026-05-12 [77c0ea6d11c7]

**Ghost dir explanation**: The OLD plist had `StandardOutPath`/`StandardErrorPath` pointing at `/Alfred-Dev/.claude/logs/headless/event-watcher-v2*.log`. Between `mv` (repair[0]) and `launchctl unload` (repair[1]), there was a ~6 second window where macOS's `KeepAlive: true` likely triggered a relaunch attempt — and **launchctl auto-creates parent directories** for StandardOutPath if missing, even when the program fails to start. That's the ghost. Safe to `rm -rf` now (current plist points at `/Alfred-Dev/...` per the user's intentional update I just received).

**Stale refs breakdown of 673 files**: 669 are in `.claude/` (caches, archives, historical logs — informational, non-load-bearing). Only **4 files are load-bearing**: `docker-compose.dev.yml`, `usage-proxy/...`, `tests/...`, `README.dev.md`. Those need Phase 3 scrubbing.

### 2026-05-12 [3750842708f3]

This is the classic JICM-compressor-stale-checkpoint failure mode — qwen3:8b summarizers prioritize the highest-token-density content and overshoot when the active scratchpad is short relative to surrounding canonical docs. The scratchpad-cross-check protocol (`self-corrections.md` 2026-05-06 entry) catches it cleanly. The checkpoint here pulled Chronicler paths from an old session, but the scratchpad's `2026-05-12 (post-topology-rename)` entry is the authoritative resume target.

