# JICM — Session Topology & Continuity Across the `/clear` Boundary

**Status:** design of record · **Date:** 2026-07-27 · **Author:** Jarvis (W11 dev lane, `dev-bg-c6ce7be7`)
**Supersedes assumptions in:** `jicm-v9-remediation-plan.md` R1/R2 ("occupancy = identity")
**Trigger:** W0 read 261,878 tokens while actually at 520,037 — JICM blind for 2 days.

---

## Part A — Forensic findings (all empirically verified 2026-07-27)

### A1. Three session birth mechanisms

| # | Mechanism | History inherited | `sessionKind` | Transcript signature |
|---|---|---|---|---|
| 1 | **Launcher** (`launch-aion.sh`) | — (origin) | `main` | begins `Please load these files into context: @…` |
| 2 | **`/clear`** | **NONE — zero shared UUIDs** | `bg` (CC ≥ 2.1.205) | begins `<local-command-caveat>` after `<command-name>/clear` |
| 3 | **`--fork-session`** | **YES — copied** | `bg` | shares message UUIDs with parent |

**Method + control:** ancestry is detectable by counting shared `.uuid` values between transcripts.
Control: `c6ce7be7` × `fbd7528a` (a known fork) = **505 shared** ✓. The six
"Resume work from compressed context" sessions share **0** with each other and with every pane
session — they are not forks, they are fresh sessions.

### A2. `/clear` mints a new session — proven

`f506b26a` (W0's LIVE conversation) begins:
```
15:08:50Z  <command-name>/clear</command-name>
15:09:11Z  resume work from …/SPRINT-STATUS.md
```
The session was created BY the clear. The prior session's transcript freezes at that instant.

### A3. The behaviour flipped at a Claude Code version boundary

| CC version | `/clear` produces |
|---|---|
| **2.1.202** (Jul 15) | `main` — `f56d4d98`, the last one |
| **2.1.205 → 2.1.220** (Jul 20 →) | **`bg`**, every one since |

Corroborated by Sir's recollection that subagent views used to disappear when done, and by the
upstream changelog carrying multiple recent `/clear` + session fixes. Anthropic docs now define
`/clear` as "**start a new conversation with empty context**", with `/compact` as the
same-conversation alternative. There is **no supported knob** to preserve the UUID across `/clear`.

### A4. Live topology (2026-07-27)

Base strata — launcher panes, `sessionKind: main`:

| Window | pane pid | main session | tokens | transcript |
|---|---|---|---|---|
| `aion:0` Jarvis | 48114 | `f56d4d98` | 261,878 | **frozen since Jul 20** |
| `aion:1` Protos | 48820 | `4ea9b495` | 96,513 | live |
| `aion:11` Jarvis-dev | 48387 | `fbd7528a` | 242,715 | live |

Actual conversations — `sessionKind: bg`, hosted by cc-daemon pid 84102:

| Displayed in | bg session | tokens | proof |
|---|---|---|---|
| `aion:0` | **`f506b26a`** | **520,037** | == statusline `520.0K` exactly |
| `aion:11` | **`c6ce7be7`** (this session) | 486,273 | — |

### A5. Why JICM went blind

`~/.claude/sessions/<pid>.json` records the sessionId **at process start**. Post-`/clear` the live
conversation has a NEW uuid that this record never learns. Every identity path we have —
`jicm_pane_session`, `.current-<key>-uuid`, launcher `--resume <uuid>` — resolves the PANE's
session, i.e. the dormant shell. The gate then computes a perfectly correct token count from a dead
transcript. **R2 reconciliation and R4's `OCC=ok` were internally correct and externally meaningless.**

### A6. The picker is `~/.claude/jobs/`, NOT the transcripts

18 job dirs keyed by session-id prefix; `state.json` carries `name` + `state`:
`blocked` → picker "Needs input" · `done`/`failed` → "Completed" · `working` → in-flight.
**173 transcripts vs 18 jobs** — that is why most transcripts never appear in the picker. Pane
(`main`) sessions get no job entry at all.
**Consequence: pruning a job dir removes the picker row; the transcript in
`~/.claude/projects/*/*.jsonl` is untouched.** This makes Sir's QoL ask directly achievable.

### A7. One lineage edge IS recorded: `resumeSessionId`

Real cross-session edges found in job state: `01d1ae83←ef57d6b4`, `072e6880←aea2395c`,
`66d922e6←266ec5ec`, `08bedb84←0a718eeb`. So **resume** lineage is captured; **`/clear`** lineage
is recorded nowhere. `children` is artifacts (HTML frames), not sessions.
`interactiveLineage: true` marks membership in an interactive chain but names no parent.

### A8. Transcript triplication (independent problem)

173 unique sessions → **447 files**; 137 written to **3 dirs each**
(`-Users-nathanielcannon-Claude-Jarvis`, `…-Project_Aion` underscore, `…-Project-Aion` hyphen),
all three updated simultaneously. **1.68 GB total, 1.10 GB (65%) redundant.**
Cause: the `~/Claude/Jarvis` symlink + two path encodings = three "projects" for one workspace.
This is R5's `Jarvis`↔`Project_Aion` realpath split.

### A9. The compounding defect

JICM's purpose is automated clear+resume. Under CC ≥2.1.205, **every JICM cycle mints one new
permanent bg session + picker row**, and — because the anchor points at the pane's original uuid —
**the next cycle reads a dead transcript.** The tool built to manage context became the primary
generator of session clutter and of its own blindness.

---

## Part B — Design: the continuity ledger

`/clear` leaves no edge, so **we write the edge**. Anthropic will not give us UUID preservation;
`/compact` preserves the session but writes no artifacts, is unconfigurable live, and is far slower
than a JICM cycle. Therefore: keep the JICM cycle, and reconstruct continuity externally.

**① Pre-clear capture.** Before the actuator sends `/clear`, append to
`.claude/context/jicm/chain/<key>.jsonl`:
`{outgoing_sid, transcript_path, tokens, ts, active_plan, checkpoint}`. Append-only.
*This is the missing DAG edge.*

**② Post-clear binding.** The new session's first gate write records `predecessor=<outgoing_sid>`,
giving each key a durable linked list across arbitrarily many clears.

**③ History distillation.** The actuator pipes the OUTGOING transcript through a LARGE local model
(`qwen3-32b-nothink:latest`, 20 GB — biggest on disk) to produce a **session-history digest**.
Kept DISTINCT from the scratchpad: the scratchpad is curated working state; the digest is what
actually happened. Chained digests make prior sessions' histories available to the current one.

**④ Resume bundle** = scratchpad + checkpoint + **history digest** + active-plan pointer.
JICM already feeds three; the digest is the new element.

**Identity anchor (replaces "occupancy = identity"):**
- **Pane tree** = which processes live in which window — context, NOT identity.
- **Live session** = freshest transcript attributable to that pane — THIS is identity.
- **Succession** = the chain ledger. Occupancy could never supply this.
- **Freshness guard (No-Silent-Degradation):** never publish a token count derived from a transcript
  staler than its session's liveness — ALERT instead.

**Disposal policy (once forward-feed is proven):** prune job dirs older than N cycles; **keep every
transcript**; never prune a session referenced by an open chain.

---

## Part C — Verifications before building (Sir-approved 2026-07-27)

1. **Why the previous local-LLM compression broke.** It was abandoned (`.compressed-context.md`)
   for an unknown failure. Leading hypothesis: qwen3 thinking-mode cannot be disabled reliably
   (`think:false` must be at payload ROOT, not inside `options`; the `-nothink` model variant is the
   mitigation). **Do not rebuild on an unknown failure mode.**
2. **Timed quality test on REAL prior transcripts.** Sir's directive: *do not back off to async after
   one or two tries* — async was already tried and produced consistently stale data. Troubleshoot and
   optimise (Ollama container W4, LiteLLM W3, MLX-Embed W5; full Docker discretion incl. rewriting
   and rebuilding Dockerfiles).
3. **Reversible prune test** on one `done`/`failed` job dir (backed up first): confirm the picker row
   disappears and the transcript survives.

---

## Part D — Open questions

- What spawns the bg session inside a permanent window — is it purely `/clear`, or also the
  agent-view/picker mechanic? (`/clear` is proven; other paths unproven.)
- Is `claude --session-id <uuid>` usable to rebind a cleared session? Documented flag, but no
  documented support for this use. **Experimental — test, never depend on.**
- Why did `f56d4d98`'s transcript freeze on Jul 20 while its process lived until Jul 25?

---

## Part E — Impact on the v9 plan

- **R1/R2** — "occupancy = identity" is FALSE post-2.1.205. A window has a *succession* of sessions;
  the pane process permanently records the first. R2 reconciliation stays useful (it repairs
  registry↔pane agreement) but is NOT sufficient for identity.
- **R3** — shadow observation of a "real W0 cycle" cannot work until the anchor is fixed: JICM cannot
  see W0's true tokens. Thresholds were lowered 550K/600K → 300K/330K (`341d6bc`) on the assumption
  the reading was live; that assumption was wrong.
- **R4 HUD** — add a FRESHNESS column; `OCC=ok` alone is misleading.
- **R5** — the triplication (A8) is the same realpath split already listed there.
