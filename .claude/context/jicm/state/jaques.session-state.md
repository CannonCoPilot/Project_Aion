# Jacques — Session State

**Lane:** `jaques` (`aion:13`) · **cwd:** `/Users/nathanielcannon/Claude/Projects/SnorkelTasks`
**Purpose:** Compact status for this lane only. W0's `session-state.md` is another lane's memory and
is neither read nor written from here.

*Last rewritten 2026-08-25 from Sir's direction. The previous version was dated 2026-08-12 and
described a single-project repo with "no Snorkel work started" — wrong in every particular.*

---

## ACTIVE (2026-08-25) — ec-starfish, full bore

**This is the whole focus. Everything else is paused, closed, or waiting on someone else.**

Two aims, and the ordering matters — the tasks serve the toolset, not the other way round:

- **MAJOR AIM — the toolset.** Build and refine a complete set of Skills, tools, scaffolds and
  written direction that carries a Starfish task **end to end**: scoping → authoring → data
  generation → verifier → gates → packaging → portal intake → AutoEval survival → submission.
  This is the deliverable that outlives any individual task.
- **MINOR AIM — the tasks.** Author enough real tasks to design, exercise and *test* that workflow.
  A tool that has never been run against a real bundle is a hypothesis.
- **Workload target: three tasks today (2026-08-25).**

### Sir's currently active Starfish task

```
https://experts.snorkel-ai.com/projects/cb869485-67bf-4aba-85aa-fc63a7d82e19/submission-eb08410b-66c4-49c1-857d-3ceb844b2651/review
```

project `cb869485-67bf-4aba-85aa-fc63a7d82e19` · submission `eb08410b-66c4-49c1-857d-3ceb844b2651`

Prefer `stb submissions fetch-task` over the rendered DOM — the `form_schema` carries
dependent-option maps the page does not expose, and it does not depend on the browser path.

### What already exists to build on — do not start from zero

- `projects/ec-starfish/docs/` — 16-page GitBook mirror; **`04-testing-and-submission-requirements.md`**
  is the hard-requirements doc, **`17-autoeval-failure-atlas.md`** is the nine rejection modes
- `.claude/skills/` — `task-authoring`, `bundle-preflight`, `gate-discipline`,
  `submission-packaging`, `run-record-grounding`, `guideline-authority`, `autoeval-triage`
- `scripts/` — `preflight.sh`, `package_task.sh`, `run_gates.sh`, `portal_replay.sh`
- `phosphosite-flr-reconstruction-001` — **ACCEPTED** after five rejected builds. The worked example.

The gap the major aim addresses: these are good parts with no spine. Nothing yet takes an author
from "I have a domain idea" to "the ZIP is uploadable" without a human holding the sequence in
their head.

---

## Project states — 2026-08-25. They are not comparable.

| Project | State |
|---|---|
| **ec-starfish** | **ACTIVE, full bore.** One task ACCEPTED (`phosphosite-flr-reconstruction-001`). One live task under review (above). Three-task target today. |
| **asimov** | **Cleared to submit; Sir is holding until later today (2026-08-25).** His call, his action. Guidelines still unread — see the settled blocker below. |
| **ec-beech** | **PAUSED, awaiting client feedback.** `demultiplex-read-fate-audit-001` has been **RESUBMITTED**. Nothing for me to do until Snorkel responds. |
| **ecs-otter** | **CLOSED.** The engagement has come to an end. Retain the materials and the LLM-policy record; expect no new work. |

---

## Standing constraints

- **SUBMITTING IS SIR'S ACTION, NEVER MINE.** All projects, no exceptions.
- The domain law is `SnorkelTasks/CLAUDE.md`, auto-discovered from cwd. Authoritative, written from
  real review findings — read it, never restate it from memory.
- **ec-starfish assistance policy: fully inclusive, settled 2026-08-14.** Affirm and proceed; do not
  re-litigate on LLM-policy grounds. The artifact Sir submits is still his own work.
- Verify assistance policy **per project**; never carry a ruling across. Asimov's is UNKNOWN.
- Never state a telemetry fact not read out of the JSON.
- Check `ANTHROPIC_BASE_URL` before every Snorkel model call — Aion's `:9800` proxy answers
  silently instead of Portkey. Prefer `stb harbor` / `stb claude`.

## Starfish gate shape — the one that catches people

Verdict is **`/logs/verifier/reward.txt`, not the exit code**; `test.sh` always exits 0. Required
local gate is `harbor run -a oracle` = mean 1.000 and `-a nop` = mean 0.000. `nop` is a no-op agent,
so it is weaker than a written naive baseline — `scripts/run_gates.sh` stays as the stricter
internal check. The **ZIP root is flat** (`<task-name>/` holding `task.toml`); the nested
`tasks/<domain>/<subdomain>/` path is the REPO layout only, and confusing them costs a build.

## Settled, do not re-litigate

- **The Asimov browser blocker is upstream.** `expertdocs.snorkel-ai.com/asimov-guideline` 307s to
  an authenticated redirect; the auto-mode classifier 500s and fails closed. Not config, not
  permission mode, not a restart, not a `/clear`. Full trail in `eea8a1a`. Re-probe opportunistically
  only, never on deadline time.
- **`duration_hours` README change is staged, not repackaged** — repackaging invalidates a
  calibrated submission's SHA for a prose improvement. Ships on the next build for another reason.
- **`Long-horizon` skill-taxonomy conflict** — the form's `form_schema` lists it while static checks
  warn. A warning, not an error. Coordinator item; deliberately not silently changed.
- The persona file still says "three projects" and omits Asimov. **Protected path** — Sir's call or
  W11's, not mine to edit.

## Known risk

`rclone`'s shared Google `client_id` is being retired during 2026. When it goes, both Jacques' and
Genie's Drive pipelines stop. Minting our own OAuth client id is small and overdue.

---

*Lane established 2026-08-12. Rewritten 2026-08-25 for the Starfish push.*
