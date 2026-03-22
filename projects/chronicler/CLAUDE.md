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

- **VM**: UTM Windows 11 ARM at `192.168.64.2` — DF + DFHack with TCP port 5000
- **DB**: PostgreSQL `chronicler` database on localhost:5432
- **World**: Namoram — "The Destined World" (region1, 100 years, ~109K records)
