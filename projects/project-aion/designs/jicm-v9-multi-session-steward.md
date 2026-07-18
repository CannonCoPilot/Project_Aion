# JICM v9 — Unified Multi-Session Context Steward — Design

**Status:** Approved (plan-mode rev 2, 2026-07-18) · **Author:** Jarvis (W11)
**Roadmap tie-in:** Evolution roadmap Phase 2.1(ii) — the dev-lane autonomic floor, generalized to its pinnacle form.
**Supersedes:** the single-session v7.9 watcher model AND the premise of `jicm-portable-architecture.md` (v8).
**Plan of record:** `.claude/plans/enchanted-wandering-scone.md` · **Validation runbook:** `../plans/jicm-v9-validation-runbook.md`

---

## 1. Problem & intent

JICM today manages exactly one session (W0) by **arbitration**, not design: `jicm-gate`/`jicm-stop` exclude the dev role so only W0 writes the single shared state file; the watcher is a hard singleton targeting `aion:0`. Every other live Claude Code session — W11 (dev), Protos (the Alfred seed), and the task-board chain windows — has no curated context management (only untuned native autocompact).

**Goal:** one thin, registry-driven **supervisor** that detects, monitors, pre-clear-preps, clears, and restores **every** active Claude Code session across **both** the Jarvis and Alfred hook domains — **W0 folded in as a first-class citizen** (not left on a legacy watcher) — with per-session namespacing, transient detached actuators, and pluggable reset policies. Every valuable behavior of today's W0 watcher is carried **forward by generalization**, not discarded. See [[feedback_fold_forward_not_parallel_legacy]].

## 2. Two verified facts that fix the mechanism

1. **Hook stdin carries no token/context data.** The current CC hooks schema (`GitRepos/claude-code-docs/docs/claude-code__hooks.md`) gives hooks only `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode` (+`prompt` on UserPromptSubmit; +`model` on SessionStart). There is **no `context_window`/token field** — so the v8 "read tokens on stdin, delete the watcher" premise is false. Sensing must parse the JSONL transcript. Each hook receives its own `transcript_path`, so **per-session sensing is native** once state is namespaced by `session_id`/key.
2. **A hook cannot invoke `/clear`.** Autonomous clearing (chains/Protos/background dev have no human to type `/clear`) must use tmux `send-keys` — i.e. the detached actuator already built and tested in `jicm-self.sh`.

Together these mandate: **transcript-based per-session sensing + tmux-actuated per-session clearing**, coordinated by one supervisor over a registry.

## 3. Architecture

State lives under `.claude/context/jicm/`:

```
jicm/
  registry/<key>.json      one entry per managed session (source of truth)
  state/<key>.json         per-session sensing snapshot (was the single .jicm-state-hook.json)
  signals/{clear-now,resume-complete,compression-done}.<key>.signal
  checkpoints/<key>.compressed.md  + <key>.scrollback[-summary].md
  supervisor.pid           ONE supervisor (actuators are transient — no PID)
```

**Registry entry:**
```json
{ "key":"w0", "session_id":"<uuid>", "transcript_path":"<abs>", "tmux_target":"aion:0",
  "class":"interactive|seed|chain", "reset_policy":"preserve-restore|zero-state",
  "owner":"jarvis|alfred", "soft_tokens":250000, "hard_tokens":300000,
  "registered_at":"…", "last_seen":"…" }
```

**Data flow (identical for every session incl. W0):**
`gate`/supervisor senses tokens+model from the transcript → `state/<key>.json` → at threshold, `stop`/supervisor raises `signals/clear-now.<key>` → **supervisor** spawns detached `jicm-actuate.sh <key>` → actuator runs the policy cycle → `/clear` the entry's `tmux_target` → resume-inject per policy.

**Session taxonomy — all first-class registry entries, no special-casing:**

| key | window | hook domain | registered by | sensed by | reset policy |
|---|---|---|---|---|---|
| `w0` | W0 Jarvis | Jarvis | Jarvis `SessionStart` | gate (fast) + supervisor | preserve-restore (full pull-forward) |
| `dev` | W11 Jarvis-dev | Jarvis | Jarvis `SessionStart` | gate + supervisor | preserve-restore |
| `protos` | W1 Alfred seed | Alfred | chain **bridge** | supervisor | **zero-state** |
| `chain-<id>` | W12+ | Alfred | chain **bridge** | supervisor | monitor; rare clear = preserve-restore |

## 4. Key design decisions

1. **W0 folded in as `key=w0`; legacy `jicm-watcher.sh` retired.** No parallel legacy. Migration committed (Phase 3), shadow-validated before cutover, archived watcher = instant rollback.
2. **Pull W0's rich machinery FORWARD.** `jicm-watcher.sh:actuate_jicm_cycle` does far more than `/clear`: scrollback capture (step 5.6) + NLP compress (5.6b), **L4 RAG ingest** (5.5) + **L5 Graphiti episode** (5.9), memory consolidation (5.7), scratchpad rotation (5.8), and the REST stage. Each becomes a step of the generalized **`preserve-restore`** policy in `jicm-actuate.sh`, per-session-namespaced. `zero-state` / `monitor` are lean subsets.
3. **Reuse over rebuild.** `jicm-self.sh:cmd_actuate` (detached `nohup`+`disown`; `_wait_for_idle` terminal-`stop_reason` guard) → generalized `jicm-actuate.sh <key>`, merged with the watcher pre-clear steps. `jicm-inject*.sh` already target-parameterized (`JICM_INJECTION_TARGET`) — unchanged. `jicm-prep-context.sh` already honors `JICM_JSONL_PATH`/`JICM_COMPRESSED_FILE`/`JICM_METADATA_FILE`/… — unchanged. Protos zero-state reuses `host-executor-bridge.sh:ensure_seed`.
4. **Supervisor-centric sensing spans both projects.** It reads each entry's `transcript_path` directly (whose `.claude/` fired is irrelevant); Jarvis lanes keep hook fast-sensing; Alfred sessions need no new Alfred hooks.
5. **Protos zero-state = relaunch, not /clear+inject.** Kill+relaunch the seed (reuse `ensure_seed`), suppress the work-state injection (`alfred/.claude/hooks/session-start.js`'s `session-state.md`+`current-priorities.md`), reload only `alfred/.claude/CLAUDE.md` + `alfred/.claude/context/compaction-essentials.md` (Alfred's designated survives-the-wipe core).
6. **Reconcile anti-multi-session guards.** The `unset JICM_*` guard (Bug-4) stays for the supervisor's own defaults; each actuator gets its namespace **command-scoped** (pattern already working in `jicm-self.sh`). The `role=dev` exclusion is removed. `find_best_jsonl`'s HALT-marker targeting is replaced by the registry's explicit `transcript_path`.
7. **Chains are monitor-first** (ephemeral ~10-min, reaped ~120s; persistent accumulation is in Protos). Detect + HUD-show via the bridge; full clear/restore included but low priority.

## 5. Phased implementation

- **Phase 0 (this cycle):** this design doc + validation runbook + roadmap pointer. *No system changes.*
- **Phase 1 — Foundation:** registry/state/signals/checkpoints in `jicm-config.sh` (`${VAR:-default}` + `<key>`-aware); migrate the 6 blockers with `key=w0` byte-identical; build `jicm-actuate.sh <key>` (generalized `cmd_actuate` + folded-in pre-clear steps + policies); generalize gate/stop/session-start (per-key, drop dev-exclusion, registry upsert). W0 stays on its watcher.
- **Phase 2 — Supervisor; prove on W11:** `jicm-supervisor.sh` (registry loop + GC + detached actuators). Canary-validate the actuator + un-gate `--fire` (**user's hand**). Validate detached-actuator survival under the CC Bash-harness.
- **Phase 3 — Fold W0 in:** shadow-run supervisor sense-only against W0, verify md5-safety + cycle parity, cut over, archive `jicm-watcher.sh`.
- **Phase 4 — Cross-project:** bridge registers Protos + chains; supervisor senses/actuates Alfred sessions; Protos `zero-state`; tmux-discovery failsafe.
- **Phase 5 — Multi-session HUD:** `jicm-watcher-hud.sh` → registry-iterating N rows.

**Phase status:** Phase 0 ✅ (this doc + runbook + roadmap pointer). Phase 1 — **foundation done** (`jicm-config.sh`: `jicm_key_paths <key>` with `key=w0` byte-identical to legacy, verified; `jicm_registry_upsert`/`_keys`/`_get` helpers). **Next in Phase 1:** `jicm-actuate.sh <key>` (generalize `cmd_actuate` + fold in watcher steps 5.5–5.9 + policies), then gate/stop/session-start generalization (per-key, drop dev-exclusion, registry upsert).

## 6. Files & reuse

Modify: `jicm-config.sh`, `jicm-self.sh`→`jicm-actuate.sh`, `jicm-watcher.sh`→`jicm-supervisor.sh`, `jicm-gate.sh`, `jicm-stop.sh`, `session-start.sh`, `jicm-watcher-hud.sh`, `alfred/.claude/jobs/lib/host-executor-bridge.sh`, `launch-aion.sh`.
Reuse (don't reimplement): `jicm-inject*.sh`, `jicm-prep-context.sh` overrides, the `jicm-self.sh` detached mechanism, `ensure_seed`/`_refresh_seed_if_stale`, the watcher's `actuate_jicm_cycle` steps 5.5–5.9, the `.dev.*` namespacing template.

## 7. Risks & validation

W0 life-support (byte-identical `key=w0` in Phase 1; sense-only shadow + md5-safety + cycle parity before Phase-3 cutover; archived watcher rollback) · losing W0 features (decision 2 + parity assertion) · detached-actuator survival (validate on Phase-2 canary; fallback: supervisor spawns actuators) · cross-project coupling (bridge is the seam) · 6-blocker regression (`env -u JARVIS_SESSION_ROLE` + throwaway-`JICM_PROJECT_DIR` harness). Code-review every phase diff.

---

## Appendix A — Empirical grounding (from the 2026-07-18 subsystem maps)

**A.1 Collision inventory — the 6 true blockers** (hardcoded, no `:-` guard, would collide across sessions): `.jicm-state-hook.json` (config:23), `.jicm-clear-now.signal` (24), `.jicm-resume-complete.signal` (25), `.compression-in-progress` (37), `.jicm-watcher.pid` (40), and the scrollback pair (`jicm-watcher.sh:212-213`). Already-parameterized seams to reuse: `JICM_INJECTION_TARGET` (inject layer), `JICM_COMPRESSED_FILE`/`JICM_COMPRESSION_SIGNAL`/`JICM_JSONL_PATH`/`JICM_METADATA_FILE`/`JICM_METRICS_FILE`/`JICM_JSONL_STATS` (prep), `JICM_SELF_WINDOW` (self). The watcher loop (`jicm-watcher.sh:719-755`) monitors one signal / one target; PID singleton (42-52); the `unset` guard (29-30) deliberately blocks per-session env. HUD is ~40 scalar globals with fixed render blocks — needs array/row refactor.

**A.2 Chain lifecycle.** Pulse task-board → `pipeline-watcher.py` (label state machine) → `orchestrate.py` (assigns `chain_id`) → `executor.py` (writes `execute-request-<TASK>.json`, in Docker) → **`host-executor-bridge.sh --daemon`** (tmux window `Styx`, singleton) picks up → `get_or_create_chain_window` (`:253-254`) `tmux new-window` at index ≥12 named `chain-<id8>`, running `claude --resume <seed_sid> --fork-session` from `~/Claude/Alfred-Dev` → prompt injected via paste-buffer → completion via `.chain-done-<task>` sentinel or fresh output file → reaped ~120s idle (or Claude-exited ~90s). Chains: **run Alfred's `.claude/` hooks**, carry **no `JARVIS_*` env**, are ephemeral (≤10 min), addressed by tmux window name (session-id not captured), ≤5 concurrent but serialized to 1 active. Seed (Protos) + daemon (Styx) are long-lived; only `chain-*` windows are reaped.

**A.3 Alfred core self-knowledge** (for Protos `zero-state`): identity = `alfred/.claude/CLAUDE.md`; survives-the-wipe core = `alfred/.claude/context/compaction-essentials.md` (Alfred's own designation, auto-injected by `pre-compact.js`). Core `@`-imports: `context/_index.md`, `context/tools/pulse-reference.md`, `docs/nexus-automation.md`, `.claude/orchestration/README.md`, `context/patterns/capability-layering-pattern.md`, `skills/session-management/SKILL.md`, `profiles/README.md`, `paths-registry.yaml`. **Drop on reset:** `context/session-state.md`, `context/projects/current-priorities.md` (work-log accumulation). Alfred has **no JICM** — native autocompact + `pre-compact.js` preservation + passive `context-monitor/` telemetry only. Protos zero-state = the existing `ensure_seed` kill+relaunch, core-only (suppress the work-state injection).
