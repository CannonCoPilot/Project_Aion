# Project Aion — Production-Readiness Audit & Completion Roadmap

**Date:** 2026-07-16
**Author:** Jarvis-dev (8-agent parallel deep review)
**Scope:** Full platform — Jarvis (Master Archon) + Alfred (Operations Archon), all features and operations
**Method:** 8 read-only reviewers, one per subsystem; every claim verified against file content, live process state, and state-file timestamps. Findings cite `file:line`.

---

## 0. How to read this document

- **Section 1** is the verdict and the one theme that explains most of the defects.
- **Section 2** is the live incident register — things broken *right now*, some needing your decision.
- **Section 3** consolidates all findings by severity across subsystems.
- **Section 4** is the unbuilt register (everything planned but unfinished, by maturity).
- **Section 5** is the phased remediation + completion roadmap (M0–M5).
- **Section 6** is the per-subsystem production-readiness scorecard.
- **Section 7** is the immediate next-actions shortlist.

Severity: **P0** = broken/dangerous now · **P1** = major gap · **P2** = minor/hardening · **P3** = polish.

---

## 1. Executive verdict

**The platform is architecturally ambitious, substantially built, and — in its data plane — genuinely solid. Its control plane is not production-grade, because the systems that are supposed to guarantee reliability report green while silently failing.**

The unifying failure mode across all eight subsystems is **silent degradation** — precisely what the workspace's own MANDATORY "No Silent Degradation" guardrail forbids. Concretely, tonight:

- The Jarvis master session (W0) sat at **100% context** for 7.5+ hours while JICM reported **25% / WATCHING**.
- The **entire PreToolUse safety layer** returns `{"continue":true}` for `sudo rm -rf /` — proven empirically — under `bypassPermissions`.
- The **L5 knowledge-graph write path** had been dead for **3 days**; the memory health monitor never probed the dependency that failed.
- **Daily-scheduled Nexus jobs have never fired once** (a macOS `date` incompatibility); the creative pipeline is a production line that has never produced.
- The **event-watcher daemon has been dead 27 days**, taking project auto-advancement and the only utilization gate with it — unalarmed.
- The dashboard confidently renders **$0.00 spend** from a zombie endpoint.

None of these announced themselves. The uniting lesson: **Aion is excellent at doing work and poor at noticing when its own organs stop.** Production-readiness here is less about new features than about making reality match the dashboards — closing silent-failure holes, restoring the guardrails that were consolidated into no-ops, supervising the unsupervised, and paying down migration debt so the alignment machinery stops describing a system that no longer exists.

**Three cross-cutting themes** organize the remediation:

1. **Security & secrets (P0).** Plaintext live credentials sit in **11+ git-tracked, GitHub-pushed files** (Postgres, Neo4j, proxy DB, Anna's key). Pulse exposes 93 unauthenticated routes on `0.0.0.0` — including endpoints that write persona-permission YAML to the host filesystem. Execution forks run `--dangerously-skip-permissions`. Rotation, not just deletion, is required (history is public).

2. **Silent failure & observability (P0–P1).** Safety hooks that are no-ops; memory circuits dead for days; jobs that never ran; give-up/park states that log instead of ALERT — all reporting healthy. The guardrail exists in prose; the machinery to honor it does not. Every autonomic circuit needs an exit-code check and an alert channel.

3. **Migration debt & drift (P1–P2).** Pre-migration paths (`~/Claude/Jarvis`, `AIFred-Pro`) wired into live hooks, scripts, cron, and docker labels; identity docs describing a tmux topology (`jarvis`), Archon roster (Jeeves/Wallace), and filesystem that no longer exist; version truth split three ways; a planning-tracker that points at dead files and never blocks.

**Bottom line:** the path to production is **~5–8 weeks of disciplined remediation**, front-loaded with a security-and-truth emergency pass, not a rebuild. The architecture is sound; the wiring and the watchers are what fail.

---

## 2. Live incident register (state as of 2026-07-16 04:00)

| # | Incident | Evidence | Action needed |
|---|----------|----------|---------------|
| L-1 | **W0 master session at 100% context**, JICM blind to it | `aion:0` pane "257503 / 100%" vs `.jicm-state-hook.json` `used_percentage:25, action:WATCHING`; soft-threshold no-fire loop 14:54→22:21 | **Your call**: `/clear` W0 (but see L-2 first). I will not inject `/clear` into your master session unprompted. |
| L-2 | **Current JICM checkpoint built from the W11 dev session**, not W0 | `.jicm-last-compression.json` sourced `fbd7528a…jsonl` (this review session) | Do **not** rely on JICM auto-resume for W0 until prep is UUID-scoped (M1). A manual checkpoint is safer. |
| L-3 | **PreToolUse safety layer is a live no-op** under bypassPermissions | `bash-safety-guard.js:486` `context.tool` (should be `tool_name`); empirical: `sudo rm -rf /` → `{"continue":true}` | Fix schema bug (M0). Until then, treat destructive Bash as unguarded. |
| L-4 | **11+ tracked files contain live plaintext credentials**, pushed to GitHub | `current-plans.md:19`, `usage-proxy/jsonl_parser.py:33`, `graphiti-auto-ingest.py:38`, `graphiti-prepopulate.py:42`, `restore-mcp-config.sh`, `graphiti_mcp_server.py:75`, +5 | **Rotate all** (public history), then purge (M0). |
| L-5 | **L5 Graphiti ingest dead 3 days** (Ollama was down); no backfill | `graphiti-auto-ingest.log` FATAL Jul 12→15; health monitor never probes :11434 | Ollama is back; add exit-code check + backfill queue (M1). Checkpoints from those 3 days are absent from the graph. |
| L-6 | **W9 Commands tmux window dead** (signal→injection channel down) | pane is bare zsh, zero children | Respawn; add worker-tier supervision (M2). |
| L-7 | **event-watcher daemon dead 27 days** | plist unloaded; last log 2026-06-18; project-advance-all + burn gate offline | Resurrect or formally retire + port duties (M1). |
| L-8 | **Dead cron every 5 min** against nonexistent `AIFred-Pro` path | `crontab -l`; `telegram-callback-handler.sh` path absent | Remove/repoint (M0 hygiene). |
| L-9 | **caddy (SSO ingress) down 2 days**, Caddyfile mount error | `docker ps` Exited(127); serves `auth.onomatologos.org` | Fix mount + migrate compose into repo (M2). |

---

## 3. Consolidated findings by severity

### P0 — Broken or dangerous now

| ID | Subsystem | Finding | Evidence |
|----|-----------|---------|----------|
| P0-1 | Hooks | Entire Jarvis PreToolUse guard layer is a silent no-op (`context.tool` vs `tool_name`); both Bash and Read/Write/Edit registrations dead; `bypassPermissions` active | `bash-safety-guard.js:486`; `context-injector.js:166`; empirical bad-payload test |
| P0-2 | Infra / Pulse / Memory | Plaintext live credentials in 11+ tracked files (Postgres, Neo4j, proxy DB, Anna's key) — repo is pushed to GitHub | `current-plans.md:19-20`; `jsonl_parser.py:33`; `graphiti-auto-ingest.py:38`; `graphiti-prepopulate.py:42`; `graphiti_mcp_server.py:75`; +6 |
| P0-3 | JICM | Model-window table unaware of Fable 5 → 300K threshold unreachable → autonomic context mgmt failed on live W0; TUI saturation failsafes removed in v7.9 with no replacement | `jicm-gate.sh:140-148`; `jicm-config.sh:59`; `jicm-watcher.sh:697`; live W0 state |
| P0-4 | Memory | L4 "session" collection self-wipes each cycle (delete-by-constant-source) → 1-deep rolling buffer, not long-term memory | `jicm-auto-ingest.py:136-145`; Qdrant `sessions`=235 pts, all Jul-15 |
| P0-5 | Memory | L5 graph write-path silently dead 3 days; health monitor blind to the Ollama/LiteLLM deps L5 uses | `graphiti-auto-ingest.log`; `jicm-watcher.sh:564-633` |
| P0-6 | Pulse | Live `pulse_dev` password hardcoded as env-default in tracked file | `usage-proxy/jsonl_parser.py:33` |
| P0-7 | Vision/Version | Three-way version split; changelog discipline broken | `VERSION`=5.12.0; `CHANGELOG.md:14`=5.11.0; `session-state.md`=v5.15.1 |

### P1 — Major gaps

| ID | Subsystem | Finding | Evidence |
|----|-----------|---------|----------|
| P1-1 | Pulse | 93 routes, zero auth, bound `0.0.0.0`; destructive routes incl. persona-YAML host writes; `PULSE_SERVICE_TOKEN` read once, never enforced | `app.py:46`; `docker-compose.dev.yml:33,54`; `app.py:3710` |
| P1-2 | Pulse | Dollar-cost zombie: dashboard shows confident $0.00; dead `MODEL_PRICING`/`_compute_cost` still ship; 29,411 legacy estimated rows contradict "NULL by design" | `app.py:2273-2364`; `proxy.py:37-44,355-373`; `frontend/src/api/usage.ts:309` |
| P1-3 | Nexus | Daily-scheduled jobs never fired (GNU `date -d` on BSD macOS); creative pipeline never produced; stall detection exempts never-run jobs | `dispatcher.sh:367,372,1151`; 0 rows in 173K log lines |
| P1-4 | Nexus | event-watcher dead 27 days → project auto-advancement + only utilization gate offline, unalarmed; Styx now a single point of failure | `event-watcher.sh:357`; plist unloaded |
| P1-5 | Nexus | Give-up/park states log but don't ALERT (contra guardrail); heal-TTL auto-unblock → silent infinite retry, unbounded spend | `watcher L748-778, 235-293`; `executor.py:698-731` |
| P1-6 | Memory | Recall reflex ~75% permanently disabled — `.retrieval-state.json` never reset; 9/12 triggers suppressed since May; `recent_projects` saturated | `relevance-retrieval.js:164-174`; state `session_start`=2026-05-16 |
| P1-7 | Hooks | Zero of 16 January-audit guardrail functions operative: consolidated into the no-op guard (P0-1) + permission-gate.js, which emits invalid `messages` output field | `permission-gate.js:194-200`; `archive/ARCHIVE-LOG.md` |
| P1-8 | Hooks | 4 memory-autonomic hooks point at pre-migration transcript slug → insight capture dead for current sessions | `insight-capture.js:20`; `memory-mirror.js:15`; `context-health-monitor.js:57`; `relevance-retrieval.js:24` |
| P1-9 | Hooks | orchestration-detector scores system-injected text as user prompts (misfired all session); debug `console.log` lines corrupt JSON stdout → injected verbatim | `orchestration-detector.js:96,484-530,496` |
| P1-10 | Hooks | Registered Stop hook uses forbidden `set -euo pipefail` → self-kills before its own corruption handlers when a Ralph loop is active | `stop-hook.sh:7` |
| P1-11 | Skills/Agents | Cull silently failed for agents/commands — `_disabled/` + `_archive/` still load; deprecated v6 compression agents invocable; AC-03 milestone review only works *because* it imports the disabled `project-manager` agent | live agent list; `review-milestone.md:164` |
| P1-12 | Infra | Zero database backups — restic validation exists, restic never installed; all state in Docker volumes | `weekly-health-check.sh:35`; no `~/.restic` |
| P1-13 | Infra | Worker tier (MLX, LiteLLM, JICM watcher, Styx, Commands) has no restart-on-failure; dies to a `read` prompt; W9 dead now | `launch-aion.sh`; live tmux |
| P1-14 | Memory/Infra | MLX embed ~85GB leak has no automated mitigation (watchdog/periodic restart) | `qwen3-embeddings-mlx/server.py`; launchd absent |
| P1-15 | Pulse | Fresh deploy breaks half the API — migration split-brain (`public.*` auto-created; 12 `pulse.*` tables only via hand-applied SQL; no runner) | `app.py:149-251`; `migrations/0001,0002` |
| P1-16 | Pulse | Vite container "unhealthy" 2 days — BusyBox wget hits `::1`, vite binds IPv4-only; one-line fix | `docker-compose.dev.yml:120`; `vite.config.ts:10` |
| P1-17 | Vision | Tier-2 strategic force-load (`current-plans.md`) is 100% Chronicler (PAUSED) — contradicts Tier-1 `.active-plan` (OriginalDR); planning-tracker enforcement is fictional (milestone hook never blocks; points at dead `current-priorities.md`) | `current-plans.md`; `planning-tracker.yaml`; `milestone-coordinator.js` |
| P1-18 | Vision | Identity drift: tmux `jarvis`→`aion`; Archon roster names unbuilt Jeeves/Wallace and omits real Alfred/Keryx; Phase-6 delivered outside the roadmap with no status markers; PR-13 acceptance layer never built | `personas/jarvis/CLAUDE.md:47`; `archon-identity.md`; `roadmap.md:826-998` |

### P2 — Hardening (condensed)

- **JICM:** stale `.compression-done.signal` skips fresh compression on next autonomous cycle; REST triggers broken both directions; state-file read-modify-write race every 5s; HUD context gauge wrong-by-inheritance; `cache_hit_rate` always 0; cycle degradations terminate as success without alert. (`jicm-prep-context.sh:692`; `jicm-watcher.sh:386-426,169-185,369-390`)
- **Nexus:** cost controls decorative (`max_budget_usd` serialized, never enforced; burn gate dead); persona `permissions.yaml` bypassed by `--dangerously-skip-permissions` forks; jobs.db written from both sides of Docker boundary (WAL over virtiofs corruption risk); container mount gap persists (reviewer sees only `alfred/`); `.claimed` requests never rescanned after crash (2 stale + 10 orphaned results). (`bridge L67,243,370-377,678`; `executor.py:870,1009`)
- **Pulse/Proxy:** PATCH `/tasks/{id}` bypasses dimension-label validation → FSM corruption; no request models (malformed JSON→500 not 400; uncapped `limit`); proxy re-parses non-JSON upstream bodies → transparency break; attribution only ⅓-wired (306/306 requests `unattributed`); monitoring stack unrunnable (path bug); prod compose rotted; standing red pytest entries. (`app.py:599-602,469`; `proxy.py:129-133`)
- **Memory:** two embedding runtimes write one graph (MLX 4-bit vs Ollama) → vector inconsistency; silent 8KB truncation into L5 (91% loss on 86KB summary); no tests for either MCP server; `except: pass` swallows; 0 community nodes. (`.mcp.json`; `graphiti-auto-ingest.py:112`; `mcp_server.py:270`)
- **Infra:** dead cron every 5 min; event-watcher plist unloaded + excluded from preflight; launcher attach-path only reconciles 5 of ~11 windows (dead Watcher never resurrected); compose label-bound to pre-migration symlink paths; ollama + MLX listen `0.0.0.0` unauthenticated; authentik/caddy run from unmigrated `AIFred-Pro`.
- **Skills:** overlap clusters (research×3, maintenance×6, context/compression×7, orchestration×4); 3 stale indexes (`_index.md`, `skills/CLAUDE.md`, `agents/CLAUDE.md`); capability-map missing AI_OCR + token-compression; autonom-ops/self-ops cite nonexistent commands; `browser.md` writes `/tmp`; Jarvis orchestration commands reference unconfigured mcp-gateway.
- **Vision:** dead upstream-sync foundation (`~/Claude/AIfred` mirror gone, PR-3 never retired); broken design-doc paths in roadmap; `ideas/API_error_rate` holds 881 lines of misfiled personal interview-prep; aifred-integration roadmap not reconciled (M7/M8 "not started" though skills exist).

### P3 — Polish (condensed)

Broken `/Users/aircannon/` symlinks (×3); ~15 unwired JICM-era scripts (~350KB) + 6 cache-mechanics experiments; `.claude/test/` **and** `.claude/tests/`; 4 `settings.json.pre-*` backups; 9 `.bak-phaseH` files; root DF artifacts (`Year [0-9]*`, `WorldGenRuns/`); `models/` 87MB as plain git blobs (LFS installed, unused); 23/49 Jarvis commands lack frontmatter; `example-command.md.backup.*`; AC-04 doc claims v8.0 / wrong thresholds; no CI (`.github/` absent); `pulse/.pulse.pid` tracked.

---

## 4. Unbuilt register (planned but unfinished)

Buckets: **IDEATED** (concept only) · **DESIGNED** (spec exists) · **STARTED** (partial code) · **BUILT-NOT-HARDENED** (works, unverified/unsupervised).

### Autonomy program (the biggest gap — Phase 6 delivered without its acceptance layer)

| Item | Source | Bucket | Note |
|------|--------|--------|------|
| PR-13 telemetry / benchmark suite / scoring / **regression-detection gate** | `roadmap.md:953-998` | STARTED | The mechanism meant to *prove* autonomy works and gate evolution on regressions — never built. This is the central acceptance gap. |
| PR-12.5 reflection **engine** (`reflection-engine.js`) | `roadmap.md:911` | IDEATED | Exists only as `/reflect` skill-prompt + hook; no engine |
| PR-12.7 R&D discovery automation (`research-agenda.yaml`) | `roadmap.md:923` | IDEATED | Skill-prompt only; no agenda/scheduler |
| PR-11.6 autonomic test framework | `roadmap.md:863` | DESIGNED | Plan doc only |
| PR-10.5/10.6 Setup Upgrade + v2.0.0 release | `roadmap.md:762,794` | DESIGNED/IDEATED | Formal Phase-5 close never done |
| PR-14.3-14.5 SOTA comparison / adoption / research scheduler | `roadmap.md:1018` | STARTED | Catalog populated Feb, untouched 5 mo; no scheduler |
| Demo B / Demo C acceptance runs | `roadmap.md:1487` | IDEATED | Never run |
| PR-15 Toolset Expansion Automation | `ideas/current/toolset-expansion-automation.md` | IDEATED | — |
| PR-16 Self-Constitution Framework | `.claude/proposals/jarvis-self-constitution-proposal.md` | DESIGNED | 12-wk plan |
| Jeeves Archon (cron persona), Wallace Archon (creative) | `roadmap.md:65-66` | IDEATED | Never built; roster to be corrected |

### Infrastructure & reliability (net-new capabilities the platform lacks)

| Item | Bucket | Note |
|------|--------|------|
| Database backup system (all 3 Postgres + Qdrant + Neo4j) | IDEATED | Validation code exists, backup layer never migrated |
| Worker-tier supervision (launchd KeepAlive for MLX/LiteLLM; watchdogs for JICM watcher, Styx, pipeline container) | DESIGNED | Heartbeat files exist, nothing watches them |
| MLX memory watchdog / periodic restart | IDEATED | Leak known, unmitigated |
| CI floor (secret scan, shellcheck, `docker compose config`, plist lint) | IDEATED | No `.github/`, no pre-commit |
| Pulse migration runner + schema-version table | DESIGNED | Numbered SQL exists, no runner |
| JICM v8 watcher/worker split + PTY backend | DESIGNED | `jicm-watcher-worker-split.md` "not started"; `jicm-inject-pty.sh` stub |
| L5 ingest retry/backfill queue + failure alerting | IDEATED | Only service-down alerting exists |

### In-flight project work (the actual active portfolio)

| Item | Bucket | Note |
|------|--------|------|
| OriginalDR batches v6–v9 (version banner, per-book track-filter, apparatus expansion, re-OCR ladder, S2 full OCR) | STARTED-ACTIVE | `.active-plan`; commit/push on HOLD |
| Palimpsest audit remediation (4 crit/high, 9 warnings, coverage) | STARTED | 1 mo old |
| Chronicler Phases 4–7 (narrative ~60% pre-built, viz, advanced, production) | STARTED-PAUSED | Needs new embark |
| Nexus 39-component ecosystem validation | IDEATED | Checklist at `alfred/docs/nexus-job-ecosystem-audit.md` |
| Knowledge Horizon | DESIGNED | "no implementation exists" |
| team-runner.py consumer jobs; `instincts/`; `pipeline_triggers` | BUILT-NOT-WIRED | Machinery exists, unused |

---

## 5. Remediation & completion roadmap

Six milestones. **M0–M2 are remediation (make it safe, true, and supervised); M3 is consolidation; M4–M5 are completion (finish the autonomy vision).** Each milestone has an exit gate. Effort estimates assume focused Jarvis-dev sessions.

### M0 — EMERGENCY: security & truth (target: this week, ~1–2 days)

*Stop the bleeding. Nothing else proceeds until credentials are rotated and the safety no-op is closed.*

1. **Rotate every exposed credential** (Postgres `chronicler`/`jarvis`, Neo4j, `pulse_dev`, Anna's key), then purge from all tracked files and rewrite history (BFG/`git filter-repo`). Files: P0-2 list. Wire `alfred/scripts/scan-secrets.sh` as a pre-commit hook so it can't recur.
2. **Fix the PreToolUse safety no-op** (P0-1): replace `context.tool`→`tool_name || tool` in `bash-safety-guard.js:486`, `context-injector.js:166`, `cross-project-commit-tracker.js`, `docker-monitor.js`. Add a smoke test that pipes a real CC-schema bad payload through every registered hook and asserts a block.
3. **Fix JICM Fable-5 sensing** (P0-3): persist `context_window_size` from statusline stdin (v9 already receives it) into a state file the gate/watcher trust; add a `used_pct ≥ N%`-of-real-window autonomous trigger so a threshold can never sit above the ceiling; restore one TUI-saturation failsafe.
4. **Version truth** (P0-7): pick one number, set `VERSION`/`session-state`/`CLAUDE.md` footer to it, backfill `CHANGELOG` 5.12→current.
5. **Kill dead automation** (L-8): remove/repoint the 5-min `AIFred-Pro` cron.

**Exit gate:** no live credential in any tracked file; bad-payload smoke test blocks; W0-class session cannot silently saturate; one version everywhere.

### M1 — Truth & safety: make reality match the dashboards (Weeks 1–2)

*Every autonomic circuit gets an exit-code check and an alert channel. This is where "No Silent Degradation" becomes real machinery, not prose.*

1. **Memory circuit integrity** (P0-4, P0-5, P1-6):
   - Stop the L4 self-wipe: make ingest `source` unique per cycle (path + session_id/timestamp); replace delete-by-source with real decay pruning.
   - Add Ollama:11434 + LiteLLM:4000 to `check_service_health`; make watcher check ingest exit codes (steps 5.5/5.6c/5.9); on failure write `.memory-health-alert` (Sir + Jarvis) and enqueue a retry/backfill.
   - Reset/TTL `.retrieval-state.json` (`injected`, `mcp_injected`, `recent_projects`) on SessionStart to re-arm the recall reflex.
2. **JICM correctness** (P1 cluster): scope prep to W0 via `.current-w0-uuid`; add role guards to `pre-clear-context-prep.sh` + `jicm-precompact.sh`; clear/age-validate `.compression-done.signal` at cycle start; route cycle-degradation events to a real alert channel; separate the REST prompt-timestamp from the watcher refresh timestamp.
3. **Nexus silent-failure closure** (P1-3, P1-4, P1-5): fix `is_daily_due` for BSD `date` (or hard-require coreutils and fail loudly) + alert on "enabled job never ran > N days"; resurrect or formally retire event-watcher and port `/projects/advance-all` + burn gate into pipeline-watcher; make every terminal/park path `notify_msgbus` critical; add a cumulative-cycle cap on the heal-TTL retry loop.
4. **Hook guardrail restoration** (P1-7, P1-8, P1-9, P1-10): fix `permission-gate.js` output shape; repoint the 4 stale-slug memory hooks to `$CLAUDE_PROJECT_DIR`; add provenance skip + strip debug lines in orchestration-detector; `stop-hook.sh:7`→`set -o pipefail`; give every JS hook a shared `logError()`→`.claude/logs/hook-errors.log`.
5. **Pulse auth** (P1-1): enforce `PULSE_SERVICE_TOKEN` on write routes (middleware) *or* bind ports to `127.0.0.1` in compose as an interim; same for proxy/dashboards.

**Exit gate:** every autonomic circuit fails loud, not silent; W0 checkpoints are W0-sourced; no unauthenticated destructive route on the LAN; a hook that breaks writes a log line.

### M2 — Supervision & reliability: no unsupervised organs (Weeks 2–4)

1. **Backups** (P1-12): nightly launchd `pg_dump` (×3 instances) + Qdrant snapshot + Neo4j dump to a Synology-synced path; re-point `weekly-health-check.sh` validation at it.
2. **Worker-tier supervision** (P1-13, P1-14): move MLX-Embed + LiteLLM to KeepAlive launchd agents bound to `127.0.0.1`; scheduled MLX restart to cap the leak; watchdog for JICM watcher, Styx `.bridge-heartbeat`, and the pipeline container; extend launcher attach-path to respawn *all* dead windows.
3. **Pulse deployability** (P1-15, P1-16): migration runner (alembic or startup SQL-applier over `migrations/` + `schema.sql`) so a fresh deploy yields the full 24-table schema; fix vite healthcheck →`127.0.0.1:5173`; give pipeline a liveness-real healthcheck; mount workspace root to close the reviewer mount gap.
4. **Dollar-cost excision** (P1-2): drop `/usage/session-spend-dollars` + its dashboard consumers; delete dead `MODEL_PRICING`/`_compute_cost`; NULL-or-archive the 29,411 legacy cost rows so the datastore matches "NULL by design."
5. **SSO/authentik** (L-9): repair Caddyfile mount; migrate authentik/caddy compose into `infrastructure/`; delete the `AIFred-Pro` remnant.
6. **CI floor:** minimal GitHub Actions — secret scan, shellcheck, `docker compose config`, plist lint.

**Exit gate:** every daemon has restart-on-failure; databases are backed up nightly and validated; a fresh `docker compose up` yields a working Pulse; CI blocks a secret or a broken compose file.

### M3 — Hygiene & consolidation: clean the workspace (Weeks 3–5, parallelizable with M2)

1. **Make the cull real** (P1-11): relocate `.claude/agents/{_disabled,_archive}` and `.claude/commands/_disabled` *outside* the discovery tree (`.claude/archive/`) — **after** unblocking AC-03 (restore `project-manager.md` to active or rewrite `review-milestone.md` to single-level).
2. **Plan-corpus hygiene** (Vision): stamp status headers and archive the ~79 COMPLETE/STALE/ABANDONED plan files to `.claude/plans/archive/`; keep the OriginalDR spine (gosling/dijkstra/jazzy/knuth) in place.
3. **Refresh the stale trio + map:** regenerate `skills/_index.md`, `skills/CLAUDE.md`, `agents/CLAUDE.md`; add AI_OCR + token-compression to capability-map; update autonom-ops (v7.9 thresholds) and self-ops.
4. **Overlap consolidation:** merge `/tooling-health`+`/health-report`→`/health`; pick canonicals for the research, context/compression, and orchestration clusters; resolve the 10 drifted cross-archon duplicate commands.
5. **Repo bloat & cruft:** gitignore the runtime-state class (`.current-w0-uuid`, insights archives, `.alfred-observer-*`, `.rest-ran-*`); delete `.bak-phaseH` (×9), root DF artifacts, `~/Claude/aircannon` symlinks, `.claude/test`↔`tests` merge, settings backups, cache-mechanics experiments; LFS-or-ignore `models/`; move misfiled `ideas/API_error_rate` and alfred-root task outputs.

**Exit gate:** deprecated agents/commands no longer load; `.claude/plans/` shows ≤6 active files; indexes match disk; `git status` is clean of runtime churn.

### M4 — Alignment & autonomy completion, part 1 (Weeks 4–6)

*Rebuild the drift-prevention machinery so the platform can hold its own alignment — then finish the reflection/evolution engines.*

1. **Rewrite Tier-2 `current-plans.md`** (P1-17) to the real portfolio (OriginalDR active + spine pointers; Palimpsest remediation; Chronicler paused) — remove the plaintext password.
2. **Planning-tracker v3:** drop `current-priorities.md`; register the OriginalDR spine; reconcile aifred-integration entries; either make the milestone gate actually block or honestly re-label it advisory; enforce `mark_status_complete` so triage never needs inference again.
3. **Identity refresh** (P1-18): persona `CLAUDE.md` tmux section (`jarvis`→`aion`, current window map); `psyche/_index.md` Soma root; `archon-identity.md` roster (add Alfred/Keryx, mark Jeeves/Wallace retired-concept); roadmap epilogue recording Phase-6-as-built (AC-01..10) with PR-13 reopened as the outstanding gap.
4. **Reflection/evolution engines** (PR-12.5/12.6): build the `reflection-engine.js` that reads corrections + selection-audit + git history and files evolution proposals; wire the risk-gated evolution pipeline that already has `evolution-queue.yaml`.
5. **Autonomic component test framework** (PR-11.6): the harness to validate AC components in isolation — prerequisite for trusting autonomy.

**Exit gate:** Tier-1 and Tier-2 agree; the tracker references only live files and either blocks or admits it doesn't; identity docs describe the system that exists; reflection produces at least one validated proposal end-to-end.

### M5 — Autonomy completion, part 2 + the acceptance layer (Weeks 6–8)

1. **PR-13 measurement layer** — the central acceptance gap: telemetry aggregation, a benchmark runner with 10+ scenarios (incl. the one-shot PRD + Demos B/C), a scoring framework, and a **regression-detection gate that blocks evolution on regression**. Without this, "autonomy works" is unproven.
2. **R&D cycle** (PR-12.7/14): `research-agenda.yaml` + discovery automation + a research scheduler over the SOTA catalog.
3. **Nexus completion:** execute the 39-component ecosystem validation against a rewritten `nexus-automation.md`; enforce per-task budget at proxy/bridge; reconcile persona `permissions.yaml` with the bypass forks; wire or retire team-runner/`instincts/`/`pipeline_triggers`.
4. **JICM v8** (optional, if the M1 fixes prove insufficient under load): the watcher/worker split with a job queue, atomic claim, retry+backoff.
5. **Formal release:** close PR-10.5/10.6, cut the v-next release with a real changelog, and record the platform as production-operational.

**Exit gate:** a benchmark run scores autonomy quantitatively; a deliberately-introduced regression is auto-blocked; the 39-component validation passes; one clean release with accurate changelog.

---

## 6. Production-readiness scorecard

| Subsystem | Data/Core | Control/Safety | Verdict | Blocking items |
|-----------|-----------|----------------|---------|----------------|
| JICM & context | v7.9 architecture clean, mostly built | Sensing failed on live model; no watchdog; silent degradations | **NEEDS-WORK** | P0-3, P1 cluster |
| Hooks & settings | Lifecycle hooks well-engineered | **Guardrail tier is an illusion** | **NOT-READY (safety)** | P0-1, P1-7..10 |
| Skills/agents/cmds | Alfred corpus exemplary; research-ops/token-compression production-grade | Cull failed; indexes stale | **NEEDS-WORK** | P1-11 |
| Memory & knowledge | L1/L3 healthy; capture/rotation genuinely autonomic | L4 self-wipes; L5 dead 3 days; recall suppressed | **NOT-READY** | P0-4, P0-5, P1-6 |
| Nexus factory | Core lane operational; hardening verified in code | Never-ran line; 27-day-dead limb; park≠alert | **NEEDS-WORK** | P1-3..5 |
| Pulse/proxy/dash | Strong dev state-of-record; dashboard clean, tsc-green | No auth; $0 zombie; no migration runner | **NEEDS-WORK** | P0-6, P1-1,2,15 |
| Infrastructure | Docker tier solid (15/17 healthchecked) | No backups; no worker supervision; no CI | **NEEDS-WORK** | P1-12,13,14 |
| Vision/plans/identity | Rich corpus; Tier-1 pointer works | Alignment machinery decorative; drift everywhere | **NEEDS-WORK** | P0-7, P1-17,18 |

**No subsystem is production-READY today.** All are recoverable without redesign. The two **NOT-READY** verdicts (hooks-safety, memory) are the priority because they are actively lying about their own state.

---

## 7. Immediate next actions (the shortlist)

1. **Decide L-1/L-2**: whether to `/clear` W0 now (I will not do it unprompted); a manual checkpoint is the safe path until JICM prep is UUID-scoped.
2. **M0 kickoff**: rotate credentials + fix the PreToolUse no-op + JICM Fable-5 sensing. These three are the difference between "audited" and "safe."
3. **Approve the milestone shape** (M0–M5) or reprioritize — e.g., if you want the autonomy acceptance layer (M5/PR-13) pulled earlier, or Chronicler/OriginalDR project work interleaved.
4. **Choose the tracking substrate**: I can file the P0/P1 items as Pulse tasks with `agent:jarvis`/`agent:aifred`/`agent:shared` labels so remediation flows through the factory Alfred is meant to run — which also dogfoods the exact pipeline this audit is trying to make production-grade.

---

*Full per-subsystem reports (INVENTORY, FINDINGS with file:line, UNBUILT REGISTER, VERDICT) available on request — this document is their synthesis. Generated by 8 parallel read-only reviewers, all findings verified against live file content and process state.*
