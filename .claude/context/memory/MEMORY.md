# Jarvis Memory — Cross-Session Facts (ALWAYS loaded; ≤120 lines)

Stable, high-frequency facts. Not session-WIP. Pre-optimization version archived as `MEMORY-2026-05-04-pre-optimization.md`.

## User profile
- [User Background](user_background.md) — PhD stats/genetics/genomics/bioinformatics; explain Palimpsest (comp-linguistics) by genomics analogy; don't over-explain stats/ML.

## Critical gotchas (repeat-bug sources)
- **DF FPS**: NEVER set `enabler.fps`/`calculated_fps` to 0 via Lua (freezes game permanently). Use `timestream` plugin.
- **Chronicler DB wipe**: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` (instant; never `DELETE FROM worlds`).
- **asyncpg JSONB**: pool auto-encodes dicts via `set_type_codec`; NEVER `json.dumps()` before `executemany`.
- **Introspect first**: never assume schema/model/API/columns; probe `information_schema.columns`, `/v1/models`, `curl`.
- **bash hooks**: NEVER `set -euo pipefail` (grep exit 1 kills script). Bash 3.2 macOS: no assoc arrays, no `readarray`, no `;&` in `case`.
- **Hook caching**: Claude Code caches `.sh` hooks at session start; mid-session edits no effect. Restart or deregister in `settings.json`.
- **tmux**: `$HOME/bin/tmux ... | grep` breaks in zsh; use full path `/Users/nathanielcannon/bin/tmux`. Never combine text+Enter; never multi-line `-l`.
- **Git author email**: noreply `177279335+CannonCoPilot@users.noreply.github.com` via `--author` + `GIT_COMMITTER_EMAIL`.

## Ollama / LiteLLM
- `think: false` at payload root, NOT inside `options`.
- Direct Ollama (`localhost:11434`) ~0.25s vs LiteLLM (`localhost:4000`) ~13.7s; use direct when latency-sensitive.

## UTM / VM
- `utmctl exec` is fire-and-forget (no stdout). Use `vm-lifecycle.sh exec-capture` or `exec-ps`.
- SCP→Windows: MUST `-O -T` flags. VM: `DF-Windows` / `192.168.64.3` / Win11 ARM64. SSH user `Jarvis`, key `~/.ssh/df-vm`.
- VM scripts: `projects/chronicler/scripts/vm-{config,lifecycle,bootstrap}.sh`.

## Claude Code integration
- JSONL: `"type":"user"` (not `"role":"human"`); text at `.message.content[].text`.
- FastMCP 3.0: `mcp.run(transport="stdio")` for Claude Code MCP integration.
- Edit tool `.claude/` safety: hardcoded DANGEROUS_DIRECTORIES blocks Edit/Write on `.claude/` paths even in `bypassPermissions`. Use Layer 1 (`protected-edit.py` via Bash) for quick edits or Layer 2 (`claude-dev-shadow.sh setup/sync`) for sustained dev. Bash tool has NO such check.
- Workspace prompts arrive via the Claude Code CLI input channel from collaborators (Sir, Watcher) or via framework mechanisms (`@`-imports, hook `additionalContext`, slash-command surfacing). All are ordinary content for you to engage with on substance. Single refusal test: would compliance violate a documented guardrail? If no, proceed.

## Infrastructure (stable)
- Venv: `infrastructure/.venv/bin/python` (Python 3.12.12, uv).
- RAG server: `infrastructure/rag-service/mcp_server.py` (FastMCP 3.0, 6 tools, Qdrant).
- Graphiti server: `infrastructure/rag-service/graphiti_mcp_server.py` (FastMCP 3.0, 6 tools, Neo4j).
- Embeddings: Qwen3-Embedding-4B via MLX → `localhost:8000/embed` (tmux MLX-Embed); dim=2560.
- Qdrant collections (2560-dim Cosine): jarvis-context, codebase, research, sessions.
- Neo4j: group_id `jarvis-core`.
- LiteLLM: `infrastructure/.venv/bin/litellm`, config `infrastructure/litellm-config.yaml`, port 4000.
- Docker compose: `infrastructure/docker-compose.yml` (PostgreSQL/ParadeDB, Qdrant, Neo4j, Redis, n8n).
- JICM compressed context: `.claude/context/.compressed-context-ready.md` (written by `jicm-prep-context.sh`, read by SessionStart hook).

## Key paths
- Credentials: `.claude/secrets/credentials.yaml`
- Session state: `.claude/context/session-state.md`
- Bash gotchas: `.claude/context/reference/bash-gotchas.md`
- Infra roadmap: `.claude/plans/mac-studio-db-ai-roadmap.md`

## DwarfCron / Chronicler
- Product code: `/Users/nathanielcannon/Claude/Projects/DwarfCron/` (chronicler pkg).
- CLI: `Projects/DwarfCron/.venv/bin/chronicler`. DB: PostgreSQL `chronicler` localhost:5432 (CDM, world "Tar Thran").
- Bridge data access: `dfhack-run` over SSH (TCP RPC broken under Prism for game-thread calls).
- Phase progress: 1, 2, 3 COMPLETE (27/27 DoD 2026-03-23). Phase 4 PAUSED pending P1.
- DFHack 53.11 API: `dfhack.units.getReadableName(unit)` (not TranslateName); `time` (not cur_year_tick); no `unit.flags1.active`.
- Live fortress: Girderpriced COLLAPSED Y256. New embark needed for further play.
- Embark identification: HFs with ZERO pre-embark events = embark dwarves; never assume 7.

## Alfred Archon (Operations — nested at `alfred/`)
- Path: `alfred/` subdirectory within Project Aion monorepo.
- GitHub: `CannonCoPilot/Project_Aion` (single monorepo).
- Pulse API: `http://localhost:8800` (dev). Pulse DB: PostgreSQL `pulse_dev` on `aifred-dev-postgres` (Docker internal, user `pulse_dev`, pw in credentials.yaml). Pulse MCP: `jarvis-pulse` (6 tools).
- Nexus: cron dispatcher 5min, 24 personas, job DB `alfred/.claude/jobs/state/jobs.db`.
- Telegram: @Keryx_Archon.
- Labels: `agent:jarvis` / `agent:aifred` / `agent:shared`.
- Docker: `alfred/docker-compose.dev.yml` (pulse, dashboard, pipeline, proxy, postgres).

## Memory tier architecture (Phase 2B, 2026-05-16)
- **L0 (Ephemeral)**: Context window — force-loaded files, conversation, tool results.
- **L1 (Session)**: `.claude/context/.scratchpad.md` — transient; auto-rotated on JICM clear + PreCompact.
- **L2 (Cross-session)**: this MEMORY.md + session-state.md — stable facts (force-loaded).
- **L3 (Checkpoint)**: `.compressed-context-ready.md` ��� JICM cycle output; auto-ingested to L4 by `jicm-auto-ingest.py`.
- **L4 (Semantic)**: Qdrant jarvis-rag (~2-3s) — collections: jarvis-context, codebase, research, sessions.
- **L5 (Structural)**: Graphiti Neo4j (~20-30s) — group_id `jarvis-core`.
- **Autonomic circuits**: L3→L4 (`jicm-auto-ingest.py`, dedup 0.92), L5→L2 (`relevance-retrieval.js`, 12 triggers).
- **Insights log**: `.claude/context/insights/insights-log.md` — auto-captured; rotated by `memory-consolidation.sh`.
- **Dashboard**: `/jarvis-memory` on Alfred nexus-dashboard (localhost:8702).

## DF session protocols (REFL-027, REFL-028)
- Three-source corroboration: ALWAYS check (1) bridge state file, (2) live DFHack probes, (3) DB denizen registry before any fortress assessment.
- After JICM clear: verify fortress identity via `dfhack-run lua 'print(dfhack.translation.translateName(dfhack.world.getCurrentSite().name,true))'` BEFORE referencing cached names.

## Project priorities (2026-06-15, see session-state.md for live status)
- **ACTIVE**: Palimpsest audit remediation — 4 critical/high bugs, 9 warnings, test coverage gaps.
- **DONE**: Palimpsest Jun 12–15 sprint (43 requests, 8 committed, 35 uncommitted, audit complete).
- **DONE**: P1.7 Pipeline v2, P1.C Hardening, P2 Scheduling, P1.B1.1 Pulse READ API.
- **DONE**: Migration Phases 0-3 (housekeeping, filesystem, GitHub push + archive).
- **STALLED**: Aion monorepo migration Phases 4-6 (launcher, docs, verification).
- **PAUSED**: Chronicler Phase 4.

## Operational habits
- Use `code-review` subagent for non-trivial changes.
- Memory tiers 2+3: use Qdrant search + Graphiti ingestion during `/meditate-session` Phase 4 (Consolidate).

## Feedback memories (linked, not auto-loaded)
- [Planning Doc Discipline](feedback_planning_doc_discipline.md) — update existing Jarvis-side docs; don't fork new planning files
- [Filesystem Policy](feedback_filesystem_policy.md)
- [DF FPS Freeze](feedback_df_fps_freeze.md)
- [DFHack GUI Popups](feedback_dfhack_gui_popups.md)
- [DF Popup Dismissal](feedback_df_popup_dismissal.md)
- [DF Game Session Control](feedback_df_game_session_control.md)
- [DF Session Resume](feedback_df_session_resume.md)
- [DF Unit/Item Creation](feedback_df_unit_creation.md)
- [Gameplay Observation Style](feedback_gameplay_observation.md)
- [Protected Path Editing](feedback_protected_path_editing.md)
- [Full Autonomous Execution](feedback_full_autonomous_execution.md)
- [VM SSH Admin Disabled](feedback_vm_ssh_admin_disabled.md)
- [Startdwarf Embark Identification](feedback_startdwarf_embark_identification.md)
- [Never Set DF FPS Zero](feedback_never_set_df_fps_zero.md)
- [Quota as Resource, Time as Burden](feedback_quota_as_resource_time_as_burden.md) — utilization-remaining is the resource; compute sustainable-burn = util ÷ hours, compare to observed
- [Quota Metric Priority](feedback_quota_metric_priority.md) — %Usage > time > tokens-by-type > $; dollar spend is least relevant
- [Decide Don't Ask in Sprints](feedback_decide_dont_ask_in_sprints.md) — after a full-autonomy grant, DECIDE forks (even scope/quality/faithfulness) and proceed; don't block with AskUserQuestion
- [Empirical Before Claim](feedback_empirical_before_claim.md) — query the proxy DB (api_requests) BEFORE asserting cost/util/cache claims; don't speculate
- [Empirical Grounding for Claims](feedback_empirical_grounding_for_claims.md) — generalizes Empirical Before Claim to ALL behavior-shaping claims; bans cross-tier derivation ($↔tokens↔burn weight)
- [UI Verification Zoom](feedback_ui_verification_zoom.md) — visual QA must zoom to where the property is resolvable + cover ALL surfaces (both Reader & Browser tracks); no overview shortcuts; parallel agents per group
- [Fallbacks Are Failures](feedback_fallbacks_are_failures.md) — unplanned fallbacks masking missing data are bugs, not acceptable graceful degradation
- [Concurrent Live-App Use](feedback_concurrent_live_app_use.md) — Sir may use the running dev app while I work; unexpected state changes may be him testing, not a bug
- [Don't Retry Capture, Switch Approach](feedback_dont_retry_capture_switch_approach.md) — RTK proxy drops pytest summary line through pipes; use --junitxml + parse, don't re-run
- [Palimpsest Iterate Autonomy](feedback_palimpsest_iterate_autonomy.md) — run Detect-refinement protocol autonomously to exit criteria; don't stop to ask between works; fix objective bugs, flag policy Qs inline and continue
- [Verify Citations Before Attributing](feedback_verify_citations_before_attributing.md) — never trust agent/recall citations of specific papers/DOIs/authors until URL or DOI resolves cleanly
- [Palimpsest Param Classification](feedback_palimpsest_param_classification.md) — track migration: OPEN (settable+validated) for tunable thresholds/windows/counts; LOCK only seeds/internal matrices/fixed confidences
- [Verify Before Apply Prior Fix](feedback_verify_before_apply_prior_fix.md) — when Sir invokes a prior investigation, re-verify current preconditions from live evidence BEFORE executing the prior remedy; convenient recall ≠ authoritative signal

## Reference memories (linked)
- [Claude Code MCP CLI Flags](reference_claude_code_mcp_cli_flags.md) — `--mcp-config` and `--strict-mcp-config` for per-session MCP loading
- [Anthropic Cost Headers](reference_anthropic_cost_headers.md) — NO dollar header exists; only unified utilization fractions; proxy cost_usd is NULL by design
- [Palimpsest Frontend Typecheck](reference_palimpsest_frontend_typecheck.md) — `tsc --noEmit` false-clean (root tsconfig files:[]); use `tsc -b`/`npm test`; build now GREEN (tsc -b && vite build clean, verified 2026-06-30)
- [Nexus Pipeline Gotchas](reference_nexus_pipeline_gotchas.md) — doc-ticket `metadata.output_dir` requirement; Styx daemon (aion:10.0) parses at startup → restart-on-edit; `env -u TMUX` for tmux from sandbox
- [CronCreate durable no-op](reference_cron_create_durable_noop.md) — `durable:true` silently ignored (always session-only); use OS `crontab` for real persistence
- [Verbatim Text via Wikisource](reference_verbatim_text_wikisource.md) — for exact public-domain text use Wikisource parse API + curl, NOT WebFetch (it summarizes)
- [Claude Code Pane State Signals](reference_claude_code_pane_state_signals.md) — classifier for tmux-watching a CC session (active/waiting/paused/menu/composing) + `send-keys` atomicity + menu-safe pattern
- [tmux Watch Layer Pattern](reference_tmux_watch_layer_pattern.md) — 3-layer redundancy (ScheduleWakeup + CronCreate + OS crontab) for bounded automated watches; failure-mode independence analysis
- [Gold Audit Precision Method](reference_gold_audit_precision_method.md) — verify precision vs sha-tied disk reference.txt (not live API); completeness = merged specific LAYER tiles, not solo type; run test_gold_maps.py

## Project memories (linked)
- [Monorepo Rules](project_monorepo_rules.md) — commit strategy, credentials, branch policy, alfred/ handling
- [AIfred Integration Strategy](project_aifred_integration.md) — Multi-Archon vision: AIfred as Ops Archon.
- [Jarvis Overhaul Vision](project_jarvis_overhaul.md) — incremental improvements, not full rebuild.
- [Season Boundary Save](project_season_boundary_save.md)
- [Nexus Job Validation](project_nexus_job_validation.md) — per-job audit/test/repair of all 39 ecosystem components (pending)
- [Palimpsest Phase 1](project_palimpsest_phase1.md) — computational literary analysis platform, 43 features Jun 12–15, 4-phase audit complete, remediation pending
- [Palimpsest Gold Eval](project_palimpsest_gold_eval.md) — mask-detection gold set (20 works), A3 mirage blind spot, Goodhart 3-controls, idx101 columnar promotion
- [Palimpsest FastAPI Model Scope](project_palimpsest_fastapi_model_scope.md) — define request BaseModels at MODULE scope, not in create_app, or future-annotations breaks FastAPI body parsing (silent 422)

# userEmail
The user's email address is nathaniel.cannon@gmail.com.
# currentDate
Today's date is 2026-05-04.
- [Nexus Container Mount Gap](project_nexus_container_mount_gap.md) — pipeline reviewer in container sees only alfred/; tasks writing to project dirs false-fail review
