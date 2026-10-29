# Embedded Archon Template (v1)

**Strictness**: ALWAYS — every Archon lane conforms; `.claude/scripts/archon-audit.py` is the conformance check.
**Status**: v1, 2026-10-28. Reference implementation: **Fielding (W12)**, commit 8164547. Supersedes the
"each Archon has its own workspace" layout for every lane except Alfred (see Exceptions).
**Owner**: W3:Jarvis-dev (Archons are worked on as projects only by Jarvis-dev).

---

## 1. The philosophy (Sir, 2026-10-28)

Archons are **embedded variants of Jarvis**: secondary personalities living inside the one Jarvis file space,
each kept distinct by **naming and tagging conventions**, with its own identity, directives, tools, instructions
and memory. They are not separate workspaces.

- **Jarvis space** (`~/Claude/Project_Aion/`) holds every Archon's identity, self-maps, lane state and planning.
- **`~/Claude/Projects/<ProjectName>/`** holds only the **codebases Archons build for the User**, named for the
  project, never for the Archon. A codebase carries its own `CLAUDE.md` (domain law) and no Archon configuration.
- Innovation in one Archon is pushed to all by living in the **shared layer** (section 5).

## 2. The shape (one Archon, key `<key>`)

| Layer | Path | What it is |
|---|---|---|
| **Identity (launch dir)** | `.claude/personas/<key>/` | The lane's **cwd**. |
| | `CLAUDE.md` | Persona: work table, own rules, register, memory map, runtime, lane boundaries. Required sections: see `_template/`. |
| | `identity.md` | Psyche voice and integrity rules. Imported by `CLAUDE.md` (`@identity.md`). |
| | `.claude/settings.json` | The lane's hooks, statusLine, permissions and **`autoMemoryDirectory`** (required). |
| | `.claude/skills/` | Skills only this Archon needs. |
| | `mcp.json` | MCP servers only this lane runs (often its codebase's server). |
| **Psyche map** | `.claude/context/psyche/<key>-identity.md` | **Symlink** to `personas/<key>/identity.md`. |
| **Nous (lane state)** | `.claude/context/.scratchpad.<key>.md`, `inbox/<key>.md` (+ `inbox/archive/`), `jicm/{chain,checkpoints,state,registry}/<key>.*`, `.current-<key>-uuid` | Keyed by name; written by shared hooks through `JICM_PROJECT_DIR`. |
| **Memory** | auto-memory `~/.claude/projects/-Users-nathanielcannon-Claude-Project-Aion--claude-personas-<key>/memory/` | Set by `autoMemoryDirectory`. Qdrant `<key>-{context,research,sessions,codebase}`; Graphiti `<key>-core`. |
| **Soma (planning)** | `projects/<key>/` | `README.md`, `plans/`, `reports/`, `research/`; `arxiv/`, `papers/` symlink into `~/Claude/Staging/verified/<key>/scholarly/` (gitignored). |
| **Codebases** | `~/Claude/Projects/<ProjectName>/` | Added with `--add-dir`. Its `CLAUDE.md` loads via the switch below. Bulk data and >100 MB scratch in Staging. |

Templates: `.claude/personas/_template/` (`CLAUDE.md`, `identity.md`, `.claude/settings.json`, `mcp.json`).

## 3. The launch contract

```
cd ~/Claude/Project_Aion/.claude/personas/<key>
env CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 JARVIS_SESSION_ROLE=<key> JARVIS_WINDOW=<n> \
    JICM_PROJECT_DIR=~/Claude/Project_Aion GRAPHITI_GROUP_ID=<key>-core JICM_RAG_COLLECTION=<key>-sessions \
    ARXIV_STORAGE_PATH=.../Staging/verified/<key>/scholarly/arxiv SCHOLAR_DOWNLOAD_PATH=.../papers ...
claude ... --add-dir <each codebase> --mcp-config ~/Claude/Project_Aion/.mcp.json <persona>/mcp.json \
    --append-system-prompt '<one paragraph, NO APOSTROPHES>' (--resume <current uuid> | --session-id <seed>)
```

No "Please load these files" init prompt: the persona is the cwd `CLAUDE.md`. Restart ONE lane with
`tmux kill-window -t aion:<Name>` then `launch-aion.sh --skip-preflight` (the top-up path re-adds only missing
windows, after exporting MCP credentials). `aion-lane-restart.sh` replays the pane's ORIGINAL command, so it
cannot carry a launch-dir change.

## 4. Verified mechanics (probe-tested 2026-10-28; do not re-derive, do not assume otherwise)

1. `--add-dir` does **not** load `CLAUDE.md` unless `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`. Before
   v1, no persona loaded this way. Personas reached a lane only through a one-shot init prompt on a new session,
   and were gone after the first `/clear`. A cwd `CLAUDE.md` reloads after every `/clear`.
2. Parent `CLAUDE.md` files load (the cwd walk reaches `Project_Aion/CLAUDE.md`).
3. **Imports outside the launch dir are refused** without an approval, **even through a symlink** (it is
   resolved). So every persona import points inside the persona folder. Scratchpad and inbox are not imported;
   `session-start.sh` names them at each start.
4. **Settings and hooks come from the cwd's `.claude/settings.json` only.** `Project_Aion/.claude/settings.json`
   (~40 Jarvis hooks) does **not** load for an embedded lane. User-level `~/.claude/settings.json` loads for every
   lane (it registers `bash-safety-guard.js` for every tool: never re-register it per lane).
5. **Skills** come from the cwd's `.claude/skills` **and** the git root's (`Project_Aion/.claude/skills`), and from
   `--add-dir` dirs. Jarvis's shared skills are therefore inherited.
6. **Transcripts follow the cwd** (own slug: every non-alphanumeric char becomes `-`).
   `CLAUDE_CODE_PROJECT_DIR_NAME` alone does nothing. **Auto-memory follows the git root**: without
   `autoMemoryDirectory` an embedded lane loads and writes **Jarvis's MEMORY.md** (observed on Fielding's first
   restart; fixed).
7. A resumed transcript must record the launch dir as its `cwd` (`session_resumable` checks it). To migrate a
   live session: copy the `.jsonl` (+ sidecar dir) into the new slug with `cwd` rewritten; keep the original.
8. Shared hook scripts resolve lane state through `JICM_PROJECT_DIR`. Two cwd-relative hooks
   (`prompt-timestamp.sh`, `insight-capture.js`) write into `personas/<key>/.claude/context/` (gitignored).

## 5. Shared vs own: how innovation propagates

| Shared (one copy, every Archon gets it) | Own (per Archon) |
|---|---|
| `Project_Aion/CLAUDE.md` guardrails | `CLAUDE.md` persona, `identity.md` |
| Hook **scripts** in `.claude/hooks/` (bodies are live) | Hook **registration** in its `.claude/settings.json` |
| `.claude/skills/` (inherited from the git root) | `.claude/skills/` in the persona folder |
| `.mcp.json` (`${VAR:-default}` per lane) | `mcp.json` |
| `jicm-config.sh`, `session-start.sh`, `aion-inbox.sh`, the launcher | Lane key, window, codebases, seed |
| `_template/` + this spec + `archon-audit.py` | Memory, lane state, `projects/<key>/` |

Rule: **a change that is good for one Archon goes into the shared column**, or into `_template/` and then into
every persona. Never fix one Archon by copying a file into its own folder when the shared copy can carry it.

## 6. Processes

**New Archon.** (1) Pick `<key>` (lower case, no hyphen; name and key agree). (2) `cp -R personas/_template
personas/<key>`, fill every `{{...}}`. (3) `ln -s ../../personas/<key>/identity.md context/psyche/<key>-identity.md`.
(4) `projects/<key>/` from Fielding's (README, plans, reports, research, Staging symlinks). (5) Add the lane to the
launcher, `jicm-config.sh` (RAG/graph case, `JK_LANE_LABEL`, `JK_GIT_DIRS`), `aion-inbox.sh` and
`aion-lane-restart.sh`. (6) Create the Qdrant collections and seed `MEMORY.md`. (7) `archon-audit.py <key>` = 0
FAIL. (8) Top-up launch.

**Change the template.** Edit `_template/` and this spec together; bump the version; apply to every persona;
`archon-audit.py` on every lane; restart lanes one at a time (resume).

**Migrate an existing lane.** Fielding's commit 8164547 is the recipe: build the persona folder (identity moved in,
psyche symlinked, settings + skills + mcp copied from the old workspace), move memory (symlink the old path),
rewire the launch function, dress-rehearse headless with `JICM_PROJECT_DIR` pointed at an empty dir, copy the
transcript with `cwd` rewritten, kill the window, top-up, read the debug log's "Loaded N CLAUDE.md" line, audit.

## 7. Roster and migration status (2026-10-28)

| Archon | Key | W | v1? | Gaps (from the 2026-10-28 inventory) |
|---|---|---|---|---|
| Fielding | fielding | 12 | **YES** | Old workspace files in `Projects/Fielding/.claude` to remove; 4.7 GB scratch to Staging |
| Fleming | fleming | 6 | no | persona never loads; external imports; works in `Projects/micro1` + `SnorkelTasks` |
| Jacques | jaques | 5 | no | persona never loads; stale force-loaded session-state ("Otter CLOSED"); no lane label |
| Genie | genie | 4 | no | persona never loads; no `projects/genie`; no lane label; stale session-state |
| Urist | urist | 2 | no | no identity file; `DwarfCron/CLAUDE.md` it calls authoritative does not exist; 3 Qdrant collections missing |
| Jarvis / Jarvis-dev | w0 / dev | 0 / 3 | n/a | **Jarvis's own persona does not load either** (`--add-dir personas/jarvis` without the switch) |
| Protos | protos | 1 | n/a | no persona, no namespace (writes to jarvis-core/sessions), no resume |

## Exceptions

- **Jarvis (W0) and Jarvis-dev (W3)** launch from `Project_Aion` itself; their persona is
  `personas/jarvis/`. They need only the loading switch (their imports are inside their cwd).
- **Alfred / Protos** lives at `Project_Aion/alfred/` with its own orchestration stack and `.claude/`. Not
  converted; its namespace gap is tracked separately.

---
*Template v1 — W3:Jarvis-dev, 2026-10-28. Related: [archon-architecture-pattern.md](archon-architecture-pattern.md)
(the general three-layer model this specializes).*
