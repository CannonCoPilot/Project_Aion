# Claude Code Session Model & JICM Identity — Comprehensive Diagnosis (REV 4)

> **Rev 4 (2026-07-20 PM):** git/docs issue RESOLVED (it was a corrupted `.git`, **not** RTK — see §6) and all conclusions **validated against re-cloned current docs**. See §6 for the citation table.

**Date:** 2026-07-20 · **Author:** W5 Jarvis-dev, session `66d922e6` (a `--fork-session` background-PTY fork of the dev pane `fbd7528a`).
**Status:** DIAGNOSIS ONLY — nothing executed, no code modified.
**Rev 3** rebuilds the diagnosis empirically after Sir's push-back, **grounded in the official Claude Code docs** (`/Users/nathanielcannon/Claude/GitRepos/claude-code-docs`: `cli-reference`, `interactive-mode`, `agent-sdk/sessions`). It **retracts** three Rev-1/2 claims and reframes the whole thing around Claude Code's *fluid* session model. Companion tool: `.claude/scripts/dev/session-reap.sh` (process diagnosis only; no transcript deletion).

**Retractions from prior revs:** (1) "W0 stuck/blind on stale hooks" — wrong (fresh process = fresh hooks). (2) "W0 self-compacted 694K→262K" — **fabricated reconciliation; retracted.** W0's exact token state is deferred to Sir's direct observation. (3) "launcher forks a new UUID every relaunch" — wrong; the launcher's 3 windows are healthy. The real issue is the collision between Claude Code's session model and Jarvis's fixed-window assumptions.

---

## 0. TL;DR

- **This is a Claude Code session-model change, not a Jarvis bug per se.** CC now treats sessions as fluid: any window can `--resume`/pick any session, `--fork-session` mints a new UUID branch, and a **daemon (`cc-daemon`) hosts "background" sessions in pooled PTYs** (`--bg-pty-host`). "Background process" = a *real* interactive session in a daemon PTY, **not** a subagent. Your intuition was right.
- **The tmux panes are correctly bound right now** (`aion:0→f56d4d98`, `aion:1→30231bad`, `aion:11→fbd7528a`). Panes don't lose their sessions — but the model *lets* you repoint/fork them, so Jarvis can no longer *assume* a fixed window↔UUID binding.
- **`fbd7528a` IS my parent** — I (`66d922e6`) am `claude --session-id 66d922e6 --fork-session --resume fbd7528a --bg-pty-host …`. You converse with this background fork; `fbd7528a` still runs in `aion:11`.
- **The real Jarvis problem is keying, not the launcher:** JICM derives its key from `JARVIS_SESSION_ROLE`, so the dev pane *and every background dev fork* (me) claim `key=dev` → registry/breadcrumb churn. Fix = occupancy/PTY-aware keying (C3).
- **Several "sessions" are daemon spare-pool slots** (`bg-spare`, 0 KB), not work. Heavy accumulation is **Alfred seeds** (Nexus forks one per dispatch, none reaped).
- **No transcripts need deleting.** Confirmed again.
- **Conclusions validated against current docs** (§6). The earlier "RTK blocks git" claim was **wrong/unverified** — the docs repo's `.git` was corrupted (missing `objects/`); re-cloned fresh (upstream updated 2026-07-20). ⚠️ its old config held a plaintext GitHub PAT — rotate it.

---

## 1. The Claude Code session model (grounded in official docs)

| Mechanism | Doc | Effect |
|---|---|---|
| `--resume, -r [session]` | cli-reference:65; interactive-mode `/resume`:111 | Resume by ID/name **or open the session picker** — any window can load any session |
| `--fork-session` | cli-reference:44; agent-sdk/sessions:137-156 | On resume, **mint a new session UUID**, new branch; **original preserved unchanged** |
| `--session-id <uuid>` | cli-reference:66 | Force a specific UUID (must not already exist) |
| `--continue, -c` | cli-reference:38 | Load the most recent conversation in the cwd |
| `--teleport` / `--remote` / `--from-pr` | cli-reference:72,64,45 | Resume claude.ai web sessions locally / create web sessions / resume PR-linked sessions |
| `--bg-pty-host …/cc-daemon-…/pty/<uuid>.sock` | *(internal; observed)* | Run a session inside a **daemon-hosted background pseudo-terminal**; a pool of pre-warmed `bg-spare` PTYs is maintained |
| `/tasks`, `Ctrl+B` | interactive-mode:117,34 | Manage background tasks; background bash/agents |

**Consequence:** window↔session is **fluid by design**. A session can live in a tmux pane, in a daemon background PTY, be forked into N branches, or be resumed into any window via the picker. **Jarvis's launcher/JICM model assumes one stable pinned UUID per tmux window — that assumption is now false**, which is the source of the confusion.

---

## 2. Comprehensive session map (empirical, 2026-07-20)

### 2a. Current tmux pane bindings (correct, stable)
| Window | pane_pid | session | notes |
|---|---|---|---|
| `aion:0` Jarvis | 14723 | **f56d4d98** | W0; heavy work session (14 MB); token state per Sir's observation |
| `aion:1` Protos | 15555 | **30231bad** | Alfred seed |
| `aion:11` Jarvis-dev | 15006 | **fbd7528a** | dev pane (my fork parent) |

### 2b. Live processes by ORIGIN
| Origin | Sessions | Meaning |
|---|---|---|
| **tmux pane (launcher)** | `f56d4d98`, `30231bad`, `fbd7528a` | resumed in place; healthy |
| **background fork (`--fork-session --resume fbd7528a --bg-pty-host`)** | **`66d922e6` (me, active)**, `90e7e0c5` (empty) | daemon-hosted forks of the dev session |
| **daemon spare pool (`bg-spare`, 0 KB)** | `e0cc6d1c`, `513140f7`, `a9eb6525`, `7dab16b5` | pre-warmed empty PTY slots — **not sessions** |
| **auto-resumed (`--resume <uuid> --reply-on-resume`)** | `1bdafa6f`, `0a718eeb`, `3cf00d80`, `c92477e4` | transient automation / cache-warming re-entries |

### 2c. Content inventory (44 sessions active in last 6 days)
- **Jarvis-dev lineage** (`dev-session-instructions`): `fbd7528a` (pane), `66d922e6` (me — contains the CV work *and* this JICM investigation), `1bdafa6f`, `08bedb84`.
- **Alfred seeds** ("You are the Alfred seed session…"): ~20 in 6 days — **Nexus forks a fresh seed per dispatch**; almost all dead. This is the bulk of the accumulation.
- **Heavy work sessions** (10-40 MB; first line a `local-command-caveat`, so topic isn't in the first prompt): W0 OriginalDR / JICM phases / remediation-roadmap — e.g. `072e6880` (40 MB), `704a6930` (15 MB), `3cf00d80`/`ec2f213d` (14/10 MB).
- **Spare-pool** (0 KB): as above.

### 2d. Identity divergence for `key=dev` (the live collision)
`registry/dev.json → 66d922e6` (me) · `.current-dev-uuid → 1bdafa6f` (auto-resumed) · pane `aion:11 → fbd7528a` · `clear-now.dev.signal → 0a718eeb`. **Four different UUIDs, all "dev."** Because keying is by role, every dev-lineage process (pane + background fork + auto-resume) claims `key=dev`.

---

## 3. NORMAL Claude Code behavior vs. actual Jarvis PROBLEMS

**NORMAL — do not fight (it's the platform):** the `bg-spare` PTY pool; `--fork-session` branching; the `/resume` picker; daemon-hosted background sessions; `--reply-on-resume` auto-resumes; prompt-suggestion background requests; `/teleport`.

**PROBLEM — Jarvis-side, real:**
- **P1 (core) — role-based keying conflates every dev-lineage session.** `jicm_derive_key` returns `dev` for any `JARVIS_SESSION_ROLE=dev` process; `jicm_registry_upsert` is last-writer-wins. So the dev pane, my background fork, and auto-resumes all overwrite `registry/dev.json`. → doc-review **C3 + C1**. *This is the pollution.*
- **P2 — the launcher/breadcrumb model assumes a fixed window↔UUID binding** that CC's picker/fork model breaks. The breadcrumb `.current-dev-uuid` chases the last writer (currently the auto-resumed orphan `1bdafa6f`), not the pane.
- **P3 — Alfred-seed accumulation.** Nexus forks a seed per dispatch; the reaper is `kill-window`-scoped, so windowless/detached seed processes and their transcripts pile up. Mostly harmless but clutters the picker.
- **P4 — stale `clear-now.dev.signal`** (`0a718eeb`, 745K, ~6 h) — supervisor un-gate landmine. → **C2**.

**UNCERTAIN — deferred to Sir:** W0's exact token state (262K vs 694K). I retract the self-compact story; `.jicm-state-hook.json` may be stale or cross-written by a same-UUID process. Needs Sir's direct read of the W0 pane.

---

## 4. Answers to Sir's questions (Rev 3)

- **Is window↔session stability lost?** At the *pane* level, no — the 3 panes hold their intended sessions right now. But CC's model makes the binding **fluid** (picker can repoint; `--fork-session` proliferates branches; the daemon hosts background copies). **Jarvis must stop *assuming* a fixed binding** and instead *observe* which session occupies each pane.
- **How is an active session a "background process"?** It's forked into a **daemon-hosted background PTY** (`--bg-pty-host`, `cc-daemon`). A real interactive session, not a subagent. (Subagents = `Task`-spawned, ephemeral, under one session; these background PTY sessions are full peers.)
- **Is `fbd7528a` a parent of `66d922e6`?** **Yes** — `--fork-session --resume fbd7528a`. My earlier "siblings via `62687e5d`" was an artifact (a fork copies the parent's head `parentUuid`).
- **Can we collapse the dev sessions? Advisable?** Don't merge transcripts (distinct branches). Do collapse the **claim on `key=dev`**: only the pane occupant owns it; background forks get a distinct key (`dev-bg-<id>`) or none. Advisable, yes.
- **Do we need to delete transcripts?** **No** — reaffirmed. Pollution is live-process + registry state.
- **The picker sessions (OriginalDR, JICM, roadmap, CV, Alfred)?** All accounted for in §2c: real accumulated work + dev forks + ~20 Alfred seeds + spare-pool. They "split off" via `--fork-session`/background-PTY and picker resumes — expected under the new model, just un-managed by Jarvis.

---

## 5. Remediation (aligned to the real model; designed, NOT applied)

1. **P1/C3 — occupancy-verified keying (the cure).** Derive a JICM key from *actual pane occupancy* (pane-PID → session UUID via `~/.claude/sessions`), not from `JARVIS_SESSION_ROLE`. A background-PTY fork (no pane) gets a distinct key or no registry entry. Stops the collision without killing anything.
2. **C2 — signal safety** + disarm the stale `0a718eeb` signal before any supervisor un-gate.
3. **C1 — registry compare-and-swap** on `session_id`; ALERT + reset on identity transition.
4. **P2 — stop pinning; start observing.** Reconcile the breadcrumb to the pane's live session each launch; consider dropping the fixed-UUID assumption in favor of "track whatever session occupies the window." Embrace `--fork-session`/picker rather than fight them.
5. **P3 — Alfred-seed lifecycle + process-level reaper** (beyond `kill-window`). Give seeds/chains a TTL and reap detached processes.
6. **W0 — no action from me;** defer token-state to Sir. If a fresh W0 is wanted, `/clear` (keep the UUID).
7. **Docs — DONE:** re-cloned `claude-code-docs` (was a corrupted `.git`, not RTK); now valid + current (§6). Rotate the PAT that was in the old config.

**Test plan:** T1 background dev fork does NOT overwrite `registry/dev.json`; T2 stale/foreign signal refused; T3 two claimants → ALERT; T4 breadcrumb converges to pane; T5 seed TTL reaps a finished chain's detached process.

---

## 6. Documentation validation (Rev 4 — current docs, re-cloned 2026-07-20)

**Git resolution:** the `git pull` failure was **NOT RTK** (an unverified assumption — retracted). RTK exists (`/opt/homebrew/bin/rtk` 0.22.0) but `git` is the real binary with no rewrite hook, and `git -C <Project_Aion>` works fine. Root cause: the docs repo's `.git` was **corrupted — missing `objects/`** (a GitKraken `gk/` artifact). Resolved by re-cloning the public upstream `ericbuess/claude-code-docs` (HEAD updated 2026-07-20); broken dir preserved as `claude-code-docs.broken-20260720`. ⚠️ the old `.git/config` origin URL contained a **plaintext GitHub PAT** — rotate it and use a credential helper.

Against the current docs, the Rev-3 conclusions are **confirmed and refined** with official terminology:

| Rev-3 finding | Current-doc confirmation | Correct term |
|---|---|---|
| "background PTY session, not a subagent" | `corporate-launcher.md:46` (`claude bg-pty-host`/`bg-spare` are official helper procs); changelog: "`/fork` copies your conversation into a **new background session**… the in-session subagent it used to launch is now `/subtask`" | **Background session** via **`/fork`** / agent-view `/resume`; a **background service (supervisor process)** hosts them; `bg-spare` = **warm standby** pool; `claude agents` = **agent view** |
| "`fbd7528a` is my parent (fork)" | `sessions.md:94-114` — `/branch`/`--fork-session` copy the convo with a new ID, original intact | I'm a `--fork-session` background session of `fbd7528a` |
| "window↔session is fluid" | `sessions.md` — `/resume` picker, `--from-pr`, `/branch`, resume-as-background-session; forks = separate (grouped) picker rows | Confirmed; **agent view** is the multi-session surface |
| "fresh process ⇒ fresh hooks" (W0 not stale) | `sessions.md:37` — "standard settings files… are **re-read at launch**" | Confirmed; hooks reload on every launch incl. `--resume` |
| launcher "No conversation found" / cwd | `sessions.md:25` — resume is "**scoped to the current project directory and its git worktrees**" | Confirmed; the `Jarvis`↔`Project_Aion` symlink cwd split is exactly this hazard |
| *(new hazard)* | `sessions.md:114` — resuming the same session in two terminals **without forking** interleaves both into one transcript | Jarvis must never `--resume` a live UUID without `--fork-session` |

**Net:** the session model is an **intentional Claude Code capability** (agent view + background sessions + `/fork`÷`/subtask` + the `/resume` picker), not a defect. The Jarvis-side problem is unchanged and now precisely framed: **role-based JICM keying conflates the pane session with its `/fork` background sessions** (this diagnosing session is one). Fix = occupancy-based keying (C3). Nothing here changes the remediation in §5.

## 7. What stays blocked
Canary → un-gate → supervisor remains blocked until **C2 (signal safety) + C3 (occupancy keying)** land and the `0a718eeb` signal is disarmed. Transcripts preserved throughout.

*End of Rev 4.*
