# Jacques — Fourth Archon of Project Aion (SnorkelAI)

*Supersedes the Genie plan previously in this file. Genie shipped 2026-08-11 (commits `3e8bcdb`, `6b15f7d`, `e8e152b`).*

## Context

Adding **Jacques**, a fourth Archon (after Jarvis `aion:0`, Alfred `alfred/`, Genie `aion:12`), whose
domain is the User's contract work for **Snorkel AI**: authoring evaluation tasks in areas of
scientific expertise. Home: `/Users/nathanielcannon/Claude/Projects/SnorkelTasks`, window **`aion:13`**.

**This is not greenfield, and that is the central design constraint.** SnorkelTasks is a mature
29 MB repo — 7 commits, pushed to `git@github.com:CannonCoPilot/SnorkelTasks.git`, clean tree — with
its own `CLAUDE.md` carrying hard-won domain law: Harbor-format bundle rules, the auto-reject list
(never put ground truth in `environment/`, never name a tool in `instruction.md`), Gate 1
(`solve.sh` → `test.sh` exit 0) / Gate 2 (naive baseline must FAIL), and run-record JSON gotchas
(`task["task"]["STATUS"]`, `PARAMS_PARSED`, bytes-vs-ms units, `PEAK_RSS` null as *signal*).
**Jacques inherits that; it is not rewritten.**

Two facts reframe the work:

1. **The repo knows only one project.** Grep for `ec-beech`, `ec-starfish`, `ecs-otter`, `starfish`,
   `otter` across the whole tree returns **zero matches**. "Beech" appears 39 times, always as
   "Project Beech"; `README.md:1` is literally `# SnorkelTasks — Project Beech`. `tasks/`,
   `submissions/`, `source-materials/`, `docs/` are flat single-namespace directories. Hosting three
   projects needs a scoping layer that does not exist.
2. **There is live, unfinished work.** `taxprofiler-execution-audit-001` went through a submission
   cycle (2026-07-31), came back with 10 review findings, was revised (2026-08-06), and is **staged
   to resubmit** — with the coordinator message drafted but explicitly **not sent**
   (`docs/05-coordinator-message.md`; `REVISION_2026-08-06.md:77` — "that is Sir's to send").
   Any restructure must not break the packaging path or that pending submission.

**Outcome:** Jacques exists as a supervised Archon; SnorkelTasks is reorganized to host three projects
without losing history or breaking the pending resubmission; the Drive/dashboard/Slack surfaces are
connected in that order of certainty.

---

## What we already have (verified)

| Capability | Status |
|---|---|
| Archon install pattern | **Proven** — Genie's 4 chokepoints, cwd/settings trap, `JICM_PROJECT_DIR` seam all solved and committed |
| Driveline (Drive↔local↔git) | **Reusable almost as-is** — see below |
| Dashboard access | `claude-in-chrome` (account connector) rides your logged-in session; `experts.snorkel-ai.com` is the portal |
| Polling pattern | `alfred/.claude/jobs/github-issue-poller.sh` — poll → state-file diff → Pulse task, **zero LLM cost in `pre_check`** |
| Secret injection | `credentials.yaml` + `yq` + export (`launch-aion.sh:1115-1122`, `get-github-pat.sh`) |
| Slack | **Nothing exists.** No creds, no MCP, no Slack connector on this account. Must be built |
| GitBook | URLs supplied; both **403 to an unauthenticated fetch** |

### Surfaces — measured, not assumed (2026-08-12)

| Surface | URL | Unauth | Reach |
|---|---|---|---|
| Submission portal ("the dashboard") | `experts.snorkel-ai.com` | **403** | browser session only |
| GitBook — starfish | `expertdocs.snorkel-ai.com/cdg_starfish_pilot_utyav_coding` | **403** | browser session only |
| GitBook — otter | `expertdocs.snorkel-ai.com/otter-guidelines` | **403** | browser session only |
| Otter task listing / claiming | `snorkel-ai.github.io/otter-harbor-task-claims/` | **200 — public** | plain fetch, pollable |
| Chrome bridge | 1 local browser connected | — | live today |

### Drive — already reachable, no new consent needed

The existing `wvu` rclone remote (same Google account) resolves all three folders. Verified by
listing each with `--drive-root-folder-id`. Contents differ sharply and that reshapes the work:

| Project | Folder id | Objects | Size | What's in it |
|---|---|---|---|---|
| **ec-beech** | `1QfBHmsZdM3a4cBBLaqyYVNilWHKZ5nnJ` | 204 | 8.4 MiB | The Beech drop — contributor guide PDF, JSON input files, task briefings, templates, showcases. **Already mirrored** into `source-materials/` |
| **ecs-otter** | `1lr5vNYkphJl_B5QmMnBlN5pvVSy98K57` | 4 | **321 MiB** | `EC Guide to Project Otter.docx`, `Project Otter Reviewer Quick Guide.docx`, `Otter Example Task.zip`, `Otter Task Skeleton (8).zip` |
| **ec-starfish** | `1kS5Aki0k_w-Oc6hbiUJkWxNt8gnuOzLl` | 8 | **2 KiB** | A bare Harbor skeleton only — `environment/`, `instruction.md`, `solution/`, `task.toml`, `tests/`. No data yet |

Beech is done-and-under-review, Otter has 321 MB of material to digest, Starfish is an empty
skeleton. Effort is nowhere near evenly split.

**⚠ Forward risk, both Archons:** `rclone config show wvu` has an empty `client_id`, i.e. it uses
rclone's *shared* Google client_id, which Google is **retiring during 2026**. When it goes, Genie's
and Jacques' Drive pipelines both stop. Creating an own OAuth client id is a small task worth doing
before it bites.

**Driveline is in better shape for reuse than expected.** `remote.py` contains *no* Shared-Drive
flags at all — `lsjson` / `copyto` only. Shared-Drive-ness lives entirely in the rclone remote's
config (`team_drive=` at `rclone config create` time), outside Driveline. Against an ordinary `1...`
folder the transport works **unmodified**; only the `auth` command's printed recipe (`cli.py:75-82`)
hardcodes the `team_drive=` guidance. Its 24 tests (`WVU/tests/test_driveline.py`) are all
config-independent and survive generalization untouched. It is already `pip install -e`'d with a
`[project.scripts] driveline` entry point and **zero third-party dependencies**.

Its two real limits: `Config`/`Manifest` carry exactly **one** `drive_root_id` (no multi-root), and
`find_repo_root()` walks to the nearest `.git`, so three per-project configs in one repo would all
resolve to the same root.

---

## Decisions I made (you were away; each is reversible, flag any you dislike)

1. **Driveline → standalone shared package** at `Projects/Driveline/`, its own repo, `pip install -e`
   into both consumers. One implementation, one place to fix bugs — the fold-forward rule. WVU keeps
   its `driveline.json` untouched; only `WVU/scripts/driveline`'s hand-rolled `PYTHONPATH` line
   changes, and WVU already has `.venv/bin/driveline` from the console-script entry, so that wrapper
   is a secondary path. Nothing in `src/driveline` imports anything WVU-specific.
2. **Slack via bot token**, built but **phase-gated** — it is the only surface needing credentials
   you may not control (Snorkel's workspace admins may have to approve the app).
3. **Restructure by `git mv`**, never copy-delete, so history follows the files.
4. **Window `aion:13`**; chain forks move to 14+ (same lockstep edit as Genie's).

---

## Phase 1 — Jacques the Archon

Mechanical now; the Genie install proved every step. Deterministic seed:
`uuid5(NAMESPACE_URL, "project_aion_jaques_w13")`.

- `.claude/personas/jaques/CLAUDE.md` + `mcp.json` — identity, absolute `@`-imports (cwd is outside
  the monorepo), memory namespace `jaques-*` / `jaques-core`, `GRAPHITI_GROUP_ID` bound in the
  scoped `mcp.json` (the root one hardcodes a literal that would otherwise win).
- `.claude/context/psyche/jacques-identity.md` — character + the Snorkel-specific integrity rules
  lifted forward from the existing `CLAUDE.md`: empirical grounding against the actual JSON, never
  infer telemetry from a briefing, the auto-reject list is absolute.
- `SnorkelTasks/.claude/settings.json` — **the trap Genie exposed.** Claude Code discovers settings
  from launch cwd; without this file Jacques runs with zero hooks, silently. Curated hook set with
  absolute paths, `JICM_PROJECT_DIR` redirecting lane state to the monorepo. Deliberately omit
  `relevance-retrieval.js` (hardcodes `jarvis-*` collections inline).
- Launcher: `window_target_index()` `Jacques) echo 13`, `WINDOW_ORDER`, `launch_jaques_window()`,
  and `host-executor-bridge.sh:42` chain floor `13 → 14`.
- JICM lane `jaques`: the same four chokepoints — `jicm_derive_key`, `jicm_default_target`,
  `jicm-supervisor.sh:303` reconcile list, `jicm-actuate.sh` `_resolve_target`/`_resolve_transcript`
  — plus `jicm_key_paths`'s `JK_RAG_COLLECTION`/`JK_GRAPHITI_GROUP` arms (added in `6b15f7d`).
- Memory: 4 Qdrant collections @ 2560/Cosine, `VALID_COLLECTIONS` in
  `infrastructure/rag-service/mcp_server.py`, and a `/projects/snorkeltasks/` rule in
  `file_to_collection()` **before** the generic `/docs/`, `/scripts/` rules.
- Pulse `agent:jaques` (free-text, no code change) + `alfred/.claude/jobs/personas/jaques/` +
  `persona_metadata` row.

**Gate:** window launches and resumes on its seed; `registry/jaques.json` shows `tmux_target aion:13`
+ `actuation_mode pane`; HUD row `live/ok`; a JICM cycle runs on Jacques' lane alone with W0/dev/genie
state byte-unchanged; `jaques-*` collections receive and `jarvis-*`/`genie-*` do not.

---

## Phase 2 — Reorganize SnorkelTasks for three projects

Done with `git mv` so history follows. Target shape:

```
SnorkelTasks/
├── CLAUDE.md              generalized: shared law + per-project pointers
├── projects/
│   ├── ec-beech/          ← everything that exists today moves here
│   │   ├── driveline.json   docs/ source-materials/ tasks/ submissions/
│   ├── ec-starfish/       ← scaffold
│   └── ecs-otter/         ← scaffold
├── shared/                cross-project: Harbor templates, the contributor guide, build steps
├── scripts/               generic tooling (de-hardcoded)
└── data/                  Drive mirrors + MANIFEST.json per project
```

- `scripts/package_task.sh` hardcodes `TASK_ID="taxprofiler-execution-audit-001"` (~line 15) — take it
  as an argument. `build_taxprofiler_task_data.py` is genuinely task-specific; it moves under
  `projects/ec-beech/scripts/` rather than pretending to be generic.
- **Preserve the pending resubmission.** `submissions/taxprofiler-execution-audit-001.tar.gz` must
  remain byte-identical and uploadable; re-verify Gate 1 (21/21) and Gate 2 (6/6 baselines fail)
  from the moved tree before declaring the restructure done.
- Reconcile the stale docs: `DOCUMENTATION_INDEX.md` (dated 2026-07-31) points at
  `tasks/taxprofiler-execution-audit-001.tar.gz`, which no longer exists.

---

## Phase 3 — Driveline generalization + Snorkel Drive

1. Extract `Projects/Driveline/` (source + the 24 tests + its own `pyproject.toml`); `pip install -e`
   into WVU and SnorkelTasks; fix `WVU/scripts/driveline`'s `PYTHONPATH`; **re-run WVU's 24 tests and
   a live `driveline status` against the WVU Shared Drive to prove Genie's pipeline is unharmed.**
2. Generalize: `auth` prints the right recipe for `team_drive=` *or* `root_folder_id=`; add a
   `DRIVELINE_CONFIG` env / `--config` override so three per-project configs can live in one repo;
   drop the baked `data/raw/` landing prefix into config.
3. **Account scope: settled.** Same Google account; no new consent. Create three dedicated rclone
   remotes (`snorkel-beech`, `snorkel-otter`, `snorkel-starfish`) each with `root_folder_id=` rather
   than overriding `team_drive` per call — cleaner, and it matches Driveline's one-root-per-config
   design so no multi-root feature is needed after all.
4. Mirror each folder; manifest everything. Otter's two zips dominate at 321 MB — they stay on Drive,
   manifest-only, hydrated on demand. Beech's 8.4 MB is already in `source-materials/`; reconcile
   rather than re-download, so the existing copy is verified against Drive instead of duplicated.
5. **Own OAuth client id** to retire the shared-client_id dependency before it breaks (see warning
   above). Benefits Genie's pipeline equally.

---

## Phase 4 — Dashboard, docs, Slack (descending certainty)

Ordered by how much is already possible.

**4a. Otter task board — unblocked, do first.** `snorkel-ai.github.io/otter-harbor-task-claims/`
returns 200 to a plain fetch. It is a GitHub Pages board, so it is pollable with `curl` + a state-file
diff on the `github-issue-poller.sh` pattern — new/changed task claims become `agent:jaques` Pulse
tasks at zero LLM cost. This is the highest-value monitor and needs nothing from you.

**4b. Dashboard + GitBooks — one mechanism, both 403.** All three authenticated surfaces go through
`claude-in-chrome` riding your logged-in Chrome (bridge verified live). Jacques reads open/active task
detail and the two guideline spaces, mirrors them to `jaques-research` so guidance is searchable
offline and diffable when Snorkel revises it. **Read-only.** `form_input` against a real client
submission portal is not authority to infer from "this is where I submit"; submission stays yours
until you say otherwise, in writing, here.

**4c. Slack — two paths, start with the one needing nothing.**
- *Now, zero credentials:* `app.slack.com` through the same Chrome bridge. Reads channels and pulls
  linked files using your existing session. Interactive, not a background poller.
- *Durable:* a Slack app (`api.slack.com/apps`) with `channels:history`, `channels:read`,
  `groups:history`, `files:read`; token under a new `slack:` key in `credentials.yaml`, injected by
  the existing `yq` + export pattern; poller on the `github-issue-poller.sh` shape, scheduled by the
  Nexus dispatcher via `registry.yaml` `type: interval` — not cron, which is reserved for infra jobs.
  File downloads need the token as `Authorization: Bearer` against `url_private`.
  **Real risk:** it is Snorkel's workspace. If you are a guest/contractor, "Install to Workspace" may
  need admin approval. Worth checking before design effort goes in.

---

## Verification

1. **Lane isolation** — after a Jacques JICM cycle, W0 / dev / genie state, checkpoints and scratchpads
   byte-unchanged. Prove it by md5 baseline, and check *content provenance* on anything that does
   change (W0 writes concurrently; that is not contamination).
2. **Memory isolation** — `jaques-*` populated, `jarvis-*` and `genie-*` counts unmoved, `jaques-core`
   distinct from `jarvis-core`/`genie-core`. Verify the **actuator** path, not just the interactive
   one: the detached actuator does not inherit launcher env, which is exactly how Genie leaked 93
   points into Jarvis's `sessions`.
3. **Nothing broken in WVU** — Driveline's 24 tests pass from the new location and a live
   `driveline status` against the WVU Shared Drive is clean.
4. **Submission integrity** — Gate 1 and Gate 2 re-pass from the restructured tree; the upload
   archive is byte-identical to what was staged.
5. **Restart survival** — full relaunch: Jacques resumes its pinned UUID, holds window 13, chain forks
   land at 14+.

---

## Open items for you

Resolved since the first draft: Drive mappings supplied and **verified reachable**; GitBook URLs
supplied; the coordinator message was a scratch draft and needs no send.

- **Slack — one check:** can you install an app in Snorkel's workspace, or does it need admin
  approval? Everything else proceeds without it, and the browser path works meanwhile.
- **Slack channel list** — which channels Jacques should watch.
- **Submission authority** — confirming Jacques stays read-only on `experts.snorkel-ai.com`. I am
  proceeding read-only unless told otherwise.
- **Per-site Chrome permission** — the extension needs `experts.snorkel-ai.com`,
  `expertdocs.snorkel-ai.com` and (if used) `app.slack.com` granted before Jacques can read them.
- **Own rclone OAuth client id** — small task, avoids a 2026 breakage that would take Genie down too.
