---
name: seasonal-wildlife
type: personal
path: ~/Claude/Projects/seasonal-wildlife
github: (local git repo — no remote yet)
registered: 2026-07-15
status: active
epic: AION-598bdb5f
labels: project:seasonal-wildlife, agent:aifred
---

# Seasonal Wildlife — DFHack Lua tool

A windowed DFHack tool for Dwarf Fortress that curates and **seasonally rotates** an
embark's wildlife. Detects the creatures that can actually visit a fort (per biome),
lets the player allow/block them, set relative abundance, and assign each to seasons via
a preference/food-web matrix. All changes are **live** (no save/reload) except adding a
species not native to the embark.

Intake: relocated from `~/Public/Drop Box/seasonal-wildlife-project` on 2026-07-15,
git-init'd as its own repo (initial commit `f928741`).

## Engine model (the crux)

- `df.global.world.populations.all` → `local_population` (wilderpopst): the LIVE lever.
  Edit `.quantity` to rotate wildlife in real time. Region back-ref
  (`region_x/region_y/population_idx`) ties each entry to its world-region.
- `world.world_data.regions[i].population` → `world_population` (regionpopst),
  `count_min/count_max`: the worldgen master. Adding a NEW species goes here and needs a
  **reload**. Untouched by quantity edits, so it's the true "Default" baseline.
- Embark subset = region back-ref match + surface-only (`feature_idx == -1`,
  `cave_id == -1`) + countable. No stored "7 per biome" list — it's emergent.

## Status

- **Done**: v3.1 hardening + Phase 1 (view-aware tallies, Force=clear+force,
  bird/aquatic/marsupial classification, Fill-cat-to-N, config JSON-crash fix,
  View-field collision fixes). Deployed, compiles-clean, **not yet play-tested**.
- **Left**: Phase 2 (Set-roster tab, Season grid with S/U/A/W keyboard toggles,
  Food-web ASCII pyramid) — gated on the user's Phase 1 play-test.

## Key paths

- Main script: `scripts/seasonal-wildlife.lua` (~44 KB, `--@ module = true`).
- GUI shim: `scripts/gui/seasonal-wildlife.lua` (reqscript launcher).
- Docs: `README.md` (install/usage), `HANDOFF.md` (engine model + gotchas),
  `PLAN.md` (approved v4 phased plan), `RESEARCH-NOTES.md` (verified internals),
  `STATE.md` (SW-3 review), `RESOURCES.md` (SW-4 reference map).
- DFHack deploy target: `<DF>/dfhack-config/scripts/` (preserve `gui/` subfolder).

## ⚠️ Gotcha — ALWAYS test on a BACKUP DF save

The tool writes to live game structures (population quantities). Duplicate the save
folder before experimenting. No automated tests exist — DFHack Lua runs in-game only.

## When to load context

- Working in `~/Claude/Projects/seasonal-wildlife/`
- Any Pulse task labeled `project:seasonal-wildlife` (epic AION-598bdb5f)

## Status update — 2026-07-17 (Kickoff AION-c6e18bd1, v3.2)

- **SW-5 code remediation DONE** (project commit `3d80dc6`): `shuffle` implemented
  (Fisher-Yates over `dfhack.random.new()`); `captureDefault` now prefers the
  region-master `count_min/count_max` midpoint via the `population_idx` back-ref;
  `isAquatic` gains `IMMOBILE_LAND` + water-only-biome fallback; stale in-file
  `reload` comment removed; HANDOFF/PLAN/STATE aligned (STATE has a dated addendum).
- **Static gates now exist and pass**: `luac -p` clean on both files; `luacheck
  --std lua53` clean (only intentional `show_gui` module-export warnings). Lua 5.5 +
  luacheck 1.2.0 installed via Homebrew.
- **In-game verification OPEN — release gate.** SW-5 (AION-9ac57b5f) stays open with
  `hold:manual`; the Phase-1 checklist must be run human/Jarvis-driven on a BACKUP
  save. DF-Windows VM was unreachable this session; no deploy was made.
- Task plan + change report: `alfred/output/seasonal-wildlife/{TASK-PLAN.md,CHANGES.md}`.

## Status update — 2026-07-17 (AION-b632b1b3, v4.0 Phase 2 build)

- **Phase 2 built** (commit `4b143b8`): Set-roster tab (targets + Fill-to-targets,
  fill natural prey/predators, explicit matrix-assign, opt-in co-align; destructive
  Ctrl+S overwrite removed), season grid with S/U/A/W row toggles, Food-web season
  selector, Add-new min-max prompt. Engine refactor: `setRoster` →
  `assignFromMatrix`/`coAlignSeasons`/`fillPartners`/`toggleSeason`.
- **Deferred (recorded, not silent)**: ASCII trophic-pyramid rendering (PLAN §10) —
  after the in-game pass.
- **Gates**: `luac -p` + `luacheck --std lua53` clean. **In-game BACKUP-save pass
  still OPEN** — now covers Phase 1 + Phase 2 (checklist in HANDOFF §5); release gate
  per SW-5 `hold:manual`.
- Report: `alfred/output/seasonal-wildlife/CHANGES-v4.md`; TASK-PLAN.md T4 updated.

## Status update — 2026-07-17 (AION-b632b1b3 re-dispatch, v4.1)

- **PLAN §10 completed** (commit `9050be7`): single-season Food-web view renders the
  ASCII trophic pyramid (apex / predators+birds / prey+other / vermin, `^` connectors)
  + aquatic mini-web (`predator ----> prey`, unlinked listed); 'All' keeps the chain
  list. **Phase 2 (PLAN §8–10) fully implemented — no unbuilt items.**
- Gates clean (`luac -p`, `luacheck --std lua53`). **In-game BACKUP-save pass remains
  the OPEN release gate** (SW-5 `hold:manual`); pyramid layout is a tuning target there.

## Status update — 2026-07-17 (AION-06496922 re-verification)

- **Verification pass, no logic changes**: all 12 override capabilities re-confirmed
  line-by-line at `9050be7`; report rewritten at
  `alfred/output/seasonal-wildlife/VERIFICATION-AION-06496922.md`.
- **Gate made reproducible** (commit `8d721dd`): `.luacheckrc` committed (DFHack
  globals allowlist); `luacheck scripts/` now 0 warnings / 0 errors — binary pass.
  HANDOFF §8 documents the static gate.
- **In-game BACKUP-save pass remains the OPEN release gate** (SW-5 `hold:manual`).
  Pipeline should stop dispatching code-modification tasks for this objective.

## Status update — 2026-07-17 (AION-03ea38be, docs)

- **USAGE.md added** (commit `87acf57`): end-user guide (quick start, concepts, per-tab
  key reference, add-new walkthrough, troubleshooting, uninstall) — closes DoD §6.5.
  README: audience split (players→USAGE, devs→HANDOFF), full file inventory, stated
  DF 53.15 / DFHack 53.15-r2 version range (DoD §6.6). Docs-only; no code touched.
- Noted external commit `8d721dd` (.luacheckrc gate) — consistent, no conflict.
- Remaining before release: T2 manual in-game pass (OPEN gate), then T5 packaging.

## Status update — 2026-07-17 (AION-37225ea4, environment prep)

- **Test environment STAGED**: DF-Windows VM started (left RUNNING); v4.1 scripts
  deployed to `<DF>\dfhack-config\scripts\` (byte-verified, dir was previously empty);
  backup save `Girderpriced_Start-BACKUP-20260717` created byte-identical (1,861 files)
  with DF confirmed not running. DF path (actual, not the README's CrossOver note):
  `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress`.
- **Embark candidates enumerated**: Girderpriced_Start (03/19, pre-collapse founding
  snapshot — best), current/autosaves (03/23, near-collapse), region2/region3/
  Raldodok_planned (unknown). Validity requires loading — human step.
- Remaining human-only: load save → confirm living fort → run
  MANUAL-VALIDATION-PROTOCOL.md checklist (SW-5 hold:manual unchanged).

## Status update — 2026-07-17 (AION-6822ce14 rev 2 + operator halt)

- **Operator halt during AION-ab66e0fa**: automation launched DF on the VM for a
  console-only partial test; the follow-up process poll was REJECTED by the operator.
  **New boundary (operator-confirmed): pipeline sessions may stage (VM start, deploys,
  backups) but must NEVER launch or drive DF.** DF process state left as-is, unknown.
- BLOCKERS-AION-6822ce14.md rev 2 written: execution summary, B1–B5 blockers with root
  causes, immediate manual-pass plan + human-supervised console workaround, long-term
  pipeline fixes (hold:manual propagation, GUI-evidence dispatch exclusion, committed
  smoke-test script proposal).
- Environment remains staged: VM reachable (verified), scripts + backup in place.
