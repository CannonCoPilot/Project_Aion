# Aion Cross-Archon Remediation — 2026-08-14

## Context

Today's lane-restart work surfaced a cluster of defects that are separate in origin but share one
shape: **a component reports success while the thing it claims is not true.** A nudge logged
"DELIVERED" for a message that never became a turn. A restart gate reported an idle lane while
killing a 55-paper extraction. `--staleness` counts a background spare process as a lane needing
relaunch. Protos was dropped from JICM management by a file deletion, silently. Each was found by
accident, not by monitoring.

Underneath them sits a genuine emergency: **swap is at 46.2 GB of 47.1 GB**, and one leaked process
accounts for 59 GB of footprint.

This plan fixes the substructure first, then each Archon's blockers, then closes the monitoring gaps
that let these hide. Every claim below is from live measurement this session, not memory.

**Assumptions made because you were away when I asked** (override any at approval):
1. ~~Protos is re-registered as managed~~ — **withdrawn.** Evidence found after asking shows Protos
   is a fork-seed that cannot self-register; re-registering it would be neither durable nor
   obviously correct. Phase 2 now fixes the silent-failure mechanism and puts the decision to you.
2. Your dev lane (W11) is restarted **last**, after all work and reporting.
3. MLX-Embed is restarted **first**, with a footprint watchdog added.

---

## Issue inventory (severity order)

### 🔴 S1 — MLX-Embed leak: 59 GB footprint, 922 MB swap remaining
`pid 55516`, uptime 3d21h, `phys_footprint: 59 GB` while RSS reports 49 MB (RSS lies on macOS —
`footprint -p` is the truth). `vm.swapusage: 46181 MB used / 47104 MB total`. This is the leading
suspect for LiteLLM OOMs and destabilizes every lane. Nothing is in flight; the hot-reload wrappers
are idle. Restart path is `aion:5` → `bash start-server.sh`.

### 🔴 S2 — Protos (W1) has been unmanaged since Aug 12 — but it is a SEED, not a lane
`registry/protos.json` and `state/protos.json` are **deleted** (uncommitted `D`). The supervisor
enumerates lanes via `jicm_registry_keys()`, which is literally `ls registry/*.json` — so
**deleting a registry file silently unmanages a lane**, with no error and no warning. That
mechanism is a defect regardless of what we decide about Protos itself.

**What Protos actually is** (checked, and it changes the fix): a warm **fork-seed** for the
chain-executor fork-and-inject pattern — `cd Alfred-Dev` (symlink to `alfred/`), header
`x-aion-session-id: seed-session`, **no persona, no JARVIS_WINDOW, no role, no --resume**. It is not
a conversational Archon. `jicm-config.sh` nonetheless treats `protos` as a first-class pane-actuated
key (aion:1, "the TEST lane"), and W1 runs **Alfred's** hooks (`alfred/.claude/settings.json`),
none of which write the Jarvis registry.

Consequences and the open question:
- Its last cycle **died mid-flight**: `chain/protos.jsonl` holds a `capture` for `42e424d3` with no
  `bind` — the ledger's own signature for an aborted cycle. The committed registry still names
  `42e424d3`, while the live session is `1bf1a4dc` (3.4 MB / 2108 records, growing).
- Because W1 exports no `JARVIS_WINDOW=1`, the key derivation cannot yield `protos`, and no Alfred
  hook writes the registry. **Protos cannot re-register itself.** A hand-written entry would go
  stale again at its next `/clear` — so re-registration alone is not a durable fix.
- `aion-lane-restart.sh` does not accept `protos` (map is `jaques|genie|dev|w0`).

**Therefore I am NOT auto-re-registering it** (this reverses the assumption I stated above, on
evidence found after asking). Whether a fork-seed should be JICM-managed — and thus subject to
automatic cycling — is a design decision that is yours. The plan instead closes the silent-failure
mechanism and surfaces the state, which is correct under either answer.

### 🟠 S3 — `.jicm-state-hook.json` has four writers with conflicting shapes
Writers: `hooks/jicm-gate.sh`, `hooks/context-health-monitor.js`, `scripts/jarvis-statusline-v8.sh`,
`scripts/jarvis-statusline-v9.sh` (plus the watcher's `refresh_state_from_jsonl`). Current content
after W0's restart: `sessionId: null`, `source: null`. This is the **same pathology as the
memory-health race** (trap 13) — and a lock would not fix it either.

**This is what blocks Watcher retirement.** W0 is the only lane still on the legacy shared path
(`JK_STATE` line 86) rather than per-key `state/<key>.json` (line 102); `state/w0.json` does not
exist. Retiring the watcher today makes W0 read **0 tokens forever** — the §1 blindness again.

### 🟠 S4 — `--staleness` counts non-lane processes
`pid 58726` is `claude bg-spare` (20 days old, parented by `claude bg-pty-host`), with a 242-byte
stub transcript from Jul 25. It has been reported as a live session needing relaunch. Every
staleness figure I have given you was inflated by it.

### 🟡 S5 — Jacques (W13): browser gate may already be closed; two real blockers remain
- `navigate` was fail-closed on classifier 500s. **Zero classifier calls since 21:05Z**, and the
  lane now shows `bypass permissions on`. The gate is plausibly resolved by the restarts — this
  needs an **empirical probe, not another fix**. Fallback remains `browser_batch` (safe-allowlisted,
  accepts `navigate` as a batched action).
- Second cause, independent of permissions: his tools are **deferred** (`ENABLE_TOOL_SEARCH=true`),
  so they register after the permission engine renders its tool table.
- **`harbor` + `stb` not installed** → the required `-a oracle = 1.000 / -a nop = 0.000` gate has
  never run. `stb login` is interactive. **Yours.**

### 🟡 S6 — Cross-lane messaging is unreliable by construction
The pane is a single-slot, destructive, human-shared channel. My message to Jacques never became a
turn; his input box currently holds an unsent line (`commit this`). `cmd_nudge` now verifies
delivery (`69dee87`), but **verification is not a channel** — content should not travel this way.

### 🟢 S7 — Genie (W12): resolved, needs confirmation only
All 6 MCP servers verified running under the new head (`annas_tools`, `arxiv`, 3× rag-service,
scholar-gateway). His scratchpad predates the restart and still says "needs a RESTART". He also lost
a 55-paper extraction at 17 papers to the 15:27 restart — **re-run needed**.

### 🟢 S8 — Housekeeping
35 unpushed commits on `main`. Pulse health path is `/api/v1/health` (`/health` 404s). W0 holds 2
uncommitted files in the palimpsest repo — active work, his call, not touched by this plan.

---

## Remediation

### Phase 1 — Reclaim memory (do first, ~2 min)
1. Restart MLX-Embed: `aion:5`, Ctrl-C then `bash start-server.sh` (or respawn the window).
2. Verify `footprint -p <new pid>` is back to single-digit GB and `vm.swapusage` free rises.
3. Add a footprint watchdog to `jicm-supervisor.sh`'s existing MAINTAIN pass — ALERT when
   `phys_footprint` crosses a threshold. Reuses `_probe`'s cause-naming pattern; **alert only, never
   auto-kill** (a restart mid-embedding corrupts an ingest).

### Phase 2 — Make Protos's state visible; do not silently re-manage it
4. **Close the class, not the instance**: make the supervisor WARN when a live claude head has no
   registry entry, and when a registry entry names a session that is no longer live. Silent
   unmanagement — in either direction — becomes impossible to repeat. This is the load-bearing fix
   and it is correct whatever you decide about Protos.
5. Reconcile the orphaned Aug 12 cycle in the ledger: record `42e424d3` as died-in-flight rather
   than leaving a bare `capture` that reads as a cycle still in progress. Its output already exists
   at `digests/protos-42e424d3.md` (untracked). Bookkeeping only — touches no live session.
6. **Report, then ask**: present Protos's true state (seed session, 3.4 MB, unmanaged, cannot
   self-register) and let you choose — manage it as a lane, keep it a pure seed and prune the
   half-present leftovers, or recycle the seed periodically instead of compressing it.
7. Deferred until (6): adding `protos` to `aion-lane-restart.sh`'s lane map, and any registry
   recreation. Both presuppose an answer we do not have.

### Phase 3 — Unblock Watcher retirement (S3)
8. Migrate w0 off the legacy shared path onto per-key `state/w0.json` (`jicm-config.sh` line 86 →
   the line-102 pattern every other lane already uses). This removes the shared file's multi-writer
   contention at the root, exactly as the memory-health fix did: **one writer per file**.
9. Verify `state/w0.json` is **gate-authored** — real `sessionId` and `source`, mtime advancing on
   W0's prompts, not on the watcher's tick.
10. Only then retire the Watcher window. `launch-aion.sh` already carries both
    `JICM_WATCHER_CYCLE_ENABLED=false` and `JICM_WATCHER_MAINT_ENABLED=false`, so the cutover
    survives relaunch.

### Phase 4 — Fix the monitoring gaps
11. `--staleness`: exclude `claude bg-spare` / `bg-pty-host` and any head not bound to a tmux pane.
    Report lane heads only.
12. Cross-lane messaging (S6): replace pane-delivered *content* with a file drop each lane reads on
    resume — `.claude/context/inbox/<key>.md`, surfaced by the persona `@`-import that already
    force-loads each lane's scratchpad. The pane keeps only the one thing it is good at: a short
    "you have mail" nudge, now delivery-verified.

### Phase 5 — Per-Archon close-out
13. **Jacques**: ask him to probe `navigate` once. If it works, the gate closed itself and the
    9 unheld pages + live diff proceed. If not, `browser_batch`. Then `harbor`/`stb` (needs you).
14. **Genie**: confirm his 6 servers via `claude mcp list`, correct his stale scratchpad, re-run the
    55-paper extraction from paper 18.
15. **Push** the 35 commits once the above is green.
16. **Dev lane (W11)** restarted last — see "What I need from you".

---

## What I need from you

| # | Action | Why it must be you |
|---|---|---|
| 1 | **Clear W13's input box** (`commit this` is sitting unsent) | It is your text. Submitting or discarding another person's unsent line is not mine to do. |
| 2 | **`stb login`** in Jacques' lane | Interactive auth; blocks the `-a oracle`/`-a nop` submission gate. |
| 3 | **Restart W11 (Jarvis-dev)** at the end — `.claude/scripts/aion-lane-restart.sh dev` | A lane may not restart itself; the respawn kills the verifier. Run it from any other lane or shell. Context survives via `--resume`. |
| 4 | **Decide Protos's role** — managed lane, pure seed (prune leftovers), or periodically recycled seed | It is a fork-seed, not an Archon; managing it changes what automatic cycling acts on. I will report its true state first (Phase 2.6). |
| 5 | **Approve or override the assumptions** listed in Context | You were away when I asked. |

Nothing else requires you. Phases 1–5 are mine.

---

## Verification

- **S1**: `footprint -p <mlx pid>` single-digit GB; `sysctl vm.swapusage` free climbs from 922 MB.
- **S2**: `jicm-supervisor.sh --status` WARNS about W1 — a live head with no registry entry —
  instead of omitting it silently. Negative-test it: temporarily move a managed key's registry file
  aside and confirm the warning fires, rather than trusting that it would.
- **S3**: `state/w0.json` exists with non-null `sessionId`/`source`; mtime advances on a W0 prompt
  while the watcher is idle. Only then kill the Watcher window, and re-check W0's tokens are
  non-zero **after** it is gone — that is the falsifiable test the retirement has always needed.
- **S4**: `--staleness` no longer lists `8db15990`; count drops to true lane heads only.
- **S5**: Jacques reports a successful `navigate`, or a successful `browser_batch` fallback.
- **S7**: `claude mcp list` in W12 shows `annas-archive` + `arxiv`; extraction resumes at 18/55.
- **Regression**: re-run the two proofs from today — a verified nudge (`rc=0`, user turn observed)
  and a background-work refusal that names its jobs.

## Risks

- **MLX restart** briefly breaks embeddings (RAG search/ingest). Nothing in flight; ~30s.
- **W0 state migration** touches the file W0's token reading depends on. Verify `state/w0.json` is
  gate-authored **before** retiring the watcher; if it is not, the watcher stays and I report why.
  A below-threshold result here is not accepted — it blocks the retirement.
- **Protos re-registration** makes a previously-unmanaged lane subject to automatic cycling. It is
  the test lane, which is the right place to find out, but its first cycle should be watched.
