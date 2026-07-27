# JICM v9 — Consolidated Remediation Plan & Critical-Review Findings

**Date:** 2026-07-20 · **Owner:** W5 Jarvis-dev · **Status:** IN EXECUTION.

> **Execution log:** **M-A (R0+R1) COMMITTED — `1954c22`** (2026-07-21). R0 signal-safety (C2); R1 occupancy keying (C3/C1/H3) + actuation model; code-review F3–F6 fixed; F1 watcher stopgap (`_w0_clear_valid`); F2 staleness check. Harnesses **re-verified live this session** (fresh hooks): R0 7/7, R1 13/13. Live e2e: the relaunched background `/fork` correctly keyed `w0-bg-266ec5ec` (did NOT clobber `w0.json`); `jicm-registry-conflicts.log` empty. Milestone review: Technical 5/5, Progress 5/5 → gate cleared. **ACTIVATION CAVEAT (Sir's hand):** the relaunch spawned a background job, NOT fresh PANE sessions — `aion:0` (W0) + `aion:11` (dev) still run pre-fix cached hooks (`--staleness` 9/10 stale). They need a relaunch to load current JICM hooks; autonomous firing stays GATED + C2/F1 refuse misfires meanwhile, so stale panes are safe. **Next:** R2 (breadcrumb reconciliation + consolidate `jicm-self.sh`→`jicm-actuate.sh` preserving self-actuation + process reaper + M2). Files: `jicm-config.sh`, `jicm-supervisor.sh`, `jicm-gate.sh`, `jicm-watcher.sh`.
**Single source of truth** for JICM v9 remediation. Supersedes the scattered TODO/NEXT lists in `.scratchpad.dev.md`.
**References (not duplicated here):** deep diagnosis → `../reports/jicm-v9-session-identity-diagnosis-2026-07-20.md` (Rev 4); architecture → `../designs/jicm-v9-multi-session-steward.md`; phase gates → `./jicm-v9-validation-runbook.md`.

**Framing (validated against current Claude Code docs):** the "session sprawl" is mostly *intentional Claude Code behavior* — **agent view** (`claude agents`), **background sessions** (`/fork`, distinct from the in-session subagent `/subtask`), the `/resume` picker, a **background service (supervisor process)** with a **warm-standby PTY pool** (`bg-pty-host`/`bg-spare`). Jarvis must **stop assuming a fixed window↔UUID binding and start observing pane occupancy.** The one true Jarvis defect is **role-based JICM keying** (finding C3). This plan makes JICM correct *with* that model, not against it.

**GOVERNING PRINCIPLE — preserve-the-reflex, add-the-volition (do not violate in any fix):** JICM is a *general-purpose clear-and-resume cycle*, not merely a threshold-triggered pane-clearer. It must serve BOTH:
- **Reflex** — automatic monitoring + autonomic cycling of **every** live session at threshold (W0, dev, **and background forks** `dev-bg-*`, protos, chains). No session is excluded from JICM/Watcher/HUD.
- **Volition** — self- and operator-directed cycles: **W0 can clear+resume itself** voluntarily or on user request; **W11-dev can point a cycle at any target**; any session can self-invoke.
Therefore **keying = per-session IDENTITY + fork-DETECTION, never JICM eligibility.** A background fork is a first-class citizen: full monitoring, its own HUD row, its own namespaced state, and its own actuation channel. The only thing occupancy forbids is a fork actuating the **parent's** pane (that's the safety property C4 protects) — a fork actuates **itself**.

---

## Part A — Critical-review findings catalog (ranked)

Verified live and/or against current docs. IDs are stable references for the phases in Part C.

### CRITICAL
- **C1 — Registry conflates key with session identity.** `jicm-config.sh:jicm_registry_upsert (90-103)` overwrites `session_id`/`transcript_path` every call; `jicm-gate.sh` calls it per prompt → last-writer-wins, no reconciliation. *Live proof: 4 UUIDs all claim "dev."*
- **C2 — Supervisor fires on bare signal presence.** `jicm-supervisor.sh:214` triggers on `[[ -f clear-now.<key>.signal ]]`, ignoring the signal's `session_id` and age. *Live landmine: stale `clear-now.dev.signal` from dead `0a718eeb` (745K, 6h) would fire on un-gate.*
- **C3 — Role-based keying (THE CORE DEFECT).** `jicm-config.sh:jicm_derive_key (124-129)` returns `dev` for *any* `JARVIS_SESSION_ROLE=dev` process; `jicm_default_target (132-138)` hardcodes `dev→aion:11`. So the dev pane **and** every `/fork` background session (this diagnosing session included) claim `key=dev` + a pane they don't occupy.
- **C4 — Actuator target↔transcript not cross-validated.** `jicm-actuate.sh` resolves `transcript` and `tmux_target` independently; no pane↔session check before `/clear` → wrong-pane decapitation risk.

### HIGH
- **H1 — Session-UUID instability unacknowledged** → reframed: it's the CC session model (`--fork-session`, picker, background sessions). Fix = observe, don't pin (Part C, R5).
- **H2 — Racing claimants, no compare-and-swap** (pairs with C1).
- **H3 — Shared globals leak into non-w0 prep.** `jicm-actuate.sh:_step_prep` doesn't namespace `JICM_SESSION_STATE`/`JICM_SCRATCHPAD`/`JICM_ACTIVE_PLAN` (`jicm-config.sh:141-143`) → a dev checkpoint would embed W0's `session-state.md`.
- **H4 — GC never reclaims a churned-UUID key; orphaned signals accumulate** (`jicm-supervisor.sh:190-206` only on stale `last_seen`).

### MEDIUM / LOW
- **M1 — Legacy `jicm-self.sh` vs `jicm-actuate.sh` coexist** during migration; supervisor is blind to the legacy `.dev` trigger.
- **M2 — Supervisor→`cmd_fire` re-resolves identity unpinned** (`jicm-supervisor.sh:181`) — second TOCTOU.
- **M3 — Docs claim `launch-aion.sh` launches supervisor + registers on start; it doesn't** (still launches `jicm-watcher.sh`; registration is lazy).
- **L1 — Resume-nudge references per-key scratchpad files nothing creates** for protos/chain.
- **L2 — Runbook gates test none of the identity-instability modes** (fork mid-cycle, two claimants, stale signal, pane↔transcript mismatch).
- **L3 — HUD is single-session** (see Part B).

### Session-model facts (current docs) that constrain the fixes
- Hooks/`settings.json` are **re-read at launch** → resume gets fresh hooks (W0 is NOT on stale hooks).
- Resume is **scoped to the project dir + git worktrees** → the `Jarvis`↔`Project_Aion` symlink cwd split causes "No conversation found."
- **Never `--resume` a live UUID without `--fork-session`** → the docs warn two terminals on one UUID interleave into one transcript (corruption).
- **Reaper gap:** chain cleanup is `kill-window` (window-scoped); detached/background claude processes are never process-reaped.

---

## Part B — The single-session HUD problem (finding L3 / v9 Phase 5)

The HUD (`jicm-watcher-hud.sh`, design `../designs/watcher-hud-design.md`) reads a **single** legacy `.jicm-state`/`.jicm-state-hook.json` and renders **one** session. Under v9 there are N concurrent keys (w0, dev, dev-bg-*, protos, chain-*). **Consequence:** un-gating autonomous multi-session clearing without a multi-session HUD means firing `/clear` at panes with **no operational view** of which session is where and at what token level — exactly where the identity bugs manifest.
**Fix (R4):** an **N-row, registry-iterating HUD** — one row per `jicm_registry_keys`, each showing key · session_id(short) · tmux_target · tokens%/threshold · action-state · live/stale. Must land **before** the Phase-2-exit un-gate (observability precondition).

---

## Part C — Prioritized remediation (phased). Each phase: `env -u` harness + code-review, per project discipline.

### R0 — Safety interlocks (do first; unblocks nothing risky)
- **C2:** supervisor rejects a `clear-now` signal unless (a) fresh (< N poll intervals), (b) its `session_id` == registry == token-state, (c) a positive re-sense over threshold at fire time; reap orphaned signals each tick.
- **Disarm** the current stale `clear-now.dev.signal` (dead `0a718eeb`).

### R1 — Occupancy keying (C3) + registry CAS (C1) + namespacing (H3) + actuation model — THE CORE
The full patch design is in **Part D**. Net effect: only the pane's actual occupant claims `w0`/`dev`; background `/fork` sessions get their own first-class `<key>-bg-<sid>` identity (namespaced state, HUD row, **self-actuating** cycle — NOT excluded from JICM); each key carries an `actuation = {mode, channel}` so a fork cycles **itself**, never the parent's pane; the registry refuses to silently clobber a live claimant. Includes the fork **detect + collapse-to-parent / adopt** path.

### R2 — Reconcile & reap
- **Breadcrumb reconciliation — DONE, and WIDER than first specced.** Implemented as
  `jicm_reconcile_pane_key <w0|dev>` (jicm-config.sh), called at the TOP of every
  supervisor `_pass` (before GC/sense/fire, so the pass reads a reconciled registry).
  **Root cause found (2026-07-25):** `jicm_derive_key` is correct but *races at startup* —
  a session's session-start hook can fire while the pane still shows the OUTGOING occupant,
  so it reads "occupant ≠ me", concludes it is a background /fork, and self-demotes to
  `<canonical>-bg-<sid8>` **for its whole life**. Consequence: canonical key left to a stale
  claimant (or, once GC'd, to nobody), namespaced state stranded under the bg key, breadcrumb
  chasing whichever hook wrote last. Writing the breadcrumb alone was therefore INSUFFICIENT —
  reconciliation must also **promote the mis-keyed occupant and migrate all 15 namespaced
  artifacts** (`JICM_KEY_ARTIFACT_VARS`) + restate `tmux_target`. Derive-time cannot fix this;
  only a later observation of the settled pane can. Pane = truth.
  Safety: fails closed on an unresolvable pane (a blind probe is what wrote the wrong answer
  originally); defers while an actuating lock is held on either key; refuses (rc=2, ALERT) to
  displace a canonical key held by a *different live* session — two live sessions on one pane
  is a human's conflict, not a thing to silently resolve.
  Live repair on first run: breadcrumb `91bcac6a`→`fbd7528a`; promoted `dev-bg-fbd7528a`→`dev`.
  Harness 14/14 (`tmp/r2-reconcile-harness.sh`), incl. defer/conflict/blind-probe branches.
- **H4 — DONE (`f160498` + TTL follow-up).** `.claude/scripts/dev/session-reap.sh`.
  PROCESSES: classifies every live claude by ancestry — WINDOW (launcher pane, never
  touched) · HOSTED (bg job/subagent under a live host; left to its host's lifecycle) ·
  ORPHANED (window gone AND parent chain dead — the only kill candidate, and only when
  idle). Transcripts never touched. Dry-run default; `--execute --yes` to act.
  **Fail-closed fix:** an absent `ps` entry previously fell through to ORPHANED, making an
  UNVERIFIABLE process a kill candidate (a transient probe failure on a live session could
  select it). Now split GONE (pid absent → stale registry row) / UNVERIFIABLE (pid exists,
  ancestry unwalkable); neither is ever killed.
  WINDOW TTL (`--windows`): `chain-*` windows idle > `JICM_CHAIN_TTL_SEC` (2h) are reapable,
  and ONLY at index ≥ 12 — fixed windows W0–W11 are immune. The **seed (Protos, W1) is never
  auto-killed**: the fork cache depends on it, so staleness > `JICM_SEED_STALE_SEC` (24h)
  ALERTs for a human/launcher recycle instead (No-Silent-Degradation — surface it, don't
  "fix" it by breaking every later fork).
  Harness 19/19 (`tmp/h4-reap-harness.sh`), incl. live-orphan reap with zero collateral,
  dead-pid exclusion, and synthetic stale-chain reap with all 12 fixed windows intact.
  **Note:** registry-key GC was never broken — one supervisor pass collects stale keys.
  H4's gap was orphaned PROCESSES and leaked WINDOWS.
- **M1 — DONE (`b09e489`, pushed).** `sense`/`prepare` ported into `jicm-actuate.sh` and
  generalized per-key (were dev-only); grammar extended to `<key> [sense|prepare]`;
  `jicm-self.sh` reduced 340→53 lines as a forwarding shim (retired `__actuate` exits 64),
  slated for removal at R6 with session-start's legacy `.dev.*` fallback. Self-clear path
  preserved: `__run` + `_cycle_preserve_restore` is a superset of the old `cmd_actuate`.
  Original spec follows.
- **M1 — consolidate `jicm-self.sh` INTO `jicm-actuate.sh` (one actuator), preserving ALL functionality — especially self-actuation/volition.** `jicm-self.sh` is the self-clear organ (a session cycles itself); `jicm-actuate.sh` is the key-parameterized actuator. Merge into a single script exposing both: external actuation (`<key> --fire`, supervisor/operator) AND self actuation (`<key> --self` / in-session self-clear, volition). Audit `jicm-self.sh` for any capability not in `jicm-actuate.sh` (idle-gate self-check, `--reply-on-resume`-aware resume, dev-checkpoint prep) and carry it forward. Do NOT drop the self-clear path. Then the supervisor watches one signal protocol (retire the legacy `.dev` flat-path signals after the bridge window).
- **M2 — DONE (`46234a1`).** `_signal_valid` now publishes the identity it PROVES
  (`SIGVALID_SID`/`SIGVALID_TARGET`, reset per call, preferring the live pane occupant —
  the C3 anchor); `_fire` passes it as `--expect-sid=` / `--expect-target=`; `cmd_fire`
  ABORTs (rc=2) when the registry resolves a different session or pane. The gap it closes:
  guards (a)/(b) prove an identity, then `_fire` discarded it and `cmd_fire` re-resolved
  from the registry — a relaunch landing in that window would redirect the cycle at whoever
  now holds the key. Pins are rejected unless combined with `--fire` (a pin must never imply
  a check that did not run); an empty pin = unpinned legacy caller. Flags, not env vars, so
  the interlock is greppable in `ps`/logs. Harness 12/12 (`tmp/m2-harness.sh`).
  Caught a live pollution on first contact (registry `dev`=`66d922e6`, a Jul-21 bg fork,
  while pane `aion:11` ran `fbd7528a`) — the defect R2 reconciliation then root-caused.

### R3 — Fold W0 into the supervisor (v9 Phase 3)
- **Step 1 — shadow SAFETY: DONE.** Prerequisite discovered 2026-07-25, before any flag flip:
  **`JICM_SUPERVISOR_INCLUDE_W0=1` was NOT "sense-only".** For `key=w0`, `JK_CLEAR_SIGNAL`
  resolves to `.claude/context/.jicm-clear-now.signal` — **byte-identical to the legacy v7.9
  watcher's `JICM_CLEAR_SIGNAL`** — and `_signal_valid` reaps at 4 sites. Flipping the flag
  with the watcher running would have let the supervisor DELETE the clear request the watcher
  was acting on: two managers, one signal file. The plan's "shadow-run sense-only" step was
  therefore unsafe as written.
  Fix: `_w0_shadow()` (true while `jicm-watcher.sh` is alive) + `_reap_signal <key> <reason>`;
  all 4 reap sites now route through it, and `_fire` returns early for a shadowed w0
  (belt-and-braces behind the two existing gates). Shadow suppresses every w0 mutation and
  **logs what it WOULD have done** (`SHADOW-W0: would reap … / would ARM …`) — which is
  exactly the parity evidence this phase needs. Shadow ends by itself: retire the watcher
  process and w0 becomes fully managed, no flag to remember.
  Harness 7/7 (`tmp/r3-shadow-harness.sh`): a planted INVALID w0 signal SURVIVES an
  `INCLUDE_W0=1` pass and the would-be reap is logged, while a non-w0 dead-raiser signal is
  still reaped (shadow is correctly w0-scoped). Regressions green: M2 12/12, R2 14/14, H4 19/19.
- **Step 2 — shadow OBSERVATION: PENDING, needs elapsed time.** Run the supervisor with
  `JICM_SUPERVISOR_INCLUDE_W0=1` across ≥1 real W0 cycle and collect the `SHADOW-W0` lines.
  Cannot be forced: W0 sits at ~217K vs soft 550K / hard 600K, so a natural cycle is far off.
- **Step 3 — parity + cutover: BLOCKED on step 2.** md5-parity of W0's checkpoint vs the
  legacy watcher (RAG/Graphiti/consolidation/scrollback all fire); then cut over; retire the
  v7.9 watcher; rehearse rollback; retire the `_w0_clear_valid` stopgap in `jicm-watcher.sh`.
  **HALT-handshake parity decision** resolved here (documented Phase-3 checkpoint).

### R4 — Multi-session HUD (v9 Phase 5 / L3) — observability precondition — **DONE**
N-row registry-iterating HUD (Part B). Land **before** un-gate.
- Folded INTO `jicm-watcher-hud.sh` (not a parallel view): `load_sessions` +
  `render_sessions_section`, wired into the existing load/render pipeline. One row per
  `jicm_registry_keys`, sensed exactly the way the supervisor senses (the gate-written
  per-key state file), so HUD and supervisor cannot disagree about what they see.
- Columns: KEY · SID(8) · TARGET · TOKENS/hard · USE% (per-key, colour-graded) ·
  ACTION · LIVE/stale · **OCC**. OCC compares the registry's `session_id` to the LIVE
  pane occupant — `ok` / `DRIFT` / `?` (unresolvable probe, never read as agreement).
  DRIFT is the startup-race / registry-drift class R2 repairs, now visible instead of silent.
- Verified live: 6 keys; `dev`=fbd7528a@aion:11 and `w0`=f56d4d98@aion:0 both `OCC=ok`
  (R2 reconciliation holding); demo mode and the full `--once` frame unregressed.

> **FINDING surfaced immediately by the new panel (belongs to R5 — session-model alignment).**
> Every `dev-bg-*` fork renders at **144–194%** of its hard threshold: bg keys carry
> `hard=200000` while `dev`/`w0` carry `hard=600000`. Cause: `jicm-gate.sh`'s model→window
> map falls through to the UNKNOWN-model default (250K window / 200K hard) for background
> fork sessions, even though a fork inherits its parent's **1M** model. Empirical proof: the
> authoring session (`dev-bg-c6ce7be7`) sat at 389.5K with no compaction — impossible under a
> real 200K window. Consequence: those keys read permanently over-threshold, so the supervisor
> perpetually wants to fire at them (`ACTUATE-PENDING`) — the exact stuck-key case the R0
> circuit breaker exists to absorb. Fix belongs in R5 (launcher/session-model alignment):
> make model/window detection work for background forks rather than defaulting them.
> This is precisely the class of defect Part B predicted the single-session HUD was hiding.

### R5 — Launcher/session-model alignment
- **Model→window alignment: DONE (2026-07-27).** The R4 HUD showed every `dev-bg-*` key at
  144–194% of threshold. **My first read ("background forks fail model detection") was WRONG
  and is corrected here.** Real cause, from the transcripts: `dev-bg-c6ce7be7` and the `dev`
  PANE both report `claude-opus-5`; `w0` reports `claude-opus-4-8`. `jicm-gate.sh`'s
  model→window map had **no `*opus-5*` case at all**, so *any* Opus 5 session — pane or fork —
  fell to the UNKNOWN branch (250K window → 200K hard clamp) and read permanently
  over-threshold. Not a fork quirk: a systemic, model-wide mis-threshold.
  Root cause of the root cause: the launcher is mid-migration Opus 4.8 → Opus 5, and the gate's
  map never followed. Fix: `*opus-5*` → 1M, plus a comment recording that a model ABSENT from
  this map is not "safe by default" — it silently lands on the 250K branch.
  Harness 17/17 (`tmp/r5-window-harness.sh`) pins every shipping model (1M tiers, the 200K
  tiers that must NOT be caught by a broad glob, unknown-stays-conservative) and asserts all
  three LIVE sessions resolve to 1M.
- **Launcher default-expansion typo: FIXED IN PLACE, NOT COMMITTED.** The uncommitted launcher
  migration contains `export AION_MODEL="${AION_MODEL:claude-opus-5}"` — missing the `-`, so it
  is *substring* expansion, not default-value: unset → `[]` (the default is never applied),
  and an explicit override → `[8[1m]]` (last 5 chars, corrupted). The committed version
  (`${AION_MODEL:-claude-opus-4-8[1m]}`) was correct; the dash was lost in the in-flight edit,
  which defeats the very override the comment above it promises. Corrected in the working tree
  because every relaunch was actively affected, but **`launch-aion.sh` is deliberately left
  uncommitted** — it carries 88/74 lines of someone else's in-flight Opus-5 migration that is
  not mine to land. **→ Sir: review and commit that migration; the one-character fix is in it.**
- Remaining R5 items (untouched): cwd/symlink-safe resume (`Jarvis`↔`Project_Aion` realpath
  split); never `--resume` a live UUID without `--fork-session`; stop pinning seed UUIDs as
  source of truth; M3 launcher-row registration + GC pass.
- cwd/symlink-safe resume (the `Jarvis`↔`Project_Aion` realpath split; `sessions.md:25`).
- **Never `--resume` a live UUID without `--fork-session`.**
- Stop pinning seed UUIDs as the source of truth; treat the pane's live session as authoritative (observe, don't assume). Embrace agent-view/background sessions rather than fighting them.
- M3: mark the design's Files-table launcher rows "pending"; add startup registration + a GC pass.

### R6 — Phase-2 EXIT (only after R0–R4)
Canary `jicm-actuate.sh <disposable> --fire --canary` (Sir's hand) → delete the `--canary` gate in `cmd_fire` → launch supervisor `JICM_SUPERVISOR_ACTUATE=1` + wire into `launch-aion.sh` → autonomous multi-session firing live. Add the L2 adversarial gates (fork mid-cycle, two claimants, stale signal, pane mismatch) to the runbook and pass them here.

### R7 — Cross-project chains (v9 Phase 4, lower priority)
Bridge registers/deregisters real chains across their lifecycle; supervisor senses an Alfred transcript; Protos zero-state relaunch loads CLAUDE.md + compaction-essentials only.

---

## Part D — C3 + C1 patch design (concrete; not applied)

**New occupancy helpers (`jicm-config.sh`):**
```bash
# session-id currently occupying a tmux target's pane ("" if none)
jicm_pane_session() {                       # <tmux_target>
    local target="$1" ppid child sid
    ppid="$("$JICM_TMUX_BIN" display -t "$target" -p '#{pane_pid}' 2>/dev/null)"; [ -n "$ppid" ] || return
    for child in $(pgrep -P "$ppid" 2>/dev/null); do
        sid="$(_jicm_pid_session "$child")"; [ -n "$sid" ] && { printf '%s' "$sid"; return; }
    done
}
_jicm_pid_session() {                        # <pid> → sessionId from ~/.claude/sessions/<pid>.json
    local pid="$1" f
    for f in "$HOME"/.claude/sessions/*.json; do
        grep -q "\"pid\":$pid[,}]" "$f" 2>/dev/null && { jq -r '.sessionId' "$f" 2>/dev/null; return; }
    done
}
```

**C3 — occupancy-verified key derivation** (replaces `jicm_derive_key`; `my_sid` comes from the hook's stdin `session_id`, which gate/stop already parse):
```bash
jicm_derive_key() {                          # [session_id] [my_sid]
    local candidate my_sid="${2:-${CLAUDE_SESSION_ID:-}}"
    if   [[ "${JARVIS_WINDOW:-}" == "0" ]];         then candidate="w0"
    elif [[ "${JARVIS_SESSION_ROLE:-}" == "dev" ]]; then candidate="dev"
    elif [[ -z "${JARVIS_WINDOW:-}" ]];             then candidate="w0"
    else printf '%s' "${1:-unknown}"; return; fi
    # OCCUPANCY GATE: claim a pane-actuated key ONLY if I actually occupy its pane.
    if [[ -n "$my_sid" ]]; then
        local pane_sid; pane_sid="$(jicm_pane_session "$(jicm_default_target "$candidate")")"
        if [[ -n "$pane_sid" && "$pane_sid" != "$my_sid" ]]; then
            printf '%s' "${candidate}-bg-${my_sid:0:8}"; return   # background /fork → own namespace
        fi
    fi
    printf '%s' "$candidate"
}
```
`jicm_key_paths` already routes any non-`w0` key to the namespaced `jicm/` tree, so a bg key gets its own state/signals/checkpoint automatically. **A `dev-bg-<sid>` key is a first-class JICM citizen** — monitored, HUD-rendered, and cyclable — it simply actuates a **different channel** than the pane it forked from (see the actuation model below). Occupancy here only decides *identity*; it never gates JICM eligibility.

**Actuation model (the fix that preserves volition).** Each registry entry carries `actuation = {mode, channel}`:

| Key | mode | channel | how it clears+resumes |
|---|---|---|---|
| `w0`, `dev` (pane occupant) | `pane` | `aion:0` / `aion:11` | self-actuate from within **or** supervisor injects the pane (external reflex) |
| `dev-bg-<sid>` (background PTY fork) | `self` (default) | the session itself | **self-actuate**: the in-session actuator senses its own threshold → preps its namespaced checkpoint → `/clear`s itself → resumes. (Future `pty` mode: external inject via the bg-pty socket.) |

Two actuation paths, **both preserved**:
- **Self-actuation** = volition + reflex-from-within. The consolidated actuator, running *inside* a session, cycles that session on its own threshold **or** on a self-invoke / user request. Works for ANY session (pane or bg PTY) because the session acts on itself — this is how "W0 clears itself voluntarily or by request" and how a `dev-bg` working session gets full autonomic cycling.
- **External actuation** = the supervisor's reflex, **only** for `mode=pane` keys, injecting `/clear` into that key's own pane. It **never** injects the parent's pane for a bg key. That is the C4 safety property — achieved without denying the fork its own cycle.

**Operator volition (W11-dev points at anything):** `jicm-actuate.sh <key> --fire` invokes a cycle on ANY registered key/channel — the dev-driver / user-request path. Preserved and first-class, not just threshold-triggered.

**Fork detect + collapse-to-parent (scenario 1a).** On SessionStart, a session compares `my_sid` vs `jicm_pane_session(<its role's pane>)`. If it is a background fork it is flagged, and offered two resolutions:
- **collapse** — prep its checkpoint → write a handoff marker → exit; the parent `dev` pane resumes (or is nudged). The graceful undo for an *unintended* fork.
- **adopt** — register as `dev-bg-<sid>` and run full JICM (self-actuating). For a *deliberately* kept background working session (scenario 1b).
Default: **alert** the operator with both options rather than silently picking (a background fork is often unintended). This detection is the same `jicm_pane_session` occupancy probe used for keying — no new machinery.

**C1 — registry compare-and-swap** (guard added to `jicm_registry_upsert` before the write):
```bash
# refuse to silently overwrite a DIFFERENT, still-LIVE claimant of this key
local incoming_sid="" stored_sid
for kv in "$@"; do [[ "${kv%%=*}" == "session_id" ]] && incoming_sid="${kv#*=}"; done
if [[ -f "$f" && -n "$incoming_sid" ]]; then
    stored_sid="$(jq -r '.session_id // empty' "$f" 2>/dev/null)"
    if [[ -n "$stored_sid" && "$stored_sid" != "$incoming_sid" ]] && _jicm_session_alive "$stored_sid"; then
        jicm_alert "registry conflict key=$key: $stored_sid (live) vs $incoming_sid — refusing clobber"
        return 3
    fi
fi
```
`_jicm_session_alive <sid>` = is any live `~/.claude/sessions/*.json` holding that sessionId (pid alive)? With C3 in place C1 rarely fires (background forks no longer claim `dev`), but it's the backstop against two genuine same-pane claimants (H2).

**H3 — namespacing:** add `JK_SESSION_STATE`/`JK_SCRATCHPAD`/`JK_ACTIVE_PLAN` to `jicm_key_paths` (w0 = legacy paths; else `jicm/…/<key>.*`) and export them in `_step_prep`, mirroring the JSONL/compressed overrides.

**Test plan (R1):** T1 a `--fork-session` dev background job does NOT overwrite `registry/dev.json` (gets `dev-bg-*`); T2 the pane session keeps `dev`; T3 two same-pane claimants → C1 ALERT, no clobber; T4 `w0` output byte-identical (regression); T5 a bg key resolves an empty pane target (no `/clear` possible).

---

## Decisions (resolved 2026-07-20, Sir)
1. **Background-fork policy — FULL first-class JICM, not monitor-only.** A `dev-bg-<sid>` session gets full monitoring + HUD + autonomic self-actuating cycle (scenario 1b), plus the **detect + collapse-to-parent** option (scenario 1a: push state → kill dev-bg → hop back to parent dev). Occupancy = identity/detection only; never an eligibility gate. (Part D revised accordingly.)
2. **Consolidate `jicm-self.sh` INTO one actuator** (`jicm-actuate.sh`), preserving ALL functionality — do not lose the self-clear/volition path or any capability unique to `jicm-self.sh`. (R2/M1 revised.)
3. **HUD stays at R4** — after the core keying fix (R1), before the un-gate (R6).

## Execution gating (AC-03 milestone reviews)
Group R0–R7 into milestones with a STOP-and-REVIEW at each boundary: **M-A** = R0+R1 (safety + core keying); **M-B** = R2+R3 (reconcile/reap + fold-W0); **M-C** = R4+R5 (HUD + launcher alignment); **M-D** = R6+R7 (un-gate + chains). At each: Technical Review (code quality 1–5) + Progress Review (plan alignment 1–5); proceed only if both ≥ 4, else remediate. Then C1–C4 / H1–H4 / M1–M3 / L1–L3 close out within their mapped phases (per Part C).

## Order of work (Sir, 2026-07-20)
Proceed **R0 → R7**, then close out **C1–C4, H1–H4, M1–M3, L1–L3** within their mapped phases. Begin at **R0 (signal safety + disarm the stale `0a718eeb` signal)** and **R1 (the core keying + actuation model)**, each with the `env -u` harness + code-review.
