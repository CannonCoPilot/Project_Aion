# JICM v9 — Unified Multi-Session Context Steward

**Status:** proposed (plan-mode, rev 2) · **Author:** Jarvis (W11) · **Date:** 2026-07-18
**Roadmap tie-in:** Phase 2.1(ii) *(dev-lane autonomic floor)* generalized to its pinnacle form.
**Supersedes:** the single-session v7.9 watcher AND the premise of `designs/jicm-portable-architecture.md` (v8).

---

## Context

**Why now.** W11 (this dev window) has no autonomic context management (`jicm-gate`/`jicm-stop` exclude the dev role; the watcher targets only `aion:0`). A long roadmap session in W11 is protected only by untuned native autocompact. Making the vessel self-sustaining is the correct first roadmap cycle — and the user's directive is to solve it *at the top tier*: **one upgraded JICM that manages every active Claude Code session — W0 included — not W0 on a legacy watcher beside a new system.**

**Escalating requirements:** (1) W11 self-sustaining; (2) elegant, not a duplicate of W0's stack; (3) indefinite addition of many sessions in other windows; (4) professional-grade — detect/monitor/pre-clear-prep/clear/restore **any** session including task-board **chain** windows; (5) pinnacle — **Protos** gets a custom **zero-state** reset (dump work-context, restore only core Alfred self-knowledge). **User override (rev 2): fold W0's stack forward into this unified system** — W0 becomes a first-class citizen of JICM v9; the legacy `jicm-watcher.sh` is retired, its rich features preserved by generalization.

**Two verified facts that fix the mechanism:**
- Hook stdin carries only `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode` (+`prompt`; +`model` on SessionStart) — **no token/`context_window`** (confirmed in `GitRepos/claude-code-docs/docs/claude-code__hooks.md`). So the v8 "read tokens from stdin, delete the watcher" premise is wrong; **sensing parses the JSONL transcript** (which each hook receives per-session → per-session sensing is native).
- A hook **cannot invoke `/clear`**. Autonomous clearing must use tmux `send-keys` — the detached actuator already built + tested in `jicm-self.sh`.

**Intended outcome:** one thin, registry-driven **supervisor** manages N heterogeneous sessions across **both** the Jarvis and Alfred hook domains — W0, W11, Protos, and ephemeral chains all as registry entries — with per-session namespacing, transient detached actuators, and pluggable reset policies. Every valuable behavior of today's W0 watcher is carried forward, generalized, not discarded.

---

## Architecture

**Session Registry** + **one thin supervisor** + **transient detached per-session actuators** + **pluggable reset policies**. New state under `.claude/context/jicm/`:

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
{ "key":"w0", "session_id":"<uuid>", "transcript_path":"<abs>",
  "tmux_target":"aion:0", "class":"interactive|seed|chain",
  "reset_policy":"preserve-restore|zero-state", "owner":"jarvis|alfred",
  "soft_tokens":250000, "hard_tokens":300000, "registered_at":"…","last_seen":"…" }
```

**Data flow (identical for every session incl. W0):** `gate`/supervisor senses tokens+model from the transcript → `state/<key>.json` → at threshold, `stop`/supervisor raises `signals/clear-now.<key>` → **supervisor** spawns detached `jicm-actuate.sh <key>` → actuator runs the policy cycle → `/clear` the entry's `tmux_target` → resume-inject per policy.

**Session taxonomy (all first-class registry entries — no special-casing):**

| key | window | hook domain | registered by | sensed by | reset policy |
|---|---|---|---|---|---|
| `w0` | W0 Jarvis | Jarvis | Jarvis `SessionStart` | gate (fast) + supervisor | preserve-restore (full pull-forward) |
| `dev` | W11 Jarvis-dev | Jarvis | Jarvis `SessionStart` | gate + supervisor | preserve-restore |
| `protos` | W1 Alfred seed | Alfred | chain **bridge** | supervisor | **zero-state** |
| `chain-<id>` | W12+ | Alfred | chain **bridge** | supervisor | monitor; rare clear = preserve-restore |

---

## Key design decisions

1. **W0 is folded in as a first-class registry entry (`key=w0`); the legacy `jicm-watcher.sh` is retired.** No parallel legacy system. Migration is committed (Phase 3), done via shadow-validation before cutover, with the archived watcher as an instant rollback.
2. **Pull W0's rich machinery FORWARD, don't lose it.** Today's `jicm-watcher.sh:actuate_jicm_cycle` does far more than /clear: scrollback capture (5.6), NLP compression (5.6b), **L4 RAG ingest** (5.5) + **L5 Graphiti episode** (5.9), memory consolidation (5.7), scratchpad rotation (5.8), plus the REST stage. All of these become steps of the **generalized `preserve-restore` policy** in `jicm-actuate.sh`, per-session-namespaced. `zero-state` and `monitor` policies are lean subsets.
3. **Reuse over rebuild.** `jicm-self.sh:cmd_actuate` (detached `nohup`+`disown` + `_wait_for_idle` terminal-`stop_reason` guard) → generalized `jicm-actuate.sh <key>`, merged with the watcher's pre-clear steps. `jicm-inject.sh`/`jicm-inject-tmux.sh` are already target-parameterized (`JICM_INJECTION_TARGET`) — unchanged. `jicm-prep-context.sh` already honors `JICM_JSONL_PATH`/`JICM_COMPRESSED_FILE`/… — unchanged. Protos zero-state reuses `host-executor-bridge.sh:ensure_seed`.
4. **Supervisor-centric sensing spans both projects.** The supervisor reads each entry's `transcript_path` directly (whose `.claude/` fired is irrelevant). Jarvis lanes *also* keep hook-driven fast-sensing; Alfred sessions need **no new Alfred hooks**.
5. **Protos zero-state = relaunch, not /clear+inject.** Kill+relaunch the seed (reusing `ensure_seed`), suppressing the work-state injection (`session-start.js`'s `session-state.md`+`current-priorities.md`) and reloading only `alfred/.claude/CLAUDE.md` + `alfred/.claude/context/compaction-essentials.md` (Alfred's designated survives-the-wipe core).
6. **Reconcile the anti-multi-session guards.** The watcher/session-start `unset JICM_*` (my Bug-4 fix) stays — it protects the supervisor's own defaults from ambient leak; each actuator gets its namespace **command-scoped** (the pattern already working in `jicm-self.sh`). The `role=dev` exclusion in gate/stop is removed (superseded by per-key namespacing). `find_best_jsonl`'s HALT-marker targeting is replaced by the registry's explicit `transcript_path`.
7. **Chains are monitor-first** (ephemeral, ~10-min, reaped ~120s; persistent accumulation lives in Protos). Detection + HUD visibility via the bridge; full clear/restore is included but low-priority.

---

## Implementation phases

**Phase 0 — Document (this cycle's deliverable).** Formalize this as `projects/project-aion/designs/jicm-v9-multi-session-steward.md` (roadmap ground-work) + a validation runbook; add a Phase-2.1 pointer in the evolution roadmap. *No system changes.*

**Phase 1 — Foundation (machinery, W0 still on its watcher).**
- Add `jicm/registry|state|signals|checkpoints` to `jicm-config.sh`, all `${VAR:-default}` + `<key>`-aware; migrate the **6 blockers** (`.jicm-state-hook.json`, `.jicm-clear-now.signal`, `.jicm-resume-complete.signal`, `.compression-in-progress`, scrollback pair), keeping `key=w0` paths byte-identical to today so the current watcher keeps working.
- Build `jicm-actuate.sh <key>`: generalize `jicm-self.sh:cmd_actuate` **and fold in** the watcher's pre-clear steps (§decision 2) behind the `preserve-restore` policy; add `zero-state`/`monitor` policies.
- Generalize `jicm-gate.sh`/`jicm-stop.sh`: derive `<key>` from env (`JARVIS_WINDOW`/`JARVIS_SESSION_ROLE`) else `session_id`; per-key state/signal; **drop dev-exclusion**; SessionStart upserts the registry entry. Generalize the `session-start.sh` clear-injection to registry-driven per-key/policy (my dev-branch is the template).

**Phase 2 — The unified supervisor; prove on W11.**
- `jicm-supervisor.sh` (a shrink+generalize of `jicm-watcher.sh`): loop = registry GC (tmux pane liveness + stale `last_seen`) → for each entry, if `clear-now.<key>` OR supervisor-sensed over-threshold+idle → spawn detached `jicm-actuate.sh <key>` → aggregate HUD data. Singleton.
- Manage **W11** on it first (non-critical lane). **Canary-validate the actuator on a disposable session, then un-gate `jicm-self.sh --fire`** *(user's hand — self-decapitation guard)*. Validate detached-actuator survival under the CC Bash-harness here.

**Phase 3 — Fold W0 in (committed migration).**
- Point W0's gate/stop at `state/w0.json`/`signals/*.w0`; register `key=w0` (tmux_target `aion:0`, preserve-restore with full pull-forward). Shadow-run the supervisor against W0 in parallel (sense-only), verify W0 checkpoint md5-safety and cycle parity vs the old watcher, then **cut W0 over to the supervisor and archive `jicm-watcher.sh`**. One system now manages W0 + W11.

**Phase 4 — Cross-project: Protos + chains.**
- `host-executor-bridge.sh` upserts/removes registry entries for the seed + each `chain-*` window (it already tracks them in `state/.chain-windows/`). Supervisor senses/actuates Alfred sessions (alfred slug transcripts). Implement Protos `zero-state`. Add **tmux-discovery** registration failsafe (classify live CC panes via `.claude/context/memory/reference_claude_code_pane_state_signals.md`).

**Phase 5 — Multi-session HUD.** Refactor `jicm-watcher-hud.sh` from ~40 scalar globals to a registry-iterating **N-row** display (key/class/model/tokens%/action/last-clear).

---

## Files to modify (representative)

| File | Change |
|---|---|
| `.claude/scripts/jicm-config.sh` | `jicm/` registry+state+signals+checkpoints paths, `${VAR:-default}` + `<key>`-aware |
| `.claude/scripts/jicm-self.sh` → `jicm-actuate.sh` | Generalize `cmd_actuate` to `<key>` + fold in watcher pre-clear steps; policy-parameterized |
| `.claude/scripts/jicm-watcher.sh` → `jicm-supervisor.sh` | Registry-iterating loop + detached actuators + GC; **archive the old watcher at Phase 3 cutover** |
| `.claude/hooks/jicm-gate.sh`, `jicm-stop.sh` | Per-key state/signal; drop `role=dev` exclusion; registry upsert |
| `.claude/hooks/session-start.sh` | Registry-driven per-key/policy checkpoint injection (generalize the dev-branch) |
| `.claude/scripts/jicm-watcher-hud.sh` | N-row registry-driven render |
| `alfred/.claude/jobs/lib/host-executor-bridge.sh` | Registry upsert/remove for seed + chains; `ensure_seed` core-only flag |
| `.claude/scripts/launch-aion.sh` | Launch `jicm-supervisor.sh` (replacing watcher launch); register W0/W11 on start |

**Reuse (don't reimplement):** `jicm-inject*.sh`, `jicm-prep-context.sh` overrides, `jicm-self.sh` detached mechanism, `host-executor-bridge.sh:ensure_seed`/`_refresh_seed_if_stale`, the watcher's `actuate_jicm_cycle` pre-clear steps 5.5–5.9, the `.dev.*` namespacing template.

---

## Risks & validation

| Risk | Mitigation |
|---|---|
| **W0 life-support** during migration | Machinery built with `key=w0` byte-identical (Phase 1); supervisor **shadow-runs W0 sense-only** and is verified for cycle parity + md5-safety before cutover (Phase 3); archived watcher = instant rollback |
| **Losing W0's rich features** in the fold-forward | Decision 2 makes every step 5.5–5.9 a generalized `preserve-restore` step; Phase-3 parity check asserts RAG/Graphiti/consolidation/scrollback all still fire |
| **Detached-actuator survival** under CC Bash-harness (open) | Validate empirically on the Phase-2 canary; fallback: supervisor (stable long-lived parent) spawns actuators instead of the stop hook |
| Cross-project coupling | The bridge is the single natural seam (already the chain lifecycle owner); registry is a plain shared dir |
| Regression in the 6-blocker migration | `key=w0` defaults byte-identical; validate each hook with the throwaway-`JICM_PROJECT_DIR` + `env -u JARVIS_SESSION_ROLE` harness proven this session |

**Verification (per phase, end-to-end):** crafted-transcript sensing through the gate (redirected `JICM_PROJECT_DIR`) asserting per-key `state`; canary actuator run watching `jicm-self-actuator.log` with W0-md5-unchanged; supervisor two-fake-session isolation + GC test; Protos zero-state capture-pane check; **code-review each phase's diff**.

---

## Deliverables

1. `projects/project-aion/designs/jicm-v9-multi-session-steward.md` + validation runbook — **Phase 0, this cycle.**
2. Phased code (Phases 1–5), each gated by canary + code-review; end-state = one supervisor managing W0/W11/Protos/chains, legacy watcher retired.

*First cycle = Phase 0 (documented design) + begin Phase 1 foundation (bypass-permissions execution). The Phase-2 canary un-gating needs the user's hand.*
