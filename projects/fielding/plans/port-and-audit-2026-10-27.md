# Fielding: port and audit against the Archon skeleton (2026-10-27)

Ordered by Sir, 2026-10-27 ~21:30Z: "Fielding lives in Projects/Fielding rather than in Project_Aion/projects as should
ALL Archons ... This port, audit, and rebuild is top priority before any further work may be done by Fielding."
Executed by W3:Jarvis-dev. Fielding stopped at 21:33Z (HEAD f177691; wiki_role fix left uncommitted, nothing running).

## 1. The location question (OPEN: Sir's decision)

Every Archon except Jarvis runs from a folder under `~/Claude/Projects/` (launch-aion.sh `*_LAUNCH_DIR`):

| Archon | Working folder (cwd) | `Project_Aion/projects/<name>/` |
|---|---|---|
| Genie (W4) | Projects/WVU | none |
| Jacques (W5) | Projects/SnorkelTasks | arxiv, papers |
| Fleming (W6) | Projects/micro1 | none (its ARXIV path points at a folder that does not exist) |
| Urist (W2) | Projects/DwarfCron | alpha_seasonalwildlife, arxiv, papers |
| Fielding (W12) | Projects/Fielding | **created today** |

So Fielding followed the established layout; it was set up that way by W3 on 2026-10-09, copying Jacques and Fleming.
Asked Sir (no answer within 10 min, AFK): (a) Aion home + code stays (done below), (b) move Fielding's repo wholesale,
(c) move every Archon. **Done now: everything all three options share.** Not done: moving the repo / cwd. That move is
large and makes Fielding the only Archon laid out that way. It needs Sir's answer.

What a wholesale move (b) would take, for the record: nest the repo in the monorepo (gitignored), move
`~/.claude/projects/-Users-nathanielcannon-Claude-Projects-Fielding/` (memory + session history) to the new slug,
`git worktree repair` for 3 worktrees (headc, tenC, tenV; ~1 GB), update `FIELDING_LAUNCH_DIR`, the persona, JICM
lane identity and AnnasTools/arxiv paths, then restart the lane.

## 2. Skeleton audit (all five Archons)

| Item | Jacques | Genie | Urist | Fleming | Fielding before | Fielding now |
|---|---|---|---|---|---|---|
| Persona `.claude/personas/<n>/CLAUDE.md` | Y | Y | Y | Y | Y | Y (+ Archon home line) |
| Psyche `context/psyche/<n>-identity.md` | Y | Y | **no** | **no** | **no** | **Y (written)** |
| Persona force-loads identity/scratchpad/inbox | Y | Y | inbox only | **nothing** | **nothing** | **Y** |
| `projects/<n>/` home | Y | **no** | Y | **no** | **no** | **Y** (README, plans, reports, research, arxiv/papers to Staging) |
| JICM lane identity (`JK_LANE_LABEL`/`JK_GIT_DIRS`) | no | no | Y | no | **no** (checkpoint carried W0 paths + Project_Aion git) | **Y** |
| Bash safety guard (PreToolUse) | **no** | **no** | **no** | **no** | **no** | **Y** (on disk; commit pending, see 3) |
| Scratchpad, inbox, uuid, registry, JICM chain + checkpoint | Y | Y | Y | Y | Y | Y |
| Per-lane session-state | Y (stale, Aug 25) | Y (stale, Aug 19) | no | no | no | no (scratchpad serves; not created) |

## 3. Fixes applied today (W3)

1. **Anna's Archive operating knowledge** (Fielding memory `feedback_annas_archive_primary.md`, rewritten). Verified
   live: download by md5 WORKS (member API; fastDownload confirmed eac0d714... = Complete Discourses of BY vol 2);
   `searchBook`/`info` return UPSTREAM_UNAVAILABLE/METADATA_GATED because the site's search and /md5/ pages sit behind
   a JavaScript anti-bot check. Fielding's own report of that was accurate. The memory now gives the working procedure:
   md5s via Sir's Chrome (one query at a time), download via the MCP, serial, Staging, Sir's GO. Also in the identity file.
2. **Psyche identity** `.claude/context/psyche/fielding-identity.md` (new), force-loaded.
3. **Persona force-load block** (identity, scratchpad, api_aware, inbox). The inbox pointer has always said "it is also
   @-imported at session start"; for Fielding that was false until now.
4. **Inbox archive**: new `aion-inbox.sh archive <key> [--keep N]` (lock shared with send/ack; refuses while a read awaits
   ack; append-only archive). Tested on a copy (byte conservation, refusal, idempotence), then run: Fielding's inbox
   573 KB -> 19 KB, 272 read messages in `inbox/archive/fielding.md`, 0 unread affected.
5. **JICM lane identity** for fielding in `jicm-config.sh` (label + git dir = Projects/Fielding; resume-block mode none).
6. **Archon home** `projects/fielding/` (README; research/ holds the LDS source map + Anna's md5 list).
7. **Safety guard** added to `Projects/Fielding/.claude/settings.json` (PreToolUse, absolute path; smoke-tested rc 0).
   Its commit was refused by Fielding's own pre-commit check (the tree holds the uncommitted wiki_role edits). Not
   bypassed. Fielding commits it with its next commit. Effective at Fielding's next restart.

## 4. Findings to carry (OPEN)

- **Same gaps elsewhere**: Fleming (no psyche, no projects/, persona force-loads nothing), Urist (no psyche), Genie (no
  projects/). The missing safety guard affects all four satellite lanes. Each needs the same treatment.
- **Worktree isolation hole in Fielding's engine** (Fielding's own report, 21:33Z): a measurement worktree's full
  `cr_data_manifest.py write` rewrote the SHARED `data/lds/cr-split-eval/*.json` through `fielding_corpus` DATA_ROOT (an
  absolute path). Came out byte-identical this time. Fix: DATA_ROOT must resolve inside the worktree, or the write must
  refuse outside it.
- **Pending Fielding work, held by the stop order**: wiki_role fix + 8-id rename (measured 20:15Z: 152 units renamed, 0
  to another man, 0 via/display changes; report looks clean). GO waits for the port to finish.
- **Lane restart** needed for the hook and the force-loaded imports to take effect (registration tier).
