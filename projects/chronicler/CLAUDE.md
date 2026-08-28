# Chronicler — Development Artifacts

Development process artifacts for the DwarfCron/Chronicler project (AI storyteller + living atlas for Dwarf Fortress).

**Deliverable code lives at**: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

## Structure

| Directory | Purpose |
|-----------|---------|
| `plans/` | Implementation plans, phase roadmaps |
| `designs/` | Architecture decisions, CDM schema designs |
| `reports/` | Ingestion reports, validation results, test outputs |
| `experiments/` | Parser experiments, performance benchmarks |
| `progress/` | Phase completion tracking |

## Reference Repos

Cloned reference repos live at `/Users/nathanielcannon/Claude/GitRepos/`:
- `df-ai`, `df-narrator`, `df-structures`, `dfhack-client-python`
- `weblegends`, `DwarfFortressLogger`, `myDFHackScripts`

## Project Context

- **VM**: UTM Windows 11 ARM `DF-Windows` at `192.168.64.3`, user `Jarvis`, key `~/.ssh/df-vm`.
  Reach DFHack with `dfhack-run` over SSH — TCP RPC (port 5000) is broken under Prism for
  game-thread calls. *(Corrected 2026-08-25: this file said `192.168.64.2` + TCP 5000.)*
- **DB**: PostgreSQL `chronicler` database on localhost:5432 — 81 tables in `public`.
- **World**: world_id 1 = **"Orid Zurko"** (verified against the live DB, 2026-08-25).
  *This file previously said "Namoram — The Destined World"; `tests/test_phase4_validation.py`
  comments say "Tar Thran / The Land of Dawning". Both names are stale doc text — the world's
  entity IDs still resolve, so the data is consistent and only the labels drifted.*
- **Last fortress**: Girderpriced, COLLAPSED Y256 Winter. No live fortress; a new embark is needed.
