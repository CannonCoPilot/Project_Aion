# Project Aion — Production Readiness Roadmap
**Version**: 1.0 · **Date**: 2026-07-16 · **Author**: Jarvis-dev (W5) · **Status**: PROPOSED (awaiting Sir's approval)
**Provenance**: Full-platform review of 2026-07-15/16 — eight parallel subsystem audits (JICM/context, hooks/settings, skills/agents/commands, memory stack, Nexus factory, Pulse/dashboards/docker, infrastructure/supervision, vision/plans corpus) + 87-file plans triage + live service/process probes. Every finding is file:line-verified. Full audit texts: `projects/project-aion/reports/production-review-2026-07-findings.md`.
**Relationship to program of record**: `projects/project-aion/roadmap.md` (PR-1..14, Jan 2026) remains the historical program; this document is the successor program of record for bringing Jarvis + Alfred to production-level operation. M6 below adds the roadmap.md epilogue reconciling the two.

---

## 1. Vision (synthesis)

**Jarvis** (Master Archon, `.claude/`): a self-aware, organically self-regulating developer co-pilot for long-session cooperative work or hands-free execution — self-launching, Wiggum-looped, milestone-reviewed, context-immortal via JICM, with reflexive tiered memory (L0–L5) and idle-time reflection/evolution/R&D/maintenance cycles.

**Alfred** (Operations Archon, `alfred/`): a self-aware super-orchestrator — a task-ticket factory (Pulse state-of-record + Nexus dispatch/execute/review) handling scheduled, repeating, and large decomposed workflows through 32 personas, with cost controls, observability, and Telegram presence (Keryx).

**The contract**: Pulse tasks + `agent:jarvis/aifred/shared` labels bind them. Jarvis works *in* sessions; Alfred works *between* them. Both must exhibit: operational reliability, efficiency, autonomy, autonomic self-regulation, reflexive memory recall, design consistency, dexterous multi-project context switching, vision attunement, and drift-free plan alignment.

**Verdict of this review**: the *organs* are largely built and often well-engineered; the *nervous system* — alerting, supervision, self-measurement, and enforceable guardrails — is incomplete or illusory. The platform is a strong prototype (overall **C+**), production-recoverable with targeted work, not redesign.

---

## 2. Current-state scorecard

| Subsystem | Grade | One-line verdict |
|---|---|---|
| Docker data plane (infra compose) | A− | Healthchecked, restart-policied, resource-limited; solid 2-day uptimes |
| Launcher / tmux topology | B | Strong preflight + deterministic W0–W11 map; attach-path reconciliation partial; seeds brittle |
| JICM v7.9 | C | Clean signal architecture; **failed its core mission live** (Fable window unknown → W0 saturated while reporting 25%) |
| Memory stack L0–L5 | C | Capture/rotation genuinely autonomic; L4 self-wipes, L5 silently down 3 days, recall reflex self-suffocated |
| Hooks / guardrail tier | **F (safety) / B (lifecycle)** | Every Jarvis PreToolUse guard is a proven no-op; JICM/lifecycle hooks well-built |
| Skills/agents/commands corpus | B− | Active set sound; cull silently failed for agents/commands; indexes frozen at Feb |
| Nexus factory | B− | Core lane operational + recently hardened; daily schedule never fired; event-watcher dead 27 days; parks don't alert |
| Pulse / proxy / dashboards | B− | Feature-rich and tsc-green; zero auth, migration split-brain, $0 zombie cost surface |
| Supervision / backups / secrets | **D** | Zero DB backups; 11 tracked credential files pushed to GitHub; tmux daemon tier unsupervised |
| Planning / identity / alignment | C− | Tier-1 `.active-plan` works; Tier-2 stale (wrong project); tracker enforcement fictional; version truth split 3 ways |

---

## 3. LIVE OPERATIONAL ALERTS (act before/alongside M0)

1. **W0 is at 100% context** while JICM reports 25%/WATCHING (gate window-table lacks `claude-fable-5`, defaults 1M vs real ~257K; 300K threshold unreachable). **Do not blind-resume**: the standing checkpoint was built from W5's transcript (session-targeting defect) — a W0 `/clear`+resume would inject dev-session context into the master session. Recovery: manually checkpoint W0 (or accept loss), fix `jicm-gate.sh` window table + prep session-targeting (M0-2/M1-4), then cycle.
2. **W9 Commands window is dead** (bare zsh, no `command-handler.sh` children) — the signal→injection channel is down; nothing alerted.
3. **event-watcher dead since 2026-06-18** — project auto-advancement (`/projects/advance-all`) and the only burn/utilization gate are offline.
4. **Caddy (SSO ingress) Exited(127) for 2 days**; authentik burns 4 containers serving only localhost.
5. **Credentials are public**: 11 tracked files with plaintext passwords/keys are on GitHub (`CannonCoPilot/Project_Aion`). Rotation is urgent regardless of any other work (M0-1).
6. Zombie crontab fires a nonexistent `AIFred-Pro` script every 5 minutes.

---

## 4. Consolidated findings register (P0/P1)

Severity: P0 = broken/blocking/exposed now · P1 = major defect or lost function. P2/P3 detail lives in the findings appendix.

### P0
| # | Finding | Evidence |
|---|---|---|
| P0-1 | **Tracked plaintext credentials (11 files), pushed to GitHub** — chronicler DSN (`.claude/context/current-plans.md:19-20`), Neo4j password (`.claude/scripts/graphiti-auto-ingest.py:66-76`, `graphiti-prepopulate.py:110-120`, `restore-mcp-config.sh:31-87`, `infrastructure/rag-service/graphiti_mcp_server.py:75-92`), pulse_dev password (`alfred/usage-proxy/jsonl_parser.py:33`), plus `alfred/dashboard/server/routes/reo.ts:15-18`, `alfred/.claude/jobs/github-issue-poller.sh:152`, book-retriever `mcp.json:9`, two `.context-capture-*.txt` env dumps, `backup-strategy.md:221-227`. History-resident → **rotate, purge, then prevent** | Infra §2; Memory P1-2; Pulse P0 |
| P0-2 | **Jarvis PreToolUse safety layer is a silent no-op** — `bash-safety-guard.js:486` destructures `tool` but harness sends `tool_name`; empirically `sudo rm -rf /` → `{"continue":true}`. Both registrations dead; session runs `bypassPermissions`. Same bug: `context-injector.js:166`, `cross-project-commit-tracker.js`, `docker-monitor.js` | Hooks F1/F4 |
| P0-3 | **JICM cannot fire for the deployed model** — `jicm-gate.sh:140-148` window table lacks fable-5 (defaults 1,000,000); hard threshold 300K (`jicm-config.sh:59`) > real ~257K ceiling; v7.9 dropped the TUI-saturation failsafes still documented in `AC-04-jicm.md:63-67`. Live consequence: alert #1 above | JICM P0 |
| P0-4 | **L4 session memory self-destructs** — `jicm-auto-ingest.py:136-145` delete-by-source with a constant path wipes the prior cycle's chunks every cycle; "semantic session history" is a 1-deep rolling buffer | Memory P0-2 |
| P0-5 | **L5 graph writes silently dead 3 days** — every `graphiti-auto-ingest` run Jul 12→15 failed (Ollama down); health monitor (`jicm-watcher.sh:564-633`) never probes Ollama/LiteLLM; ingest is fire-and-forget with no exit-code check, alert, or backfill | Memory P0-1 |
| P0-6 | **Version truth split three ways, changelog dead** — VERSION=5.12.0=CLAUDE.md; CHANGELOG stops at 5.11.0 (Feb 19); session-state cla