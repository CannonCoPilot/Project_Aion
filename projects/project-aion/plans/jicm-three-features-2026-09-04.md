# JICM — Three Feature Builds (planned 2026-09-04)

Status: **F1 DONE · F2 DONE · F3 BUILT, ONE VERIFICATION STEP OUTSTANDING** (2026-09-04 ~18:1x)

## IMPLEMENTATION RECORD (appended 2026-09-04)
- **F1 DONE** — `jicm-nudge.sh` SOFT + HARD text rewritten. Verified: SOFT/HARD emit, WATCHING
  passes through. Backup `jicm-nudge.sh.bak-f1-*`.
  ⚠️ The two rows this plan flagged VERIFY-BEFORE-SHIPPING (background-task notification and
  subagent report surviving a `/clear`) were **NOT** empirically tested — testing them requires
  clearing a live lane. Per this plan's own instruction the wording was **softened instead of
  asserted**: it says results *"may have nowhere to return to"*, never that they are lost. What
  IS confirmed structurally: a `/clear` mints a NEW session uuid (this lane went
  `ce0c9b6c…` → `ec4f01a4…`), so anything addressed by session identity is unreachable after.
  If either row is ever tested and survives, the text needs no change — it is already true
  under both outcomes.
- **F2 DONE** — quota tier added ABOVE the action gate, exactly as this plan's CRITICAL DESIGN
  POINT demanded. Verified matrix: fires at rate 90 (89 does not), float rates handled
  (`91.7` → 91), quota-only emits standalone, both-hot emits **ONE** block with the quota text
  appended, and a QUOTA → SOFT_NUDGE+QUOTA escalation is not swallowed by the quota cooldown.
  **Latency: 18ms common path** (vs the ~22ms baseline) — `rate_5h_pct` rides the jq read that
  already ran, so the tier costs nothing when cold. Backup `jicm-nudge.sh.bak-f2-*`.
- **F3 BUILT — design revised, see below.** `.claude/scripts/jicm-now.sh` + `.claude/commands/jicm-now.md`.

### 🔴 F3 DESIGN REVISION — it is a FRONT-END, not an inline cycle
This plan said "drive the cycle inline". **`jicm-actuate.sh --fire` already does that**: it runs
prep → clear → resume in a detached worker, already takes `actuating.<key>` with a PID owner
token, and already carries M2 identity pinning, transcript verification and the
self-decapitation guard. Reimplementing it would make **two writers of one cycle** — the exact
class of bug the action/pending_action split came from. So `jicm-now.sh` is a guarded operator
front-end over `--fire` (fold forward, do not build a parallel legacy). Steps 1/2/3/4/6 of the
original design are all implemented in the wrapper; step 5 delegates.

**Verified:** dry-run on dev resolves the right lane (`aion:11`, own transcript) · live lock
REFUSES with exit 1 and does not race · stale lock (dead pid) proceeds with a note · NOT READY
save-gate aborts, and **`--force` does not bypass it** (stub-harnessed; the stub's FIRE line
never printed under either invocation).

**🔴 OUTSTANDING:** the real (non-dry-run) run on dev is NOT done — it would clear this session
mid-task. That is the last verification step in this plan's own §Verification. Do it at a natural
hand-back point, and watch `jicm-watcher.log` for a second actuation within 60s to confirm no
double-fire.

---

### Original status line
Status: **PLAN — reviewed and revised. Implement AFTER the jicm cycle + Genie relaunch + piece 5.**
Author: W11:Jarvis-dev. Written before a JICM clear so it survives it.

---

## F1 — Rewrite the mid-turn nudge language

### Current text (jicm-nudge.sh, SOFT tier)
> "Prefer finishing the current step over opening new ones, and keep your scratchpad current."

Too vague. It does not say a clear is *coming*, and it does not name the class of action that
is actually dangerous.

### What actually does NOT survive a `/clear`

A `/clear` mints a NEW session in the same process. The process, the shell, and the filesystem
survive; **the conversation and everything anchored to it does not.** So the hazard is not
"losing work" — it is **starting something whose RESULT can only be delivered to a session that
will no longer exist.** Orphaned work is worse than un-started work: it burns quota and returns
nowhere.

| Thing | Survives `/clear`? | Why it matters |
|---|---|---|
| Background Bash task (`run_in_background`) | process YES, **result NO** | completion notification lands in a dead session |
| Subagent (`Agent` tool) | agent YES, **report NO** | its final report is delivered to the spawning session |
| Artifact watches | **NO** — documented session-local | republish notices stop arriving |
| `CronCreate` with `durable:true` | **NO** — silently session-only (MEMORY.md) | looks scheduled, isn't |
| `Monitor` / until-loop waits | **NO** | the waiter is the session |
| Plan-mode state | **NO** | |
| MCP server connections | re-initialise | observed today: drop + reconnect on restart |
| Unsent tmux input buffer | **NO** | actuator's `clear-input` discards it (trap #16) |
| Files, scratchpad, checkpoints, git, transcript | **YES** | this is the durable channel |

⚠️ **VERIFY BEFORE SHIPPING** (do not assert these from this table alone): whether a background
Bash task's notification is genuinely lost or re-delivered post-clear, and whether a subagent
spawned pre-clear can still be reached via `SendMessage` after. Test both empirically; if either
survives, soften that row rather than overstating.

### New SOFT text (draft)
> `[JICM] CONTEXT NEARING THRESHOLD — {tokens} of {hard}. A /clear WILL happen at the end of one
> of the next few turns. Keep going on what you are doing; finishing the current step is exactly
> right. Two things to avoid until after the cycle: (1) do not START background tasks, subagents,
> artifact watches, monitors or session-scoped crons — they outlive the turn but their RESULTS
> come back to a session that will no longer exist, so the work is spent and lost; (2) do not
> leave findings only in this conversation. Anything you would be annoyed to re-derive belongs
> in your scratchpad now, where it survives. In-flight work already running: let it return before
> you hand back.`

### New HARD text (draft)
> `[JICM] OVER HARD THRESHOLD — {tokens} of {hard}. The cycle is queued and fires at the END of
> this turn; it cannot interrupt you mid-turn, so you are safe to finish cleanly — but every tool
> call from here adds to the overshoot the checkpoint must carry. Land the current step, write
> state to your scratchpad, and hand back. Do not open new work, and do not spawn anything whose
> result would return after the clear.`

**Design rule:** the message must *permit* finishing. The old wording read as "stop", which
causes an abrupt hand-back mid-task — worse than a slightly larger overshoot.

---

## F2 — Quota-aware nudge (5-hour window ≥ 90%)

### Data source — already exists, no new plumbing
`jicm-gate.sh` already writes **`rate_5h_pct`** and `rate_7d_pct` into every lane's state file
(confirmed in the state schema). `jicm-nudge.sh` already reads that file on PreToolUse. So this
is an added tier in a hook that is already installed, already rate-limited, and already cheap
(22ms with the session-id fast path).

### 🔴 CRITICAL DESIGN POINT (this is what a naive implementation gets wrong)
Quota pressure is **ORTHOGONAL** to context pressure. A lane can sit at 10% context and 95%
quota. The current hook returns early unless `action` is SOFT_NUDGE/HARD_HALT — so a quota tier
placed after that check **would never fire**. The quota check must run **BEFORE** the
action gate, on its own cooldown, with its own stamp tier.

### Behaviour
- Threshold `JICM_QUOTA_WARN_PCT` (default **90**), read from `rate_5h_pct`.
- Message: do **not** launch new subagents; let any in-flight subagents finish and return their
  work before taking further steps of your own; prefer finishing over parallelising.
- Cooldown `JICM_QUOTA_COOLDOWN` default 600s, tier-stamped so a quota nudge and a context
  nudge do not suppress each other.
- If BOTH quota ≥90 and context over threshold, emit ONE combined message, not two.

### Draft text
> `[JICM] 5-HOUR QUOTA AT {pct}% — do not launch any new subagents or parallel background work.
> If subagents are already running, WAIT for them to return their results and fold them in before
> starting any next step of your own. Sequential work from here; parallel fan-out at this level
> risks exhausting the window mid-task and stranding whatever is in flight.`

---

## F3 — `/jicm-now` — operator-triggered synchronous cycle

### The problem being solved
Today `/jicm` and `/intelligent-compress` **write a signal and wait for the watcher to notice**
(10s poll), then wait through prepare → clear → resume, each with unpredictable latency (the
2026-09-03 incident showed ~22 minutes end-to-end). At the keyboard that is unusable.

### Design
A command that **drives the cycle inline** instead of signalling and waiting:
1. Resolve the caller's key (`jicm_derive_key`) — never assume w0.
2. **Take the watcher's own lock** (`signals/actuating.<key>`) BEFORE starting, so the daemon
   cannot double-fire the same cycle. Release on exit via `trap`.
   ⚠️ Must use `trap ... EXIT` **with an explicit `exit`** — a bare trap survives SIGTERM and
   strips its own lock (recorded trap: [[reference_trap_term_unkillable]]).
3. Run `jicm-actuate.sh <key> prepare`; **abort loudly** if the save-gate says NOT READY (do not
   override it — that gate is what protected Jacques today).
4. Print each stage as it completes, with elapsed seconds, so the operator sees progress rather
   than a hang.
5. Drive clear + resume directly.
6. Refresh watcher-visible state so the daemon does not re-fire: reset `pending_action`, clear
   `clear-now.<key>.signal`, clear `over-threshold.<key>`, and update the registry `last_seen`.
7. `--dry-run` prints the plan and touches nothing.

### Flags
`/jicm-now [--key <k>] [--dry-run] [--force]` — `--force` skips only the IDLE wait, never the
save-gate.

### Impact on Watcher-JICM (the part that needs care)
- **Lock contention** is the main risk: if the daemon is mid-actuation, `/jicm-now` must REFUSE,
  not race. Check `actuating.<key>` + `_worker_alive` first.
- **Double-clear** is the second: after the manual cycle, a stale `clear-now` signal would make
  the watcher fire again into a freshly-cleared lane. Step 6 exists precisely to prevent that.
- The new `over-threshold.<key>` marker from R3 must also be cleared, or the lane logs a
  spurious `OVER-THRESHOLD-CLEARED` with a nonsense duration.

---

## Implementation order (after cycle + Genie + piece 5)
1. **F1** — text-only edit to `jicm-nudge.sh`. Lowest risk. Verify with the existing matrices.
2. **F2** — add the quota tier ABOVE the action gate in the same hook; re-run latency + matrix.
3. **F3** — new `.claude/commands/jicm-now.md` + `.claude/scripts/jicm-now.sh`. Highest risk;
   dry-run first, then exercise on the **dev** lane (self), never on W0 first.

## Verification
- F1/F2: extend `scratchpad/guard-*`-style matrices — assert quota tier fires at 90 with context
  at WATCHING, that the two tiers do not suppress each other, and that latency stays ~22ms.
- F3: `--dry-run` on dev; then a real run on dev; confirm no double-fire by watching
  `jicm-watcher.log` for a second actuation within 60s.

### Verification results (2026-09-04 18:2x) — ALL THREE COMPLETE ✅
- **F1** DONE. SOFT/HARD text rewritten; the two VERIFY-BEFORE-SHIPPING rows were softened
  rather than asserted (not testable without clearing a live lane). `/clear` minting a new
  session uuid confirmed structurally: `ce0c9b6c…` → `ec4f01a4…`.
- **F2** DONE. Quota tier sits ABOVE the action gate; matrix verified (90 fires / 89 does not ·
  float `91.7` · quota-only standalone · both-hot = ONE block · escalation not swallowed).
  Common path **18ms**, under the 22ms baseline.
- **F3** DONE — **live non-dry-run fire on dev, no double-fire.** `jicm-now.sh` actuated at
  18:24:32; `jicm-actuate.log` shows exactly one `preserve-restore start/complete` pair
  (checkpoint 5350 bytes, digest 501 words in 147s, `/clear` at 18:27:25, RESUME nudge 18:27:28);
  `jicm-watcher.log` reaped it once — `reap: key=dev actuation cycle complete (lock released
  after 184s)`. **No second actuation** in the following 60s, no `actuating.dev` lock left
  behind, and no `clear-now.dev.signal` written (contrast the 17:22 watcher-driven cycle, which
  DID leave SOFT_NUDGE signal lines in `jicm-stop.log` at 23:22:09Z/23:22:36Z). The stale-signal
  cleanup in `jicm-now.sh` step 4 is therefore sound: the direct-fire path leaves the watcher
  nothing to re-trigger on.
